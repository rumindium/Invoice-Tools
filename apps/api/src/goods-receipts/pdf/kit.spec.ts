import { describe, expect, it } from 'vitest';
import { gridCell, gridRows } from './kit';

describe('reference grid', () => {
  it('spreads the receiving location over the whole last row after eight cells', () => {
    expect(gridCell(8, 9)).toEqual({ column: 0, row: 2, span: 4 });
    expect(gridCell(3, 9)).toEqual({ column: 3, row: 0, span: 1 });
    expect(gridRows(9)).toBe(3);
  });

  it('puts the location next to a termin cell in the last row', () => {
    expect(gridCell(8, 10)).toEqual({ column: 0, row: 2, span: 1 });
    expect(gridCell(9, 10)).toEqual({ column: 1, row: 2, span: 3 });
    expect(gridRows(10)).toBe(3);
  });
});
