export const DATABASE_NAME = 'caiguo_app_v2'
export const DATABASE_VERSION = 1

export const NATIVE_SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations(
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans(
  id TEXT PRIMARY KEY,
  source_plan_id TEXT,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  pass_counts TEXT NOT NULL,
  multiplier INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_selections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL,
  odds TEXT NOT NULL,
  selection_key TEXT NOT NULL,
  UNIQUE(plan_id, selection_key)
);
CREATE INDEX IF NOT EXISTS idx_plan_selections_plan ON plan_selections(plan_id);
CREATE TABLE IF NOT EXISTS plan_tags(
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(plan_id, tag_id)
);
CREATE TABLE IF NOT EXISTS match_snapshots(
  match_id INTEGER PRIMARY KEY,
  match_num TEXT NOT NULL,
  match_datetime TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  match_num TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  half_time_score TEXT NOT NULL,
  full_time_score TEXT NOT NULL,
  goal_line INTEGER NOT NULL,
  official_results TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(match_id, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_match_results_latest ON match_results(match_id, fetched_at DESC);
CREATE TABLE IF NOT EXISTS ledger_orders(
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  plan_name TEXT NOT NULL,
  plan_snapshot TEXT NOT NULL,
  purchased_at TEXT NOT NULL,
  stake_cents INTEGER NOT NULL,
  return_cents INTEGER NOT NULL,
  return_manual INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_orders_date ON ledger_orders(purchased_at DESC);
CREATE TABLE IF NOT EXISTS ledger_adjustments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES ledger_orders(id) ON DELETE CASCADE,
  previous_return_cents INTEGER NOT NULL,
  next_return_cents INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_adjustments_order ON ledger_adjustments(order_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS sync_jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  added_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  error_message TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS odds_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL,
  odds TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(match_id, market, outcome, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_odds_history_match ON odds_history(match_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS app_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`
