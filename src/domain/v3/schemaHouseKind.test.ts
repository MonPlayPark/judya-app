import { describe, expect, it } from 'vitest';
import { sampleRootV3 } from './fixtures';
import { houseItemSchema, rootSchema } from './schema';

describe('house item kind (M4 PR 5a)', () => {
  it('is optional: old data without it still passes', () => {
    expect(houseItemSchema.safeParse({ id: 'h9', name: 'ยาสามัญตัวอย่าง' }).success).toBe(true);
    expect(rootSchema.safeParse(sampleRootV3()).success).toBe(true);
  });
  it('accepts the seven medicine kinds and refuses anything else', () => {
    for (const kind of ['tablet', 'capsule', 'liquid', 'cream', 'sachet', 'drops', 'other']) {
      expect(houseItemSchema.safeParse({ id: 'h9', name: 'ยาสามัญตัวอย่าง', kind }).success).toBe(true);
    }
    expect(houseItemSchema.safeParse({ id: 'h9', name: 'ยาสามัญตัวอย่าง', kind: 'syrup' }).success).toBe(false);
  });
});
