import { describe, expect, it } from 'vitest';
import { AVATAR_NAMES, ICON_NAMES, MASCOT_POSES, avatarUrl, iconUrl, mascotUrl } from './visual';

describe('visual image helper', () => {
  it('has 28 icons, 12 avatars and 8 mascot poses', () => {
    expect(ICON_NAMES).toHaveLength(28);
    expect(AVATAR_NAMES).toHaveLength(12);
    expect(MASCOT_POSES).toHaveLength(8);
  });

  it('finds a file for every name', () => {
    for (const n of ICON_NAMES) expect(iconUrl(n)).toMatch(/svg/);
    for (const n of AVATAR_NAMES) expect(avatarUrl(n)).toMatch(/svg/);
    for (const n of MASCOT_POSES) expect(mascotUrl(n)).toMatch(/svg/);
  });

  it('has no unused image files (48 svg in total)', () => {
    const all = import.meta.glob('./assets/visual/*/*.svg');
    expect(Object.keys(all)).toHaveLength(48);
  });
});
