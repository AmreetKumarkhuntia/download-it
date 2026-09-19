use super::*;
#[test]
fn framing_is_bounded_and_detects_truncation() {
    let mut bytes = vec![];
    write_message(&mut bytes, &serde_json::json!({"message":"日本語"})).unwrap();
    let parsed: serde_json::Value = read_message(&mut bytes.as_slice()).unwrap().unwrap();
    assert_eq!(parsed["message"], "日本語");
    assert!(read_message::<serde_json::Value>(&mut &bytes[..bytes.len() - 1]).is_err());
    assert!(
        read_message::<serde_json::Value>(&mut &(MAX_MESSAGE as u32 + 1).to_ne_bytes()[..])
            .is_err()
    );
    assert!(read_message::<serde_json::Value>(&mut &[][..])
        .unwrap()
        .is_none());
}
#[test]
fn only_exact_extension_origins_are_allowed() {
    let valid = format!("chrome-extension://{}/", "a".repeat(32));
    assert!(origin_allowed(&valid, std::slice::from_ref(&valid)));
    assert!(!origin_allowed(
        "https://example.com/",
        &["https://example.com/".into()]
    ));
    assert!(!origin_allowed(&valid, &[]));
    assert!(!origin_allowed(&format!("{valid}page.html"), &[valid]));
}
