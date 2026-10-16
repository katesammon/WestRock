/** Preserve each confirmed leaf value separately from unverified extraction. */
export function provenance(verified: unknown, extracted: unknown) {
  const result: Record<
    string,
    { source: string; verified: unknown; extracted?: unknown }
  > = {}
  function walk(value: unknown, original: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value))
        walk(
          child,
          original && typeof original === 'object'
            ? (original as Record<string, unknown>)[key]
            : undefined,
          path ? `${path}.${key}` : key,
        )
    } else
      result[path] = {
        source:
          original !== undefined &&
          JSON.stringify(original) === JSON.stringify(value)
            ? 'AI extraction · human confirmed'
            : 'User entry · human confirmed',
        verified: value,
        ...(original !== undefined ? { extracted: original } : {}),
      }
  }
  walk(verified, extracted, '')
  return result
}
