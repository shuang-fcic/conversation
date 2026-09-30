export interface WithCacheParams<T> {
  key: string;
  fn: () => Promise<T> | T;
  ttl?: number;
}

export interface CacheSetParams<T> {
  key: string;
  value: T;
  ttl?: number;
}
