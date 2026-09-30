interface Auditable {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export type ModelCreate<T extends Auditable, K extends keyof T = never> = Omit<
  T,
  'createdAt' | 'updatedAt' | 'updatedBy' | 'id' | K
>;

// `updatedAt` is stamped by the DB (CURRENT_TIMESTAMP on UPDATE), never by callers.
export type ModelUpdate<
  T extends Auditable,
  K extends Exclude<keyof T, 'updatedAt'> = never,
> = Partial<Pick<T, K>> & Pick<T, 'updatedBy'>;

export type JsonObject = Record<string, unknown>;
