import { describe, expect, it } from "vitest";

import {
  isMatchKickoffAfter,
  isMatchKickoffAfterNow,
  localCalendarDate,
  parseMatchKickoffMs,
} from "@/features/matches/visibility";

describe("match visibility for ticket list", () => {
  it("parses official kickoff timestamps as local wall-clock instants", () => {
    expect(parseMatchKickoffMs("2026-07-23 20:00:00")).toBe(
      new Date(2026, 6, 23, 20, 0, 0).getTime(),
    );
    expect(parseMatchKickoffMs("2026-07-23 20:00")).toBe(
      new Date(2026, 6, 23, 20, 0, 0).getTime(),
    );
    expect(parseMatchKickoffMs("2026/7/23 9:05")).toBe(
      new Date(2026, 6, 23, 9, 5, 0).getTime(),
    );
    expect(parseMatchKickoffMs("2026-07-23")).toBe(
      new Date(2026, 6, 23, 0, 0, 0).getTime(),
    );
    expect(parseMatchKickoffMs("bad")).toBeNull();
  });

  it("shows only fixtures whose kickoff is strictly after nowMs", () => {
    const now = new Date(2026, 6, 23, 15, 0, 0).getTime();
    expect(isMatchKickoffAfter("2026-07-23 14:59:00", now)).toBe(false);
    expect(isMatchKickoffAfter("2026-07-23 15:00:00", now)).toBe(false);
    expect(isMatchKickoffAfter("2026-07-23 15:00:01", now)).toBe(true);
    expect(isMatchKickoffAfter("2026-07-22 23:59:00", now)).toBe(false);
    expect(isMatchKickoffAfter("2026-07-24 02:00:00", now)).toBe(true);
  });

  it("isMatchKickoffAfterNow uses the provided Date clock", () => {
    const now = new Date(2026, 6, 23, 18, 0, 0);
    expect(isMatchKickoffAfterNow("2026-07-23 17:59:59", now)).toBe(false);
    expect(isMatchKickoffAfterNow("2026-07-23 18:00:01", now)).toBe(true);
  });

  it("localCalendarDate still reflects the device clock (not a hard-coded day)", () => {
    const live = localCalendarDate();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(live).toBe(expected);
  });
});
