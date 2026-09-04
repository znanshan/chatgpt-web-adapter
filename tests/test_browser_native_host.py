from __future__ import annotations

from chatgpt_web_adapter.browser_native_host import BrowserNativeBroker


def test_broker_rejects_wrong_local_token_and_answers_ping(tmp_path) -> None:
    broker = BrowserNativeBroker(state_dir=tmp_path)
    broker.start()
    try:
        denied = broker.handle_local_request(
            {"protocol": 1, "type": "ping", "request_id": "x", "token": "wrong"}
        )
        assert denied["ok"] is False
        assert denied["error"] == "BROWSER_NATIVE_UNAUTHORIZED"

        allowed = broker.handle_local_request(
            {
                "protocol": 1,
                "type": "ping",
                "request_id": "y",
                "token": broker.token,
            }
        )
        assert allowed["ok"] is True
        assert allowed["extensionConnected"] is False
    finally:
        broker.close()


def test_turn_timeout_budget_is_not_artificially_capped_at_five_minutes() -> None:
    from chatgpt_web_adapter.browser_native_host import MAX_TURN_TIMEOUT_SECONDS

    assert MAX_TURN_TIMEOUT_SECONDS >= 1800


def test_characterize_is_allowed_and_not_blocked_by_active_writer(monkeypatch, tmp_path) -> None:
    import chatgpt_web_adapter.browser_native_host as subject

    broker = BrowserNativeBroker(state_dir=tmp_path)
    broker.extension_connected = True

    def fake_write(stream, forwarded):
        broker.route_native_message({
            "protocol": 1,
            "type": "characterize_result",
            "request_id": forwarded["request_id"],
            "ok": True,
            "active": False,
        })

    monkeypatch.setattr(subject, "write_native_message", fake_write)
    broker.turn_lock.acquire()
    try:
        result = broker.handle_local_request({
            "protocol": 1,
            "token": broker.token,
            "type": "characterize",
            "action": "status",
            "request_id": "char-while-writing",
            "timeoutMs": 1000,
        })
    finally:
        broker.turn_lock.release()
        broker._server.server_close()

    assert result["ok"] is True
    assert result["active"] is False


def test_observation_is_not_blocked_by_an_active_writer(monkeypatch, tmp_path) -> None:
    import chatgpt_web_adapter.browser_native_host as subject

    broker = BrowserNativeBroker(state_dir=tmp_path)
    broker.extension_connected = True

    def fake_write(stream, forwarded):
        broker.route_native_message({
            "protocol": 1,
            "type": "turn_observation_result",
            "request_id": forwarded["request_id"],
            "ok": True,
            "observation": {"state": "RUNNING"},
        })

    monkeypatch.setattr(subject, "write_native_message", fake_write)
    broker.turn_lock.acquire()
    try:
        result = broker.handle_local_request({
            "protocol": 1,
            "token": broker.token,
            "type": "observe_turn",
            "request_id": "observe-while-writing",
            "timeoutMs": 1000,
        })
    finally:
        broker.turn_lock.release()
        broker._server.server_close()

    assert result["ok"] is True
    assert result["observation"]["state"] == "RUNNING"
