import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('hash router', () => {
  it('empty hash is the home route', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
    expect(parseHash('#/').path).toBe('/');
  });

  it('splits path and query, ignores a trailing slash', () => {
    const r = parseHash('#/meds/?tab=house');
    expect(r.path).toBe('/meds');
    expect(r.query.get('tab')).toBe('house');
  });

  it('adds a missing leading slash', () => {
    expect(parseHash('#members').path).toBe('/members');
  });
});
