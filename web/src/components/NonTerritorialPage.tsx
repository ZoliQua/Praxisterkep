// tek-nelkul.html: the GP practices without a district obligation.
//
// NEAK's registry lists two forms of GP practice. A district (T) answers for
// an area; a TN practice takes only the patients who register with it, so it
// is never vacant in NEAK's sense and never enters the vacancy rate — which
// is why the landing's 6281 and the 6357 GP practices people count elsewhere
// differ. This page says what the 76 are: how many by type, who runs them,
// how the group shrank since 2019 and who left, and how settled the rest is.
// Every number comes from nonterritorial.json; none is typed into i18n.
import { t } from '../lib/i18n';
import { formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import {
  OPERATORS, TEK_TYPES, institutionSplit, tekRows, useNonTerritorial, yearEnds,
  type NonTerritorialRaw, type Operator,
} from '../lib/nonterritorial';
import { PageNav } from './PageNav';
import { Footer } from './Footer';
import { useHashScroll } from '../lib/useHashScroll';

const signed = (ratio: number) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${formatPercent(Math.abs(ratio))}`;
const shortMonth = (m: string) => `${m.slice(0, 4)}.${m.slice(5)}`;

/** Practices by archived month, stacked by type. */
function TimelineChart({ data }: { data: NonTerritorialRaw }) {
  const max = Math.max(...data.months.map((m) => m.nonTerritorial.total));
  return (
    <div className="tekchart" role="img" aria-label={t('tekPage.timeline.aria', {
      start: formatNumber(data.span.start), end: formatNumber(data.span.end) })}>
      <div className="tekchart__cols">
        {data.months.map((m) => (
          <div key={m.month} className="tekchart__col" title={`${formatMonth(m.month)}: ${formatNumber(m.nonTerritorial.total)}`}>
            <span className="tekchart__val">{formatNumber(m.nonTerritorial.total)}</span>
            <div className="tekchart__stack" style={{ height: `${(m.nonTerritorial.total / max) * 100}%` }}>
              {[...TEK_TYPES].reverse().map((k) => m.nonTerritorial.byType[k] > 0 && (
                <span key={k} className={`tekchart__seg tekchart__seg--${k}`}
                  style={{ flex: m.nonTerritorial.byType[k] }} />
              ))}
            </div>
            <span className="tekchart__label">{shortMonth(m.month)}</span>
          </div>
        ))}
      </div>
      <ul className="tekchart__legend">
        {TEK_TYPES.map((k) => (
          <li key={k}><i className={`tekchart__seg--${k}`} />{t(`tek.short.${k}`)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one per row, scaled to the largest. */
function Bars({ rows, tone = 'accent' }: { rows: { key: string; label: string; n: number; note?: string }[]; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="tekbars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="tekbars__label">{r.label}</span>
          <span className="tekbars__track">
            <span className={`tekbars__fill tekbars__fill--${tone}`} style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="tekbars__val">{formatNumber(r.n)}{r.note && <em> {r.note}</em>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Left against new, per operator: the shape of the change. */
function Turnover({ data }: { data: NonTerritorialRaw }) {
  const { left, new: added } = data.operators;
  const keys = OPERATORS.filter((o) => left[o] + added[o] > 0);
  const max = Math.max(1, ...keys.map((o) => Math.max(left[o], added[o])));
  return (
    <div className="tekturn">
      <div className="tekturn__head">
        <span>{t('tekPage.turnover.left')}</span><span />{' '}<span>{t('tekPage.turnover.new')}</span>
      </div>
      {keys.map((o) => (
        <div key={o} className="tekturn__row">
          <span className="tekturn__side tekturn__side--left">
            <em>{formatNumber(left[o])}</em>
            <span className="tekturn__bar tekturn__bar--left" style={{ width: `${(left[o] / max) * 100}%` }} />
          </span>
          <span className="tekturn__label">{t(`tekPage.operator.${o}`)}</span>
          <span className="tekturn__side">
            <span className="tekturn__bar tekturn__bar--new" style={{ width: `${(added[o] / max) * 100}%` }} />
            <em>{formatNumber(added[o])}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Exits and arrivals between each pair of archived registries. */
function PairsChart({ data }: { data: NonTerritorialRaw }) {
  const max = Math.max(1, ...data.pairList.map((p) => Math.max(p.left, p.new)));
  return (
    <div className="tekpairs" role="img" aria-label={t('tekPage.pairs.aria')}>
      <div className="tekpairs__cols">
        {data.pairList.map((p) => (
          <div key={p.to} className="tekpairs__col"
            title={`${formatMonth(p.from)} → ${formatMonth(p.to)}: −${p.left} / +${p.new}`}>
            <span className="tekpairs__up"><span style={{ height: `${(p.new / max) * 100}%` }} />{p.new > 0 && <em>+{p.new}</em>}</span>
            <span className="tekpairs__down"><span style={{ height: `${(p.left / max) * 100}%` }} />{p.left > 0 && <em>−{p.left}</em>}</span>
            <span className="tekchart__label">{shortMonth(p.to)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Continuity({ data }: { data: NonTerritorialRaw }) {
  const rows = (['TN', 'T'] as const).map((f) => {
    const c = data.continuity[f];
    return { f, share: c.compared ? c.same / c.compared : 0, ...c };
  });
  return (
    <ul className="tekbars tekbars--share">
      {rows.map((r) => (
        <li key={r.f}>
          <span className="tekbars__label">{t(`tekPage.stability.${r.f}`)}</span>
          <span className="tekbars__track">
            <span className={`tekbars__fill tekbars__fill--${r.f === 'TN' ? 'accent' : 'mid'}`} style={{ width: `${r.share * 100}%` }} />
          </span>
          <span className="tekbars__val">{formatPercent(r.share, 0)}<em> ({formatNumber(r.same)} / {formatNumber(r.compared)})</em></span>
        </li>
      ))}
    </ul>
  );
}

export function NonTerritorialPage() {
  useHashScroll();
  const data = useNonTerritorial();
  if (!data?.months.length) return (<><PageNav /><div className="loading">…</div></>);

  const months = data.months;
  const first = months[0];
  const last = months[months.length - 1];
  const rows = tekRows(last);
  const span = data.span;
  const tStart = first.territorial.total;
  const tEnd = last.territorial.total;
  const all = last.territorial.total + last.nonTerritorial.total;
  const now = data.operators.now;
  const leftSplit = institutionSplit(data.operators.left);
  const newSplit = institutionSplit(data.operators.new);
  const nowSplit = institutionSplit(now);

  let gap: [string, string] | null = null;
  for (let i = 1; i < months.length; i++) {
    const a = months[i - 1].month;
    const b = months[i].month;
    if (!gap || monthsBetween(a, b) > monthsBetween(gap[0], gap[1])) gap = [a, b];
  }
  const lastChildIdx = months.reduce((at, m, i) => (m.nonTerritorial.byType.child > 0 ? i : at), -1);
  const childGone = last.nonTerritorial.byType.child === 0 && lastChildIdx >= 0 && lastChildIdx + 1 < months.length;
  const seats = data.latest.bySeat.filter((s) => s.county !== 'Budapest').slice(0, 6);
  const tn = data.continuity.TN;
  const tt = data.continuity.T;

  return (
    <>
      <PageNav />
      <header className="section container" id="tek-nelkul">
        <h1 className="section__heading">{t('tek.heading')}</h1>
        <p className="section__lead">{t('tekPage.lead')}</p>
        <div className="tekkpis">
          <div><strong>{formatNumber(last.nonTerritorial.total)}</strong><span>{t('tekPage.kpi.tn')}</span></div>
          <div><strong>{formatPercent(last.nonTerritorial.total / all)}</strong><span>{t('tekPage.kpi.share', { all: formatNumber(all) })}</span></div>
          <div><strong>{signed((span.end - span.start) / span.start)}</strong><span>{t('tekPage.kpi.change', { from: formatMonth(span.from) })}</span></div>
          <div><strong>{formatNumber(nowSplit.institutions)}</strong><span>{t('tekPage.kpi.institutions')}</span></div>
        </div>
      </header>

      <section className="section container" id="tipusok">
        <h2 className="section__subheading">{t('tekPage.typesHeading')}</h2>
        <div className="balance__panel">
          <table className="balance__types tek__table">
            <thead>
              <tr>
                <th>{t('balance.thType')}</th>
                <th className="is-num">{t('tek.thTerritorial')}</th>
                <th className="is-num">{t('tek.thNon')}</th>
                <th className="is-num">{t('tek.thAll')}</th>
                <th className="is-num">{t('tek.thShare')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.key === 'total' ? 'is-total' : undefined}>
                  <td>{r.key === 'total' ? t('tek.total') : t(`balance.type.gp.${r.key}`)}</td>
                  <td className="is-num">{formatNumber(r.territorial)}</td>
                  <td className="is-num">{formatNumber(r.nonTerritorial)}</td>
                  <td className="is-num">{formatNumber(r.all)}</td>
                  <td className="is-num">{r.all ? formatPercent(r.nonTerritorial / r.all) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="balance__note">{t('tek.note')}</p>
        </div>
      </section>

      <section className="section container" id="mukodtetok">
        <h2 className="section__subheading">{t('tekPage.operatorsHeading')}</h2>
        <p className="section__explain">{t('tekPage.operatorsLead', {
          month: formatMonth(last.month), state: formatNumber(now.state), university: formatNumber(now.university),
          company: formatNumber(now.company), sole: formatNumber(now.sole),
        })}</p>
        <Bars rows={OPERATORS.filter((o) => now[o] > 0).map((o) => ({
          key: o, label: t(`tekPage.operator.${o}`), n: now[o],
          note: `(${formatPercent(now[o] / last.nonTerritorial.total, 0)})`,
        }))} />
        <p className="balance__note">{t('tekPage.operatorsNote')}</p>
      </section>

      <section className="section container" id="valtozas">
        <h2 className="section__subheading">{t('tekPage.timeline.heading')}</h2>
        <p className="section__explain">{t('tek.trendSpan', {
          from: formatMonth(span.from), to: formatMonth(span.to),
          start: formatNumber(span.start), end: formatNumber(span.end),
          change: signed((span.end - span.start) / span.start),
          tStart: formatNumber(tStart), tEnd: formatNumber(tEnd), tChange: signed((tEnd - tStart) / tStart),
        })}</p>
        <TimelineChart data={data} />
        {gap && <p className="balance__note">{t('tek.gap', { a: formatMonth(gap[0]), b: formatMonth(gap[1]) })}</p>}
      </section>

      <section className="section container" id="kik-szuntek-meg">
        <h2 className="section__subheading">{t('tekPage.turnover.heading')}</h2>
        <p className="tekfinding">{t('tekPage.finding', {
          leftBusiness: formatNumber(leftSplit.business), newBusiness: formatNumber(newSplit.business),
          leftInst: formatNumber(leftSplit.institutions), newInst: formatNumber(newSplit.institutions),
        })}</p>
        <Turnover data={data} />
        <ul className="tek__facts">
          <li>{t('tek.trendFlows', {
            left: formatNumber(span.left), new: formatNumber(span.new), kept: formatNumber(span.kept),
          })}{' '}{span.toTerritorial + span.fromTerritorial === 0 ? t('tek.noFormChange')
            : t('tek.formChange', { to: formatNumber(span.toTerritorial), from: formatNumber(span.fromTerritorial) })}</li>
          {leftSplit.unknown > 0 && <li>{t('tekPage.unknownLeft', { n: formatNumber(leftSplit.unknown) })}</li>}
          {childGone && <li>{t('tek.child', {
            from: formatMonth(first.month), start: formatNumber(first.nonTerritorial.byType.child),
            lastSeen: formatMonth(months[lastChildIdx].month), month: formatMonth(months[lastChildIdx + 1].month),
          })}</li>}
        </ul>
        <h3 className="tek__minihead">{t('tekPage.pairs.heading')}</h3>
        <PairsChart data={data} />
        <p className="balance__note">{t('tek.trendPairs', {
          n: formatNumber(data.pairs.count), left: formatNumber(data.pairs.left), new: formatNumber(data.pairs.new),
        })}</p>
      </section>

      <section className="section container" id="stabilitas">
        <h2 className="section__subheading">{t('tekPage.stability.heading')}</h2>
        <p className="section__explain">{t('tekPage.stability.lead', {
          since: formatNumber(data.sinceStart), now: formatNumber(last.nonTerritorial.total), from: formatMonth(first.month),
          tn: formatPercent(tn.compared ? tn.same / tn.compared : 0, 0),
          t: formatPercent(tt.compared ? tt.same / tt.compared : 0, 0),
        })}</p>
        <Continuity data={data} />
        <p className="balance__note">{t('tekPage.stability.note', { from: formatMonth(first.month), to: formatMonth(last.month) })}</p>
      </section>

      <section className="section container" id="hol">
        <h2 className="section__subheading">{t('tekPage.whereHeading', { month: formatMonth(last.month) })}</h2>
        <div className="tekgrid">
          <div>
            <h3 className="tek__minihead">{t('tekPage.byCounty')}</h3>
            <Bars tone="mid" rows={data.latest.byCounty.map((c) => ({ key: c.county, label: c.county, n: c.n }))} />
          </div>
          <div>
            <h3 className="tek__minihead">{t('tekPage.bySeat')}</h3>
            <Bars tone="mid" rows={seats.map((s) => ({ key: s.settlement, label: s.settlement, n: s.n }))} />
          </div>
        </div>
        {last.nonTerritorial.unnamed > 0 && (
          <p className="balance__note">{t('tek.unnamed', { n: formatNumber(last.nonTerritorial.unnamed) })}</p>
        )}
      </section>

      <section className="section container" id="idosor">
        <h2 className="section__subheading">{t('tekPage.tableHeading')}</h2>
        <div className="tek__trendwrap">
          <table className="balance__types tek__table tek__trend">
            <thead>
              <tr>
                <th>{t('tek.thMonth')}</th>
                <th className="is-num">{t('tek.thNon')}</th>
                {TEK_TYPES.map((k) => <th key={k} className="is-num">{t(`tek.short.${k}`)}</th>)}
                <th className="is-num">{t('tek.thTerritorial')}</th>
              </tr>
            </thead>
            <tbody>
              {[first, ...yearEnds(months).filter((m) => m.month !== first.month)].map((m) => (
                <tr key={m.month}>
                  <td>{formatMonth(m.month)}</td>
                  <td className="is-num"><strong>{formatNumber(m.nonTerritorial.total)}</strong></td>
                  {TEK_TYPES.map((k) => <td key={k} className="is-num">{formatNumber(m.nonTerritorial.byType[k])}</td>)}
                  <td className="is-num">{formatNumber(m.territorial.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="balance__note">{t('tek.trendNote')} {t('tek.source', { n: formatNumber(months.length) })}</p>
      </section>
      <Footer />
    </>
  );
}

export type { Operator };
