import { SetMetadata } from '@nestjs/common';

import { APP_SOURCE } from 'src/auth/constants/auth.app-source.constant';

export const ALLOWED_APP_SOURCES_KEY = 'allowedAppSources';

export const AllowedAppSources = (...sources: APP_SOURCE[]) =>
  SetMetadata(ALLOWED_APP_SOURCES_KEY, sources);
