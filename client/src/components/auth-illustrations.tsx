import { cn } from "@/lib/utils";

/*
 * Decorative source-to-pay illustrations shown either side of the auth card
 * (sign in / supplier sign up / forgot password). Inline SVG in the S2P logo
 * palette: navy #0B0D24, violet #7C3AED / #8B3DFF, blue #4F7BEA.
 * Purely decorative — hidden from assistive tech.
 */

const NAVY = "#0B0D24";
const VIOLET = "#7C3AED";
const VIOLET_LIGHT = "#8B3DFF";
const BLUE = "#4F7BEA";
const LAVENDER = "#EDE7FE";
const LAVENDER_DEEP = "#DDD3FD";

function SourceArt() {
  return (
    <svg viewBox="0 0 300 320" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="s2p-src-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={LAVENDER} />
          <stop offset="1" stopColor="#E3E9FD" />
        </linearGradient>
        <linearGradient id="s2p-src-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={VIOLET_LIGHT} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
        <filter id="s2p-src-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={VIOLET} floodOpacity="0.14" />
        </filter>
      </defs>

      <circle cx="150" cy="165" r="132" fill="url(#s2p-src-bg)" />

      {/* RFQ document */}
      <g filter="url(#s2p-src-shadow)">
        <rect x="88" y="62" width="136" height="172" rx="14" fill="#fff" />
        <rect x="88" y="62" width="136" height="34" rx="14" fill={VIOLET} />
        <rect x="88" y="82" width="136" height="14" fill={VIOLET} />
        <text x="104" y="84" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">RFQ</text>
        <rect x="104" y="112" width="96" height="8" rx="4" fill={LAVENDER_DEEP} />
        <rect x="104" y="128" width="74" height="8" rx="4" fill={LAVENDER_DEEP} />
        {[150, 172, 194].map((y, i) => (
          <g key={y}>
            <rect x="104" y={y} width="12" height="12" rx="3" fill={i < 2 ? VIOLET : "#fff"} stroke={VIOLET} strokeWidth="1.5" />
            {i < 2 && <path d={`M106.5 ${y + 6} l3 3 l5 -6`} stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            <rect x="124" y={y + 2} width={i === 2 ? 52 : 70} height="8" rx="4" fill="#E6E8F2" />
          </g>
        ))}
      </g>

      {/* Supplier building */}
      <g filter="url(#s2p-src-shadow)">
        <rect x="28" y="168" width="84" height="94" rx="14" fill="#fff" />
        <path d="M48 246 V200 l22 -12 l22 12 V246 Z" fill={NAVY} />
        {[0, 1].map((r) =>
          [0, 1].map((c) => (
            <rect key={`${r}${c}`} x={56 + c * 18} y={208 + r * 14} width="9" height="8" rx="1.5" fill={BLUE} />
          )),
        )}
        <rect x="64" y="234" width="12" height="12" rx="2" fill={VIOLET_LIGHT} />
      </g>

      {/* Auction gavel badge */}
      <g filter="url(#s2p-src-shadow)">
        <circle cx="236" cy="70" r="34" fill="url(#s2p-src-accent)" />
        <g transform="rotate(-35 236 70)">
          <rect x="222" y="54" width="28" height="13" rx="3" fill="#fff" />
          <rect x="233" y="66" width="6" height="26" rx="3" fill="#fff" />
        </g>
      </g>

      {/* Flow arrow supplier -> RFQ */}
      <path d="M118 214 C 150 214, 160 250, 200 256" stroke={VIOLET} strokeWidth="2.5" strokeDasharray="5 6" fill="none" strokeLinecap="round" />
      <path d="M196 249 l9 7 l-10 5" stroke={VIOLET} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="226" cy="262" r="16" fill="#fff" stroke={LAVENDER_DEEP} strokeWidth="2" />
      <path d="M219 262 l5 5 l9 -10" stroke={VIOLET} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PayArt() {
  return (
    <svg viewBox="0 0 300 320" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="s2p-pay-bg" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={LAVENDER} />
          <stop offset="1" stopColor="#E3E9FD" />
        </linearGradient>
        <linearGradient id="s2p-pay-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={NAVY} />
          <stop offset="1" stopColor="#3B1C8C" />
        </linearGradient>
        <linearGradient id="s2p-pay-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={VIOLET_LIGHT} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
        <filter id="s2p-pay-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={VIOLET} floodOpacity="0.14" />
        </filter>
      </defs>

      <circle cx="150" cy="165" r="132" fill="url(#s2p-pay-bg)" />

      {/* Purchase order (behind) */}
      <g filter="url(#s2p-pay-shadow)" transform="rotate(-8 120 130)">
        <rect x="56" y="58" width="118" height="146" rx="12" fill="#fff" />
        <text x="70" y="82" fontSize="12" fontWeight="700" fill={BLUE} fontFamily="Inter, sans-serif">PO</text>
        <rect x="70" y="94" width="84" height="7" rx="3.5" fill="#E6E8F2" />
        <rect x="70" y="108" width="64" height="7" rx="3.5" fill="#E6E8F2" />
        <rect x="70" y="122" width="76" height="7" rx="3.5" fill="#E6E8F2" />
      </g>

      {/* Invoice */}
      <g filter="url(#s2p-pay-shadow)">
        <rect x="108" y="76" width="128" height="160" rx="14" fill="#fff" />
        <text x="124" y="102" fontSize="13" fontWeight="700" fill={NAVY} fontFamily="Inter, sans-serif">INVOICE</text>
        <rect x="124" y="114" width="64" height="7" rx="3.5" fill={LAVENDER_DEEP} />
        {[134, 150, 166].map((y) => (
          <g key={y}>
            <rect x="124" y={y} width="58" height="7" rx="3.5" fill="#E6E8F2" />
            <rect x="196" y={y} width="24" height="7" rx="3.5" fill="#E6E8F2" />
          </g>
        ))}
        <rect x="124" y="186" width="96" height="1.5" fill="#E6E8F2" />
        <rect x="124" y="198" width="40" height="9" rx="4.5" fill={NAVY} />
        <rect x="180" y="198" width="40" height="9" rx="4.5" fill={VIOLET} />
        {/* approved stamp */}
        <circle cx="232" cy="84" r="20" fill={VIOLET} />
        <path d="M223 84 l6 6 l11 -12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Payment card */}
      <g filter="url(#s2p-pay-shadow)">
        <rect x="44" y="196" width="138" height="84" rx="14" fill="url(#s2p-pay-card)" />
        <rect x="44" y="214" width="138" height="14" fill={BLUE} opacity="0.85" />
        <rect x="58" y="240" width="22" height="16" rx="3" fill="#C4B5FD" />
        <rect x="58" y="264" width="66" height="6" rx="3" fill="#ffffff" opacity="0.55" />
      </g>

      {/* Coins */}
      <g filter="url(#s2p-pay-shadow)">
        {[0, 1, 2].map((i) => (
          <ellipse key={i} cx="232" cy={272 - i * 11} rx="30" ry="10" fill="url(#s2p-pay-coin)" stroke="#fff" strokeWidth="1.5" />
        ))}
        <text x="226" y="254" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">$</text>
      </g>
    </svg>
  );
}

const CAPTIONS = {
  left: { title: "Source", detail: "Suppliers · RFQs · Auctions" },
  right: { title: "Pay", detail: "Orders · Invoices · Payments" },
} as const;

/** One side illustration with its caption. Shown only on wide screens so it never crowds the form. */
export function AuthSideArt({ side, className }: { side: "left" | "right"; className?: string }) {
  const caption = CAPTIONS[side];
  return (
    <div className={cn("hidden xl:flex w-72 shrink-0 flex-col items-center text-center select-none", className)} aria-hidden="true">
      {side === "left" ? <SourceArt /> : <PayArt />}
      <p className="mt-2 text-lg font-semibold tracking-tight text-[#0B0D24] dark:text-white">{caption.title}</p>
      <p className="text-sm text-muted-foreground">{caption.detail}</p>
    </div>
  );
}
