use super::*;
#[test]
fn filename_cannot_escape_destination() {
    assert_eq!(safe_filename("../../hello.exe").unwrap(), ".._.._hello.exe");
    assert!(safe_filename("CON.txt").is_err());
    assert!(safe_filename("..").is_err());
}
