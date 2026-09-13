from __future__ import annotations

import json
import re
from pathlib import Path

from tools.build_production_worker import render_legacy_runtime

ROOT = Path(__file__).resolve().parents[1] / "src" / "chatgpt_web_adapter" / "browser_native_extension"
PRODUCTION = ROOT / "production"
_IMPORT = re.compile(r"(?:importScripts\(|import\s+[^;]*?from\s+)[\"\']([^\"\']+)[\"\']")


def _imports(path: Path) -> list[str]:
    return _IMPORT.findall(path.read_text(encoding="utf-8"))


def _walk(relative: str, seen: set[str]) -> None:
    if relative in seen:
        return
    seen.add(relative)
    path = ROOT / relative
    assert path.is_file(), relative
    for target in _imports(path):
        if target.startswith("./"):
            child_path = (ROOT / Path(relative).parent / target).resolve()
            child = str(child_path.relative_to(ROOT.resolve())).replace("\\", "/")
        elif "/" not in target and target.endswith(".js"):
            child = target
        else:
            continue
        _walk(child, seen)


def test_manifest_uses_explicit_production_entrypoint() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["background"]["service_worker"] == "production/service_worker_entry.js"
    assert manifest["background"].get("type") == "module"


def test_production_graph_contains_no_historical_repair_or_diagnostic_modules() -> None:
    seen: set[str] = set()
    _walk("production/service_worker_entry.js", seen)
    forbidden = ("repair", "diagnostic", "forensics", "characterization", "manual_ground_truth", "turn_probe", "history_probe")
    offenders = sorted(name for name in seen if any(token in Path(name).name.lower() for token in forbidden))
    assert offenders == []



def test_flattened_legacy_runtime_matches_historical_graph_exactly() -> None:
    source = (PRODUCTION / "legacy_runtime.js").read_text(encoding="utf-8")
    assert source == render_legacy_runtime()
    assert "importScripts(" not in source


def test_production_entry_declares_single_named_callback_owners() -> None:
    source = (PRODUCTION / "service_worker_entry.js").read_text(encoding="utf-8")
    assert "createTurnExecutor" in source
    assert "createNativeMessageRouter" in source
    assert "createStreamLifecycle" in source
    assert "executeNativeTurn =" not in source
    assert "onNativeMessage =" not in source
