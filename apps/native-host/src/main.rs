use dm_browser::{origin_allowed, read_message, write_message};
use dm_contracts::{BrowserRequest, BrowserResponse, BrowserState, BROWSER_PROTOCOL_VERSION};
use dm_domain::{AppError, ErrorCode};
use std::{io, path::PathBuf};

fn run() -> io::Result<()> {
    let origin = std::env::args().nth(1).unwrap_or_default();
    let directory = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "Windows local application data is unavailable",
            )
        })?;
    let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(
        directory.join("DownloadIt/BrowserIntegration/development/host.json"),
    )?)?;
    let allowed: Vec<String> = serde_json::from_value(manifest["allowed_origins"].clone())?;
    if !origin_allowed(&origin, &allowed) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Extension origin is not registered",
        ));
    }
    #[cfg(windows)]
    let runtime = tokio::runtime::Runtime::new()?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();
    while let Some(request) = read_message::<BrowserRequest>(&mut input)? {
        #[cfg(windows)]
        let result = runtime.block_on(dm_browser::windows::forward(&request));
        #[cfg(not(windows))]
        let result = unsupported_platform();
        let response = result.unwrap_or_else(|error| BrowserResponse {
            version: BROWSER_PROTOCOL_VERSION, request_id: request.request_id, state: BrowserState::Error, job: None,
            error: Some(AppError::new(if error.kind() == io::ErrorKind::NotFound { ErrorCode::NotFound } else { ErrorCode::Network },
                if error.kind() == io::ErrorKind::NotFound { "Download It is not running. Open it to capture downloads." } else { "Cannot confirm the desktop response. Open Download It and check the handoff again." })),
        });
        write_message(&mut output, &response)?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn unsupported_platform() -> io::Result<BrowserResponse> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows is required",
    ))
}
fn main() {
    if run().is_err() {
        eprintln!("Download It native bridge could not process the request. Check registration and protocol compatibility.");
        std::process::exit(1);
    }
}
