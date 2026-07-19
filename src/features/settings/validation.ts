import type { AppSettings } from '@/types/domain'

export function validateSettings(value: AppSettings): void {
  const limits: Record<keyof AppSettings, [number, number, string]> = {
    historyLimits: [1, 50, '每场历史条数'],
    workers: [1, 12, '并发请求数'],
    timeoutSeconds: [5, 120, '接口超时'],
    retries: [0, 8, '失败重试次数'],
    defaultMultiplier: [1, 999, '默认倍数'],
  }
  for (const [key, [minimum, maximum, label]] of Object.entries(limits) as Array<
    [keyof AppSettings, [number, number, string]]
  >) {
    const current = value[key]
    if (!Number.isInteger(current) || current < minimum || current > maximum) {
      throw new RangeError(`${label}必须是 ${minimum}～${maximum} 的整数`)
    }
  }
}
