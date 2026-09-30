/**
 * Type families let schema contracts accept harmless width changes while still
 * detecting drift between string, numeric, and timestamp columns.
 */
export const DB2_TYPE = {
  STRING: ['CHAR', 'VARCHAR', 'CLOB', 'GRAPHIC', 'VARGRAPHIC'],
  NUMERIC: ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC'],
  // IBM i catalogs may report the legacy spelling TIMESTMP.
  TIMESTAMP: ['TIMESTAMP', 'TIMESTMP'],
} as const;

export type Db2TypeKind = keyof typeof DB2_TYPE;

export interface Db2ColumnDef {
  name: string;
  kind: Db2TypeKind;
  nullable: boolean;
}

export interface Db2TableSchema {
  table: string;
  columns: readonly Db2ColumnDef[];
}

export function selectColumns(schema: Db2TableSchema): string {
  return schema.columns.map((c) => c.name).join(', ');
}

type ScalarOf<K extends Db2TypeKind> = K extends 'NUMERIC' ? number : string;

type ColumnValue<C extends Db2ColumnDef> = C['nullable'] extends true
  ? ScalarOf<C['kind']> | null
  : ScalarOf<C['kind']>;

export type Db2Row<T extends Db2TableSchema> = {
  [C in T['columns'][number] as C['name']]: ColumnValue<C>;
};
