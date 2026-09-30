import type odbc from 'odbc';

import type { Db2Repository } from 'src/database/database.db2.repository';

/** Runs mocked transactions inline and preserves an existing outer connection. */
export function stubTransaction(
  db2: jest.Mocked<Db2Repository>,
  conn: object = {},
): odbc.Connection {
  const fakeConn = conn as odbc.Connection;
  db2.withTransaction.mockImplementation(
    (cb: (c: odbc.Connection) => unknown, outer?: odbc.Connection) =>
      cb(outer ?? fakeConn) as never,
  );
  return fakeConn;
}
