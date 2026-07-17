#!/usr/bin/env python3
"""Copy Python runtime sources and seed data into the Android project."""

from pathlib import Path
import base64
import shutil


root = Path(__file__).resolve().parents[1]
target = root / "android" / "app" / "src" / "main" / "python"
target.mkdir(parents=True, exist_ok=True)
for name in ("sporttery_db.py", "sporttery_history.py", "sporttery_web.py"):
    shutil.copy2(root / name, target / name)
for name in ("sporttery_history.json", "sporttery_plans.json", "sporttery_results.jsonl", "sporttery_tags.json"):
    source = root / name
    if source.exists():
        shutil.copy2(source, target / name)
web_target = target / "web"
if web_target.exists():
    shutil.rmtree(web_target)
shutil.copytree(root / "web", web_target)

# Chaquopy stores application sources in an import archive. Files are bundled,
# but pathlib's is_file/read_bytes checks are not reliable against that archive
# on every Android version. Embed the small SVG assets in a Python module so
# the local HTTP server always has a deterministic fallback.
embedded = target / "embedded_web_assets.py"
asset_root = root / "web" / "assets"
items = []
for source in sorted(asset_root.rglob("*.svg")):
    key = "/assets/" + source.relative_to(asset_root).as_posix()
    encoded = base64.b64encode(source.read_bytes()).decode("ascii")
    items.append(f"    {key!r}: {encoded!r},")
embedded.write_text(
    '"""Generated Android fallback assets. Do not edit."""\n\n'
    "ASSETS_BASE64 = {\n" + "\n".join(items) + "\n}\n",
    encoding="utf-8",
)
print(f"Prepared Android Python runtime at {target}")
