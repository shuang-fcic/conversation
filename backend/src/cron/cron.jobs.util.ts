// nest-commander stores @Command options on the class under this key but does
// not re-export it from the package root. Importing the typed const (rather
// than hardcoding the string) means a rename in a future version fails at
// compile time instead of silently returning undefined.
import { CommandMeta } from 'nest-commander/src/constants';

interface CommandMetadata {
  name: string;
}

// Reads the command name off a class decorated with nest-commander's
// @Command; returns undefined for any provider that isn't a command.
export function getCommandName(metatype: unknown): string | undefined {
  if (typeof metatype !== 'function') return undefined;
  const meta = Reflect.getMetadata(CommandMeta, metatype) as
    CommandMetadata | undefined;
  return meta?.name;
}

export function validateCronJobs(
  jobs: string[],
  registered: ReadonlySet<string>,
): void {
  for (const job of jobs) {
    if (!registered.has(job)) {
      throw new Error(
        `Unknown cron job in CRON_JOBS: "${job}". Registered: ${[...registered].join(', ')}`,
      );
    }
  }
}
