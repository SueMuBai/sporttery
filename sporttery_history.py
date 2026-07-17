#!/usr/bin/env python3
"""Fetch current Sporttery football matches and summarize head-to-head history."""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://webapi.sporttery.cn/gateway/uniform/football"
MATCH_URL = f"{BASE_URL}/getMatchCalculatorV1.qry"
HISTORY_URL = f"{BASE_URL}/getResultHistoryV1.qry"
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    # A complete browser request context avoids false positives from the site's WAF.
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.sporttery.cn/",
    "Origin": "https://www.sporttery.cn",
}


def fetch_json(url: str, params: dict[str, Any], timeout: float, retries: int) -> dict[str, Any]:
    full_url = f"{url}?{urlencode(params)}"
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request = Request(full_url, headers=HEADERS)
            with urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not payload.get("success") or str(payload.get("errorCode")) != "0":
                raise RuntimeError(payload.get("errorMessage") or "接口返回失败")
            return payload
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(0.5 * (2**attempt))
    raise RuntimeError(f"请求失败: {full_url}: {last_error}")


def get_matches(timeout: float, retries: int) -> list[dict[str, Any]]:
    payload = fetch_json(
        MATCH_URL,
        {"channel": "c", "poolCode": "crs,ttg,hafu,hhad,had"},
        timeout,
        retries,
    )
    groups = payload.get("value", {}).get("matchInfoList", []) or []
    return [match for group in groups for match in (group.get("subMatchList", []) or [])]


def result_for_team(history: dict[str, Any], team_id: int) -> tuple[str, int, int]:
    home_id = history.get("sportteryHomeTeamId")
    away_id = history.get("sportteryAwayTeamId")
    try:
        home_goals = int(history.get("homeTeamFullCourtGoalCnt", 0))
        away_goals = int(history.get("awayTeamFullCourtGoalCnt", 0))
    except (TypeError, ValueError):
        home_goals = away_goals = 0

    if team_id == home_id:
        goals_for, goals_against = home_goals, away_goals
    elif team_id == away_id:
        goals_for, goals_against = away_goals, home_goals
    else:
        return "unknown", 0, 0
    result = "win" if goals_for > goals_against else "loss" if goals_for < goals_against else "draw"
    return result, goals_for, goals_against


def summarize(match: dict[str, Any], history_payload: dict[str, Any]) -> dict[str, Any]:
    histories = history_payload.get("value", {}).get("matchList", []) or []
    home_id = int(match.get("homeTeamId", 0))
    away_id = int(match.get("awayTeamId", 0))
    wins = draws = losses = goals_for = goals_against = 0
    normalized_history = []
    for item in histories:
        result, gf, ga = result_for_team(item, home_id)
        if result == "win":
            wins += 1
        elif result == "draw":
            draws += 1
        elif result == "loss":
            losses += 1
        goals_for += gf
        goals_against += ga
        normalized_history.append(
            {
                "date": item.get("matchDate", ""),
                "tournament": item.get("tournamentShortName", ""),
                "homeTeam": item.get("homeTeamShortName", ""),
                "awayTeam": item.get("awayTeamShortName", ""),
                "score": item.get("fullCourtGoal", ""),
                "halfTimeScore": item.get("halfTimeGoal", ""),
                "currentHomeTeamResult": result,
                "homeTeamRole": (
                    "currentHome"
                    if item.get("sportteryHomeTeamId") == home_id
                    else "currentAway"
                    if item.get("sportteryHomeTeamId") == away_id
                    else "unknown"
                ),
                "awayTeamRole": (
                    "currentHome"
                    if item.get("sportteryAwayTeamId") == home_id
                    else "currentAway"
                    if item.get("sportteryAwayTeamId") == away_id
                    else "unknown"
                ),
            }
        )

    count = wins + draws + losses
    return {
        "matchId": match.get("matchId"),
        "matchNum": match.get("matchNumStr", ""),
        "league": match.get("leagueAbbName", ""),
        "matchDateTime": f"{match.get('matchDate', '')} {match.get('matchTime', '')}".strip(),
        "homeTeam": match.get("homeTeamAbbName", ""),
        "awayTeam": match.get("awayTeamAbbName", ""),
        "homeRank": match.get("homeRank", ""),
        "awayRank": match.get("awayRank", ""),
        "odds": {
            "had": match.get("had", {}),
            "hhad": match.get("hhad", {}),
            "crs": match.get("crs", {}),
            "ttg": match.get("ttg", {}),
            "hafu": match.get("hafu", {}),
        },
        "historySummary": {
            "perspective": match.get("homeTeamAbbName", ""),
            "matches": count,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "goalsFor": goals_for,
            "goalsAgainst": goals_against,
            "winRate": round(wins * 100 / count, 1) if count else 0,
        },
        "history": normalized_history,
    }


def render_markdown(
    items: list[dict[str, Any]], errors: list[dict[str, Any]], limits: int, total: int
) -> str:
    lines = [
        "# 体彩足球当前比赛历史交锋汇总",
        "",
        f"> 生成时间：{datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z')}  ",
        f"> 当前比赛：{total} 场；历史查询成功 {len(items)} 场、失败 {len(errors)} 场；每场最多查询 {limits} 条历史交锋。  ",
        "> 胜/平/负、进失球均以当前比赛主队视角统计。",
        "",
    ]
    for item in items:
        summary = item["historySummary"]
        had, hhad = item["odds"]["had"], item["odds"]["hhad"]
        lines.extend(
            [
                f"## {item['matchNum']}｜{item['league']}｜{item['homeTeam']} vs {item['awayTeam']}",
                "",
                f"- 比赛时间：{item['matchDateTime']}；matchId：`{item['matchId']}`",
                f"- 排名：{item['homeRank'] or '-'} / {item['awayRank'] or '-'}",
                f"- 胜平负赔率：主 {had.get('h', '-')} / 平 {had.get('d', '-')} / 客 {had.get('a', '-')}",
                f"- 让球（{hhad.get('goalLine', '-')}）赔率：主 {hhad.get('h', '-')} / 平 {hhad.get('d', '-')} / 客 {hhad.get('a', '-')}",
                f"- 交锋汇总（{summary['perspective']}视角）：{summary['matches']} 场 {summary['wins']}胜 {summary['draws']}平 {summary['losses']}负，进 {summary['goalsFor']} 球失 {summary['goalsAgainst']} 球，胜率 {summary['winRate']}%",
                "",
            ]
        )
        if item["history"]:
            lines.extend(
                [
                    "| 日期 | 赛事 | 主队 | 半场比分 | 全场比分 | 客队 | 当前主队结果 |",
                    "|---|---|---|---:|---:|---|---|",
                ]
            )
            labels = {"win": "胜", "draw": "平", "loss": "负", "unknown": "未知"}
            for row in item["history"]:
                lines.append(
                    f"| {row['date']} | {row['tournament']} | {row['homeTeam']} | {row['halfTimeScore'] or '-'} | {row['score']} | {row['awayTeam']} | {labels[row['currentHomeTeamResult']]} |"
                )
            lines.append("")
        else:
            lines.extend(["暂无历史交锋记录。", ""])
    if errors:
        lines.extend(["## 查询失败", ""])
        lines.extend(f"- matchId `{e['matchId']}`：{e['error']}" for e in errors)
        lines.append("")
    return "\n".join(lines)


def collect_history(
    limits: int = 10, workers: int = 4, timeout: float = 15, retries: int = 2
) -> dict[str, Any]:
    """Collect matches and histories for both the CLI and web interface."""
    if limits < 1 or workers < 1 or retries < 0:
        raise ValueError("limits/workers 必须大于 0，retries 不能小于 0")
    matches = get_matches(timeout, retries)
    results: dict[int, dict[str, Any]] = {}
    errors: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                fetch_json,
                HISTORY_URL,
                {
                    "sportteryMatchId": match["matchId"],
                    "termLimits": limits,
                    "tournamentFlag": 0,
                    "homeAwayFlag": 0,
                },
                timeout,
                retries,
            ): match
            for match in matches
        }
        for future in as_completed(futures):
            match = futures[future]
            try:
                results[int(match["matchId"])] = summarize(match, future.result())
            except Exception as exc:
                errors.append({"matchId": match.get("matchId"), "error": str(exc)})
    ordered = [results[int(m["matchId"])] for m in matches if int(m["matchId"]) in results]
    return {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "total": len(matches),
        "limits": limits,
        "matches": ordered,
        "errors": errors,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="获取体彩当前足球比赛及历史交锋汇总")
    parser.add_argument("--limits", type=int, default=10, help="每场历史交锋条数，默认 10")
    parser.add_argument("--workers", type=int, default=4, help="并发请求数，默认 4")
    parser.add_argument("--timeout", type=float, default=15, help="单次请求超时秒数，默认 15")
    parser.add_argument("--retries", type=int, default=2, help="失败重试次数，默认 2")
    parser.add_argument("--output", default="sporttery_history.md", help="Markdown 输出文件")
    parser.add_argument("--json-output", default="sporttery_history.json", help="JSON 输出文件")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        data = collect_history(args.limits, args.workers, args.timeout, args.retries)
    except (RuntimeError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    Path(args.output).write_text(
        render_markdown(data["matches"], data["errors"], args.limits, data["total"]),
        encoding="utf-8",
    )
    Path(args.json_output).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"完成：获取 {data['total']} 场，成功 {len(data['matches'])} 场，失败 {len(data['errors'])} 场")
    print(f"Markdown: {Path(args.output).resolve()}")
    print(f"JSON:     {Path(args.json_output).resolve()}")
    return 0 if not data["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
