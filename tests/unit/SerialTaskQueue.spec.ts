import { describe, expect, it } from 'vitest'

import { SerialTaskQueue } from '@/services/database/SerialTaskQueue'

describe('SerialTaskQueue', () => {
  it('never overlaps native transaction tasks and continues after a failure', async () => {
    const queue = new SerialTaskQueue()
    let active = 0
    let peak = 0
    const order: string[] = []

    const task = (name: string, fail = false) =>
      queue.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        order.push(`${name}:start`)
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(`${name}:end`)
        active -= 1
        if (fail) throw new Error(name)
        return name
      })

    const results = await Promise.allSettled([
      task('first'),
      task('second', true),
      task('third'),
    ])

    expect(peak).toBe(1)
    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ])
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
  })
})
