// Original Pit line-art emblems for lobby tiles (decorative).
const G = "#e8d5a3";
export function GameEmblem({ kind }: { kind?: string }) {
  const common = { width: 44, height: 44, viewBox: "0 0 48 48", fill: "none", stroke: G, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "game-emblem" };
  switch (kind) {
    case "bj": return <svg {...common}><rect x="9" y="8" width="20" height="28" rx="3" transform="rotate(-10 19 22)"/><rect x="19" y="12" width="20" height="28" rx="3" transform="rotate(8 29 26)"/><path d="M29 22l3 4-3 4-3-4z"/></svg>;
    case "slot": return <svg {...common}><rect x="7" y="10" width="30" height="28" rx="4"/><path d="M14 18v12M22 18v12M30 18v12"/><path d="M37 16h4v8"/><circle cx="41" cy="26" r="2"/></svg>;
    case "vault": return <svg {...common}><path d="M24 6l6 10h-12z"/><path d="M14 18h20l-3 22H17z"/><path d="M18 26h12M19 32h10"/><path d="M10 40h28"/></svg>;
    case "he": return <svg {...common}><ellipse cx="24" cy="26" rx="18" ry="11"/><ellipse cx="24" cy="26" rx="12" ry="6.5"/><circle cx="24" cy="12" r="3"/><path d="M24 15v4"/></svg>;
    case "rl": return <svg {...common}><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><path d="M24 7v8M24 33v8M7 24h8M33 24h8M12 12l6 6M30 30l6 6M36 12l-6 6M18 30l-6 6"/><circle cx="31" cy="15" r="1.8" fill={G}/></svg>;
    case "cr": return <svg {...common}><rect x="7" y="14" width="18" height="18" rx="3" transform="rotate(-12 16 23)"/><rect x="23" y="18" width="18" height="18" rx="3" transform="rotate(10 32 27)"/><circle cx="13" cy="20" r="1.3" fill={G}/><circle cx="18" cy="25" r="1.3" fill={G}/><circle cx="29" cy="24" r="1.3" fill={G}/><circle cx="35" cy="30" r="1.3" fill={G}/><circle cx="32" cy="27" r="1.3" fill={G}/></svg>;
    case "pg": return <svg {...common}><path d="M10 34h28M13 34V18l11-8 11 8v16"/><path d="M18 34v-9h12v9"/><path d="M8 18h32"/></svg>;
    default: return <svg {...common}><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="8"/></svg>;
  }
}
