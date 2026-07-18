const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/

export function yuanToCents(value: string | number): number {
  const normalized = typeof value === 'number' ? value.toFixed(2) : value.trim()
  if (!MONEY_PATTERN.test(normalized)) {
    throw new TypeError(`无效金额：${String(value)}`)
  }

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [yuan = '0', fraction = ''] = unsigned.split('.')
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new RangeError('金额超出安全范围')
  return negative ? -cents : cents
}

export function centsToYuan(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new TypeError('金额必须使用整数分')
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

export function addCents(values: readonly number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value)) throw new TypeError('金额必须使用整数分')
    const next = total + value
    if (!Number.isSafeInteger(next)) throw new RangeError('金额合计超出安全范围')
    return next
  }, 0)
}
