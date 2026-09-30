export function toInPlaceholders(array: number[] | string[]): string {
  return `(${array.map(() => '?').join(', ')})`;
}

export function toColumnClauses(
  mapping: Record<string, string | number | null | undefined>,
): { clauses: string[]; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  for (const [column, value] of Object.entries(mapping)) {
    if (value === undefined) continue;
    if (value === null) {
      clauses.push(`${column} = NULL`);
    } else {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  return { clauses, params };
}

export function toValuePlaceholders(values: Array<string | number | null>): {
  placeholders: string;
  params: Array<string | number>;
} {
  const placeholders: string[] = [];
  const params: Array<string | number> = [];

  for (const value of values) {
    if (value === null) {
      placeholders.push('NULL');
    } else {
      placeholders.push('?');
      params.push(value);
    }
  }

  return {
    placeholders: placeholders.join(', '),
    params,
  };
}
