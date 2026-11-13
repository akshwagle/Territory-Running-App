const paths = {
  back: 'm14 5-7 7 7 7M7 12h14', chevron: 'm9 5 7 7-7 7', close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  'eye-off': 'm3 3 18 18M10 5c6-1 12 7 12 7s-1 2-3 4M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2M10 10a3 3 0 0 0 4 4',
  settings: 'm10 2 4 0 1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1 1-3Zm2 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  home: 'm3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10', user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
  warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
};
export function Icon({ name, ...props }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" {...props}><path d={paths[name] || paths.chevron} /></svg>;
}
export function BrandMark(props) {
  return <svg viewBox="-60 -60 120 120" aria-hidden="true" focusable="false" {...props}>
    <g stroke="var(--color-paper)" strokeWidth="2"><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(-26 22.5)" fill="var(--color-pine)"/><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(26 22.5)" fill="var(--color-pine)"/><path d="M0-27 23.383-13.5V13.5L0 27-23.383 13.5v-27Z" transform="translate(0 -22.5)" fill="var(--color-clay)"/></g>
  </svg>;
}
