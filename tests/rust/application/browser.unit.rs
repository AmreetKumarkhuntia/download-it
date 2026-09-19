use super::*;
#[test]
fn capture_requires_matching_replayable_file() {
    let m = SourceMetadata {
        total_bytes: Some(10),
        etag: Some("\"file\"".into()),
        content_type: Some("application/octet-stream".into()),
        ..Default::default()
    };
    let mut e = BrowserFileEvidence {
        method: "GET".into(),
        total_bytes: 10,
        content_type: "application/octet-stream".into(),
        etag: Some("\"file\"".into()),
        last_modified: None,
    };
    assert!(validate_source(&m, Some(&e)).is_ok());
    e.method = "POST".into();
    assert!(validate_source(&m, Some(&e)).is_err());
    e.method = "GET".into();
    e.etag = None;
    assert!(validate_source(&m, Some(&e)).is_err());
    assert!(validate_source(
        &SourceMetadata {
            content_type: Some("text/html".into()),
            ..m
        },
        None
    )
    .is_err());
}
