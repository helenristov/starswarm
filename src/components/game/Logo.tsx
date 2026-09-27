import { useId } from "react";

/** Swarm formation flying over the wordmark: [x, y, color]. */
const SWARM: [number, number, string][] = [
  [180, 20, "#5ee0ff"],
  [156, 28, "#e0564f"],
  [204, 28, "#e0564f"],
  [132, 36, "#f5b83d"],
  [228, 36, "#f5b83d"],
  [108, 44, "#f5b83d"],
  [252, 44, "#f5b83d"],
];

/** `top` is the line's em box top (baseline − 53.9 at this size), where its chrome gradient starts. */
const LINES = [
  { text: "STAR", y: 100, width: 226, top: 46.1 },
  { text: "SWARMS", y: 158, width: 330, top: 104.1 },
];
const LINE_HEIGHT = 70.2;
/** Where one line's gradient band hands over to the next: between STAR's baseline (100) and SWARMS' cap tops (~116). */
const SPLIT_Y = 108;

export function Logo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const fill = `${id}-fill`;
  const clip = `${id}-clip`;
  const glow = `${id}-glow`;
  const shine = `${id}-shine`;
  const mask = `${id}-mask`;

  // Fixed widths keep the lockup identical whatever the font's metrics.
  const words = LINES.map(({ text, y, width }) => (
    <text key={text} x={180} y={y} textAnchor="middle" textLength={width} lengthAdjust="spacingAndGlyphs">
      {text}
    </text>
  ));

  return (
    <svg viewBox="0 0 360 176" role="img" aria-label="Star Swarms" className={className}>
      <defs>
        {/* Chrome top, hard horizon, molten bottom — classic arcade marquee. One per line. */}
        {LINES.map((line, i) => (
          <linearGradient
            key={line.text}
            id={`${fill}-${i}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={line.top}
            x2="0"
            y2={line.top + LINE_HEIGHT}
          >
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.46" stopColor="#a9efff" />
            <stop offset="0.5" stopColor="#2b5f9e" />
            <stop offset="0.54" stopColor="#ff8a3d" />
            <stop offset="1" stopColor="#ffe08a" />
          </linearGradient>
        ))}
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={glow} filterUnits="userSpaceOnUse" x="-20" y="20" width="400" height="176">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {/* The face is gradient rectangles masked by plain white text, not gradient-filled
            text: WebKit (every iOS browser) clips gradient-filled text that uses textLength to
            a mis-measured box, cutting off each line's first and last letters. */}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="176">
          <g className="logo-type" fill="#fff">
            {words}
          </g>
        </mask>
        <clipPath id={clip}>
          <g className="logo-type">{words}</g>
        </clipPath>
      </defs>

      {/* Speed streaks behind the type */}
      <g stroke="#5ee0ff" strokeLinecap="round" opacity="0.35">
        <line x1="14" y1="120" x2="70" y2="120" strokeWidth="2" />
        <line x1="30" y1="130" x2="62" y2="130" strokeWidth="1.5" />
        <line x1="290" y1="120" x2="346" y2="120" strokeWidth="2" />
        <line x1="298" y1="130" x2="330" y2="130" strokeWidth="1.5" />
      </g>

      {/* Formation */}
      <g>
        {SWARM.map(([x, y, color], i) => (
          <path
            key={i}
            className="logo-ship"
            style={{ animationDelay: `${i * -0.22}s` }}
            d={`M${x} ${y + 7} L${x - 6} ${y - 3} L${x} ${y} L${x + 6} ${y - 3} Z`}
            fill={color}
          />
        ))}
      </g>

      <g className="logo-type">
        {/* Neon glow */}
        <g fill="none" stroke="#5ee0ff" strokeWidth="6" filter={`url(#${glow})`} opacity="0.55">
          {words}
        </g>
        {/* Extruded depth */}
        <g transform="translate(0 5)" fill="#0c2342" stroke="#0c2342" strokeWidth="4" strokeLinejoin="round">
          {words}
        </g>
        {/* Outline sits under the face: the font's glyphs have overlapping
            contours, and stroking the face itself would trace them. */}
        <g fill="#07080c" stroke="#07080c" strokeWidth="3" strokeLinejoin="round">
          {words}
        </g>
      </g>

      {/* Face: each line's gradient band, split between the lines, shown through the text mask */}
      <g mask={`url(#${mask})`}>
        <rect x="0" y="0" width="360" height={SPLIT_Y} fill={`url(#${fill}-0)`} />
        <rect x="0" y={SPLIT_Y} width="360" height={176 - SPLIT_Y} fill={`url(#${fill}-1)`} />
      </g>

      {/* Light sweep, clipped to the letters */}
      <g clipPath={`url(#${clip})`}>
        <rect className="logo-shine" x="-80" y="40" width="60" height="140" fill={`url(#${shine})`} transform="skewX(-20)" />
      </g>

      {/* Twinkle */}
      <path
        className="logo-twinkle"
        d="M318 40 L321 51 L332 54 L321 57 L318 68 L315 57 L304 54 L315 51 Z"
        fill="#fff"
      />
    </svg>
  );
}
