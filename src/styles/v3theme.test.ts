// @vitest-environment node
// Guards the v3 theme (M4 PR 4d): every colour of the board is in `.v3theme`, and the v2 `:root` is still v2.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), name), 'utf8');
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations inside the first rule whose selector is exactly `selector`. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const end = css.indexOf('}', start);
  const out = new Map<string, string>();
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1] ?? '', (m[2] ?? '').trim());
  return out;
}

const V3: Record<string, string> = {
  '--color-primary': '#006DF5',
  '--color-primary-pressed': '#0056C2',
  '--color-primary-ink': '#005FD6',
  '--color-primary-tint': '#E4F0FE',
  '--color-navy': '#013073',
  '--color-background': '#F6FAFF',
  '--color-surface': '#FFFFFF',
  '--color-border': '#E3E8EF',
  '--color-border-strong': '#80868B',
  '--color-ink': '#202124',
  '--color-ink-muted': '#5F6368',
  '--color-success': '#34A853',
  '--color-success-ink': '#137333',
  '--color-success-tint': '#E6F4EA',
  '--color-warning': '#FBBC05',
  '--color-warning-ink': '#8A5300',
  '--color-warning-tint': '#FEF7E0',
  '--color-error': '#EA4335',
  '--color-error-solid': '#D93025',
  '--color-error-ink': '#C5221F',
  '--color-error-tint': '#FCE8E6',
  '--color-band': '#EAF3FF',
  '--color-member-blue': '#006DF5',
  '--elevation-1': '0 1px 2px rgba(60, 64, 67, 0.22), 0 1px 3px 1px rgba(60, 64, 67, 0.1)',
  '--elevation-2': '0 1px 2px rgba(60, 64, 67, 0.3), 0 2px 6px 2px rgba(60, 64, 67, 0.15)',
  '--color-header-cloud': '#DDEEFE',
  '--color-header-cloud-2': '#E3F1FF',
  '--color-header-spark': '#0A74F5',
  '--color-logo-blue': '#047AF9',
  '--color-period-sun': '#F29900',
  '--color-period-dusk': '#D9480F',
  '--color-period-dusk-fill': '#FF9F43',
  '--shadow-selected-ring': '0 0 0 3px #006DF5',
  '--touch-min': '44px',
  '--fs': '1',
};

describe('v3theme.css', () => {
  const css = read('v3theme.css');
  const theme = block(css, '.v3theme');

  it.each(Object.entries(V3))('.v3theme sets %s to %s', (name, value) => {
    expect(theme.get(name)).toBe(value);
  });

  it('has no variable the board does not list', () => {
    expect([...theme.keys()].sort()).toEqual(Object.keys(V3).sort());
  });

  it('scales the text with the three sizes (n / m / l = 93 / 100 / 115 %)', () => {
    expect(block(css, "html[data-fs='n'] .v3theme").get('--fs')).toBe('1');
    expect(block(css, "html[data-fs='m'] .v3theme").get('--fs')).toBe('1.075');
    expect(block(css, "html[data-fs='l'] .v3theme").get('--fs')).toBe('1.24');
  });

  it('only styles .v3theme (nothing leaks to :root or other pages)', () => {
    const rules = withoutComments(css);
    expect(rules).not.toMatch(/:root/);
    const selectors = [...rules.matchAll(/^([^\s/*][^{]*)\{/gm)].map((m) => (m[1] ?? '').trim());
    for (const sel of selectors) expect(sel).toMatch(/\.v3theme$/);
  });
});

describe('tokens.css :root (v2 stays as it was until PR 7)', () => {
  const root = block(read('tokens.css'), ':root');
  it('keeps the v2 colours', () => {
    expect(root.get('--color-primary')).toBe('#1a73e8');
    expect(root.get('--color-background')).toBe('#f8f9fa');
    expect(root.get('--color-border')).toBe('#dadce0');
    expect(root.get('--color-band')).toBe('#d6e6fd');
    expect(root.get('--elevation-1')).toBe('0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)');
  });
  it('has no v3-only variable', () => {
    expect(root.has('--fs')).toBe(false);
    expect(root.has('--color-header-cloud')).toBe(false);
    expect(root.has('--shadow-selected-ring')).toBe(false);
  });
});
