import type { Request } from 'express';

export interface InternalServiceRequest extends Request {
  appSource: string;
  userId?: string;
}
