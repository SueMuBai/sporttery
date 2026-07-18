import { describe, expect, it } from 'vitest'

import { addCents, centsToYuan, yuanToCents } from '@/utils/money'

describe('money utilities', () => {
  it('converts yuan without floating point accumulation', () => {
    expect(yuanToCents('0.10')).toBe(10)
    expect(yuanToCents('148.00')).toBe(14800)
    expect(addCents([yuanToCents('0.10'), yuanToCents('0.20')])).toBe(30)
    expect(centsToYuan(30)).toBe('0.30')
    expect(centsToYuan(-6184)).toBe('-61.84')
  })

  it('rejects amounts with more than two decimal places', () => {
    expect(() => yuanToCents('1.001')).toThrow('无效金额')
    expect(() => centsToYuan(1.5)).toThrow('整数分')
  })
})
