const ODDS_SCALE = 10_000n

export function parseOdds(odds: string): bigint {
  const normalized = odds.trim()
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) throw new TypeError(`无效赔率：${odds}`)
  const [integer = '0', fraction = ''] = normalized.split('.')
  return BigInt(integer) * ODDS_SCALE + BigInt(fraction.padEnd(4, '0'))
}

export function payoutCents(baseCents: number, odds: readonly string[]): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) {
    throw new TypeError('基础投注金额必须是非负整数分')
  }
  let numerator = BigInt(baseCents)
  let denominator = 1n
  for (const odd of odds) {
    numerator *= parseOdds(odd)
    denominator *= ODDS_SCALE
  }
  const rounded = (numerator + denominator / 2n) / denominator
  const value = Number(rounded)
  if (!Number.isSafeInteger(value)) throw new RangeError('奖金超出安全范围')
  return value
}
