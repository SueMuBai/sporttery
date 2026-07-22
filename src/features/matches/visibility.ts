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
 */
export function matchCalendarDate(matchDateTime: string): string | null {
  const matched = matchDateTime.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return matched?.[1] ?? null
}

/** True when the match is scheduled on local today or a later calendar day. */
export function isMatchOnOrAfterToday(
  matchDateTime: string,
  today: Date = new Date(),
): boolean {
  const day = matchCalendarDate(matchDateTime)
  if (!day) return false
  return day >= localCalendarDate(today)
}
