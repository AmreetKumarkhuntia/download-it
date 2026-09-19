use super::*;
#[tokio::test]
async fn current_user_pipe_round_trip_and_exclusive_listener() {
    let sid = user_sid().unwrap();
    let server = listener(&sid, true).unwrap();
    assert!(listener(&sid, true).is_err());
    let mut client = ClientOptions::new().open(pipe_name(&sid)).unwrap();
    server.connect().await.unwrap();
    let mut server = server;
    write_async(&mut client, &serde_json::json!({"hello":1}))
        .await
        .unwrap();
    let value: serde_json::Value = read_async(&mut server).await.unwrap();
    assert_eq!(value["hello"], 1);
}
