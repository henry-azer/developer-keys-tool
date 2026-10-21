import { useId } from 'react';

/**
 * The Developer Keys mark: a bold D whose bowl is a vault door. The dial ring, its
 * spokes and the keyhole are cut out with a mask, so it takes the current
 * text colour and works on any background. Source: branding/developer-keys-mark.svg.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  const id = `dv-cut-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <path d="M5 3h10.5C23.5 3 29 8.6 29 16s-5.5 13-13.5 13H5Z" fill="#fff" />
        <circle cx="15.5" cy="16" r="6.2" fill="none" stroke="#000" strokeWidth="2.4" />
        <rect x="14.3" y="6.2" width="2.4" height="4.2" rx="1.2" fill="#000" />
        <rect x="14.3" y="21.6" width="2.4" height="4.2" rx="1.2" fill="#000" />
        <rect x="5.8" y="14.8" width="4.2" height="2.4" rx="1.2" fill="#000" />
        <rect x="21" y="14.8" width="4.2" height="2.4" rx="1.2" fill="#000" />
        <circle cx="15.5" cy="14.7" r="2.1" fill="#000" />
        <path d="M14.55 16.1 13.95 19.4a.5.5 0 0 0 .5.6h2.1a.5.5 0 0 0 .5-.6l-.6-3.3Z" fill="#000" />
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
