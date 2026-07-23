import { describe, expect, it } from "vitest";

import {
  isMatchOnOrAfterDay,
  isMatchOnOrAfterToday,
  localCalendarDate,
  matchCalendarDate,
} from "@/features/matches/visibility";

describe("match visibility for ticket list", () => {
  it("extracts calendar date prefixes from official timestamps", () => {
    expect(matchCalendarDate("2026-07-22 20:00:00")).toBe("2026-07-22");
    expect(matchCalendarDate("2026-07-22T20:00:00.000Z")).toBe("2026-07-22");
    expect(matchCalendarDate("2026/7/22 20:00")).toBe("2026-07-22");
    expect(matchCalendarDate("bad")).toBeNull();
  });

  it("formats the device-local calendar date from a real Date, not a constant", () => {
    expect(localCalendarDate(new Date(2026, 6, 22, 9, 30, 0))).toBe(
      "2026-07-22",
    );
    expect(localCalendarDate(new Date(2026, 6, 23, 0, 0, 1))).toBe(
      "2026-07-23",
    );
    // live clock must look like YYYY-MM-DD and match getFullYear/Month/Date
    const live = localCalendarDate();
    expect(live).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(live).toBe(expected);
  });

  it("keeps today and future fixtures, hides past calendar days relative to the given day key", () => {
    const todayKey = "2026-07-23";
    expect(isMatchOnOrAfterDay("2026-07-22 23:59:00", todayKey)).toBe(false);
    expect(isMatchOnOrAfterDay("2026-07-23 00:00:00", todayKey)).toBe(true);
    expect(isMatchOnOrAfterDay("2026-07-23 23:30:00", todayKey)).toBe(true);
    expect(isMatchOnOrAfterDay("2026-07-24 19:00:00", todayKey)).toBe(true);
  });

  it("isMatchOnOrAfterToday uses the provided Date's local day", () => {
    const thursday = new Date(2026, 6, 23, 15, 0, 0);
    expect(isMatchOnOrAfterToday("2026-07-22 20:00:00", thursday)).toBe(false);
    expect(isMatchOnOrAfterToday("2026-07-23 02:00:00", thursday)).toBe(true);
  });
});
