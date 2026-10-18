// "Mibe kerül egy üres körzet?" — the outcome every other analysis is about.
//
// The section has one argument and makes it in four steps, each a chart a
// reader can poke at:
//
//   1. what avoidable mortality is, and how it splits (the three NNGYK groups
//      as one bar, for the median járás and the selected one);
//   2. where it is high (the map);
//   3. whether it goes with vacant GP districts (the scatter, coloured by
//      income third, with r and the partial r beside it);
//   4. whether that is only poverty (the grid: income third × vacancy third).
//
// Every number is read from outcomes.json; the sentences that state a
// finding are built from those numbers, so they cannot drift from the data.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, inSentence } from '../lib/format';
import {
  districtHref, incomeThird, metaOf, partialOf, pairOf, pValue, ruralMedian, strengthOf,
  useOutcomes, valueOf, type OutcomeDistrict,
} from '../lib/outcomes';
import { DistrictMap } from './charts/DistrictMap';
import { OutcomeScatter, type ScatterPoint } from './charts/OutcomeScatter';
import { TertileGrid } from './charts/TertileGrid';

const MEASURES = ['avoidable', 'amenable', 'treatable', 'preventable', 'allCause'] as const;
type Measure = (typeof MEASURES)[number];

/** The three avoidable groups as one stacked bar. */
function Composition({ rows, row }: { rows: OutcomeDistrict[]; row: OutcomeDistrict | null }) {
  const parts = ['treatable', 'both', 'preventable'] as const;
  // the járás in the middle of the ranking, named: three medians added up
  // would be a járás that does not exist
  const ranked = rows.filter((r) => !r.capital && r.avoidable !== null)
    .sort((a, b) => (a.avoidable as number) - (b.avoidable as number));
  const mid = ranked[Math.floor(ranked.length / 2)];
  const of = (d: OutcomeDistrict) => Object.fromEntries(parts.map((p) => [p, valueOf(d, p) ?? 0]));
  const lines = [
    ...(mid ? [{ label: t('outcomes.mortality.medianDistrict', { name: mid.name }), vals: of(mid) }] : []),
    ...(row && row !== mid ? [{ label: row.name, vals: of(row) }] : []),
  ];
  const max = Math.max(...lines.map((l) => parts.reduce((a, p) => a + l.vals[p], 0)));
  return (
    <div className="composition">
      {lines.map((l) => (
        <div key={l.label} className="composition__row">
          <span className="composition__label">{l.label}</span>
          <span className="composition__bar">
            {parts.map((p) => (
              <i key={p} className={`composition__part is-${p}`}
                style={{ width: `${(100 * l.vals[p]) / max}%` }}
                title={`${t(`outcomes.measure.${p}`)}: ${formatNumber(Math.round(l.vals[p]))}`} />
            ))}
          </span>
          <b>{formatNumber(Math.round(parts.reduce((a, p) => a + l.vals[p], 0)))}</b>
        </div>
      ))}
      <div className="composition__legend">
        {parts.map((p) => (
          <span key={p}><i className={`composition__part is-${p}`} />{t(`outcomes.part.${p}`)}</span>
        ))}
      </div>
    </div>
  );
}

export function MortalitySection() {
  const data = useOutcomes();
  const [measure, setMeasure] = useState<Measure>('avoidable');
  const [picked, setPicked] = useState<string | null>(null);
  const [cell, setCell] = useState<[number, number] | null>(null);

  const rows = useMemo(() => data?.districts ?? [], [data]);
  const third = useMemo(() => incomeThird(rows), [rows]);
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  if (!data) return null;

  const meta = metaOf(measure);
  const values = new Map(rows.filter((r) => valueOf(r, measure) !== null)
    .map((r) => [r.name, valueOf(r, measure) as number]));
  const rural = rows.filter((r) => !r.capital);
  // the opening sentence is about avoidable mortality whatever is selected:
  // "under 75, from causes care could have averted" is not true of all-cause
  const lead = [...rows].filter((r) => r.avoidable !== null)
    .sort((a, b) => (b.avoidable as number) - (a.avoidable as number));
  const worst = lead[0];
  const best = lead[lead.length - 1];
  const fmtA = metaOf('avoidable').format;

  const pair = pairOf(data, 'gpRate', measure);
  const part = partialOf(data, 'gpRate', measure, 'income');
  const incPair = pairOf(data, 'income', measure);

  const gridKey = measure === 'amenable' ? 'amenable' : 'avoidable';
  const grid = data.grid[gridKey];
  const highlight = cell
    ? new Set(rows.filter((r) => grid.cells[cell[0]][cell[1]].districts.includes(r.slug)).map((r) => r.name))
    : null;
  const top = grid.cells[2];
  const low = grid.cells[0];

  const points: ScatterPoint[] = rural
    .filter((r) => r.gpRate !== null && valueOf(r, measure) !== null)
    .map((r) => ({
      id: r.name, label: r.name, sub: r.county, x: r.gpRate as number,
      y: valueOf(r, measure) as number, size: r.population, group: third(r),
    }));
  const row = picked ? byName.get(picked) ?? null : null;

  return (
    <section className="section container outcome" id="halalozas">
      <h2 className="section__heading">{t('outcomes.mortality.heading')}</h2>
      <p className="section__lead">
        {t('outcomes.mortality.lead', {
          year: data.sources.mortality.year,
          best: best.name, bestValue: fmtA(best.avoidable as number),
          worst: worst.name, worstValue: fmtA(worst.avoidable as number),
          times: formatDecimal(((worst.avoidable as number) / (best.avoidable as number)).toFixed(1)),
        })}
      </p>

      <div className="outcome__explain">
        <div>
          <h3>{t('outcomes.mortality.whatHeading')}</h3>
          <p>{t('outcomes.mortality.what')}</p>
          <ul className="outcome__parts">
            {(['treatable', 'both', 'preventable'] as const).map((p) => (
              <li key={p}><i className={`composition__part is-${p}`} />
                <b>{t(`outcomes.part.${p}`)}</b> — {t(`outcomes.partText.${p}`)}</li>
            ))}
          </ul>
        </div>
        <Composition rows={rows} row={row} />
      </div>

      <div className="seg outcome__switch" role="group" aria-label={t('outcomes.mortality.switch')}>
        {MEASURES.map((m) => (
          <button key={m} aria-pressed={measure === m} onClick={() => { setMeasure(m); setCell(null); }}>
            {t(`outcomes.measure.${m}`)}
          </button>
        ))}
      </div>
      <p className="section__explain">{t(`outcomes.measureText.${measure}`)}</p>

      <div className="outcome__pair">
        <div>
          <h3 className="outcome__sub">{t('outcomes.mortality.mapHeading')}</h3>
          <DistrictMap values={values} selected={picked} onPick={setPicked}
            legendFormat={meta.format} total={rows.length}
            scale={{ domain: 'spread' }} color={meta.color}
            seatOf={(n) => byName.get(n)?.county} />
          {row && (
            <p className="outcome__picked">
              <a href={districtHref(row.name)}>{row.name}</a>
              {' — '}{t('outcomes.mortality.pickedLine', {
                value: meta.format(valueOf(row, measure) as number),
                median: meta.format(ruralMedian(rows, measure) as number),
              })}
            </p>
          )}
        </div>
        <div>
          <h3 className="outcome__sub">{t('outcomes.mortality.scatterHeading')}</h3>
          <OutcomeScatter points={points}
            xLabel={t('outcomes.measure.gpRate')} yLabel={t(`outcomes.measure.${measure}`)}
            xFormat={metaOf('gpRate').format} yFormat={meta.format}
            groupLabels={[t('outcomes.third.0'), t('outcomes.third.1'), t('outcomes.third.2')]}
            selected={picked} highlight={highlight} onPick={setPicked} />
        </div>
      </div>

      {pair && (
        <p className="outcome__finding">
          {t('outcomes.mortality.findingRaw', {
            r: formatDecimal(pair.r.toFixed(2)), p: pValue(pair.p), n: pair.n,
            strength: t(`outcomes.strength.${strengthOf(pair.r)}`),
            what: inSentence(t(`outcomes.measure.${measure}`)),
          })}
          {part && ` ${t('outcomes.mortality.findingPartial', {
            r: formatDecimal(part.partial.toFixed(2)), p: pValue(part.p),
          })}`}
          {incPair && ` ${t('outcomes.mortality.findingIncome', {
            r: formatDecimal(incPair.r.toFixed(2)),
          })}`}
        </p>
      )}

      <div className="outcome__gridblock">
        <div>
          <h3 className="outcome__sub">{t('outcomes.grid.heading')}</h3>
          <p className="section__explain">{t('outcomes.grid.explain', {
            what: inSentence(t(`outcomes.measure.${gridKey}`)),
          })}</p>
          <TertileGrid grid={grid} format={metaOf(gridKey).format} active={cell} onPick={setCell} />
          {top[0].median !== null && top[2].median !== null && low[0].median !== null && (
            <p className="outcome__finding">
              {t('outcomes.grid.finding', {
                richLow: metaOf(gridKey).format(top[0].median),
                richHigh: metaOf(gridKey).format(top[2].median),
                richUp: Math.round(100 * (top[2].median / top[0].median - 1)),
                poorLow: metaOf(gridKey).format(low[0].median),
                poorHigh: metaOf(gridKey).format(low[2].median as number),
              })}
            </p>
          )}
        </div>
        <div className="outcome__celllist">
          {cell ? (
            <>
              <h4>{t('outcomes.grid.cellHeading', {
                inc: t(`outcomes.grid.inc${cell[0]}`), vac: t(`outcomes.grid.vac${cell[1]}`),
              })}</h4>
              <ul>
                {rows.filter((r) => grid.cells[cell[0]][cell[1]].districts.includes(r.slug))
                  .sort((a, b) => (valueOf(b, gridKey) ?? 0) - (valueOf(a, gridKey) ?? 0))
                  .map((r) => (
                    <li key={r.slug}>
                      <a href={districtHref(r.name)}>{r.name}</a>
                      <span>{metaOf(gridKey).format(valueOf(r, gridKey) as number)}</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : <p className="outcome__hint">{t('outcomes.grid.pickHint')}</p>}
        </div>
      </div>

      <p className="notice">{t('outcomes.mortality.caveat')}</p>
      <p className="section__source">{t('outcomes.mortality.source', {
        year: data.sources.mortality.year,
      })}</p>
    </section>
  );
}
