import { isValidMarketOutcome } from "@/features/betting/outcomes";
import { normalizeLedgerAdjustment } from "@/features/ledger/adjustments";
import {
  assertValidMatchResult,
  assertValidMatchSnapshot,
} from "@/features/matches/validation";
import {
  assertPersistableLedgerOrder,
  assertPersistablePlan,
} from "@/features/plans/validation";
import {
  assertValidPlanTag,
  MAX_PLAN_TAGS,
  normalizedTagIdentity,
} from "@/features/plans/tagValidation";
import { validateSettings } from "@/features/settings/validation";
import type {
  AppEvent,
  AppSettings,
  LedgerAdjustment,
  LedgerOrder,
  MatchResult,
  MatchSnapshot,
  OddsHistoryEntry,
  PlanSelection,
  PlanTag,
  SavedPlan,
  SyncJob,
} from "@/types/domain";

export interface DatabaseBackupSnapshot {
  settings: AppSettings;
  tags: PlanTag[];
  plans: SavedPlan[];
  ledgerOrders: LedgerOrder[];
  ledgerAdjustments: LedgerAdjustment[];
  matches: MatchSnapshot[];
  results: MatchResult[];
  syncJobs: SyncJob[];
  oddsHistory: OddsHistoryEntry[];
  appEvents: AppEvent[];
}

const marketCodes = new Set(["had", "hhad", "crs", "ttg", "hafu"]);
const syncKinds = new Set(["matches", "results", "full"]);
const syncStatuses = new Set(["running", "success", "partial", "failed"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value;
}

function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}${allowEmpty ? "格式无效" : "不能为空"}`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label}无效`);
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${label}格式无效`);
  return result;
}

function optionalId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return integer(value, label, 1);
}

function cloneRecord(value: unknown, label: string): Record<string, unknown> {
  return structuredClone(record(value, label));
}

function normalizeSettings(value: unknown): AppSettings {
  const source = record(value, "系统设置");
  const settings: AppSettings = {
    historyLimits: integer(source.historyLimits, "每场历史条数", 1),
    workers: integer(source.workers, "并发请求数", 1),
    timeoutSeconds: integer(source.timeoutSeconds, "接口超时", 1),
    retries: integer(source.retries, "失败重试次数", 0),
    defaultMultiplier: integer(source.defaultMultiplier, "默认倍数", 1),
    autoSyncMatches: source.autoSyncMatches as boolean,
    expandMatchDetails: source.expandMatchDetails as boolean,
  };
  validateSettings(settings);
  return settings;
}

function normalizeTag(value: unknown, index: number): PlanTag {
  const source = record(value, `第 ${index + 1} 个标签`);
  const tag: PlanTag = {
    id: optionalId(source.id, `第 ${index + 1} 个标签 ID`),
    name: text(source.name, `第 ${index + 1} 个标签名称`),
    color: text(source.color, `标签“${String(source.name ?? "")}”的颜色`),
    sortOrder: integer(source.sortOrder, "标签排序", 1),
    createdAt: timestamp(source.createdAt, "标签创建时间"),
  };
  assertValidPlanTag(tag);
  return tag;
}

function normalizeSelection(
  value: unknown,
  planName: string,
  index: number,
): PlanSelection {
  const source = record(value, `方案“${planName}”第 ${index + 1} 个投注选项`);
  const market = text(source.market, "投注玩法");
  if (!marketCodes.has(market)) throw new Error(`方案“${planName}”包含未知玩法`);
  return {
    key: text(source.key, "投注键"),
    matchId: integer(source.matchId, "投注比赛 ID", 1),
    market: market as PlanSelection["market"],
    outcome: text(source.outcome, "投注选项"),
    odds: text(source.odds, "投注赔率"),
  };
}

function normalizePlan(value: unknown, index: number, label = "方案"): SavedPlan {
  const source = record(value, `第 ${index + 1} 个${label}`);
  const name = text(source.name, `${label}名称`);
  if (source.status !== "saved") throw new Error(`${label}状态无效`);
  const sourcePlanId =
    source.sourcePlanId === undefined
      ? undefined
      : text(source.sourcePlanId, `${label}来源 ID`);
  const selections = array(source.selections, `${label}“${name}”的投注选项`).map(
    (selection, selectionIndex) =>
      normalizeSelection(selection, name, selectionIndex),
  );
  const tags = array(source.tags, `${label}“${name}”的标签`).map((tag) =>
    text(tag, `${label}标签`),
  );
  const plan: SavedPlan = {
    id: text(source.id, `${label} ID`),
    ...(sourcePlanId ? { sourcePlanId } : {}),
    revision: integer(source.revision, `${label}版本`, 1),
    status: "saved",
    name,
    selections,
    passCounts: array(source.passCounts, `${label}“${name}”的过关方式`).map(
      (passCount) => integer(passCount, "过关方式", 1),
    ),
    multiplier: integer(source.multiplier, `${label}倍数`, 1),
    tags,
    createdAt: timestamp(source.createdAt, `${label}创建时间`),
    updatedAt: timestamp(source.updatedAt, `${label}更新时间`),
  };
  assertPersistablePlan(plan);
  return plan;
}

function normalizeMatch(value: unknown, index: number): MatchSnapshot {
  const source = record(value, `第 ${index + 1} 场比赛`);
  const match: MatchSnapshot = {
    matchId: integer(source.matchId, "比赛 ID", 1),
    matchNum: text(source.matchNum, "比赛场次号"),
    matchDateTime: text(source.matchDateTime, "比赛开赛时间"),
    homeTeam: text(source.homeTeam, "比赛主队"),
    awayTeam: text(source.awayTeam, "比赛客队"),
    payload: cloneRecord(source.payload, "比赛原始数据"),
    updatedAt: timestamp(source.updatedAt, "比赛更新时间"),
  };
  assertValidMatchSnapshot(match);
  return match;
}

function normalizeResult(value: unknown, index: number): MatchResult {
  const source = record(value, `第 ${index + 1} 条赛果`);
  const result: MatchResult = {
    id: optionalId(source.id, "赛果 ID"),
    matchId: integer(source.matchId, "赛果比赛 ID", 1),
    matchNum: text(source.matchNum, "赛果场次号"),
    homeTeam: text(source.homeTeam, "赛果主队"),
    awayTeam: text(source.awayTeam, "赛果客队"),
    halfTimeScore: text(source.halfTimeScore, "半场比分", true),
    fullTimeScore: text(source.fullTimeScore, "全场比分"),
    goalLine: integer(source.goalLine, "让球值"),
    officialResults: cloneRecord(source.officialResults, "官方赛果") as MatchResult["officialResults"],
    fetchedAt: timestamp(source.fetchedAt, "赛果更新时间"),
  };
  assertValidMatchResult(result);
  return result;
}

function normalizeLedger(value: unknown, index: number): LedgerOrder {
  const source = record(value, `第 ${index + 1} 笔账单`);
  const planId =
    source.planId === undefined ? undefined : text(source.planId, "账单关联方案 ID");
  if (typeof source.returnManual !== "boolean") {
    throw new Error("账单手工回款标记无效");
  }
  if (source.status !== "pending" && source.status !== "settled") {
    throw new Error("账单状态无效");
  }
  const order: LedgerOrder = {
    id: text(source.id, "账单 ID"),
    ...(planId ? { planId } : {}),
    planName: text(source.planName, "账单方案名称"),
    planSnapshot: normalizePlan(source.planSnapshot, index, "账单冻结方案"),
    purchasedAt: timestamp(source.purchasedAt, "账单购买时间"),
    stakeCents: integer(source.stakeCents, "账单投入金额", 0),
    returnCents: integer(source.returnCents, "账单回款金额", 0),
    returnManual: source.returnManual,
    status: source.status,
    notes: text(source.notes, "账单备注", true),
    createdAt: timestamp(source.createdAt, "账单创建时间"),
    updatedAt: timestamp(source.updatedAt, "账单更新时间"),
  };
  assertPersistableLedgerOrder(order);
  return order;
}

function normalizeAdjustment(value: unknown, index: number): LedgerAdjustment {
  const source = record(value, `第 ${index + 1} 条回款修改记录`);
  const status =
    source.status === undefined ? undefined : text(source.status, "回款修改状态");
  const adjustmentSource =
    source.source === undefined ? undefined : text(source.source, "回款修改来源");
  if (status !== undefined && status !== "success" && status !== "failed") {
    throw new Error("回款修改状态无效");
  }
  if (
    adjustmentSource !== undefined &&
    adjustmentSource !== "manual" &&
    adjustmentSource !== "system"
  ) {
    throw new Error("回款修改来源无效");
  }
  return normalizeLedgerAdjustment({
    id: optionalId(source.id, "回款修改记录 ID"),
    orderId: text(source.orderId, "回款修改记录账单 ID"),
    previousReturnCents: integer(source.previousReturnCents, "原回款金额", 0),
    nextReturnCents: integer(source.nextReturnCents, "新回款金额", 0),
    occurredAt: timestamp(source.occurredAt, "回款修改时间"),
    note: text(source.note, "回款修改说明", true),
    ...(status ? { status } : {}),
    ...(adjustmentSource ? { source: adjustmentSource } : {}),
    ...(source.operator === undefined
      ? {}
      : { operator: text(source.operator, "回款修改操作端", true) }),
    ...(source.failureReason === undefined
      ? {}
      : { failureReason: text(source.failureReason, "回款失败原因", true) }),
    ...(source.attemptedValue === undefined
      ? {}
      : { attemptedValue: text(source.attemptedValue, "回款尝试值", true) }),
  });
}

function normalizeSyncJob(value: unknown, index: number): SyncJob {
  const source = record(value, `第 ${index + 1} 条同步记录`);
  const kind = text(source.kind, "同步类型");
  const status = text(source.status, "同步状态");
  if (!syncKinds.has(kind) || !syncStatuses.has(status)) {
    throw new Error("同步记录状态无效");
  }
  return {
    id: optionalId(source.id, "同步记录 ID"),
    kind: kind as SyncJob["kind"],
    status: status as SyncJob["status"],
    addedCount: integer(source.addedCount, "同步新增数量", 0),
    updatedCount: integer(source.updatedCount, "同步更新数量", 0),
    failedCount: integer(source.failedCount, "同步失败数量", 0),
    errorMessage: text(source.errorMessage, "同步错误信息", true),
    startedAt: timestamp(source.startedAt, "同步开始时间"),
    ...(source.finishedAt === undefined || source.finishedAt === null
      ? {}
      : { finishedAt: timestamp(source.finishedAt, "同步结束时间") }),
  };
}

function normalizeOdds(value: unknown, index: number): OddsHistoryEntry {
  const source = record(value, `第 ${index + 1} 条赔率记录`);
  const market = text(source.market, "赔率玩法");
  const outcome = text(source.outcome, "赔率选项");
  const odds = text(source.odds, "赔率值");
  if (!marketCodes.has(market) || !isValidMarketOutcome(market, outcome)) {
    throw new Error("赔率记录投注选项无效");
  }
  if (!/^\d+(?:\.\d+)?$/.test(odds) || Number(odds) <= 0) {
    throw new Error("赔率记录赔率值无效");
  }
  return {
    id: optionalId(source.id, "赔率记录 ID"),
    matchId: integer(source.matchId, "赔率记录比赛 ID", 1),
    market: market as OddsHistoryEntry["market"],
    outcome,
    odds,
    capturedAt: timestamp(source.capturedAt, "赔率记录时间"),
  };
}

function normalizeEvent(value: unknown, index: number): AppEvent {
  const source = record(value, `第 ${index + 1} 条应用记录`);
  return {
    id: optionalId(source.id, "应用记录 ID"),
    type: text(source.type, "应用记录类型"),
    payload: cloneRecord(source.payload, "应用记录内容"),
    createdAt: timestamp(source.createdAt, "应用记录时间"),
  };
}

function assertUnique<T>(
  values: T[],
  identity: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = identity(value);
    if (seen.has(key)) throw new Error(`备份中存在重复${label}：${key}`);
    seen.add(key);
  }
}

export function normalizeBackupSnapshot(value: unknown): DatabaseBackupSnapshot {
  const source = record(value, "备份数据");
  const snapshot: DatabaseBackupSnapshot = {
    settings: normalizeSettings(source.settings),
    tags: array(source.tags, "标签数据").map(normalizeTag),
    plans: array(source.plans, "方案数据").map((plan, index) =>
      normalizePlan(plan, index),
    ),
    ledgerOrders: array(source.ledgerOrders, "账单数据").map(normalizeLedger),
    ledgerAdjustments: array(source.ledgerAdjustments, "回款修改记录").map(
      normalizeAdjustment,
    ),
    matches: array(source.matches, "比赛数据").map(normalizeMatch),
    results: array(source.results, "赛果数据").map(normalizeResult),
    syncJobs: array(source.syncJobs, "同步记录").map(normalizeSyncJob),
    oddsHistory: array(source.oddsHistory, "赔率历史").map(normalizeOdds),
    appEvents: array(source.appEvents, "应用记录").map(normalizeEvent),
  };

  if (snapshot.tags.length > MAX_PLAN_TAGS) {
    throw new Error(`备份中的标签超过 ${MAX_PLAN_TAGS} 个`);
  }
  assertUnique(snapshot.tags, (tag) => normalizedTagIdentity(tag.name), "标签");
  assertUnique(snapshot.plans, (plan) => plan.id, "方案 ID");
  assertUnique(snapshot.matches, (match) => String(match.matchId), "比赛 ID");
  assertUnique(snapshot.ledgerOrders, (order) => order.id, "账单 ID");
  assertUnique(
    snapshot.results,
    (result) => `${result.matchId}|${result.fetchedAt}`,
    "赛果",
  );
  assertUnique(
    snapshot.oddsHistory,
    (entry) =>
      `${entry.matchId}|${entry.market}|${entry.outcome}|${entry.capturedAt}`,
    "赔率记录",
  );

  const tagNames = new Set(snapshot.tags.map((tag) => tag.name));
  for (const plan of snapshot.plans) {
    const missing = plan.tags.find((tag) => !tagNames.has(tag));
    if (missing) throw new Error(`方案“${plan.name}”引用了缺失标签“${missing}”`);
  }
  const orderIds = new Set(snapshot.ledgerOrders.map((order) => order.id));
  for (const adjustment of snapshot.ledgerAdjustments) {
    if (!orderIds.has(adjustment.orderId)) {
      throw new Error(`回款修改记录引用了缺失账单：${adjustment.orderId}`);
    }
  }
  return snapshot;
}
