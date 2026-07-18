"""SQLite persistence and one-time migration for the Sporttery ledger app."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("SPORTTERY_DATA_DIR", ROOT))
DATA_ROOT.mkdir(parents=True, exist_ok=True)
DB_FILE = DATA_ROOT / "caiguo.db"


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_FILE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError:
        db.execute("PRAGMA journal_mode=DELETE")
    return db


SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, pass_counts TEXT NOT NULL, multiplier INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_selections(
  id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL, market TEXT NOT NULL, outcome TEXT NOT NULL, odds REAL NOT NULL,
  selection_key TEXT NOT NULL, UNIQUE(plan_id, selection_key)
);
CREATE TABLE IF NOT EXISTS plan_tags(
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(plan_id, tag_id)
);
CREATE TABLE IF NOT EXISTS match_snapshots(
  match_id INTEGER PRIMARY KEY, match_num TEXT, match_datetime TEXT, home_team TEXT, away_team TEXT,
  payload TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER NOT NULL, match_num TEXT, home_team TEXT, away_team TEXT,
  half_time_score TEXT, full_time_score TEXT NOT NULL, goal_line INTEGER NOT NULL DEFAULT 0,
  official_results TEXT NOT NULL DEFAULT '{}', fetched_at TEXT NOT NULL,
  UNIQUE(match_id, full_time_score, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_results_match ON match_results(match_id, id);
CREATE TABLE IF NOT EXISTS ledger_orders(
  id TEXT PRIMARY KEY, plan_id TEXT, plan_name TEXT NOT NULL, plan_snapshot TEXT NOT NULL,
  purchased_at TEXT NOT NULL, stake_amount REAL NOT NULL, return_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES ledger_orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, amount REAL NOT NULL, occurred_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_orders(purchased_at);
"""


def initialize() -> None:
    with connect() as db:
        db.executescript(SCHEMA)
        columns = {r[1] for r in db.execute("PRAGMA table_info(ledger_orders)")}
        if "return_manual" not in columns:
            db.execute("ALTER TABLE ledger_orders ADD COLUMN return_manual INTEGER NOT NULL DEFAULT 0")
        tag_columns = {r[1] for r in db.execute("PRAGMA table_info(tags)")}
        if "color" not in tag_columns:
            db.execute("ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '#5797F5'")
        if "sort_order" not in tag_columns:
            db.execute("ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        palette = ("#5797F5", "#9A91F5", "#61D6BF", "#FF8FB3", "#FFD166", "#FF6B4A")
        for index, row in enumerate(db.execute("SELECT id,color,sort_order FROM tags ORDER BY id")):
            color = row["color"] if re.fullmatch(r"#[0-9A-Fa-f]{6}", row["color"] or "") else palette[index % len(palette)]
            sort_order = row["sort_order"] or index + 1
            db.execute("UPDATE tags SET color=?,sort_order=? WHERE id=?", (color.upper(), sort_order, row["id"]))
        defaults = {"history_limits": 10, "workers": 4, "timeout": 15, "retries": 2, "default_multiplier": 1}
        for key, value in defaults.items():
            db.execute(
                "INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)",
                (key, json.dumps(value, ensure_ascii=False), now()),
            )
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=1").fetchone():
            _migrate_legacy(db)
            db.execute("INSERT INTO schema_migrations VALUES(1,?)", (now(),))
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=2").fetchone():
            db.execute("INSERT INTO schema_migrations VALUES(2,?)", (now(),))
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version=3").fetchone():
            palette = ("#5797F5", "#9A91F5", "#61D6BF", "#FF8FB3", "#FFD166", "#FF6B4A")
            for index, row in enumerate(db.execute("SELECT id FROM tags ORDER BY id"), 1):
                db.execute(
                    "UPDATE tags SET color=?,sort_order=? WHERE id=?",
                    (palette[(index - 1) % len(palette)], index, row["id"]),
                )
            db.execute("INSERT INTO schema_migrations VALUES(3,?)", (now(),))


def _read_json(name: str, default: Any) -> Any:
    try:
        return json.loads((ROOT / name).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _migrate_legacy(db: sqlite3.Connection) -> None:
    for tag in _read_json("sporttery_tags.json", ["已购", "AI"]):
        db.execute("INSERT OR IGNORE INTO tags(name,created_at) VALUES(?,?)", (str(tag), now()))
    history = _read_json("sporttery_history.json", {})
    save_matches(db, history.get("matches", []))
    plans = _read_json("sporttery_plans.json", [])
    for plan in plans:
        plan = {k: v for k, v in plan.items() if k != "evaluation"}
        save_plan(db, plan, create_ledger=False)
    result_file = ROOT / "sporttery_results.jsonl"
    if result_file.exists():
        for line in result_file.read_text(encoding="utf-8").splitlines():
            try:
                append_result(db, json.loads(line))
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
    for plan in plans:
        if "已购" in plan.get("tags", []):
            current = get_plan(db, str(plan["id"]))
            if current:
                create_ledger_order(db, current, purchased_at=plan.get("updatedAt"), allow_existing=True)


def get_settings() -> dict[str, Any]:
    with connect() as db:
        return {r["key"]: json.loads(r["value"]) for r in db.execute("SELECT key,value FROM settings")}


def update_settings(values: dict[str, Any]) -> dict[str, Any]:
    with connect() as db:
        for key, value in values.items():
            db.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
                (key, json.dumps(value, ensure_ascii=False), now()),
            )
    return get_settings()


def list_tags() -> list[str]:
    with connect() as db:
        return [r["name"] for r in db.execute("SELECT name FROM tags ORDER BY sort_order,id")]


def list_tag_details() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """SELECT t.name,t.color,t.sort_order,COUNT(pt.plan_id) AS plan_count
               FROM tags t LEFT JOIN plan_tags pt ON pt.tag_id=t.id
               GROUP BY t.id ORDER BY t.sort_order,t.id"""
        ).fetchall()
    return [
        {
            "name": row["name"],
            "color": row["color"],
            "sortOrder": row["sort_order"],
            "planCount": row["plan_count"],
            "system": row["name"] == "已购",
        }
        for row in rows
    ]


def normalize_tag_color(value: str | None) -> str:
    color = str(value or "#5797F5").strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        raise ValueError("标签颜色格式无效")
    return color


def add_tag(name: str, color: str | None = None) -> list[str]:
    name = name.strip()
    if not name or len(name) > 8:
        raise ValueError("标签名称需为1至8个字符")
    with connect() as db:
        if db.execute("SELECT COUNT(*) FROM tags").fetchone()[0] >= 8:
            raise ValueError("最多只能创建8个标签")
        next_order = db.execute("SELECT COALESCE(MAX(sort_order),0)+1 FROM tags").fetchone()[0]
        db.execute(
            "INSERT INTO tags(name,created_at,color,sort_order) VALUES(?,?,?,?)",
            (name, now(), normalize_tag_color(color), next_order),
        )
    return list_tags()


def delete_tag(name: str) -> list[str]:
    with connect() as db:
        db.execute("DELETE FROM tags WHERE name=?", (name,))
    return list_tags()


def rename_tag(old_name: str, new_name: str, color: str | None = None) -> list[str]:
    old_name, new_name = old_name.strip(), new_name.strip()
    if not old_name or not new_name or len(new_name) > 8:
        raise ValueError("标签名称需为1至8个字符")
    with connect() as db:
        duplicate = db.execute("SELECT id FROM tags WHERE lower(name)=lower(?) AND name<>?", (new_name, old_name)).fetchone()
        if duplicate:
            raise ValueError("标签名称已存在")
        if color is None:
            db.execute("UPDATE tags SET name=? WHERE name=?", (new_name, old_name))
        else:
            db.execute("UPDATE tags SET name=?,color=? WHERE name=?", (new_name, normalize_tag_color(color), old_name))
    return list_tags()


def reorder_tags(names: list[str]) -> list[dict[str, Any]]:
    with connect() as db:
        existing = [r["name"] for r in db.execute("SELECT name FROM tags ORDER BY sort_order,id")]
        ordered = [name for name in names if name in existing]
        ordered.extend(name for name in existing if name not in ordered)
        for index, name in enumerate(ordered, 1):
            db.execute("UPDATE tags SET sort_order=? WHERE name=?", (index, name))
    return list_tag_details()


def save_matches(db: sqlite3.Connection, matches: list[dict[str, Any]]) -> None:
    for match in matches:
        db.execute(
            """INSERT INTO match_snapshots VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(match_id) DO UPDATE SET match_num=excluded.match_num,match_datetime=excluded.match_datetime,
            home_team=excluded.home_team,away_team=excluded.away_team,payload=excluded.payload,updated_at=excluded.updated_at""",
            (match["matchId"], match.get("matchNum"), match.get("matchDateTime"), match.get("homeTeam"),
             match.get("awayTeam"), json.dumps(match, ensure_ascii=False), now()),
        )


def store_matches(matches: list[dict[str, Any]]) -> None:
    with connect() as db:
        save_matches(db, matches)


def latest_matches() -> list[dict[str, Any]]:
    with connect() as db:
        return [json.loads(r["payload"]) for r in db.execute("SELECT payload FROM match_snapshots ORDER BY match_datetime,match_num")]


def save_plan(db: sqlite3.Connection, plan: dict[str, Any], create_ledger: bool = True) -> dict[str, Any]:
    plan_id = str(plan.get("id") or int(datetime.now().timestamp() * 1000))
    stamp = now()
    existing = db.execute("SELECT created_at FROM plans WHERE id=?", (plan_id,)).fetchone()
    db.execute(
        "INSERT OR REPLACE INTO plans VALUES(?,?,?,?,?,?)",
        (plan_id, plan.get("name") or "未命名方案", json.dumps(plan.get("passCounts", [2])),
         int(plan.get("multiplier", 1)), existing[0] if existing else stamp, stamp),
    )
    db.execute("DELETE FROM plan_selections WHERE plan_id=?", (plan_id,))
    for s in plan.get("selections", []):
        db.execute(
            "INSERT INTO plan_selections(plan_id,match_id,market,outcome,odds,selection_key) VALUES(?,?,?,?,?,?)",
            (plan_id, int(s["matchId"]), s["market"], s["outcome"], float(s["odds"]), s.get("key") or f'{s["matchId"]}|{s["market"]}|{s["outcome"]}'),
        )
    db.execute("DELETE FROM plan_tags WHERE plan_id=?", (plan_id,))
    for tag in plan.get("tags", []):
        db.execute("INSERT OR IGNORE INTO tags(name,created_at) VALUES(?,?)", (tag, stamp))
        tag_id = db.execute("SELECT id FROM tags WHERE name=?", (tag,)).fetchone()[0]
        db.execute("INSERT OR IGNORE INTO plan_tags VALUES(?,?)", (plan_id, tag_id))
    saved = get_plan(db, plan_id)
    # Keep the linked ledger label in sync while preserving its purchased
    # selections, odds, stake and timestamp as an immutable snapshot.
    db.execute(
        "UPDATE ledger_orders SET plan_name=?,updated_at=? WHERE plan_id=? AND plan_name<>?",
        (saved["name"], stamp, plan_id, saved["name"]),
    )
    if create_ledger and "已购" in plan.get("tags", []):
        create_ledger_order(db, saved, allow_existing=True)
    return saved


def upsert_plan(plan: dict[str, Any]) -> dict[str, Any]:
    with connect() as db:
        return save_plan(db, plan)


def get_plan(db: sqlite3.Connection, plan_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    if not row:
        return None
    selections = [dict(r) for r in db.execute("SELECT match_id AS matchId,market,outcome,odds,selection_key AS key FROM plan_selections WHERE plan_id=? ORDER BY id", (plan_id,))]
    tags = [r[0] for r in db.execute("SELECT t.name FROM tags t JOIN plan_tags pt ON pt.tag_id=t.id WHERE pt.plan_id=?", (plan_id,))]
    return {"id": row["id"], "name": row["name"], "selections": selections, "passCounts": json.loads(row["pass_counts"]),
            "multiplier": row["multiplier"], "tags": tags, "updatedAt": row["updated_at"]}


def list_plans() -> list[dict[str, Any]]:
    with connect() as db:
        ids = [r[0] for r in db.execute("SELECT id FROM plans ORDER BY updated_at DESC")]
        return [get_plan(db, i) for i in ids]


def remove_plan(plan_id: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM plans WHERE id=?", (plan_id,))


def append_result(db: sqlite3.Connection, result: dict[str, Any]) -> bool:
    before = db.total_changes
    db.execute(
        "INSERT OR IGNORE INTO match_results(match_id,match_num,home_team,away_team,half_time_score,full_time_score,goal_line,official_results,fetched_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (int(result["matchId"]), result.get("matchNum"), result.get("homeTeam"), result.get("awayTeam"),
         result.get("halfTimeScore"), result["fullTimeScore"], int(result.get("goalLine", 0)),
         json.dumps(result.get("officialResults", {}), ensure_ascii=False), result.get("fetchedAt") or now()),
    )
    return db.total_changes > before


def store_result(result: dict[str, Any]) -> bool:
    with connect() as db:
        return append_result(db, result)


def latest_results() -> dict[int, dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM match_results ORDER BY id").fetchall()
    out: dict[int, dict[str, Any]] = {}
    for r in rows:
        out[r["match_id"]] = {"matchId": r["match_id"], "matchNum": r["match_num"], "homeTeam": r["home_team"],
            "awayTeam": r["away_team"], "halfTimeScore": r["half_time_score"], "fullTimeScore": r["full_time_score"],
            "goalLine": r["goal_line"], "officialResults": json.loads(r["official_results"]), "fetchedAt": r["fetched_at"]}
    return out


def calculated_stake(plan: dict[str, Any]) -> float:
    import itertools
    groups: dict[int, int] = {}
    for s in plan.get("selections", []):
        groups[int(s["matchId"])] = groups.get(int(s["matchId"]), 0) + 1
    bets = 0
    counts = list(groups.values())
    for n in plan.get("passCounts", []):
        for combo in itertools.combinations(counts, int(n)):
            product = 1
            for count in combo:
                product *= count
            bets += product
    return float(bets * 2 * int(plan.get("multiplier", 1)))


def create_ledger_order(db: sqlite3.Connection, plan: dict[str, Any], purchased_at: str | None = None, allow_existing: bool = False) -> str:
    existing = db.execute("SELECT id FROM ledger_orders WHERE plan_id=?", (str(plan["id"]),)).fetchone()
    if existing and allow_existing:
        return existing[0]
    order_id = str(uuid.uuid4())
    stamp = purchased_at or now()
    stake = calculated_stake(plan)
    db.execute(
        "INSERT INTO ledger_orders(id,plan_id,plan_name,plan_snapshot,purchased_at,stake_amount,return_amount,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (order_id, str(plan["id"]), plan["name"], json.dumps(plan, ensure_ascii=False), stamp, stake, 0.0, "pending", "", now(), now()),
    )
    db.execute("INSERT INTO ledger_transactions(order_id,type,amount,occurred_at,note) VALUES(?,?,?,?,?)", (order_id, "purchase", -stake, stamp, "确认购买"))
    return order_id


def list_ledger(start: str | None = None, end: str | None = None) -> dict[str, Any]:
    query = "SELECT * FROM ledger_orders WHERE 1=1"
    args: list[Any] = []
    if start:
        query += " AND purchased_at>=?"; args.append(start)
    if end:
        query += " AND purchased_at<?"; args.append(end + "T23:59:59+99:99")
    query += " ORDER BY purchased_at DESC"
    with connect() as db:
        rows = [dict(r) for r in db.execute(query, args)]
    items = []
    for r in rows:
        r["netProfit"] = round(r["return_amount"] - r["stake_amount"], 2)
        r["snapshot"] = json.loads(r.pop("plan_snapshot"))
        items.append(r)
    return {"items": items, "totalStake": round(sum(x["stake_amount"] for x in items), 2),
            "totalReturn": round(sum(x["return_amount"] for x in items), 2),
            "totalProfit": round(sum(x["netProfit"] for x in items), 2)}


def update_ledger(order_id: str, return_amount: float | None = None, notes: str | None = None) -> None:
    with connect() as db:
        row = db.execute("SELECT return_amount,status FROM ledger_orders WHERE id=?", (order_id,)).fetchone()
        if not row:
            raise ValueError("账单不存在")
        if return_amount is not None:
            if row["status"] != "settled":
                raise ValueError("方案尚未全部结算，不能修改回款金额")
            value = max(0.0, float(return_amount))
            delta = value - float(row["return_amount"])
            db.execute("UPDATE ledger_orders SET return_amount=?,return_manual=1,updated_at=? WHERE id=?", (value, now(), order_id))
            if delta:
                db.execute("INSERT INTO ledger_transactions(order_id,type,amount,occurred_at,note) VALUES(?,?,?,?,?)", (order_id, "payout_adjustment", delta, now(), "修正回款金额"))
        if notes is not None:
            db.execute("UPDATE ledger_orders SET notes=?,updated_at=? WHERE id=?", (notes, now(), order_id))


initialize()
