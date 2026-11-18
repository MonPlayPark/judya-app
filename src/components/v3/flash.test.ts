import { describe, expect, it } from 'vitest';
import { setFlash, takeFlash } from './flash';

describe('flash', () => {
  it('is given once and then gone', () => {
    expect(takeFlash()).toBeNull();
    setFlash('บันทึกการแก้ไขแล้ว');
    expect(takeFlash()).toBe('บันทึกการแก้ไขแล้ว');
    expect(takeFlash()).toBeNull();
  });
});
