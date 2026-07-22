import { describe, expect, it } from "vitest";

import {
  isMatchOnOrAfterToday,
  localCalendarDate,
  matchCalendarDate,
} from "@/features/matches/visibility";

describe("match visibility for ticket list", () => {
  it("extracts calendar date prefixes from official timestamps", () => {
    expect(matchCalendarDate("2026-07-22 20:00:00")).toBe("2026-07-22");
    expect(matchCalendarDate("2026-07-22T20:00:00.000Z")).toBe("2026-07-22");
    expect(matchCalendarDate("bad")).toBeNull();
  });

  it("formats the device-local calendar date", () => {
    expect(localCalendarDate(new Date(2026, 6, 22, 9, 30, 0))).toBe(
      "2026-07-22",
    );
  });

  it("keeps today and future fixtures, hides past calendar days", () => {
    const today = new Date(2026, 6, 22, 15, 0, 0);
    expect(isMatchOnOrAfterToday("2026-07-21 23:59:00", today)).toBe(false);
    expect(isMatchOnOrAfterToday("2026-07-22 00:00:00", today)).toBe(true);
    expect(isMatchOnOrAfterToday("2026-07-22 23:30:00", today)).toBe(true);
    expect(isMatchOnOrAfterToday("2026-07-23 19:00:00", today)).toBe(true);
  });
});
