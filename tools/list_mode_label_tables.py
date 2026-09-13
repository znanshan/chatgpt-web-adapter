"""List every mode-label table the adapter test discovers, and the locale labels each one knows.

Run from the adapter checkout with its src on PYTHONPATH. Read-only.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, "src")
from chatgpt_web_adapter.browser_native_install import browser_native_extension_dir  # noqa: E402

LOCALE = {"即时", "中", "高", "极高", "мгновенно", "средний", "высокий", "очень высокий"}
RESULT = re.compile(r"(return|push)\s*\(?\s*'(INSTANT|MEDIUM|HIGH|EXTRA_HIGH)'")

root = Path(browser_native_extension_dir())
count = 0
for path in sorted(root.glob("*.js")):
    text = path.read_text(encoding="utf-8")
    if not RESULT.search(text):
        continue
    found = set(re.findall(r"text === '([^']+)'", text)) | set(
        re.findall(r"text\.includes\('([^']+)'\)", text))
    count += 1
    print(f"{count:2d}  {path.name:62s} {sorted(found & LOCALE)}")
print(f"tables discovered: {count}")
