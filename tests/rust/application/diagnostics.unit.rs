use super::*;
#[test]
fn source_details_never_reveal_url_credentials() {
    assert_eq!(
        display_url("https://name:secret@example.com/file.zip?token=private#secret"),
        "https://example.com/file.zip [query/fragment hidden]"
    );
    assert_eq!(
        display_url("https://example.com/file.zip"),
        "https://example.com/file.zip"
    );
}
