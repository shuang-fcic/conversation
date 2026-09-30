import { Db2Repository } from 'src/database/database.db2.repository';
import { DB2_TYPE, Db2TableSchema } from 'src/database/database.db2.schema';

interface SysColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

/**
 * Verifies only columns the app depends on; unrelated physical columns are ignored.
 * Reads the catalog, so results do not depend on table data.
 */
export async function assertTableSchema(
  db2: Db2Repository,
  schema: string,
  contract: Db2TableSchema,
): Promise<void> {
  const rows = await db2.query<SysColumnRow>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM QSYS2.SYSCOLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [schema, contract.table],
  );

  expect(rows.length).toBeGreaterThan(0);

  const actual = new Map(rows.map((r) => [r.COLUMN_NAME.trim(), r]));

  for (const col of contract.columns) {
    const found = actual.get(col.name);

    expect(found ? col.name : `MISSING:${col.name}`).toBe(col.name);
    if (!found) continue;

    expect({
      column: col.name,
      type: found.DATA_TYPE.trim(),
      nullable: found.IS_NULLABLE.trim() === 'Y',
    }).toEqual({
      column: col.name,
      type: expect.stringMatching(
        new RegExp(`^(${DB2_TYPE[col.kind].join('|')})$`),
      ),
      nullable: col.nullable,
    });
  }
}
