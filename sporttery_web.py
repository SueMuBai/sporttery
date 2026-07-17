#!/usr/bin/env python3
"""Local web interface for the Sporttery history collector."""

from __future__ import annotations

import argparse
import base64
import itertools
import json
import mimetypes
import threading
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sporttery_history import collect_history, fetch_json, render_markdown
import sporttery_db as storage


ROOT = Path(__file__).resolve().parent
WEB_FILE = ROOT / "web" / "index.html"
ASSET_ROOT = ROOT / "web" / "assets"
try:
    from embedded_web_assets import ASSETS_BASE64
except ImportError:
    ASSETS_BASE64 = {}
STATE: dict[str, Any] = {"data": None}
RESULT_API = "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry"
saved_matches = storage.latest_matches()
if saved_matches:
    STATE["data"] = {"matches": saved_matches, "errors": [], "total": len(saved_matches), "limits": storage.get_settings().get("history_limits", 10), "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
STATE_LOCK = threading.Lock()


def load_results() -> dict[int, dict[str, Any]]:
    return storage.latest_results()


def selection_wins(selection: dict[str, Any], result: dict[str, Any]) -> bool:
    official = result.get("officialResults", {})
    if selection["market"] in official:
        return selection["outcome"] == official[selection["market"]]
    home, away = map(int, result["fullTimeScore"].split(":"))
    market = selection["market"]
    if market == "had":
        actual = "h" if home > away else "d" if home == away else "a"
    elif market == "hhad":
        adjusted_home = home + int(result.get("goalLine", 0))
        actual = "h" if adjusted_home > away else "d" if adjusted_home == away else "a"
    elif market == "ttg":
        actual = str(home + away) if home + away <= 6 else "7+"
    elif market == "hafu":
        half_home, half_away = map(int, result["halfTimeScore"].split(":"))
        half = "h" if half_home > half_away else "d" if half_home == half_away else "a"
        full = "h" if home > away else "d" if home == away else "a"
        actual = f"{half}-{full}"
    elif market == "crs":
        score = f"{home}:{away}"
        exact_scores = {
            "0:0", "0:1", "0:2", "0:3", "0:4", "0:5",
            "1:0", "1:1", "1:2", "1:3", "1:4", "1:5",
            "2:0", "2:1", "2:2", "2:3", "2:4", "2:5",
            "3:0", "3:1", "3:2", "3:3", "4:0", "4:1", "4:2",
            "5:0", "5:1", "5:2",
        }
        if score in exact_scores:
            actual = score
        else:
            actual = "home_other" if home > away else "draw_other" if home == away else "away_other"
    else:
        return False
    return selection["outcome"] == actual


def evaluate_plan(plan: dict[str, Any], results: dict[int, dict[str, Any]]) -> dict[str, Any]:
    selections = plan.get("selections", [])
    stake = 0.0
    settled_stake = 0.0
    prize = 0.0
    multiplier = int(plan.get("multiplier", 1))
    groups: dict[int, list[dict[str, Any]]] = {}
    for selection in selections:
        groups.setdefault(int(selection["matchId"]), []).append(selection)
    settled_ids = set(groups).intersection(results)
    pending = len(groups) - len(settled_ids)
    for size in plan.get("passCounts", []):
        for match_combo in itertools.combinations(groups.values(), int(size)):
            for combo in itertools.product(*match_combo):
                stake += 2 * multiplier
                combo_settled = all(int(s["matchId"]) in results for s in combo)
                if combo_settled:
                    settled_stake += 2 * multiplier
                if combo_settled and all(
                    selection_wins(s, results[int(s["matchId"])]) for s in combo
                ):
                    payout = 2 * multiplier
                    for selection in combo:
                        payout *= float(selection["odds"])
                    prize += payout
    # Profit is final only after every selected match has a result.
    correct_matches = sum(
        1
        for match_id, choices in groups.items()
        if match_id in results and any(selection_wins(s, results[match_id]) for s in choices)
    )
    settled_count = len(settled_ids)
    return {
        "totalMatches": len(groups),
        "settledMatches": settled_count,
        "pendingMatches": pending,
        "correctMatches": correct_matches,
        "wrongMatches": settled_count - correct_matches,
        "stake": round(stake, 2),
        "settledStake": round(settled_stake, 2),
        "prize": round(prize, 2),
        "currentProfit": round(prize - settled_stake, 2),
        "profit": round(prize - stake, 2) if pending == 0 else None,
        "status": "settled" if pending == 0 else "pending",
    }


def refresh_ledger_returns() -> None:
    results = load_results()
    with storage.connect() as db:
        for row in db.execute("SELECT id,plan_snapshot FROM ledger_orders"):
            plan = json.loads(row["plan_snapshot"])
            evaluation = evaluate_plan(plan, results)
            status = "settled" if evaluation["status"] == "settled" else "pending"
            db.execute(
                "UPDATE ledger_orders SET return_amount=CASE WHEN return_manual=1 THEN return_amount ELSE ? END,status=?,updated_at=? WHERE id=?",
                (evaluation["prize"], status, datetime.now().astimezone().isoformat(timespec="seconds"), row["id"]),
            )


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
        elif path.startswith("/assets/"):
            asset = (ASSET_ROOT / path.removeprefix("/assets/")).resolve()
            if ASSET_ROOT.resolve() in asset.parents and asset.is_file():
                content = asset.read_bytes()
            elif path in ASSETS_BASE64:
                content = base64.b64decode(ASSETS_BASE64[path])
            else:
                self.send_json({"error": "资源不存在"}, 404)
                return
            content_type = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
            self.send_bytes(content, content_type)
        elif path == "/api/latest":
            with STATE_LOCK:
                self.send_json(STATE["data"] or {"matches": [], "errors": [], "total": 0})
        elif path == "/api/plans":
            plans = storage.list_plans()
            results = load_results()
            for plan in plans:
                plan["evaluation"] = evaluate_plan(plan, results)
            self.send_json(plans)
        elif path == "/api/results":
            self.send_json(list(load_results().values()))
        elif path == "/api/tags":
            self.send_json(storage.list_tags())
        elif path == "/api/settings":
            self.send_json(storage.get_settings())
        elif path == "/api/ledger":
            from urllib.parse import parse_qs
            params = parse_qs(urlparse(self.path).query)
            refresh_ledger_returns()
            self.send_json(storage.list_ledger((params.get("start") or [None])[0], (params.get("end") or [None])[0]))
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
                try:
                    plans = storage.list_plans()
                except (OSError, json.JSONDecodeError):
                    plans = []
                desired_ids = set(by_id)
                for plan in plans:
                    desired_ids.update(int(s["matchId"]) for s in plan.get("selections", []))
                today = datetime.now().astimezone()
                dates: set[str] = {
                    (today + timedelta(days=offset)).strftime("%Y-%m-%d")
                    for offset in range(-7, 2)
                }
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
                            if match_id not in desired_ids or not item.get("sectionsNo999"):
                                continue
                            source = by_id.get(match_id, {})
                            official_results: dict[str, str] = {}
                            try:
                                detail = fetch_json(
                                    "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchGeneral.qry",
                                    {"matchId": match_id, "matchStatus": item.get("matchStatus", "11")},
                                    15,
                                    2,
                                )
                                for pool in detail.get("value", {}).get("matchResultList", []) or []:
                                    code = str(pool.get("poolCode", "")).lower()
                                    combination = str(pool.get("combination", ""))
                                    if code in ("had", "hhad"):
                                        official_results[code] = combination.lower()
                                    elif code == "hafu":
                                        official_results[code] = combination.lower().replace(":", "-")
                                    elif code == "ttg":
                                        official_results[code] = combination
                                    elif code == "crs":
                                        if combination == "-1:-H":
                                            combination = "home_other"
                                        elif combination == "-1:-D":
                                            combination = "draw_other"
                                        elif combination == "-1:-A":
                                            combination = "away_other"
                                        official_results[code] = combination
                            except Exception:
                                pass
                            result = {
                                "matchId": match_id,
                                "matchNum": item.get("matchNumStr", source.get("matchNum", "")),
                                "homeTeam": item.get("homeTeamAbbName", source.get("homeTeam", "")),
                                "awayTeam": item.get("awayTeamAbbName", source.get("awayTeam", "")),
                                "halfTimeScore": item.get("sectionsNo1", ""),
                                "fullTimeScore": item.get("sectionsNo999", ""),
                                "goalLine": int(float(source.get("odds", {}).get("hhad", {}).get("goalLineValue") or 0)),
                                "officialResults": official_results,
                                "fetchedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                            }
                            old = existing.get(match_id)
                            result_signature = (
                                result.get("halfTimeScore"), result.get("fullTimeScore"),
                                result.get("goalLine"), result.get("officialResults", {}),
                            )
                            old_signature = (
                                old.get("halfTimeScore"), old.get("fullTimeScore"),
                                old.get("goalLine"), old.get("officialResults", {}),
                            ) if old else None
                            if old_signature != result_signature:
                                appended.append(result)
                                existing[match_id] = result
                for result in appended:
                    storage.store_result(result)
                # Recalculate current return amounts for purchased ledger snapshots.
                refresh_ledger_returns()
                self.send_json({"ok": True, "appended": len(appended), "results": list(existing.values())})
            except Exception as exc:
                self.send_json({"error": f"赛果更新失败：{exc}"}, 500)
            return
        if path == "/api/plans":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                plan = body.get("plan", {})
                self.send_json(storage.upsert_plan(plan))
            except Exception as exc:
                self.send_json({"error": f"方案保存失败：{exc}"}, 400)
            return
        if path == "/api/tags":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                tag = str(body.get("tag", "")).strip()
                self.send_json(storage.add_tag(tag) if tag else storage.list_tags())
            except Exception as exc:
                self.send_json({"error": f"标签保存失败：{exc}"}, 400)
            return
        if path == "/api/tags/delete":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                self.send_json(storage.delete_tag(str(body.get("tag", ""))))
            except Exception as exc:
                self.send_json({"error": f"标签删除失败：{exc}"}, 400)
            return
        if path == "/api/tags/rename":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                self.send_json(storage.rename_tag(str(body.get("oldTag", "")), str(body.get("newTag", ""))))
            except Exception as exc:
                self.send_json({"error": f"标签修改失败：{exc}"}, 400)
            return
        if path == "/api/plans/delete":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                storage.remove_plan(str(body.get("id")))
                self.send_json({"ok": True})
            except Exception as exc:
                self.send_json({"error": f"方案删除失败：{exc}"}, 400)
            return
        if path == "/api/settings":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                self.send_json(storage.update_settings(json.loads(self.rfile.read(length) or b"{}")))
            except Exception as exc:
                self.send_json({"error": f"设置保存失败：{exc}"}, 400)
            return
        if path == "/api/ledger/update":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                storage.update_ledger(str(body["id"]), body.get("returnAmount"), body.get("notes"))
                self.send_json({"ok": True})
            except Exception as exc:
                self.send_json({"error": f"账单更新失败：{exc}"}, 400)
            return
        if path == "/api/save":
            with STATE_LOCK:
                data = STATE["data"]
            if not data:
                self.send_json({"error": "暂无可保存的数据"}, 404)
                return
            try:
                storage.store_matches(data["matches"])
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
            app_settings = storage.get_settings()
            data = collect_history(limits=limits, workers=workers, timeout=float(app_settings.get("timeout", 15)), retries=int(app_settings.get("retries", 2)))
            with STATE_LOCK:
                STATE["data"] = data
            storage.store_matches(data["matches"])
            storage.update_settings({"history_limits": limits, "workers": workers})
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
