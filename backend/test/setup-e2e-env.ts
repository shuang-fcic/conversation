import { Logger } from '@nestjs/common';

// Focused e2e modules skip ConfigModule, but @Throttle reads config at import time.
// Seed only those eager values while preserving anything supplied by CI.
const importTimeDefaults: Record<string, string> = {
  THROTTLER_GLOBAL_SPAN: '60000',
  THROTTLER_GLOBAL_LIMIT: '2000',
  THROTTLER_WORKFLOW_SPAN: '60000',
  THROTTLER_WORKFLOW_LIMIT: '1000',
};

for (const [key, value] of Object.entries(importTimeDefaults)) {
  process.env[key] ??= value;
}

Logger.overrideLogger(false);
