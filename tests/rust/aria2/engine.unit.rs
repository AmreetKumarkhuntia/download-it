use super::*;

#[test]
fn telemetry_uses_msb_first_ignores_padding_and_redacts_server_urls() {
    let details = transfer_details(
        &json!({"numPieces":"5", "bitfield":"af", "pieceLength":"1048576", "connections":"2"}),
        &json!({"split":"8", "max-connection-per-server":"4"}),
        &json!([{"servers":[{"currentUri":"https://user:pass@cdn.example/file?token=secret#private", "downloadSpeed":"42"}]}]),
    );
    assert_eq!(details.piece_groups, vec![100, 0, 100, 0, 100]);
    assert_eq!(details.completed_pieces, 3);
    assert_eq!(details.connection_limit, 4);
    assert_eq!(details.servers[0].server, "https://cdn.example");
    assert_eq!(details.servers[0].speed_bytes, 42);
    assert_eq!(
        transfer_details(&json!({}), &json!({}), &json!([])).piece_groups,
        Vec::<u8>::new()
    );
}

#[test]
fn large_piece_maps_are_bounded_and_preserve_completion() {
    let details = transfer_details(
        &json!({"numPieces":"1001", "bitfield":"f".repeat(251)}),
        &json!({}),
        &json!([]),
    );
    assert_eq!(details.completed_pieces, 1001);
    assert_eq!(details.piece_groups, vec![100; 120]);
}
