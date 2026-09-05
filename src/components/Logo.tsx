export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8d5a3" />
          <stop offset="1" stopColor="#c9a227" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#0b0d0c" stroke="url(#g)" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#c9a227" strokeDasharray="3 5" />
      <path d="M18 38c6-14 22-14 28 0" fill="none" stroke="url(#g)" strokeWidth="2.4" />
      <rect x="26" y="18" width="12" height="16" rx="2" fill="none" stroke="url(#g)" />
      <text x="32" y="30" textAnchor="middle" fontSize="10" fill="#e8d5a3" fontFamily="serif">P</text>
    </svg>
  );
}
