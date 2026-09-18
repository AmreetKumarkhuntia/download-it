use async_trait::async_trait;
use dm_application::ports::FileStore;
use dm_domain::{AppError, ErrorCode, Result};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
};

pub struct LocalFileStore;

fn io_error(e: std::io::Error) -> AppError {
    let code = match e.kind() {
        std::io::ErrorKind::PermissionDenied => ErrorCode::Permission,
        std::io::ErrorKind::AlreadyExists => ErrorCode::Conflict,
        _ => ErrorCode::Disk,
    };
    AppError::new(code, format!("File operation failed: {e}"))
}

#[async_trait]
impl FileStore for LocalFileStore {
    async fn stage(&self, destination: &str, id: &str) -> Result<PathBuf> {
        if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Invalid download identifier.",
            ));
        }
        let root = tokio::fs::canonicalize(destination)
            .await
            .map_err(io_error)?;
        let directory = root.join(".download-it").join(id);
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(io_error)?;
        let actual = tokio::fs::canonicalize(&directory)
            .await
            .map_err(io_error)?;
        if !actual.starts_with(&root) {
            return Err(AppError::new(
                ErrorCode::Permission,
                "The staging directory must remain inside the destination.",
            ));
        }
        Ok(actual.join("payload"))
    }
    async fn verify(&self, path: &Path, expected: Option<&str>, size: Option<u64>) -> Result<()> {
        let path = path.to_owned();
        let expected = expected.map(str::to_owned);
        tokio::task::spawn_blocking(move || {
            let mut file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(path)
                .map_err(io_error)?;
            let length = file.metadata().map_err(io_error)?.len();
            if size.is_some_and(|n| n != length) {
                return Err(AppError::new(
                    ErrorCode::Disk,
                    "Downloaded file length does not match the expected size.",
                ));
            }
            if let Some(expected) = expected {
                let mut hash = Sha256::new();
                let mut buffer = [0u8; 128 * 1024];
                loop {
                    let n = file.read(&mut buffer).map_err(io_error)?;
                    if n == 0 {
                        break;
                    }
                    hash.update(&buffer[..n]);
                }
                if format!("{:x}", hash.finalize()) != expected {
                    return Err(AppError::new(
                        ErrorCode::ChecksumMismatch,
                        "SHA-256 verification failed. Restart to download a fresh copy.",
                    ));
                }
            }
            file.sync_all().map_err(io_error)
        })
        .await
        .map_err(|_| AppError::new(ErrorCode::Disk, "File verification stopped unexpectedly."))?
    }
    async fn finalize(&self, staging: &Path, destination: &Path) -> Result<()> {
        // A hard link atomically publishes the complete file without ever replacing an existing file.
        // Keeping staging until the DB commit makes recovery after a crash idempotent.
        if destination.exists() && same_file::is_same_file(staging, destination).unwrap_or(false) {
            return Ok(());
        }
        tokio::fs::hard_link(staging, destination)
            .await
            .map_err(io_error)?;
        #[cfg(unix)]
        if let Some(parent) = destination.parent() {
            std::fs::File::open(parent)
                .map_err(io_error)?
                .sync_all()
                .map_err(io_error)?;
        }
        Ok(())
    }
    async fn cleanup(&self, staging: &Path) -> Result<()> {
        let directory = staging
            .parent()
            .ok_or_else(|| AppError::new(ErrorCode::InvalidInput, "Invalid staging path."))?;
        let id = directory.file_name().unwrap_or_default().to_string_lossy();
        if staging.file_name().is_none_or(|n| n != "payload")
            || id.len() != 32
            || !id.bytes().all(|b| b.is_ascii_hexdigit())
            || directory
                .parent()
                .and_then(Path::file_name)
                .is_none_or(|n| n != ".download-it")
        {
            return Err(AppError::new(
                ErrorCode::Permission,
                "Refusing to remove files outside a managed staging directory.",
            ));
        }
        for file in [staging.to_owned(), staging.with_extension("aria2")] {
            match tokio::fs::remove_file(file).await {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(io_error(e)),
            }
        }
        let _ = tokio::fs::remove_dir(directory).await;
        Ok(())
    }
    async fn exists(&self, path: &Path) -> bool {
        tokio::fs::try_exists(path).await.unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn publication_never_overwrites_and_is_recoverable() {
        let d = tempfile::tempdir().unwrap();
        let fs = LocalFileStore;
        let stage = fs
            .stage(
                d.path().to_str().unwrap(),
                "0123456789abcdef0123456789abcdef",
            )
            .await
            .unwrap();
        tokio::fs::write(&stage, b"correct").await.unwrap();
        let final_path = d.path().join("file.bin");
        fs.finalize(&stage, &final_path).await.unwrap();
        fs.finalize(&stage, &final_path).await.unwrap();
        fs.cleanup(&stage).await.unwrap();
        assert_eq!(tokio::fs::read(&final_path).await.unwrap(), b"correct");
        tokio::fs::write(d.path().join("different"), b"wrong")
            .await
            .unwrap();
        assert!(fs
            .finalize(&d.path().join("different"), &final_path)
            .await
            .is_err());
    }
    #[tokio::test]
    async fn checksum_mismatch_is_not_accepted() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("file");
        tokio::fs::write(&path, b"hello").await.unwrap();
        let error = LocalFileStore
            .verify(&path, Some(&"0".repeat(64)), Some(5))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::ChecksumMismatch);
    }
    #[tokio::test]
    async fn large_files_do_not_truncate_to_32_bits() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("large-file");
        let file = std::fs::File::create(&path).unwrap();
        let length = 4 * 1024 * 1024 * 1024u64 + 17;
        file.set_len(length).unwrap();
        LocalFileStore
            .verify(&path, None, Some(length))
            .await
            .unwrap();
        assert!(LocalFileStore.verify(&path, None, Some(17)).await.is_err());
    }
}
