import { type Cache } from 'cache-manager';

import { CachingService } from './caching.service';

const makeCache = (): jest.Mocked<
  Pick<Cache, 'get' | 'set' | 'del' | 'mdel' | 'clear'>
> => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  mdel: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
});

const makeService = (cache: ReturnType<typeof makeCache>) => {
  const service = new CachingService(cache as unknown as Cache);
  (service as unknown as { logger: { error: jest.Mock } }).logger = {
    error: jest.fn(),
  };
  return service;
};

describe('CachingService.withCache', () => {
  let cache: ReturnType<typeof makeCache>;
  let service: CachingService;

  beforeEach(() => {
    cache = makeCache();
    service = makeService(cache);
  });

  it('returns cached value on hit', async () => {
    cache.get.mockResolvedValue(42);
    const fn = jest.fn();

    const result = await service.withCache({ key: 'k', fn });

    expect(result).toBe(42);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls fn and writes to cache on miss', async () => {
    cache.get.mockResolvedValue(undefined);
    const fn = jest.fn().mockResolvedValue('value');

    const result = await service.withCache({ key: 'k', fn, ttl: 1000 });

    expect(result).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('k', 'value', 1000);
  });

  it('does not cache null or undefined', async () => {
    cache.get.mockResolvedValue(undefined);
    const fn = jest.fn().mockResolvedValue(null);

    await service.withCache({ key: 'k', fn });

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('coalesces concurrent misses into one fn call', async () => {
    cache.get.mockResolvedValue(undefined);

    let resolve!: (v: string) => void;
    const deferred = new Promise<string>((r) => (resolve = r));
    const fn = jest.fn().mockReturnValue(deferred);

    const p1 = service.withCache({ key: 'k', fn });
    const p2 = service.withCache({ key: 'k', fn });
    const p3 = service.withCache({ key: 'k', fn });

    resolve('shared');
    const [a, b, c] = await Promise.all([p1, p2, p3]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe('shared');
    expect(b).toBe('shared');
    expect(c).toBe('shared');
  });

  it('clears the in-flight entry on fn rejection so the next call retries', async () => {
    cache.get.mockResolvedValue(undefined);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('ok');

    await expect(service.withCache({ key: 'k', fn })).rejects.toThrow(
      'db down',
    );

    cache.get.mockResolvedValue(undefined);
    const result = await service.withCache({ key: 'k', fn });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('skips the write when del() invalidates the key mid-load', async () => {
    cache.get.mockResolvedValue(undefined);

    let resolve!: (v: string) => void;
    const deferred = new Promise<string>((r) => (resolve = r));
    const fn = jest.fn().mockReturnValue(deferred);

    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    fn.mockImplementation(() => {
      markStarted();
      return deferred;
    });

    const p = service.withCache({ key: 'k', fn });
    await started;
    await service.del('k');
    resolve('stale');
    await p;

    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('k');
  });

  it('caches again after an invalidated load completes', async () => {
    cache.get.mockResolvedValue(undefined);

    let resolve!: (value: string) => void;
    const stale = new Promise<string>((r) => (resolve = r));
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    const p = service.withCache({
      key: 'k',
      fn: () => {
        markStarted();
        return stale;
      },
    });
    await started;
    await service.del('k');
    resolve('stale');
    await p;

    const result = await service.withCache({ key: 'k', fn: () => 'fresh' });

    expect(result).toBe('fresh');
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('k', 'fresh', undefined);
  });

  it('falls through to fn when cache.get throws', async () => {
    cache.get.mockRejectedValue(new Error('cache error'));
    const fn = jest.fn().mockResolvedValue('fallback');

    const result = await service.withCache({ key: 'k', fn });

    expect(result).toBe('fallback');
    expect(cache.set).not.toHaveBeenCalled();
  });
});
