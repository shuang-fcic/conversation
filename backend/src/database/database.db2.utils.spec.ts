import {
  toColumnClauses,
  toInPlaceholders,
  toValuePlaceholders,
} from './database.db2.utils';

describe('database.db2.utils', () => {
  describe('toInPlaceholders', () => {
    it('renders one placeholder per element', () => {
      expect(toInPlaceholders(['a', 'b', 'c'])).toBe('(?, ?, ?)');
      expect(toInPlaceholders([1])).toBe('(?)');
    });

    it('renders empty parens for an empty array', () => {
      expect(toInPlaceholders([])).toBe('()');
    });
  });

  describe('toColumnClauses', () => {
    it('emits `col = ?` and collects params in order', () => {
      const { clauses, params } = toColumnClauses({ name: 'Jane', age: 30 });
      expect(clauses).toEqual(['name = ?', 'age = ?']);
      expect(params).toEqual(['Jane', 30]);
    });

    it('inlines NULL for null values without a param', () => {
      const { clauses, params } = toColumnClauses({ a: null, b: 'x' });
      expect(clauses).toEqual(['a = NULL', 'b = ?']);
      expect(params).toEqual(['x']);
    });

    it('skips undefined values entirely (partial update semantics)', () => {
      const { clauses, params } = toColumnClauses({
        keep: 'y',
        drop: undefined,
      });
      expect(clauses).toEqual(['keep = ?']);
      expect(params).toEqual(['y']);
    });

    it('returns empty results for an empty mapping', () => {
      expect(toColumnClauses({})).toEqual({ clauses: [], params: [] });
    });
  });

  describe('toValuePlaceholders', () => {
    it('joins placeholders and inlines NULL, params in order', () => {
      const { placeholders, params } = toValuePlaceholders(['x', null, 5]);
      expect(placeholders).toBe('?, NULL, ?');
      expect(params).toEqual(['x', 5]);
    });

    it('returns an empty string for no values', () => {
      expect(toValuePlaceholders([])).toEqual({ placeholders: '', params: [] });
    });
  });
});
