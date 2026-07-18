#!/usr/bin/env python3
"""Verify that the checked-in v3-to-v4 SQLite SQL preserves money and rows."""

from __future__ import annotations

import re
import sqlite3
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def template_literal(path: Path, pattern: str) -> str:
    source = path.read_text(encoding="utf-8")
    match = re.search(pattern, source)
    if not match:
        raise RuntimeError(f"Cannot find migration SQL in {path}")
    return match.group(1)


def main() -> None:
    schema = template_literal(
        ROOT / "src/services/database/schema.ts",
        r"export const NATIVE_SCHEMA = `([\s\S]*?)`",
    )
    native_adapter = ROOT / "src/services/database/native/CapacitorSqliteAdapter.ts"
    legacy = template_literal(native_adapter, r"const LEGACY_LEDGER_SCHEMA = `([\s\S]*?)`")
    final = template_literal(
        native_adapter,
        r"await this\.db\.execute\(\n\s+`(INSERT INTO ledger_orders[\s\S]*?PRAGMA foreign_keys=ON;)`,",
    )

    with tempfile.NamedTemporaryFile(suffix=".db") as handle:
        database = sqlite3.connect(handle.name)
        database.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE ledger_orders(
              id TEXT PRIMARY KEY, plan_id TEXT, plan_name TEXT NOT NULL,
              plan_snapshot TEXT NOT NULL, purchased_at TEXT NOT NULL,
              stake_amount REAL NOT NULL, return_amount REAL NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'pending', notes TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              return_manual INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE ledger_transactions(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_id TEXT NOT NULL REFERENCES ledger_orders(id) ON DELETE CASCADE,
              type TEXT NOT NULL, amount REAL NOT NULL,
              occurred_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO ledger_orders VALUES(
              'o1','p1','方案','{}','2026-07-16',74.0,86.16,
              'settled','', 'created','updated',1
            );
            INSERT INTO ledger_transactions(order_id,type,amount,occurred_at,note)
            VALUES('o1','stake',74.0,'created','');
            """
        )

        database.executescript(legacy)
        database.executescript(schema)
        database.executescript(final)

        order = database.execute(
            "SELECT stake_cents,return_cents,return_manual FROM ledger_orders WHERE id='o1'"
        ).fetchone()
        transaction = database.execute(
            "SELECT amount_cents FROM ledger_transactions WHERE order_id='o1'"
        ).fetchone()
        new_tables = database.execute(
            """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type='table' AND name IN ('sync_jobs','odds_history','app_events')
            """
        ).fetchone()

        assert order == (7400, 8616, 1), order
        assert transaction == (7400,), transaction
        assert new_tables == (3,), new_tables

        columns = {
            row[1] for row in database.execute("PRAGMA table_info(ledger_orders)").fetchall()
        }
        assert "stake_cents" in columns and "stake_amount" not in columns

    print("Legacy SQLite v3 -> v4 migration verified: rows and integer-cent values preserved")


if __name__ == "__main__":
    main()
