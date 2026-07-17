#!/usr/bin/env python3
"""Copy Python runtime sources and seed data into the Android project."""

from pathlib import Path
import base64
import re
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


def inline_android_svg_urls(html_path: Path, asset_root: Path) -> int:
    """Inline SVG CSS URLs for Android WebView reliability.

    Some Android WebView versions fail to paint localhost SVG resources used
    by CSS masks/backgrounds even though the same files load in desktop
    browsers. Only the copied Android HTML is transformed, so the normal web
    source keeps readable asset paths.
    """

    html = html_path.read_text(encoding="utf-8")
    pattern = re.compile(r"url\(\s*(['\"]?)(/assets/[^)'\"]+\.svg)\1\s*\)")
    cache: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        url = match.group(2)
        if url not in cache:
            source = asset_root / url.removeprefix("/assets/")
            if not source.is_file():
                raise FileNotFoundError(f"Missing SVG referenced by Android HTML: {url}")
            payload = base64.b64encode(source.read_bytes()).decode("ascii")
            cache[url] = f"data:image/svg+xml;base64,{payload}"
        return f"url('{cache[url]}')"

    transformed, count = pattern.subn(replace, html)
    html_path.write_text(transformed, encoding="utf-8")
    return count


inlined_count = inline_android_svg_urls(web_target / "index.html", web_target / "assets")

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
print(f"Prepared Android Python runtime at {target}; inlined {inlined_count} SVG URLs")
