from __future__ import annotations

import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_ROOT = REPO_ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension"
SOURCE_ENTRY = "service_worker_entry_v3.js"
OUTPUT = EXTENSION_ROOT / "production" / "legacy_runtime.js"
_IMPORT = re.compile(r'(?m)^[ \t]*importScripts\("([^"]+)"\);?[ \t]*$')
_EXPORT_TAIL = """

// Transitional Task-5 boundary: expose the final assembled callbacks without
// letting the production entry mutate the historical global wrapper chain.
export function getLegacyRuntimeCallbacks() {
  return Object.freeze({
    executeTurn: executeNativeTurn,
    routeNativeMessage: onNativeMessage,
    ownsObservedTab: globalThis._cwaPersistentObserverOwnsTab ?? null,
  });
}
"""


def flatten_script(name: str, stack: tuple[str, ...] = ()) -> str:
    if name in stack:
        raise RuntimeError(f"import cycle: {stack + (name,)}")
    text = (EXTENSION_ROOT / name).read_text(encoding="utf-8")
    output: list[str] = []
    position = 0
    for match in _IMPORT.finditer(text):
        output.append(text[position:match.start()])
        child = match.group(1)
        output.append(f"\n/* BEGIN legacy source: {child} */\n")
        output.append(flatten_script(child, stack + (name,)))
        output.append(f"\n/* END legacy source: {child} */\n")
        position = match.end()
    output.append(text[position:])
    return "".join(output)


def render_legacy_runtime() -> str:
    return flatten_script(SOURCE_ENTRY) + _EXPORT_TAIL


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render_legacy_runtime()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != rendered:
            print(f"stale production bundle: {OUTPUT}")
            return 1
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
