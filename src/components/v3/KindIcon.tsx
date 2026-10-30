// The seven medicine-kind pictures of the medicine list. Shapes, numbers and colours are copied as-is from the
// design (M4 PR 5a, 3B); inline SVG on purpose so no file is added to src/assets/visual. Do not redraw or tune.
import type { ReactNode } from 'react';
import type { MedKind } from '../../domain/v3/schema';

const LINE = { stroke: '#013073', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const SACHET_DOTS: [number, number][] = [
  [12, 7.5], [10.4, 10.5], [13.6, 10.5], [8.8, 13.5], [12, 13.5], [15.2, 13.5], [7.2, 16.5], [10.4, 16.5],
  [13.6, 16.5], [16.8, 16.5], [5.5, 19.5], [8.7, 19.5], [11.9, 19.5], [15.1, 19.5], [18.3, 19.5],
];
const BOTTLE = 'M9 5.9h6l1.9 3v10.8a1.6 1.6 0 01-1.6 1.6H8.7a1.6 1.6 0 01-1.6-1.6V8.9z';

const SHAPES: Record<MedKind, ReactNode> = {
  tablet: (
    <>
      <path d="M3.5 11.5v2.5c0 2.5 3.8 4.5 8.5 4.5s8.5-2 8.5-4.5v-2.5" fill="#9CC9F5" {...LINE} />
      <ellipse cx="12" cy="11.5" rx="8.5" ry="4.5" fill="#CFE4FF" {...LINE} />
      <path d="M7.5 11.3l5-1.6" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  capsule: (
    <g transform="rotate(-45 12 12)">
      <rect x="3" y="8" width="18" height="8" rx="4" fill="#FFFFFF" />
      <path d="M12 8H7a4 4 0 000 8h5z" fill="#9CC9F5" />
      <rect x="3" y="8" width="18" height="8" rx="4" fill="none" {...LINE} />
      <path d="M12 8v8" fill="none" {...LINE} />
    </g>
  ),
  liquid: (
    <>
      <rect x="9.3" y="2.5" width="5.4" height="3.4" rx="1" fill="#EA4335" {...LINE} />
      <path d={BOTTLE} fill="#FFFFFF" {...LINE} />
      <path d="M7.1 12.5h9.8v7.2a1.6 1.6 0 01-1.6 1.6H8.7a1.6 1.6 0 01-1.6-1.6z" fill="#F6A5A0" />
      <path d={BOTTLE} fill="none" {...LINE} />
    </>
  ),
  cream: (
    <g transform="rotate(45 12 12)">
      <rect x="9.3" y="2" width="5.4" height="3.6" rx="1" fill="#81C995" {...LINE} />
      <path d="M8.5 5.6h7l-.4 12.4-3.1 3.5-3.1-3.5z" fill="#FFFFFF" {...LINE} />
      <path d="M9.2 17.6h5.6" fill="none" {...LINE} />
    </g>
  ),
  sachet: (
    <>
      {SACHET_DOTS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="#013073" />
      ))}
    </>
  ),
  drops: (
    <>
      <rect x="10.2" y="2.5" width="3.6" height="3.5" rx="1" fill="#CFE4FF" {...LINE} />
      <rect x="9.2" y="6" width="5.6" height="2.5" rx=".6" fill="#FFFFFF" {...LINE} />
      <rect x="7.5" y="8.5" width="9" height="12.5" rx="2.5" fill="#9CC9F5" {...LINE} />
    </>
  ),
  other: (
    <>
      {[5, 12, 19].map((cx) => (
        <circle key={cx} cx={cx} cy="12" r="1.9" fill="#013073" />
      ))}
    </>
  ),
};

export function KindIcon({ kind, size }: { kind: MedKind; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {SHAPES[kind]}
    </svg>
  );
}
