import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import {
  evaluatePlan,
  validateSingleMarketPerMatch,
} from "@/features/betting/calculator";
import { isValidMarketOutcome } from "@/features/betting/outcomes";
import {
  assertValidMatchResult,
  assertValidMatchSnapshot,
} from "@/features/matches/validation";
import { MAX_PLAN_TAG_NAME_LENGTH } from "@/features/plans/tagValidation";
import { getDatabase } from "@/services/database/createDatabase";
import { normalizePlanName } from "@/features/plans/planName";
import { assertPersistablePlan } from "@/features/plans/validation";
import type {
  AppSettings,
  LedgerOrder,
  MatchResult,
  MatchSnapshot,
  PlanTag,
  SavedPlan,
} from "@/types/domain";
import { centsToYuan } from "@/utils/money";

export interface ExportBundle {
  formatVersion: 1;
  exportedAt: string;
  settings: AppSettings;
  tags: PlanTag[];
  plans: SavedPlan[];
  ledgerOrders: LedgerOrder[];
  matches: MatchSnapshot[];
  results: MatchResult[];
}

export async function createExportBundle(): Promise<ExportBundle> {
  const database = getDatabase();
  await database.initialize();
  const [settings, tags, plans, ledgerOrders, matches, results] =
    await Promise.all([
      database.getSettings(),
      database.listTags(),
      database.listPlans(),
      database.listLedger(),
      database.listMatches(),
      database.listLatestResults(),
    ]);
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    settings,
    tags,
    plans,
    ledgerOrders,
    matches,
    results,
  };
}

export function serializeJsonExport(bundle: ExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function parseJsonExport(value: string): ExportBundle {
  const parsed = JSON.parse(value) as Partial<ExportBundle>;
  if (parsed.formatVersion !== 1) throw new Error("不支持的导出文件版本");
  for (const key of [
    "settings",
    "tags",
    "plans",
    "ledgerOrders",
    "matches",
    "results",
  ] as const) {
    if (parsed[key] === undefined) throw new Error(`导出文件缺少 ${key}`);
  }
  return parsed as ExportBundle;
}

export async function importPlansFromJson(
  value: string,
): Promise<{ tags: number; plans: number; matches: number; results: number }> {
  const { tags, plans, matches, results } = parsePlanImport(value);
  const database = getDatabase();
  await database.initialize();
  return database.importPlans(tags, plans, matches, results);
}

export function parsePlanImport(value: string): {
  tags: PlanTag[];
  plans: SavedPlan[];
  matches: MatchSnapshot[];
  results: MatchResult[];
} {
  const bundle = parseJsonExport(value);
  if (
    !Array.isArray(bundle.tags) ||
    !Array.isArray(bundle.plans) ||
    !Array.isArray(bundle.matches) ||
    !Array.isArray(bundle.results)
  ) {
    throw new Error("备份中的标签、方案、比赛或赛果格式无效");
  }
  if (!bundle.plans.length) throw new Error("备份中没有可导入的方案");
  if (bundle.tags.length > 8) throw new Error("备份中的标签超过 8 个");
  const seenTags = new Set<string>();
  const tags = bundle.tags.map((tag, index) => {
    const name = String(tag.name ?? "").trim();
    if (!name) throw new Error(`第 ${index + 1} 个标签没有名称`);
    if (name.length > MAX_PLAN_TAG_NAME_LENGTH) {
      throw new Error(`标签“${name}”超过 ${MAX_PLAN_TAG_NAME_LENGTH} 个字符`);
    }
    const identity = name.toLocaleLowerCase();
    if (seenTags.has(identity)) throw new Error(`备份中存在重复标签“${name}”`);
    seenTags.add(identity);
    return {
      name,
      color: String(tag.color || "#5797F5"),
      sortOrder: Number(tag.sortOrder) || index + 1,
      createdAt: String(tag.createdAt || new Date().toISOString()),
    } satisfies PlanTag;
  });
  const tagNames = new Set(tags.map((tag) => tag.name));
  const seenPlanIds = new Set<string>();
  const validMarkets = new Set(["had", "hhad", "crs", "ttg", "hafu"]);
  const plans = bundle.plans.map((plan, index) => {
    if (!plan?.id) throw new Error(`第 ${index + 1} 个方案缺少 ID`);
    const id = String(plan.id);
    if (seenPlanIds.has(id)) throw new Error(`备份中存在重复方案 ID：${id}`);
    seenPlanIds.add(id);
    const name = normalizePlanName(String(plan.name ?? ""));
    if (!Array.isArray(plan.selections) || !plan.selections.length) {
      throw new Error(`第 ${index + 1} 个方案没有投注选项`);
    }
    const selections = plan.selections.map((selection, selectionIndex) => {
      const matchId = Number(selection.matchId);
      const market = String(selection.market);
      const outcome = String(selection.outcome ?? "");
      const odds = String(selection.odds ?? "");
      if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error(`方案“${name}”第 ${selectionIndex + 1} 个比赛 ID 无效`);
      }
      if (!validMarkets.has(market)) {
        throw new Error(`方案“${name}”包含未知玩法“${market}”`);
      }
      if (!isValidMarketOutcome(market, outcome)) {
        throw new Error(`方案“${name}”包含无效投注选项“${market}/${outcome}”`);
      }
      return {
        key: `${matchId}|${market}|${outcome}`,
        matchId,
        market: market as SavedPlan["selections"][number]["market"],
        outcome,
        odds,
      };
    });
    if (
      new Set(selections.map((selection) => selection.key)).size !==
      selections.length
    ) {
      throw new Error(`方案“${name}”包含重复投注选项`);
    }
    const matchCount = new Set(selections.map((selection) => selection.matchId))
      .size;
    const passCounts = Array.isArray(plan.passCounts)
      ? [...new Set(plan.passCounts.map(Number))]
      : [];
    if (
      !passCounts.length ||
      passCounts.some(
        (size) =>
          !Number.isInteger(size) || size < 1 || size > 8 || size > matchCount,
      )
    ) {
      throw new Error(`方案“${name}”的过关方式无效`);
    }
    const multiplier = Number(plan.multiplier);
    if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9999) {
      throw new Error(`方案“${name}”的倍数无效`);
    }
    const planTags = Array.isArray(plan.tags)
      ? [...new Set(plan.tags.map(String))]
      : [];
    if (planTags.length > 3) throw new Error(`方案“${name}”超过 3 个标签`);
    const stamp = new Date().toISOString();
    const normalized: SavedPlan = {
      ...structuredClone(plan),
      id,
      name,
      revision: Math.max(1, Number(plan.revision) || 1),
      status: "saved",
      selections,
      passCounts,
      multiplier,
      tags: planTags,
      createdAt: String(plan.createdAt || stamp),
      updatedAt: String(plan.updatedAt || stamp),
    };
    const missing = normalized.tags.find((tag) => !tagNames.has(tag));
    if (missing)
      throw new Error(`方案“${normalized.name}”引用了缺失标签“${missing}”`);
    const conflicts = validateSingleMarketPerMatch(normalized.selections);
    if (conflicts.length) {
      throw new Error(`方案“${normalized.name}”包含同场多玩法`);
    }
    assertPersistablePlan(normalized);
    return normalized;
  });
  const referencedMatchIds = new Set(
    plans.flatMap((plan) =>
      plan.selections.map((selection) => selection.matchId),
    ),
  );
  const isObject = (item: unknown): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item);
  const requireText = (value: unknown, label: string): string => {
    const text = String(value ?? "").trim();
    if (!text) throw new Error(`${label}不能为空`);
    return text;
  };
  const requireTimestamp = (value: unknown, label: string): string => {
    const text = requireText(value, label);
    if (Number.isNaN(Date.parse(text))) throw new Error(`${label}格式无效`);
    return text;
  };
  const importedMatches = bundle.matches
    .filter((match) => referencedMatchIds.has(Number(match?.matchId)))
    .map((match) => {
      const matchId = Number(match.matchId);
      if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error("备份中的比赛 ID 无效");
      }
      if (!isObject(match.payload)) {
        throw new Error(`比赛 ${matchId} 的原始数据格式无效`);
      }
      const matchDateTime = requireText(
        match.matchDateTime,
        `比赛 ${matchId} 的开赛时间`,
      );
      if (
        !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(matchDateTime)
      ) {
        throw new Error(`比赛 ${matchId} 的开赛时间格式无效`);
      }
      const normalized = {
        matchId,
        matchNum: requireText(match.matchNum, `比赛 ${matchId} 的场次号`),
        matchDateTime,
        homeTeam: requireText(match.homeTeam, `比赛 ${matchId} 的主队`),
        awayTeam: requireText(match.awayTeam, `比赛 ${matchId} 的客队`),
        payload: structuredClone(match.payload),
        updatedAt: requireTimestamp(
          match.updatedAt,
          `比赛 ${matchId} 的更新时间`,
        ),
      } satisfies MatchSnapshot;
      assertValidMatchSnapshot(normalized);
      return normalized;
    });
  const latestMatches = new Map<number, MatchSnapshot>();
  for (const match of importedMatches) {
    const previous = latestMatches.get(match.matchId);
    if (
      !previous ||
      Date.parse(previous.updatedAt) < Date.parse(match.updatedAt)
    ) {
      latestMatches.set(match.matchId, match);
    }
  }
  const missingMatchIds = [...referencedMatchIds].filter(
    (matchId) => !latestMatches.has(matchId),
  );
  if (missingMatchIds.length) {
    throw new Error(
      `备份缺少方案引用的比赛数据：${missingMatchIds.slice(0, 5).join("、")}`,
    );
  }
  const latestResults = new Map<number, MatchResult>();
  for (const result of bundle.results.filter((item) =>
    referencedMatchIds.has(Number(item?.matchId)),
  )) {
    const matchId = Number(result.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      throw new Error("备份中的赛果比赛 ID 无效");
    }
    const normalizeScore = (
      value: unknown,
      label: string,
      optional = false,
    ) => {
      const score = String(value ?? "").trim();
      if (optional && !score) return "";
      if (!/^\d+\s*:\s*\d+$/.test(score)) {
        throw new Error(`比赛 ${matchId} 的${label}格式无效`);
      }
      return score.replace(/\s+/g, "");
    };
    if (!isObject(result.officialResults)) {
      throw new Error(`比赛 ${matchId} 的官方赛果格式无效`);
    }
    const goalLine = Number(result.goalLine);
    if (!Number.isFinite(goalLine)) {
      throw new Error(`比赛 ${matchId} 的让球值无效`);
    }
    const officialResults = structuredClone(result.officialResults);
    for (const [market, outcome] of Object.entries(officialResults)) {
      if (!isValidMarketOutcome(market, outcome)) {
        throw new Error(`比赛 ${matchId} 的官方赛果内容无效`);
      }
    }
    const normalized: MatchResult = {
      matchId,
      matchNum: requireText(result.matchNum, `比赛 ${matchId} 的场次号`),
      homeTeam: requireText(result.homeTeam, `比赛 ${matchId} 的主队`),
      awayTeam: requireText(result.awayTeam, `比赛 ${matchId} 的客队`),
      halfTimeScore: normalizeScore(result.halfTimeScore, "半场比分", true),
      fullTimeScore: normalizeScore(result.fullTimeScore, "全场比分"),
      goalLine,
      officialResults,
      fetchedAt: requireTimestamp(
        result.fetchedAt,
        `比赛 ${matchId} 的赛果更新时间`,
      ),
    };
    assertValidMatchResult(normalized);
    const previous = latestResults.get(matchId);
    if (
      !previous ||
      Date.parse(previous.fetchedAt) < Date.parse(normalized.fetchedAt)
    ) {
      latestResults.set(matchId, normalized);
    }
  }
  return {
    tags,
    plans,
    matches: [...latestMatches.values()],
    results: [...latestResults.values()],
  };
}

export function serializeMarkdownExport(bundle: ExportBundle): string {
  const evaluatedOrders = bundle.ledgerOrders.map((order) => {
    const evaluation = evaluatePlan(order.planSnapshot, bundle.results);
    const returnCents = order.returnManual
      ? order.returnCents
      : evaluation.currentReturnCents;
    return { order, evaluation, returnCents };
  });
  const stakeCents = bundle.ledgerOrders.reduce(
    (total, order) => total + order.stakeCents,
    0,
  );
  const returnCents = evaluatedOrders.reduce(
    (total, item) => total + item.returnCents,
    0,
  );
  const lines = [
    "# 彩果长期账单导出",
    "",
    `- 导出时间：${bundle.exportedAt}`,
    `- 保存方案：${bundle.plans.length} 个`,
    `- 账单：${bundle.ledgerOrders.length} 笔`,
    `- 总投入：¥${centsToYuan(stakeCents)}`,
    `- 当前回款：¥${centsToYuan(returnCents)}`,
    `- 已保存比赛：${bundle.matches.length} 场`,
    `- 已保存赛果：${bundle.results.length} 场`,
    "",
    "## 账单明细",
    "",
    "| 购买时间 | 方案 | 投注 | 回款 | 回款口径 | 状态 |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...evaluatedOrders.map(
      ({ order, evaluation, returnCents: displayedReturnCents }) =>
        `| ${order.purchasedAt} | ${escapeMarkdown(order.planName)} | ¥${centsToYuan(order.stakeCents)} | ¥${centsToYuan(displayedReturnCents)} | ${evaluation.status === "pending" ? "当前已结算" : order.returnManual ? "实际回款" : "理论回款"} | ${evaluation.status === "settled" ? "已完成" : "进行中"} |`,
    ),
    "",
    "## 保存方案",
    "",
    ...bundle.plans.flatMap((plan) => [
      `### ${escapeMarkdown(plan.name)}`,
      "",
      `- 场次：${new Set(plan.selections.map((selection) => selection.matchId)).size}`,
      `- 选项：${plan.selections.length}`,
      `- 过关：${plan.passCounts.map((size) => `${size}关`).join("、")}`,
      `- 倍数：${plan.multiplier}`,
      `- 标签：${plan.tags.join("、") || "无"}`,
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveTextFile(
  filename: string,
  content: string,
  type: string,
): Promise<{ filename: string; location: string }> {
  if (!Capacitor.isNativePlatform()) {
    downloadTextFile(filename, content, type);
    return { filename, location: "浏览器下载目录" };
  }
  const result = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({
    title: `彩果数据导出：${filename}`,
    text: "彩果长期账单导出文件",
    url: result.uri,
    dialogTitle: "保存或分享导出文件",
  });
  return { filename, location: result.uri };
}

export function exportFilename(
  extension: "json" | "md",
  date = new Date(),
): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `caiguo-${stamp}.${extension}`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
