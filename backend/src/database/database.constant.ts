// Cache key for the server's UTC offset (read via CURRENT TIMEZONE). Not env —
// a plain constant. The offset is effectively static (only shifts on a server
// tz/DST change) so it's cached rather than queried per conversion; the TTL now
// lives in the `database` config namespace (databaseConfig.timezoneOffsetTtlMs).
export const DB2_TIMEZONE_OFFSET_CACHE_KEY = 'db2:timezone-offset-ms';
