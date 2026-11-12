export const hexPoints = '0,-27 23.383,-13.5 23.383,13.5 0,27 -23.383,13.5 -23.383,-13.5';

export default function Logo({ wordmark = true }) {
  return <span className="logo">
    <svg className="logo-mark" viewBox="-60 -60 120 120" aria-hidden="true">
      <polygon points={hexPoints} transform="translate(-26 22.5)" fill="var(--color-pine)" />
      <polygon points={hexPoints} transform="translate(26 22.5)" fill="var(--color-pine)" />
      <polygon points={hexPoints} transform="translate(0 -22.5)" fill="var(--color-clay)" />
    </svg>
    {wordmark && <span className="wordmark">TERRITORY RUN</span>}
  </span>;
}
