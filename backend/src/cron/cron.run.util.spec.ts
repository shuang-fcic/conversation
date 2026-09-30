import { getJobName, getRunId } from './cron.run.util';

describe('getJobName', () => {
  const argv = (command?: string) => [
    'node',
    'dist/cron',
    ...(command ? [command] : []),
  ];

  it('uses the cron subcommand as the job', () => {
    expect(getJobName(argv('expire-messages'))).toBe('expire-messages');
  });

  it('falls back to "cron" when no subcommand is given', () => {
    expect(getJobName(argv())).toBe('cron');
  });

  it('falls back to "cron" for an option flag like --help', () => {
    expect(getJobName(argv('--help'))).toBe('cron');
  });

  it('falls back to "cron" for an unsafe (traversal) arg', () => {
    expect(getJobName(argv('../evil'))).toBe('cron');
  });
});

describe('getRunId', () => {
  it('mints one UUID and returns it stably for the process', () => {
    expect(getRunId()).toBe(getRunId());
    expect(getRunId()).toHaveLength(36);
  });
});
