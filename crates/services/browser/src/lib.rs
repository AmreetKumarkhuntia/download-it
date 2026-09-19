use serde::{de::DeserializeOwned, Serialize};
use std::io::{self, Read, Write};

pub const HOST_NAME: &str = "io.github.amreetkumarkhuntia.downloadit.browser.dev";
pub const MAX_MESSAGE: usize = 64 * 1024;

#[cfg(windows)]
pub mod windows;

pub fn read_message<T: DeserializeOwned>(input: &mut impl Read) -> io::Result<Option<T>> {
    let mut header = [0; 4];
    if input.read(&mut header[..1])? == 0 {
        return Ok(None);
    }
    input.read_exact(&mut header[1..])?;
    let length = checked_length(header)?;
    let mut data = vec![0; length];
    input.read_exact(&mut data)?;
    serde_json::from_slice(&data)
        .map(Some)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid native message"))
}

pub fn write_message(output: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let data = encode(value)?;
    output.write_all(&(data.len() as u32).to_ne_bytes())?;
    output.write_all(&data)?;
    output.flush()
}

pub fn checked_length(header: [u8; 4]) -> io::Result<usize> {
    let length = u32::from_ne_bytes(header) as usize;
    if length == 0 || length > MAX_MESSAGE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Native message exceeds limit",
        ));
    }
    Ok(length)
}

pub fn encode(value: &impl Serialize) -> io::Result<Vec<u8>> {
    let data = serde_json::to_vec(value)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Cannot encode native message"))?;
    if data.is_empty() || data.len() > MAX_MESSAGE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Native message exceeds limit",
        ));
    }
    Ok(data)
}

pub fn origin_allowed(origin: &str, allowed: &[String]) -> bool {
    let Some(id) = origin
        .strip_prefix("chrome-extension://")
        .and_then(|s| s.strip_suffix('/'))
    else {
        return false;
    };
    id.len() == 32
        && id.bytes().all(|c| (b'a'..=b'p').contains(&c))
        && allowed.iter().any(|s| s == origin)
}

#[cfg(test)]
#[path = "../../../../tests/rust/browser/unit.rs"]
mod tests;
