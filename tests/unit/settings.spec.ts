import { describe, expect, it } from "vitest";

import {
  exportFilename,
  parsePlanImport,
  parseJsonExport,
  serializeJsonExport,
  serializeMarkdownExport,
  type ExportBundle,
} from "@/services/export/exportData";
import { validateSettings } from "@/stores/settings";
import { DEFAULT_SETTINGS } from "@/types/domain";

const bundle: ExportBundle = {
  formatVersion: 1,
  exportedAt: "2026-07-18T12:00:00+08:00",
  settings: DEFAULT_SETTINGS,
  tags: [],
  plans: [],
  ledgerOrders: [],
  matches: [],
  results: [],
};

describe("settings and exports", () => {
  it("validates every configurable numeric boundary", () => {
    expect(() => validateSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, workers: 0 })).toThrow(
      "并发请求数",
    );
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, timeoutSeconds: 4 }),
    ).toThrow("接口超时");
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, defaultMultiplier: 1.5 }),
    ).toThrow("默认倍数");
  });

  it("round-trips a JSON export and rejects unknown formats", () => {
    const serialized = serializeJsonExport(bundle);
    expect(parseJsonExport(serialized)).toEqual(bundle);
    expect(() => parseJsonExport('{"formatVersion":2}')).toThrow(
      "不支持的导出文件版本",
    );
  });

  it("rejects backups that bypass tag and betting constraints", () => {
    const timestamp = "2026-07-19T12:00:00.000Z";
    const plan = {
      id: "import-plan",
      revision: 1,
      status: "saved" as const,
      name: "导入校验",
      selections: [
        {
          key: "ignored",
          matchId: 1,
          market: "had" as const,
          outcome: "h",
          odds: "1.80",
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: ["AI"],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const base: ExportBundle = {
      ...bundle,
      tags: [
        {
          name: "AI",
          color: "#5797F5",
          sortOrder: 1,
          createdAt: timestamp,
        },
      ],
      plans: [plan],
      matches: [
        {
          matchId: 1,
          matchNum: "周三001",
          matchDateTime: "2026-07-19 19:30:00",
          homeTeam: "主队",
          awayTeam: "客队",
          payload: {},
          updatedAt: timestamp,
        },
      ],
    };

    expect(parsePlanImport(JSON.stringify(base)).plans[0]?.selections[0]?.key).toBe(
      "1|had|h",
    );
    const restored = parsePlanImport(JSON.stringify({
      ...base,
      matches: [
        {
          matchId: 1,
          matchNum: "周三001",
          matchDateTime: "2026-06-01 19:30:00",
          homeTeam: "主队",
          awayTeam: "客队",
          payload: { odds: {} },
          updatedAt: timestamp,
        },
        {
          matchId: 99,
          matchNum: "未引用",
          matchDateTime: "2026-06-01 20:00:00",
          homeTeam: "甲",
          awayTeam: "乙",
          payload: {},
          updatedAt: timestamp,
        },
      ],
      results: [
        {
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "0:0",
          fullTimeScore: "1:0",
          goalLine: 0,
          officialResults: { had: "h" },
          fetchedAt: "2026-06-02T01:00:00.000+08:00",
        },
        {
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "1 : 0",
          fullTimeScore: "2 : 0",
          goalLine: 0,
          officialResults: { had: "h" },
          fetchedAt: "2026-06-01T21:00:00.000Z",
        },
      ],
    }));
    expect(restored.matches.map((match) => match.matchId)).toEqual([1]);
    expect(restored.results).toEqual([
      expect.objectContaining({ matchId: 1, halfTimeScore: "1:0", fullTimeScore: "2:0" }),
    ]);
    expect(() =>
      parsePlanImport(
        JSON.stringify({
          ...base,
          tags: Array.from({ length: 9 }, (_, index) => ({
            name: `标签${index}`,
            color: "#5797F5",
            sortOrder: index + 1,
            createdAt: timestamp,
          })),
        }),
      ),
    ).toThrow("标签超过 8 个");
    expect(() =>
      parsePlanImport(
        JSON.stringify({
          ...base,
          plans: [
            {
              ...plan,
              selections: [
                ...plan.selections,
                {
                  key: "1|hhad|h",
                  matchId: 1,
                  market: "hhad",
                  outcome: "h",
                  odds: "2.10",
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("同场多玩法");
    expect(() =>
      parsePlanImport(
        JSON.stringify({
          ...base,
          plans: [{
            ...plan,
            selections: [{ ...plan.selections[0], outcome: "home" }],
          }],
        }),
      ),
    ).toThrow("无效投注选项“had/home”");
    expect(() =>
      parsePlanImport(
        JSON.stringify({
          ...base,
          plans: [{ ...plan, selections: [{ ...plan.selections[0], odds: "无效" }] }],
        }),
      ),
    ).toThrow("无效赔率");
    expect(() =>
      parsePlanImport(
        JSON.stringify({
          ...base,
          plans: [{ ...plan, selections: [{ ...plan.selections[0], odds: "0" }] }],
        }),
      ),
    ).toThrow("无效赔率");
    expect(() =>
      parsePlanImport(JSON.stringify({
        ...base,
        results: [{
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "",
          fullTimeScore: "已完场",
          goalLine: 0,
          officialResults: {},
          fetchedAt: timestamp,
        }],
      })),
    ).toThrow("全场比分格式无效");
    expect(() =>
      parsePlanImport(JSON.stringify({ ...base, matches: [] })),
    ).toThrow("缺少方案引用的比赛数据：1");
    expect(() =>
      parsePlanImport(JSON.stringify({
        ...base,
        results: [{
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "0:0",
          fullTimeScore: "1:0",
          goalLine: "错误" as unknown as number,
          officialResults: { had: "h" },
          fetchedAt: timestamp,
        }],
      })),
    ).toThrow("让球值无效");
    expect(() =>
      parsePlanImport(JSON.stringify({
        ...base,
        results: [{
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "0:0",
          fullTimeScore: "1:0",
          goalLine: -0.5,
          officialResults: { had: "h" },
          fetchedAt: timestamp,
        }],
      })),
    ).toThrow("让球值无效");
    expect(() =>
      parsePlanImport(JSON.stringify({
        ...base,
        results: [{
          matchId: 1,
          matchNum: "周三001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "0:0",
          fullTimeScore: "1:0",
          goalLine: 0,
          officialResults: { had: "home" },
          fetchedAt: timestamp,
        }],
      })),
    ).toThrow("官方赛果内容无效");
  });

  it("creates readable Markdown and stable timestamped filenames", () => {
    expect(serializeMarkdownExport(bundle)).toContain("# 彩果长期账单导出");
    expect(serializeMarkdownExport(bundle)).toContain("总投入：¥0.00");
    expect(exportFilename("json", new Date(2026, 6, 18, 9, 8, 7))).toBe(
      "caiguo-20260718-090807.json",
    );
  });

  it("exports ledger status and automatic return from the latest results", () => {
    const timestamp = "2026-07-18T12:00:00+08:00";
    const plan = {
      id: "export-plan",
      revision: 1,
      status: "saved" as const,
      name: "动态结算方案",
      selections: [
        {
          key: "1|had|h",
          matchId: 1,
          market: "had" as const,
          outcome: "h",
          odds: "1.80",
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const report = serializeMarkdownExport({
      ...bundle,
      plans: [plan],
      ledgerOrders: [
        {
          id: "export-order",
          planId: plan.id,
          planName: plan.name,
          planSnapshot: plan,
          purchasedAt: timestamp,
          stakeCents: 200,
          returnCents: 0,
          returnManual: false,
          status: "pending",
          notes: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      results: [
        {
          matchId: 1,
          matchNum: "周六001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "1:0",
          fullTimeScore: "2:0",
          goalLine: 0,
          officialResults: { had: "h" },
          fetchedAt: timestamp,
        },
      ],
    });

    expect(report).toContain("当前回款：¥3.60");
    expect(report).toContain("| ¥2.00 | ¥3.60 | 理论回款 | 已完成 |");
  });
});
