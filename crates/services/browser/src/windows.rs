use crate::{checked_length, encode};
use dm_application::services::BrowserService;
use dm_contracts::{BrowserRequest, BrowserResponse};
use std::{io, ptr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{ClientOptions, NamedPipeServer, ServerOptions},
    task::{JoinHandle, JoinSet},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        },
        GetTokenInformation, TokenUser, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

pub fn user_sid() -> io::Result<String> {
    // Win32 owns the token and converted string; release both on every path.
    unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error());
        }
        let result = (|| {
            let mut length = 0;
            GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut length);
            if length == 0 {
                return Err(io::Error::last_os_error());
            }
            // usize storage supplies TOKEN_USER's required pointer alignment.
            let mut buffer = vec![0usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
            if GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                length,
                &mut length,
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let user = &*buffer.as_ptr().cast::<TOKEN_USER>();
            let mut sid = ptr::null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut n = 0;
            while *sid.add(n) != 0 {
                n += 1;
            }
            let value = String::from_utf16_lossy(std::slice::from_raw_parts(sid, n));
            LocalFree(sid.cast());
            Ok(value)
        })();
        CloseHandle(token);
        result
    }
}

fn pipe_name(sid: &str) -> String {
    format!(r"\\.\pipe\DownloadIt.Browser.Dev.{sid}")
}

fn listener(sid: &str, first: bool) -> io::Result<NamedPipeServer> {
    let sddl: Vec<u16> = format!("D:P(A;;GA;;;{sid})")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    unsafe {
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        // The descriptor remains valid until CreateNamedPipe has copied it.
        let result = ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .create_with_security_attributes_raw(
                pipe_name(sid),
                (&mut attributes as *mut SECURITY_ATTRIBUTES).cast(),
            );
        LocalFree(descriptor);
        result
    }
}

pub struct BrowserBridge(JoinHandle<()>);
impl Drop for BrowserBridge {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub fn start(service: Arc<BrowserService>) -> io::Result<BrowserBridge> {
    let sid = user_sid()?;
    let mut next = listener(&sid, true)?;
    Ok(BrowserBridge(tokio::spawn(async move {
        let mut tasks = JoinSet::new();
        loop {
            tokio::select! {
                result = next.connect(), if tasks.len() < 16 => {
                    if result.is_err() { break; }
                    let fresh = match listener(&sid, false) { Ok(pipe) => pipe, Err(_) => break };
                    let mut pipe = std::mem::replace(&mut next, fresh);
                    let service = service.clone();
                    tasks.spawn(async move {
                        let request = tokio::time::timeout(Duration::from_secs(5), read_async::<BrowserRequest>(&mut pipe)).await;
                        if let Ok(Ok(request)) = request {
                            // Do not cancel an application mutation when the client disconnects.
                            let response = service.handle(request).await;
                            let _ = write_async(&mut pipe, &response).await;
                        }
                    });
                }
                _ = tasks.join_next(), if !tasks.is_empty() => {}
            }
        }
    })))
}

async fn read_async<T: serde::de::DeserializeOwned>(
    pipe: &mut (impl tokio::io::AsyncRead + Unpin),
) -> io::Result<T> {
    let mut header = [0; 4];
    pipe.read_exact(&mut header).await?;
    let mut bytes = vec![0; checked_length(header)?];
    pipe.read_exact(&mut bytes).await?;
    serde_json::from_slice(&bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid bridge response"))
}
async fn write_async(
    pipe: &mut (impl tokio::io::AsyncWrite + Unpin),
    value: &impl serde::Serialize,
) -> io::Result<()> {
    let bytes = encode(value)?;
    pipe.write_all(&(bytes.len() as u32).to_ne_bytes()).await?;
    pipe.write_all(&bytes).await?;
    pipe.flush().await
}

pub async fn forward(request: &BrowserRequest) -> io::Result<BrowserResponse> {
    let name = pipe_name(&user_sid()?);
    let mut pipe = ClientOptions::new().open(name)?;
    tokio::time::timeout(Duration::from_secs(35), async {
        write_async(&mut pipe, request).await?;
        read_async(&mut pipe).await
    })
    .await
    .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Desktop response timed out"))?
}

#[cfg(test)]
#[path = "../../../../tests/rust/browser/windows.unit.rs"]
mod tests;
