import { Logger } from '@nestjs/common';

// Silence expected error-path logs. Tests of logging can still spy on Logger.prototype.
Logger.overrideLogger(false);
