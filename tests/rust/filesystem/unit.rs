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
