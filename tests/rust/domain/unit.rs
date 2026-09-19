use super::*;
#[test]
fn resume_requires_matching_usable_validators() {
    let original = SourceMetadata {
        total_bytes: Some(42),
        etag: Some("\"stable\"".into()),
        ..Default::default()
    };
    assert!(original.can_resume_with(&original));
    assert!(!original.can_resume_with(&SourceMetadata {
        total_bytes: Some(43),
        ..original.clone()
    }));
    assert!(!SourceMetadata::default().can_resume_with(&SourceMetadata::default()));
    let weak = SourceMetadata {
        etag: Some("W/\"weak\"".into()),
        total_bytes: Some(42),
        ..Default::default()
    };
    assert!(!weak.can_resume_with(&weak));
}
