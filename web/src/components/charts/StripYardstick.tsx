// Where one járás stands among 174, in a single line.
//
// Every rural járás is a short tick on the line, the median a taller one,
// and this járás a dot — so the reader sees not only "above the median" but
// how far into the tail, and whether the tail is long. The bad end is always
// on the right, whatever the measure's direction, so a row of these reads
// like one scale.
export function StripYardstick({ values, value, median, higherWorse, mid }: {
  values: number[];
  value: number | null;
  median: number | null;
  higherWorse: boolean;
  /** a diverging measure's middle (0, or 100), drawn as a faint line */
  mid?: number;
}) {
  const W = 300; const H = 34; const PAD = 8;
  if (!values.length) return null;
  const lo = Math.min(...values, value ?? Infinity);
  const hi = Math.max(...values, value ?? -Infinity);
  const x = (v: number) => {
    const f = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    return PAD + (higherWorse ? f : 1 - f) * (W - 2 * PAD);
  };
  return (
    <svg className="strip" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} className="strip__axis" />
      {mid !== undefined && mid >= lo && mid <= hi && (
        <line x1={x(mid)} x2={x(mid)} y1={4} y2={H - 4} className="strip__mid" />
      )}
      {values.map((v, i) => (
        <line key={i} x1={x(v)} x2={x(v)} y1={H / 2 - 5} y2={H / 2 + 5} className="strip__tick" />
      ))}
      {median !== null && (
        <line x1={x(median)} x2={x(median)} y1={3} y2={H - 3} className="strip__median" />
      )}
      {value !== null && <circle cx={x(value)} cy={H / 2} r={6} className="strip__dot" />}
    </svg>
  );
}
