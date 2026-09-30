export function buildCacheKey(prefix: string, ...args: string[]): string {
  return [prefix, ...args].join(':');
}
