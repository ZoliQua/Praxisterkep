// "Megérte?" — NEAK's settlement and practice-right grants, followed up.
//
// NEAK publishes each year's winners and nothing after. The ETL matches each
// winner's address to a district through the monthly archive and reads where
// that district stands now; this section shows it year by year, against the
// districts that had been vacant as long and got no grant, and on the map.
// Shared health-centre addresses that cannot be told apart are shown as
// their own colour and kept out of every share — "one of the five has a
// doctor" would flatter the grant.
//
// Every count opens the winners behind it: a year, a county, a share — the
// list NEAK published, matched to a district, without the doctor's name.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { districtHref, useOutcomes } from '../lib/outcomes';
import { DistrictMap } from './charts/DistrictMap';
import { StackedBars } from './charts/StackedBars';
import { DataTableModal } from './DataTableModal';
import {
  GRANT_COLUMNS, grantFileKey, grantPart, grantRows, useGrantFile, type GrantWinner,
} from '../lib/grants';

const ORDER = ['filled', 'vacant', 'gone', 'byName', 'ambiguous', 'unmatched', 'noContract'];
const COLORS: Record<string, string> = {
  filled: 'var(--calm)', vacant: 'var(--bad)', gone: 'var(--approx)', byName: 'var(--accent)',
  ambiguous: 'var(--amber)',
  unmatched: 'var(--ink-faint)', noContract: 'var(--line-strong)',
};

type Kind = 'gp' | 'dental';
type Winner = { contract: boolean; status: string | null; matchedBy: string };

/** the parts of a set of winners, as the ETL summary counts them: a district
 *  found only by the winner's name is its own part, outside the outcomes */
function partsOf(list: Winner[]): Record<string, number> {
  const signed = list.filter((w) => w.contract);
  const byAddress = signed.filter((w) => w.matchedBy !== 'name');
  return {
    filled: byAddress.filter((w) => w.status === 'filled').length,
    vacant: byAddress.filter((w) => w.status === 'vacant').length,
    gone: byAddress.filter((w) => w.status === 'gone').length,
    byName: signed.length - byAddress.length,
    ambiguous: signed.filter((w) => w.matchedBy === 'ambiguous').length,
    unmatched: signed.filter((w) => w.matchedBy === 'none').length,
    noContract: list.length - signed.length,
  };
}
type Programme = 'settle' | 'practice';

/** Which winners a table shows; every field left out means all of them. */
interface Pick { year?: number; county?: string; parts?: string[]; labelKey?: string }

function GrantTable({ pick, kind, prog, onClose }: {
  pick: Pick | null; kind: Kind; prog: Programme; onClose: () => void;
}) {
  const file = useGrantFile(pick !== null);
  const list: GrantWinner[] = (file?.kinds[kind].winners ?? []).filter((w) => w.programme === prog
    && (pick?.year === undefined || w.year === pick.year)
    && (pick?.county === undefined || w.county === pick.county)
    && (!pick?.parts || pick.parts.includes(grantPart(w))));
  const years = [...new Set(list.map((w) => w.year))].sort();
  const where = [t(`outcomes.grants.kind.${kind}`),
    pick?.year !== undefined ? String(pick.year) : t('outcomes.grants.table.allYears'),
    ...(pick?.county ? [pick.county] : []),
    ...(pick?.labelKey ? [t(pick.labelKey)] : [])];
  const slug = [kind, prog, pick?.year ?? 'osszes', pick?.county, pick?.parts?.join('-')]
    .filter(Boolean).join('-').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-');
  return (
    <DataTableModal open={pick !== null} onClose={onClose}
      title={t(`outcomes.grants.table.title.${prog}`)} subtitle={where.join(' · ')}
      rows={grantRows(list)} columns={GRANT_COLUMNS} countUnit="rows"
      filename={`praxisterkep-tamogatasok-${slug}`}
      above={file ? {
        label: t('outcomes.grants.table.sources'),
        render: () => (
          <p className="section__explain">
            {t('outcomes.grants.table.sourcesText')}{' '}
            {years.map((y, i) => {
              const f = file.files[grantFileKey({ programme: prog, kind, year: y })];
              return f ? (
                <span key={y}>{i > 0 && ' · '}
                  <a href={f.url} target="_blank" rel="noopener noreferrer">{y}</a></span>
              ) : null;
            })}
          </p>
        ),
      } : undefined} />
  );
}

export function GrantsSection() {
  const o = useOutcomes();
  const [kind, setKind] = useState<Kind>('gp');
  const [programme, setProgramme] = useState<Programme>('settle');
  const [picked, setPicked] = useState<string | null>(null);
  const [table, setTable] = useState<Pick | null>(null);
  if (!o) return null;
  const g = o.grants.kinds[kind];
  const prog: Programme = kind === 'dental' ? 'settle' : programme;
  const total = g.total[prog];
  if (!total) return null;
  const decided = total.filled + total.vacant + total.gone;
  const years = g.byProgrammeYear.filter((r) => r.programme === prog);
  const mine = g.winners.filter((w) => w.programme === prog);
  // the yearly rows from the winners too, so every chart counts the same way
  const parts = (r: { year: number }) => partsOf(mine.filter((w) => w.year === r.year));
  // the comparison: districts vacant 12+ months without a grant, by year
  const cmp = g.comparison;
  // one share per year, never pooled: a district vacant for years sits in
  // several yearly cohorts, and a pooled count would weigh it again each time
  const cmpShares = cmp.filter((c) => c.districts > 0).map((c) => (c.filled ?? 0) / c.districts);
  const byDistrict = new Map<string, number>();
  for (const w of g.winners) {
    if (w.programme === prog && w.contract) byDistrict.set(w.district, (byDistrict.get(w.district) ?? 0) + 1);
  }

  return (
    <section className="section container outcome" id="tamogatasok">
      <h2 className="section__heading">{t('outcomes.grants.heading')}</h2>
      <p className="section__lead">{t('outcomes.grants.lead')}</p>
      <div className="outcome__switches">
        <div className="seg outcome__switch" role="group">
          {(['gp', 'dental'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`outcomes.grants.kind.${k}`)}
            </button>
          ))}
        </div>
        {kind === 'gp' && (
          <div className="seg outcome__switch" role="group">
            {(['settle', 'practice'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={programme === k} onClick={() => setProgramme(k)}>
                {t(`outcomes.grants.programme.${k}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="section__explain">{t(`outcomes.grants.programmeExplain.${prog}`)}</p>

      <div className="outcome__kpis">
        <button type="button" className="is-pickable" onClick={() => setTable({})}
          title={t('outcomes.grants.table.open')}>
          <b>{formatNumber(total.winners)}</b><span>{t('outcomes.grants.kpi.winners')}</span></button>
        <button type="button" className="is-pickable" title={t('outcomes.grants.table.open')}
          onClick={() => setTable({ parts: ['filled'], labelKey: 'outcomes.grants.part.filled' })}>
          <b>{decided ? formatPercent(total.filled / decided) : '–'}</b>
          <span>{t('outcomes.grants.kpi.filled', { n: formatNumber(total.filled), of: formatNumber(decided) })}</span></button>
        {prog === 'settle' && cmpShares.length > 0 && (
          <div><b>{formatPercent(Math.min(...cmpShares), 0)}–{formatPercent(Math.max(...cmpShares), 0)}</b>
            <span>{t('outcomes.grants.kpi.comparison')}</span></div>
        )}
        <button type="button" className="is-pickable" title={t('outcomes.grants.table.open')}
          onClick={() => setTable({ parts: ['ambiguous', 'unmatched'], labelKey: 'outcomes.grants.table.unknown' })}>
          <b>{formatNumber(total.ambiguous + total.unmatched)}</b>
          <span>{t('outcomes.grants.kpi.unknown')}</span></button>
      </div>
      {(total.byName ?? 0) > 0 && (
        <p className="extra-note">
          {t('outcomes.grants.byNameNote', { n: formatNumber(total.byName ?? 0) })}{' '}
          <button type="button" className="pdfx__link"
            onClick={() => setTable({ parts: ['byName'], labelKey: 'outcomes.grants.part.byName' })}>
            {t('outcomes.grants.byNameOpen')}</button>
        </p>
      )}

      <h3 className="outcome__sub">{t('outcomes.grants.yearsHeading', { month: g.latestMonth })}</h3>
      <StackedBars rows={years.map((r) => ({ key: String(r.year), label: String(r.year), parts: parts(r) }))}
        order={ORDER} colors={COLORS} labelPrefix="outcomes.grants.part"
        onPick={(y) => setTable({ year: Number(y) })} />
      <p className="extra-note">{t('outcomes.grants.table.hint')}</p>

      {prog === 'settle' && g.matched.pairs > 0 && (
        <div className="outcome__callout grant-matched">
          <h3 className="outcome__sub">{t('outcomes.grants.matchedHeading')}</h3>
          <div className="grant-matched__bars">
            {([['with', g.matched.treatedFilled], ['without', g.matched.controlFilled]] as const).map(([k, v]) => (
              <div key={k}>
                <span>{t(`outcomes.grants.matched.${k}`)}</span>
                <span className="grant-matched__track"><i className={`is-${k}`} style={{ width: `${(v ?? 0) * 100}%` }} /></span>
                <b>{v === null ? '–' : formatPercent(v, 0)}</b>
              </div>
            ))}
          </div>
          <p>{t('outcomes.grants.matchedText', {
            pairs: formatNumber(g.matched.pairs), per: formatNumber(Math.round(g.matched.controlsPerDistrict)),
            same: formatPercent(g.matched.sameCountyShare, 0), excluded: formatNumber(g.matched.excluded),
          })}</p>
        </div>
      )}

      {prog === 'settle' && (
        <>
          <h3 className="outcome__sub">{t('outcomes.grants.compareHeading')}</h3>
          <p className="section__explain">{t('outcomes.grants.compareExplain')}</p>
          <div className="grant-compare">
            {years.map((r) => {
              const c = cmp.find((x) => x.year === r.year);
              const dec = r.filled + r.vacant + r.gone;
              const a = dec ? r.filled / dec : null;
              const b = c && c.districts ? (c.filled ?? 0) / c.districts : null;
              return (
                <button type="button" key={r.year} className="grant-compare__row is-pickable"
                  onClick={() => setTable({ year: r.year })}>
                  <span className="grant-compare__year">{r.year}</span>
                  <span className="grant-compare__bars">
                    <span title={t('outcomes.grants.compareWith', { share: a === null ? '–' : formatPercent(a), n: dec })}>
                      <i className="is-with" style={{ width: `${(a ?? 0) * 100}%` }} />
                      <b>{a === null ? '–' : formatPercent(a)}</b>
                    </span>
                    <span title={t('outcomes.grants.compareWithout', { share: b === null ? '–' : formatPercent(b), n: c?.districts ?? 0 })}>
                      <i className="is-without" style={{ width: `${(b ?? 0) * 100}%` }} />
                      <b>{b === null ? '–' : formatPercent(b)}</b>
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="grant-compare__legend">
              <span><i className="is-with" />{t('outcomes.grants.with')}</span>
              <span><i className="is-without" />{t('outcomes.grants.without')}</span>
            </div>
          </div>
        </>
      )}

      <div className="outcome__pair">
        <div>
          <h3 className="outcome__sub">{t('outcomes.grants.mapHeading')}</h3>
          <DistrictMap values={byDistrict} selected={picked} onPick={(n) => { window.location.href = districtHref(n); }}
            legendFormat={(v) => formatNumber(v)} total={o.districts.length} color="var(--calm)"
            seatOf={(n) => o.districts.find((d) => d.name === n)?.county} />
        </div>
        <div>
          <h3 className="outcome__sub">{t('outcomes.grants.countyHeading')}</h3>
          <StackedBars rows={[...new Set(mine.map((w) => w.county))].map((c) => ({
            key: c, label: c, parts: partsOf(mine.filter((w) => w.county === c)) }))
            .sort((a, b) => Object.values(b.parts).reduce((x, y) => x + y, 0)
              - Object.values(a.parts).reduce((x, y) => x + y, 0))}
            order={ORDER} colors={COLORS} labelPrefix="outcomes.grants.part"
            selected={picked} onPick={(c) => { setPicked(c); setTable({ county: c }); }} />
        </div>
      </div>
      <GrantTable pick={table} kind={kind} prog={prog} onClose={() => setTable(null)} />
      <p className="notice">{t('outcomes.grants.caveat')}</p>
      <p className="section__source">{t('outcomes.grants.source')}{' '}
        <a href={o.grants.sourceUrl} target="_blank" rel="noopener noreferrer">neak.gov.hu</a></p>
    </section>
  );
}
