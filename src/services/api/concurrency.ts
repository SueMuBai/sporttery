export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('并发数必须是正整数')
  }

  const results = new Array<R>(values.length)
  let cursor = 0

  async function consume(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      const value = values[index]
      if (value !== undefined) results[index] = await worker(value, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, consume))
  return results
}
