from __future__ import annotations

import json
from pathlib import Path

from chatgpt_web_adapter.standalone_send import write_bridge_ui_state


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "service_worker.js"


def test_native_worker_reports_ready_and_generating_ui_states() -> None:
    source = WORKER.read_text(encoding="utf-8")
    assert '"browser_ui_state"' in source
    assert '"READY_FOR_INPUT"' in source
    assert '"GENERATING"' in source
    assert "onUiState" in source
    assert '[contenteditable="true"]' in source


def test_bridge_ui_state_sink_writes_only_safe_state_fields(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "ui-state.json"
    monkeypatch.setenv("CWA_BRIDGE_UI_STATE_FILE", str(path))

    write_bridge_ui_state({
        "type": "browser_ui_state",
        "state": "READY_FOR_INPUT",
        "reason": "generation_control_absent",
        "secret": "must-not-persist",
    })

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["schema"] == 1
    assert payload["state"] == "READY_FOR_INPUT"
    assert payload["reason"] == "generation_control_absent"
    assert "secret" not in payload
