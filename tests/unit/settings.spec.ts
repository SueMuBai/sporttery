import { describe, expect, it } from "vitest";

import {
  exportFilename,
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

  it("creates readable Markdown and stable timestamped filenames", () => {
    expect(serializeMarkdownExport(bundle)).toContain("# 彩果长期账单导出");
    expect(serializeMarkdownExport(bundle)).toContain("总投入：¥0.00");
    expect(exportFilename("json", new Date(2026, 6, 18, 9, 8, 7))).toBe(
      "caiguo-20260718-090807.json",
    );
  });
});
