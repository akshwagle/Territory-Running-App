const paths = {
  back: 'm14 5-7 7 7 7M7 12h14', chevron: 'm9 5 7 7-7 7', close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  'eye-off': 'm3 3 18 18M10 5c6-1 12 7 12 7s-1 2-3 4M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2M10 10a3 3 0 0 0 4 4',
  settings: 'm10 2 4 0 1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1 1-3Zm2 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  home: 'm3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10', user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
  warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  run: 'M3 19h18M4 19c-1-3-1-5 1-6l3 1 2 3h3l3-2 4 2M9 13l1-4 3 1m0 6 1-4',
  ride: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 8h5l-4 8m3-3 4 3m-8-3 3-3',
  heart: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z',
  comment: 'M4 4h16v12H9l-5 4V4Z',
  share: 'M12 16V4m0 0 4 4m-4-4L8 8M5 14v6h14v-6',
  play: 'M7 4l13 8-13 8V4Z',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm8 2h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3m1 8h6m-3-4v4',
  calendar: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-6 9v-1a6 6 0 0 1 12 0v1M17 6a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1',
  flame: 'M12 21c4 0 6-2.6 6-6 0-4-4-4-4-9-2 2-3 4-3 6-1-1-2-2-2-4-2 3-3 5-3 7 0 3.4 2 6 6 6Z',
  chart: 'M4 20V10m5 10V5m5 15v-7m5 7V8',
};
export function Icon({ name, ...props }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" {...props}><path d={paths[name] || paths.chevron} /></svg>;
}
export function BrandMark(props) {
  return <svg viewBox="-60 -60 120 120" aria-hidden="true" focusable="false" {...props}>
    <g stroke="var(--bg)" strokeWidth="2"><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(-26 22.5)" fill="var(--accent)"/><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(26 22.5)" fill="var(--accent)"/><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(0 -22.5)" fill="var(--danger)"/></g>
  </svg>;
}
