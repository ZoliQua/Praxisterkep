// "Mi változott?" — the vacancy lists held against each other.
//
// The map shows one month; the archive holds forty. Between any two of them
// the same FIN codes can be followed: which districts fell vacant, which
// were filled, which went onto the dissolved list or left the registry. Two
// sections share one row design: year by year (the last archived month of
// each year), and month by month inside the current year.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatMonth, formatNumber } from '../lib/format';
import {
  COUNTY_COLUMNS, LIST_COLUMNS, countyMoves, countyRows, useChanges,
  type ChangeEntry, type ChangePair,
} from '../lib/changes';
import type { Row } from '../lib/eesztTable';
import { DataTableModal } from './DataTableModal';
import { PdfButton } from './PdfButton';

type Kind = 'gp' | 'dental';

function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(-n)}` : '±0';
}

function KindSwitch({ kind, setKind }: { kind: Kind; setKind: (k: Kind) => void }) {
  return (
    <div className="seg outcome__switch" role="group">
      {(['gp', 'dental'] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
          {t(`outcomes.grants.kind.${k}`)}
        </button>
      ))}
    </div>
  );
}

/** Where the vacancies went and where the new ones came from, in words. */
function flowText(p: ChangePair): string {
  const f = p.flows;
  const out: string[] = [];
  if (f.filled) out.push(t('changes.out.filled', { n: formatNumber(f.filled) }));
  if (f.toDissolved) out.push(t('changes.out.toDissolved', { n: formatNumber(f.toDissolved) }));
  if (f.leftRegistry) out.push(t('changes.out.leftRegistry', { n: formatNumber(f.leftRegistry) }));
  if (f.unknownFate) out.push(t('changes.out.unknownFate', { n: formatNumber(f.unknownFate) }));
  const inn: string[] = [];
  if (f.fromFilled) inn.push(t('changes.in.fromFilled', { n: formatNumber(f.fromFilled) }));
  if (f.fromDissolved) inn.push(t('changes.in.fromDissolved', { n: formatNumber(f.fromDissolved) }));
  if (f.newDistrict) inn.push(t('changes.in.newDistrict', { n: formatNumber(f.newDistrict) }));
  if (f.unknownOrigin) inn.push(t('changes.in.unknownOrigin', { n: formatNumber(f.unknownOrigin) }));
  return [
    out.length ? t('changes.outLine', { list: out.join(', ') }) : '',
    inn.length ? t('changes.inLine', { list: inn.join(', ') }) : '',
  ].filter(Boolean).join(' ');
}

function PairRow({ p, max, on, onPick }: {
  p: ChangePair; max: number; on: boolean; onPick: () => void;
}) {
  const net = p.vacantTo - p.vacantFrom;
  return (
    <button type="button" className={`change-row${on ? ' is-on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="change-row__when">
        {formatMonth(p.from)} → {formatMonth(p.to)}
        {p.months > 1 && <span className="change-row__gap">{t('changes.gap', { n: p.months })}</span>}
      </span>
      <span className="change-row__counts">
        {formatNumber(p.vacantFrom)} → {formatNumber(p.vacantTo)}
        <b className={net > 0 ? 'is-up' : net < 0 ? 'is-down' : ''}>{signed(net)}</b>
      </span>
      <span className="change-row__bars" aria-hidden="true">
        <span className="change-row__half is-out">
          <i style={{ width: `${(p.flows.ended / max) * 100}%` }} />
        </span>
        <span className="change-row__half is-in">
          <i style={{ width: `${(p.flows.newVacant / max) * 100}%` }} />
        </span>
      </span>
      <span className="change-row__flows">
        {t('changes.flowShort', { ended: formatNumber(p.flows.ended), added: formatNumber(p.flows.newVacant) })}
      </span>
    </button>
  );
}

function PairDetail({ p, kind, slug }: { p: ChangePair; kind: Kind; slug: string }) {
  const [table, setTable] = useState<'counties' | 'new' | 'ended' | null>(null);
  const moves = countyMoves(p).slice(0, 8);
  const popDelta = p.populationFrom != null && p.populationTo != null ? p.populationTo - p.populationFrom : null;
  const listRows = (list: ChangeEntry[] | undefined): Row[] =>
    (list ?? []).map((e) => ({ ...e, howLabel: t(`changes.how.${e.how}`) } as Row));
  const name = `${p.from}_${p.to}`;
  return (
    <div className="change-detail">
      <p className="section__explain">{flowText(p)}</p>
      <ul className="change-detail__facts">
        {popDelta !== null && (
          <li>{t('changes.population', {
            from: formatNumber(p.populationFrom!), to: formatNumber(p.populationTo!), delta: signed(popDelta),
          })}</li>
        )}
        {p.totalFrom != null && p.totalTo != null && (
          <li>{t('changes.total', {
            from: formatNumber(p.totalFrom), to: formatNumber(p.totalTo), delta: signed(p.totalTo - p.totalFrom),
          })}</li>
        )}
        {p.dissolvedFrom != null && p.dissolvedTo != null && kind === 'dental' && (
          <li>{t('changes.dissolved', { from: formatNumber(p.dissolvedFrom), to: formatNumber(p.dissolvedTo) })}</li>
        )}
        {p.longTermFrom != null && p.longTermTo != null && (
          <li>{t('changes.longTerm', { from: formatNumber(p.longTermFrom), to: formatNumber(p.longTermTo) })}</li>
        )}
        {p.doctorChanges != null && (
          <li>{t('changes.doctorChanges', { n: formatNumber(p.doctorChanges) })}</li>
        )}
      </ul>
      {moves.length > 0 && (
        <>
          <h4 className="change-detail__sub">{t('changes.countiesTitle')}</h4>
          <div className="change-counties">
            {moves.map((c) => (
              <span key={c.county} className="change-county">
                <span>{c.county}</span>
                <b className={c.net > 0 ? 'is-up' : c.net < 0 ? 'is-down' : ''}>{signed(c.net)}</b>
                <small>{t('changes.countyFlows', { added: formatNumber(c.newVacant), ended: formatNumber(c.ended) })}</small>
              </span>
            ))}
          </div>
        </>
      )}
      <div className="eeszt-actions">
        <button className="data-btn" onClick={() => setTable('counties')}>{t('changes.openCounties')}</button>
        {p.newList && (
          <button className="data-btn" onClick={() => setTable('new')}>
            {t('changes.openNew', { n: formatNumber(p.flows.newVacant) })}</button>
        )}
        {p.endedList && (
          <button className="data-btn" onClick={() => setTable('ended')}>
            {t('changes.openEnded', { n: formatNumber(p.flows.ended) })}</button>
        )}
      </div>
      <DataTableModal open={table === 'counties'} onClose={() => setTable(null)}
        title={t('changes.countiesTableTitle', { from: formatMonth(p.from), to: formatMonth(p.to) })}
        subtitle={t(`changes.kind.${kind}`)} rows={countyRows(p)} columns={COUNTY_COLUMNS}
        countUnit="rows" filename={`praxisterkep-valtozas-${slug}-${kind}-${name}-megyek`} />
      <DataTableModal open={table === 'new'} onClose={() => setTable(null)}
        title={t('changes.newTableTitle', { from: formatMonth(p.from), to: formatMonth(p.to) })}
        subtitle={t(`changes.kind.${kind}`)} rows={listRows(p.newList)} columns={LIST_COLUMNS}
        filename={`praxisterkep-valtozas-${kind}-${name}-uj`} />
      <DataTableModal open={table === 'ended'} onClose={() => setTable(null)}
        title={t('changes.endedTableTitle', { from: formatMonth(p.from), to: formatMonth(p.to) })}
        subtitle={t(`changes.kind.${kind}`)} rows={listRows(p.endedList)} columns={LIST_COLUMNS}
        filename={`praxisterkep-valtozas-${kind}-${name}-megszunt`} />
    </div>
  );
}

function PairList({ pairs, kind, slug, picked: held, onPick }: {
  pairs: ChangePair[]; kind: Kind; slug: string;
  /** the chosen row, when the caller keeps it (the PDF button exports it) */
  picked?: number; onPick?: (i: number) => void;
}) {
  const [own, setOwn] = useState(pairs.length - 1);
  const picked = held ?? own;
  const setPicked = onPick ?? setOwn;
  const max = Math.max(1, ...pairs.map((p) => Math.max(p.flows.ended, p.flows.newVacant)));
  const p = pairs[Math.min(picked, pairs.length - 1)];
  return (
    <>
      <div className="change-legend">
        <span className="is-out">{t('changes.legendOut')}</span>
        <span className="is-in">{t('changes.legendIn')}</span>
      </div>
      <div className="change-rows">
        {pairs.map((q, i) => (
          <PairRow key={`${q.from}-${q.to}`} p={q} max={max} on={i === picked} onPick={() => setPicked(i)} />
        ))}
      </div>
      {p && <PairDetail key={`${kind}-${p.from}-${p.to}`} p={p} kind={kind} slug={slug} />}
    </>
  );
}

export function MonthChanges({ kind: initial }: { kind: Kind }) {
  const data = useChanges();
  const [kind, setKind] = useState<Kind>(initial);
  const [picked, setPicked] = useState<number | null>(null);
  if (!data) return null;
  const k = data.kinds[kind];
  const at = Math.min(picked ?? k.monthly.length - 1, k.monthly.length - 1);
  const first = k.monthly[0];
  const last = k.monthly[k.monthly.length - 1];
  return (
    <section className="section container" id="valtozas-ho">
      <div className="heading-row">
        <h2 className="section__heading">{t('changes.monthHeading', { year: data.year })}</h2>
        {/* the report starts on the pair the reader has open; the dialog widens it */}
        <PdfButton level="changes" from={k.monthly[at].from} to={k.monthly[at].to} />
      </div>
      <KindSwitch kind={kind} setKind={(x) => { setKind(x); setPicked(null); }} />
      <p className="section__lead">{t('changes.monthLead', {
        from: formatMonth(first.from), to: formatMonth(last.to),
        vfrom: formatNumber(first.vacantFrom), vto: formatNumber(last.vacantTo),
        pairs: k.monthly.length,
      })}</p>
      <PairList key={kind} pairs={k.monthly} kind={kind} slug="ho" picked={at} onPick={setPicked} />
      <p className="extra-note">{t('changes.caveat')}</p>
    </section>
  );
}

export function YearChanges({ kind: initial }: { kind: Kind }) {
  const data = useChanges();
  const [kind, setKind] = useState<Kind>(initial);
  if (!data) return null;
  const k = data.kinds[kind];
  const s = k.span;
  const top = Math.max(1, ...k.years.map((y) => y.vacant));
  return (
    <section className="section container" id="valtozas-ev">
      <h2 className="section__heading">{t('changes.yearHeading')}</h2>
      <KindSwitch kind={kind} setKind={setKind} />
      <p className="section__lead">{t('changes.spanLead', {
        from: formatMonth(s.from), to: formatMonth(s.to),
        vfrom: formatNumber(s.vacantFrom), vto: formatNumber(s.vacantTo),
        added: formatNumber(s.flows.newVacant), ended: formatNumber(s.flows.ended),
        filled: formatNumber(s.flows.filled),
      })}</p>
      <div className="change-years" role="list">
        {k.years.map((y) => (
          <div key={y.year} className="change-year" role="listitem"
            title={t('changes.yearBar', { month: formatMonth(y.month), n: formatNumber(y.vacant) })}>
            <span className="change-year__value">{formatNumber(y.vacant)}</span>
            <span className="change-year__bar"><i style={{ height: `${(y.vacant / top) * 100}%` }} /></span>
            <span className="change-year__label">{y.year}{y.partial ? '*' : ''}</span>
            <small className="change-year__month">{formatMonth(y.month)}</small>
          </div>
        ))}
      </div>
      <p className="extra-note">{t('changes.yearNote')}</p>
      <h3 className="section__subheading">{t('changes.yearPairsTitle')}</h3>
      <PairList key={kind} pairs={k.yearly} kind={kind} slug="ev" />
      <p className="extra-note">{t('changes.caveat')}</p>
    </section>
  );
}
