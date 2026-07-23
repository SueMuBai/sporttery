/** Local calendar date as YYYY-MM-DD (device timezone). */
export function localCalendarDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Extract the calendar date prefix from matchDateTime.
 * Official snapshot format is typically `YYYY-MM-DD HH:mm:ss`.
 * Also accepts `YYYY/MM/DD` and leading/trailing whitespace.
 */
export function matchCalendarDate(matchDateTime: string): string | null {
  const matched = matchDateTime
    .trim()
    .match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (!matched) return null
  const year = matched[1]
  const month = matched[2].padStart(2, "0")
  const day = matched[3].padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * True when the match is scheduled on the given local calendar day or later.
 * Pass `todayKey` from a reactive source (store clock) so list filters
 * re-evaluate when the device day changes; do not rely on a bare
 * `new Date()` inside a Vue computed alone.
 */
export function isMatchOnOrAfterDay(
  matchDateTime: string,
  todayKey: string,
): boolean {
  const day = matchCalendarDate(matchDateTime)
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return false
  return day >= todayKey
}

/** Convenience for non-reactive callers (tests, one-shot checks). */
export function isMatchOnOrAfterToday(
  matchDateTime: string,
  today: Date = new Date(),
): boolean {
  return isMatchOnOrAfterDay(matchDateTime, localCalendarDate(today))
}
