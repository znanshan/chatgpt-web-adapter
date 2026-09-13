from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "tools" / "build_production_worker.py"


def _builder_module():
    spec = importlib.util.spec_from_file_location("build_production_worker", BUILDER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_turn_chain_transform_preserves_wrapper_order(tmp_path: Path) -> None:
    builder = _builder_module()
    source = """
async function executeNativeTurn(message) {
  return [\"base\", message.value];
}
async function onNativeMessage(message) {
  return await executeNativeTurn(message);
}
const firstPrior = executeNativeTurn;
executeNativeTurn = async function first(message) {
  return [...await firstPrior(message), \"first\"];
};
const secondPrior = executeNativeTurn;
executeNativeTurn = async function second(message) {
  return [...await secondPrior(message), \"second\"];
};
"""
    transformed, final_executor, count = builder.compose_turn_executor(source)
    assert count == 2
    assert final_executor == "_productionTurnStage02"
    assert "executeNativeTurn =" not in transformed
    assert "const firstPrior = _baseExecuteNativeTurn;" in transformed
    assert "const secondPrior = _productionTurnStage01;" in transformed
    assert "const _productionTurnStage01 = async function first" in transformed
    assert "const _productionTurnStage02 = async function second" in transformed
    assert "await composedTurnExecutor(message)" in transformed

    script = tmp_path / "pipeline.mjs"
    script.write_text(
        transformed
        + f"\nconst composedTurnExecutor = {final_executor};\n"
        + "console.log(JSON.stringify(await composedTurnExecutor({value: 7})));\n",
        encoding="utf-8",
    )
    completed = subprocess.run(
        ["node", str(script)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(completed.stdout) == ["base", 7, "first", "second"]
