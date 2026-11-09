const INK = "#2a2238";

function Eyes({ y = 27 }: { y?: number }) {
  return (
    <>
      <circle cx="23" cy={y} r="2.9" fill={INK} stroke="none" />
      <circle cx="41" cy={y} r="2.9" fill={INK} stroke="none" />
    </>
  );
}

// One expression per mood score, from 1 (awful) to 5 (rad).
const EXPRESSIONS: Record<number, React.ReactNode> = {
  5: (
    <>
      <path d="M17.5 28.5q4.5-6.5 9 0" />
      <path d="M37.5 28.5q4.5-6.5 9 0" />
      <path d="M19.5 37.5q12.5 16 25 0z" fill={INK} />
    </>
  ),
  4: (
    <>
      <Eyes />
      <path d="M21 38.5q11 10.5 22 0" />
    </>
  ),
  3: (
    <>
      <Eyes />
      <path d="M23 42.5h18" />
    </>
  ),
  2: (
    <>
      <Eyes y={28} />
      <path d="M22 46q10-9 20 0" />
    </>
  ),
  1: (
    <>
      <path d="M16.5 25l9-4.5" />
      <path d="M47.5 25l-9-4.5" />
      <Eyes y={31} />
      <path d="M21.5 48q10.5-11.5 21 0" />
    </>
  ),
};

/** A drawn face for a mood, so moods look the same on every device. */
export function MoodFace({ score, color, ...svgProps }: { score: number; color: string } & React.SVGProps<SVGSVGElement>) {
  const level = Math.min(5, Math.max(1, Math.round(score)));
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...svgProps}>
      <circle cx="32" cy="32" r="32" fill={color} />
      <ellipse cx="24" cy="19" rx="15" ry="11" fill="#fff" opacity=".2" />
      <g fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity=".88">
        {EXPRESSIONS[level]}
      </g>
    </svg>
  );
}
