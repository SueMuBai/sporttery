import { describe, expect, it } from 'vitest'

import { mapWithConcurrency } from '@/services/api/concurrency'

describe('mapWithConcurrency', () => {
  it('preserves order and never exceeds the configured worker count', async () => {
    let active = 0
    let maximum = 0
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return value * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50, 60])
    expect(maximum).toBe(2)
  })
})
