/**
 * Parse official matchDateTime as a local-time kickoff instant (ms since epoch).
 * Accepts `YYYY-MM-DD HH:mm[:ss]`, `YYYY/M/D H:mm`, and `YYYY-MM-DDTHH:mm:ss`.
 * Date-only values are treated as local midnight that day.
 */
export function parseMatchKickoffMs(matchDateTime: string): number | null {
  const matched = matchDateTime
    .trim()
    .match(
      /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    )
  if (!matched) return null

  const year = Number(matched[1])
  const monthIndex = Number(matched[2]) - 1
  const day = Number(matched[3])
  const hours = Number(matched[4] ?? 0)
  const minutes = Number(matched[5] ?? 0)
  const seconds = Number(matched[6] ?? 0)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const kickoff = new Date(year, monthIndex, day, hours, minutes, seconds, 0)
  const ms = kickoff.getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * True when kickoff is strictly after `nowMs` (device clock).
 * Pass a reactive store clock so the list re-filters when time advances.
 */
export function isMatchKickoffAfter(
  matchDateTime: string,
  nowMs: number,
): boolean {
  const kickoffMs = parseMatchKickoffMs(matchDateTime)
  if (kickoffMs === null || !Number.isFinite(nowMs)) return false
  return kickoffMs > nowMs
}

/** Non-reactive convenience for tests / one-shot checks. */
export function isMatchKickoffAfterNow(
  matchDateTime: string,
  now: Date = new Date(),
): boolean {
  return isMatchKickoffAfter(matchDateTime, now.getTime())
}

/** Local calendar date as YYYY-MM-DD (device timezone). Kept for status labels. */
export function localCalendarDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** @deprecated Prefer parseMatchKickoffMs / isMatchKickoffAfter. */
export function matchCalendarDate(matchDateTime: string): string | null {
  const matched = matchDateTime
    .trim()
    .match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (!matched) return null
  return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`
}

/** @deprecated Prefer isMatchKickoffAfter. */
export function isMatchOnOrAfterDay(
  matchDateTime: string,
  todayKey: string,
): boolean {
  const day = matchCalendarDate(matchDateTime)
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return false
  return day >= todayKey
}

/** @deprecated Prefer isMatchKickoffAfterNow. */
export function isMatchOnOrAfterToday(
  matchDateTime: string,
  today: Date = new Date(),
): boolean {
  return isMatchOnOrAfterDay(matchDateTime, localCalendarDate(today))
}
