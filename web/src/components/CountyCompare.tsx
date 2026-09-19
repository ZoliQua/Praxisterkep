// Side-by-side comparison of two counties: headline indicators from the
// current snapshot plus overlaid vacancy-count timelines from the archive.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent } from '../lib/format';
import { useAppStore, useHistoryEntries, useSnapshot } from '../store/useAppStore';
import type { CountyAggregate } from '../types';

const W = 460;
const H = 150;
const PAD = { top: 12, right: 10, bottom: 22, left: 34 };
const COLOR_A = 'var(--accent)';
const COLOR_B = '#b58cff';

function CountyCard({ county, color }: { county: CountyAggregate; color: string }) {
  const rate = county.total ? (county.vacant + county.dissolved) / county.total : null;
  const rows: [string, string][] = [
    [t('ranking.compareVacant'), `${county.vacant + county.dissolved} / ${county.total ?? '–'}`],
    [t('ranking.compareRate'), rate !== null ? formatPercent(rate) : '–'],
    [t('ranking.comparePop'), formatNumber(county.populationVacant + county.populationDissolved)],
  ];
  if (county.populationShare != null) {
    rows.push([t('ranking.comparePopShare'), formatPercent(county.populationShare)]);
  }
  if (county.praxesPer10k != null) {
    rows.push([t('ranking.comparePer10k'), formatDecimal(county.praxesPer10k.toFixed(2))]);
  }
  if (county.longTerm != null) {
    rows.push([t('ranking.compareLongTerm'), String(county.longTerm)]);
  }
  return (
    <div className="compare-card">
      <h4><span className="compare-dot" style={{ background: color }} />{county.name}</h4>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export function CountyCompare() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const history = useHistoryEntries();
  const counties = useMemo(
    () => [...snapshot.counties].sort((a, b) => a.name.localeCompare(b.name, 'hu')),
    [snapshot],
  );
  // defaults: the worst county vs Budapest (or the second-worst)
  const worst = useMemo(() => [...snapshot.counties].sort((a, b) => {
    const ra = a.total ? (a.vacant + a.dissolved) / a.total : 0;
    const rb = b.total ? (b.vacant + b.dissolved) / b.total : 0;
    return rb - ra;
  }), [snapshot]);
  const [nameA, setNameA] = useState(() => worst[0]?.name ?? '');
  const [nameB, setNameB] = useState(() => {
    const bp = snapshot.counties.find((c) => c.name === 'BUDAPEST');
    return bp?.name ?? worst[1]?.name ?? '';
  });
  const a = counties.find((c) => c.name === nameA);
  const b = counties.find((c) => c.name === nameB);

  const series = useMemo(() => {
    const pick = (name: string) => history.map((h) => {
      const c = h.byCounty[name];
      return c ? c.vacant + c.dissolved : null;
    });
    return { a: pick(nameA), b: pick(nameB) };
  }, [history, nameA, nameB]);

  const maxY = Math.max(1, ...series.a.filter((v): v is number => v !== null),
    ...series.b.filter((v): v is number => v !== null));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xAt = (i: number) =>
    PAD.left + (history.length > 1 ? (i / (history.length - 1)) * innerW : 0);
  const yAt = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  const line = (values: (number | null)[]) => values
    .map((v, i) => (v === null ? null : `${i === 0 || values[i - 1] === null ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`))
    .filter(Boolean).join(' ');
  const years = useMemo(() => {
    const seen = new Set<string>();
    const all = history.map((h, i) => {
      const y = h.month.slice(0, 4);
      if (seen.has(y)) return null;
      seen.add(y);
      return { i, label: y };
    }).filter((v): v is { i: number; label: string } => v !== null);
    // thin the labels so they never collide on an irregular archive
    const step = Math.max(1, Math.ceil(all.length / 6));
    return all.filter((_, idx) => idx % step === 0);
  }, [history]);

  if (!a || !b) return null;
  return (
    <div className="compare">
      <h3 className="why__chain-title">{t('ranking.compareTitle')}</h3>
      <p className="section__explain">{t('ranking.compareExplain')}</p>
      <div className="compare__selects">
        <select value={nameA} onChange={(e) => setNameA(e.target.value)} aria-label="A">
          {counties.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <span className="compare__vs">vs</span>
        <select value={nameB} onChange={(e) => setNameB(e.target.value)} aria-label="B">
          {counties.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="compare__grid">
        <CountyCard county={a} color={COLOR_A} />
        <div className="compare-chart">
          <p>{t('ranking.compareChart', { kind: t(`kinds.${kind}.adj`) })}</p>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('ranking.compareTitle')}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.left} x2={W - PAD.right} y1={yAt(f * maxY)} y2={yAt(f * maxY)}
                  stroke="var(--line)" strokeWidth={1} />
                <text x={PAD.left - 5} y={yAt(f * maxY) + 3.5} textAnchor="end"
                  fill="var(--ink-faint)" fontSize="10">{Math.round(f * maxY)}</text>
              </g>
            ))}
            {years.map(({ i, label }) => (
              <text key={label} x={xAt(i)} y={H - 6} fill="var(--ink-faint)" fontSize="10">
                {label}
              </text>
            ))}
            <path d={line(series.a)} fill="none" stroke={COLOR_A} strokeWidth={2.2} />
            <path d={line(series.b)} fill="none" stroke={COLOR_B} strokeWidth={2.2} />
          </svg>
        </div>
        <CountyCard county={b} color={COLOR_B} />
      </div>
    </div>
  );
}
