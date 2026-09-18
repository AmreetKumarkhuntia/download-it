use async_trait::async_trait;
use dm_application::ports::ProcessSupervisor;
use dm_domain::{AppError, ErrorCode, Result};
use std::{io::Write, net::TcpListener, path::Path, process::Stdio};
use tokio::{
    process::{Child, Command},
    sync::Mutex,
};

pub struct Aria2Process {
    child: Mutex<Child>,
    pub endpoint: String,
    pub secret: String,
    _config: tempfile::NamedTempFile,
}
impl Aria2Process {
    pub fn start(executable: &Path, runtime_directory: &Path) -> Result<Self> {
        Self::start_with_libraries(executable, runtime_directory, None)
    }
    pub fn start_with_libraries(
        executable: &Path,
        runtime_directory: &Path,
        libraries: Option<&Path>,
    ) -> Result<Self> {
        if !executable.is_file() {
            return Err(AppError::new(ErrorCode::Engine, "Bundled aria2 is missing. Run pnpm prepare:aria2 during development, or reinstall Download It."));
        }
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| {
            AppError::new(ErrorCode::Engine, "Cannot allocate a local engine port.")
        })?;
        let port = listener.local_addr().unwrap().port();
        let secret =
            uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
        let mut config = tempfile::NamedTempFile::new_in(runtime_directory).map_err(|_| {
            AppError::new(
                ErrorCode::Permission,
                "Cannot create a private engine configuration.",
            )
        })?;
        writeln!(config, "enable-rpc=true\nrpc-listen-all=false\nrpc-allow-origin-all=false\nrpc-listen-port={port}\nrpc-secret={secret}\nstop-with-process={}\ncheck-certificate=true\nmin-tls-version=TLSv1.2\nenable-dht=false\nenable-dht6=false\nenable-peer-exchange=false\nfollow-torrent=false\nfollow-metalink=false\nconsole-log-level=error\nsummary-interval=0\nquiet=true\nauto-save-interval=1\n", std::process::id())
            .map_err(|_| AppError::new(ErrorCode::Disk, "Cannot write the engine configuration."))?;
        drop(listener);
        let mut command = Command::new(executable);
        #[cfg(target_os = "linux")]
        if let Some(directory) = libraries {
            command.env("LD_LIBRARY_PATH", directory);
        }
        #[cfg(target_os = "macos")]
        if let Some(directory) = libraries {
            command.env("DYLD_LIBRARY_PATH", directory);
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        let _ = libraries;
        command
            .arg(format!("--conf-path={}", config.path().display()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let child = command.spawn().map_err(|_| {
            AppError::new(
                ErrorCode::Engine,
                "Cannot start aria2. Check the binary and its runtime dependencies.",
            )
        })?;
        Ok(Self {
            child: Mutex::new(child),
            endpoint: format!("http://127.0.0.1:{port}/jsonrpc"),
            secret,
            _config: config,
        })
    }
}
#[async_trait]
impl ProcessSupervisor for Aria2Process {
    async fn stop(&self) -> Result<()> {
        let mut child = self.child.lock().await;
        if tokio::time::timeout(std::time::Duration::from_secs(5), child.wait())
            .await
            .is_err()
        {
            child.kill().await.map_err(|_| {
                AppError::new(ErrorCode::Engine, "Could not stop the download engine.")
            })?;
        }
        Ok(())
    }
}
