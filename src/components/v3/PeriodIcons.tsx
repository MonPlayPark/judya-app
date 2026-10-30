// The four period icons of the Home "ยาของวันนี้" card. Copied as-is from the locked board HomeV3.dc.html (canvas v87):
// shapes, numbers and colours are the design, do not redraw or tune them here. The colours live inside the SVG on
// purpose (no tokens); a contrast problem is reported to the owner, not fixed in this file.

export function MorningIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A6FD6" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M7.5 19h9.5a3.4 3.4 0 0 0 .3-6.8 5.2 5.2 0 0 0-9.9 1.4A2.8 2.8 0 0 0 7.5 19z" fill="#CFE4FF"></path>
      <path d="M6.5 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM6.5 2.2v1.2M1.6 8h1.2M3 4.5l.9.9M10 4.5l-.9.9"></path>
    </svg>
  );
}

export function NoonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F29900" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="4.2" fill="#FBBC05"></circle>
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"></path>
    </svg>
  );
}

export function EveningIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D9480F" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M7.5 15a4.5 4.5 0 0 1 9 0z" fill="#FF9F43"></path>
      <path d="M12 5.5v2.4M5 9l1.7 1.7M19 9l-1.7 1.7M2.5 15h2M19.5 15h2M4 18.5h16M7 21.5h10"></path>
    </svg>
  );
}

export function NightIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z" fill="#013073"></path>
    </svg>
  );
}
