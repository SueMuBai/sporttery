export function combinations<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 0) throw new TypeError('组合长度必须是非负整数')
  if (size === 0) return [[]]
  if (size > values.length) return []
  const output: T[][] = []

  function visit(start: number, selected: T[]): void {
    if (selected.length === size) {
      output.push([...selected])
      return
    }
    const needed = size - selected.length
    for (let index = start; index <= values.length - needed; index += 1) {
      const value = values[index]
      if (value === undefined) continue
      selected.push(value)
      visit(index + 1, selected)
      selected.pop()
    }
  }

  visit(0, [])
  return output
}

export function cartesianProduct<T>(groups: readonly (readonly T[])[]): T[][] {
  return groups.reduce<T[][]>(
    (products, group) => products.flatMap((product) => group.map((item) => [...product, item])),
    [[]],
  )
}
