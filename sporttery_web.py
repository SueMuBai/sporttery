#!/usr/bin/env python3
"""Local web interface for the Sporttery history collector."""

from __future__ import annotations

import argparse
import itertools
import json
import threading
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sporttery_history import collect_history, fetch_json, render_markdown


ROOT = Path(__file__).resolve().parent
WEB_FILE = ROOT / "web" / "index.html"
STATE: dict[str, Any] = {"data": None}
PLANS_FILE = ROOT / "sporttery_plans.json"
RESULTS_FILE = ROOT / "sporttery_results.jsonl"
RESULT_API = "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry"
try:
    saved_file = ROOT / "sporttery_history.json"
    if saved_file.exists():
        STATE["data"] = json.loads(saved_file.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    STATE["data"] = None
STATE_LOCK = threading.Lock()


def load_results() -> dict[int, dict[str, Any]]:
    results: dict[int, dict[str, Any]] = {}
    if RESULTS_FILE.exists():
        for line in RESULTS_FILE.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
                results[int(item["matchId"])] = item
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
    return results


def selection_wins(selection: dict[str, Any], result: dict[str, Any]) -> bool:
    home, away = map(int, result["fullTimeScore"].split(":"))
    if selection["market"] == "had":
        actual = "h" if home > away else "d" if home == away else "a"
    else:
        adjusted_home = home + int(result.get("goalLine", 0))
        actual = "h" if adjusted_home > away else "d" if adjusted_home == away else "a"
    return selection["outcome"] == actual


def evaluate_plan(plan: dict[str, Any], results: dict[int, dict[str, Any]]) -> dict[str, Any]:
    selections = plan.get("selections", [])
    settled = [s for s in selections if int(s["matchId"]) in results]
    pending = len(selections) - len(settled)
    stake = 0.0
    prize = 0.0
    multiplier = int(plan.get("multiplier", 1))
    for size in plan.get("passCounts", []):
        for combo in itertools.combinations(selections, int(size)):
            stake += 2 * multiplier
            if all(int(s["matchId"]) in results for s in combo) and all(
                selection_wins(s, results[int(s["matchId"])]) for s in combo
            ):
                payout = 2 * multiplier
                for selection in combo:
                    payout *= float(selection["odds"])
                prize += payout
    # Profit is final only after every selected match has a result.
    return {
        "settledMatches": len(settled),
        "pendingMatches": pending,
        "stake": round(stake, 2),
        "prize": round(prize, 2),
        "profit": round(prize - stake, 2) if pending == 0 else None,
        "status": "settled" if pending == 0 else "pending",
    }


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, content: bytes, content_type: str, status: int = 200, **headers: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        for name, value in headers.items():
            self.send_header(name.replace("_", "-"), value)
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, value: Any, status: int = 200) -> None:
        self.send_bytes(
            json.dumps(value, ensure_ascii=False).encode(),
            "application/json; charset=utf-8",
            status,
        )

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            self.send_bytes(WEB_FILE.read_bytes(), "text/html; charset=utf-8")
        elif path == "/api/latest":
            with STATE_LOCK:
                self.send_json(STATE["data"] or {"matches": [], "errors": [], "total": 0})
        elif path == "/api/plans":
            try:
                plans = json.loads(PLANS_FILE.read_text(encoding="utf-8")) if PLANS_FILE.exists() else []
            except (OSError, json.JSONDecodeError):
                plans = []
            results = load_results()
            for plan in plans:
                plan["evaluation"] = evaluate_plan(plan, results)
            self.send_json(plans)
        elif path == "/api/results":
            self.send_json(list(load_results().values()))
        elif path in ("/download/json", "/download/markdown"):
            with STATE_LOCK:
                data = STATE["data"]
            if not data:
                self.send_json({"error": "请先执行查询"}, 404)
                return
            if path.endswith("json"):
                content = json.dumps(data, ensure_ascii=False, indent=2).encode()
                self.send_bytes(content, "application/json; charset=utf-8", Content_Disposition='attachment; filename="sporttery_history.json"')
            else:
                content = render_markdown(data["matches"], data["errors"], data["limits"], data["total"]).encode()
                self.send_bytes(content, "text/markdown; charset=utf-8", Content_Disposition='attachment; filename="sporttery_history.md"')
        else:
            self.send_json({"error": "页面不存在"}, 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/results/sync":
            try:
                with STATE_LOCK:
                    data = STATE["data"] or {}
                matches = data.get("matches", [])
                by_id = {int(m["matchId"]): m for m in matches}
                dates: set[str] = set()
                for match in matches:
                    day = datetime.fromisoformat(match["matchDateTime"].split()[0])
                    dates.add(day.strftime("%Y-%m-%d"))
                    dates.add((day - timedelta(days=1)).strftime("%Y-%m-%d"))
                existing = load_results()
                appended: list[dict[str, Any]] = []
                for match_date in sorted(dates):
                    payload = fetch_json(
                        RESULT_API,
                        {"method": "result", "matchDate": match_date, "pageSize": 100},
                        15,
                        2,
                    )
                    for group in payload.get("value", {}).get("matchInfoList", []) or []:
                        for item in group.get("subMatchList", []) or []:
                            match_id = int(item.get("matchId", 0))
                            if match_id not in by_id or not item.get("sectionsNo999"):
                                continue
                            source = by_id[match_id]
                            result = {
                                "matchId": match_id,
                                "matchNum": item.get("matchNumStr", source.get("matchNum", "")),
                                "homeTeam": item.get("homeTeamAbbName", source.get("homeTeam", "")),
                                "awayTeam": item.get("awayTeamAbbName", source.get("awayTeam", "")),
                                "halfTimeScore": item.get("sectionsNo1", ""),
                                "fullTimeScore": item.get("sectionsNo999", ""),
                                "goalLine": int(float(source.get("odds", {}).get("hhad", {}).get("goalLineValue") or 0)),
                                "fetchedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                            }
                            old = existing.get(match_id)
                            if not old or old.get("fullTimeScore") != result["fullTimeScore"]:
                                appended.append(result)
                                existing[match_id] = result
                if appended:
                    with RESULTS_FILE.open("a", encoding="utf-8") as file:
                        for result in appended:
                            file.write(json.dumps(result, ensure_ascii=False) + "\n")
                self.send_json({"ok": True, "appended": len(appended), "results": list(existing.values())})
            except Exception as exc:
                self.send_json({"error": f"赛果更新失败：{exc}"}, 500)
            return
        if path == "/api/plans":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                plans = json.loads(PLANS_FILE.read_text(encoding="utf-8")) if PLANS_FILE.exists() else []
                plan = body.get("plan", {})
                plan["id"] = plan.get("id") or str(int(__import__("time").time() * 1000))
                plan["updatedAt"] = __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds")
                plans = [p for p in plans if p.get("id") != plan["id"]]
                plans.insert(0, plan)
                PLANS_FILE.write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")
                self.send_json(plan)
            except Exception as exc:
                self.send_json({"error": f"方案保存失败：{exc}"}, 400)
            return
        if path == "/api/plans/delete":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                plans = json.loads(PLANS_FILE.read_text(encoding="utf-8")) if PLANS_FILE.exists() else []
                plans = [p for p in plans if p.get("id") != body.get("id")]
                PLANS_FILE.write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")
                self.send_json({"ok": True})
            except Exception as exc:
                self.send_json({"error": f"方案删除失败：{exc}"}, 400)
            return
        if path == "/api/save":
            with STATE_LOCK:
                data = STATE["data"]
            if not data:
                self.send_json({"error": "暂无可保存的数据"}, 404)
                return
            try:
                (ROOT / "sporttery_history.json").write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                (ROOT / "sporttery_history.md").write_text(
                    render_markdown(data["matches"], data["errors"], data["limits"], data["total"]),
                    encoding="utf-8",
                )
                self.send_json({"ok": True})
            except OSError as exc:
                self.send_json({"error": f"保存失败：{exc}"}, 500)
            return
        if path != "/api/query":
            self.send_json({"error": "接口不存在"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            limits = min(max(int(body.get("limits", 10)), 1), 100)
            workers = min(max(int(body.get("workers", 4)), 1), 10)
            data = collect_history(limits=limits, workers=workers)
            with STATE_LOCK:
                STATE["data"] = data
            (ROOT / "sporttery_history.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            (ROOT / "sporttery_history.md").write_text(
                render_markdown(data["matches"], data["errors"], limits, data["total"]), encoding="utf-8"
            )
            self.send_json(data)
        except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": f"查询失败：{exc}"}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="体彩足球历史交锋 Web 界面")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}"
    print(f"界面已启动：{url}（按 Ctrl+C 停止）")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
