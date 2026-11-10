/** Pit mark: crimson lacquer medallion, gold ring, flame-tipped "P". Original art. */
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="pit-logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="pitLogoGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".5" stopColor="#f5c542" />
          <stop offset="1" stopColor="#a8650c" />
        </linearGradient>
        <radialGradient id="pitLogoRed" cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#e3202a" />
          <stop offset="1" stopColor="#5a0409" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#pitLogoRed)" stroke="url(#pitLogoGold)" strokeWidth="3.5" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="url(#pitLogoGold)" strokeWidth="1" strokeDasharray="2 3.2" opacity=".85" />
      <path d="M24 46 V18 h10.5 a8.5 8.5 0 0 1 0 17 H29" fill="none" stroke="url(#pitLogoGold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 12 c3 3 1 5 3 7 c1 -2 3 -2 3 -4 c2 3 1 7 -2 8" fill="none" stroke="#ffb03a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
