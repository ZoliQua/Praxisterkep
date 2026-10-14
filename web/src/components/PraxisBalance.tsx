// What the headline number is a part of.
//
// The landing used to open with "1026" — the vacant GP districts — and left
// the reader to wonder of how many. This block puts the whole stock first:
// how many districts the branch has, how many of them have a contracted
// physician, how many do not, and (for dental, where NEAK publishes such a
// list) how many were dissolved outright.
//
// Then it splits the stock by type, because one number hides two different
// countries: an adult district without a doctor and a paediatric one without
// a doctor are not the same problem, and in GP care they fail at very
// different rates. "Vegyes" is listed with them rather than folded away — in
// most villages it is the only district there is, serving adults and children
// together.
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { stockOf, typeRows } from '../lib/balance';
import { useContextStore } from '../lib/context';
import { vacancyOf } from '../lib/vacancy';
import { DissolvedSwitch } from './DissolvedSwitch';
import type { PraxisKind } from '../types';

interface Part { key: string; n: number; color: string; label: string }

function Bar({ parts, total }: { parts: Part[]; total: number }) {
  if (!total) return null;
  return (
    <div className="balance-bar" role="img"
      aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(', ')}>
      {parts.filter((p) => p.n > 0).map((p) => (
        <span key={p.key} className={`balance-bar__part balance-bar__part--${p.key}`}
          style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label}: ${p.n}`} />
      ))}
    </div>
  );
}

export function PraxisBalance() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind) as PraxisKind;
  const mode = useContextStore((s) => s.dissolved);
  if (!snapshot) return null;

  const stock = stockOf(snapshot);
  if (!stock) return null;
  const { total, vacant, dissolved, filled } = stock;

  const parts: Part[] = [
    { key: 'filled', n: filled, color: 'ok', label: t('stats.statusFilled') },
    { key: 'vacant', n: vacant, color: 'bad', label: t('stats.statusVacant') },
    { key: 'dissolved', n: dissolved, color: 'dim', label: t('stats.statusDissolved') },
  ];

  // the same code means a different thing in the two branches: "gyermek" is
  // a házi gyermekorvosi körzet in GP care and gyermekfogászat in dental, and
  // the table should say which
  const rows = typeRows(snapshot, mode).map((row) => {
    const named = t(`balance.type.${kind}.${row.key}`);
    return {
      ...row,
      label: named.startsWith('balance.') ? t(`praxisTypes.${row.key}`) : named,
    };
  });
  const worst = rows.length ? Math.max(...rows.map((r) => r.rate)) : 0;
  const parts2 = vacancyOf(snapshot.national, mode);

  return (
    <section className="section container" id="allomany">
      <h2 className="section__heading">{tKind('balance.heading', kind)}</h2>
      <p className="section__explain">{tKind('balance.lead', kind, {
        total: formatNumber(total),
        vacant: formatNumber(parts2.count),
        rate: parts2.rate !== null ? formatPercent(parts2.rate) : '–',
      })}</p>
      {dissolved > 0 && <DissolvedSwitch />}

      <div className="balance__panel">
      <div className="balance__main">
        <div className="balance__figures">
          <span className="balance__total">{formatNumber(total)}</span>
          <span className="balance__totalLabel">{tKind('balance.total', kind)}</span>
        </div>
        <div className="balance__barwrap">
          <Bar parts={parts} total={total} />
          <ul className="balance__legend">
            {parts.filter((p) => p.n > 0).map((p) => (
              <li key={p.key}>
                <i className={`balance-dot balance-dot--${p.key}`} />
                <strong>{formatNumber(p.n)}</strong>
                <span>{p.label}</span>
                <em>{formatPercent(p.n / total)}</em>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <table className="balance__types">
        <thead>
          <tr>
            <th>{t('balance.thType')}</th>
            <th className="is-num">{t('balance.thTotal')}</th>
            <th className="is-num">{t('stats.statusFilled')}</th>
            <th className="is-num">{t('stats.statusVacant')}</th>
            <th>{t('balance.thRate')}{dissolved > 0
              && ` (${t(mode === 'with' ? 'dissolved.withShort' : 'dissolved.withoutShort')})`}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="is-num">{formatNumber(r.total)}</td>
              <td className="is-num">{formatNumber(r.filled)}</td>
              <td className="is-num">{formatNumber(r.vacant)}</td>
              <td>
                <span className="balance__rate">
                  <span className="balance__rateTrack">
                    {/* scaled to the worst type, so the comparison between
                        them is what the eye reads */}
                    <span className="balance__rateFill"
                      style={{ width: `${worst ? (r.rate / worst) * 100 : 0}%` }} />
                  </span>
                  <span className="balance__rateVal">{formatPercent(r.rate)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="balance__note">
        {tKind('balance.note', kind)}
        {dissolved > 0 && mode === 'without' && ` ${t('balance.dissolvedNote', {
          n: formatNumber(dissolved),
        })}`}
        {dissolved > 0 && mode === 'with' && ` ${t('balance.dissolvedCounted', {
          n: formatNumber(dissolved),
        })}`}
      </p>
      </div>
    </section>
  );
}
