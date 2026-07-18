import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import { getDatabase } from "@/services/database/createDatabase";
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

export function serializeMarkdownExport(bundle: ExportBundle): string {
  const stakeCents = bundle.ledgerOrders.reduce(
    (total, order) => total + order.stakeCents,
    0,
  );
  const returnCents = bundle.ledgerOrders.reduce(
    (total, order) => total + order.returnCents,
    0,
  );
  const lines = [
    "# 彩果长期账单导出",
    "",
    `- 导出时间：${bundle.exportedAt}`,
    `- 保存方案：${bundle.plans.length} 个`,
    `- 账单：${bundle.ledgerOrders.length} 笔`,
    `- 总投入：¥${centsToYuan(stakeCents)}`,
    `- 已记录回款：¥${centsToYuan(returnCents)}`,
    `- 已保存比赛：${bundle.matches.length} 场`,
    `- 已保存赛果：${bundle.results.length} 场`,
    "",
    "## 账单明细",
    "",
    "| 购买时间 | 方案 | 投注 | 回款 | 状态 |",
    "| --- | --- | ---: | ---: | --- |",
    ...bundle.ledgerOrders.map(
      (order) =>
        `| ${order.purchasedAt} | ${escapeMarkdown(order.planName)} | ¥${centsToYuan(order.stakeCents)} | ¥${centsToYuan(order.returnCents)} | ${order.status === "settled" ? "已完成" : "进行中"} |`,
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
