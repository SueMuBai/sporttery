import type { MarketCode } from '@/types/domain'

export const MARKET_OUTCOMES: Record<MarketCode, ReadonlySet<string>> = {
  had: new Set(['h', 'd', 'a']),
  hhad: new Set(['h', 'd', 'a']),
  ttg: new Set(['0', '1', '2', '3', '4', '5', '6', '7+']),
  hafu: new Set(['h-h', 'h-d', 'h-a', 'd-h', 'd-d', 'd-a', 'a-h', 'a-d', 'a-a']),
  crs: new Set([
    '0:0', '0:1', '0:2', '0:3', '0:4', '0:5',
    '1:0', '1:1', '1:2', '1:3', '1:4', '1:5',
    '2:0', '2:1', '2:2', '2:3', '2:4', '2:5',
    '3:0', '3:1', '3:2', '3:3',
    '4:0', '4:1', '4:2',
    '5:0', '5:1', '5:2',
    'home_other', 'draw_other', 'away_other',
  ]),
}

export function isValidMarketOutcome(
  market: string,
  outcome: unknown,
): market is MarketCode {
  return (
    Object.prototype.hasOwnProperty.call(MARKET_OUTCOMES, market) &&
    typeof outcome === 'string' &&
    MARKET_OUTCOMES[market as MarketCode].has(outcome)
  )
}
