#!/usr/bin/env python3
"""Copy Python runtime sources and seed data into the Android project."""

from pathlib import Path
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
print(f"Prepared Android Python runtime at {target}")
