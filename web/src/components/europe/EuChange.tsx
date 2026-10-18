// Ten years in one line per country: where it stood, where it stands, and
// whether the move was the good way. Countries are in the order of the
// ranking, so a line is read against its neighbours as well as its start.
import { t } from '../../lib/i18n';
import type { Better, ChangeRow } from '../../lib/europe';

export function EuChange({ rows, members, better, focus, onFocus, nameOf, format }: {
  rows: ChangeRow[];
  members: string[];
  better: Better;
  focus: string;
  onFocus: (geo: string) => void;
  nameOf: (geo: string) => string;
  format: (v: number) => string;
}) {
  if (!rows.length) return <p className="section__explain">{t('europe.change.none')}</p>;
  const missing = members.filter((g) => !rows.some((r) => r.geo === g));
  const hi = Math.max(...rows.flatMap((r) => [r.from, r.to])) * 1.06 || 1;
  const x = (v: number) => `${(v / hi) * 100}%`;
  return (
    <div className="eu-change">
      <p className="eu-pairs__legend">
        <span><i className="is-from" />{t('europe.change.from')}</span>
        <span><i className="is-to" />{t('europe.change.to')}</span>
        {better !== 'neutral' && <span><i className="is-good" />{t('europe.change.good')}</span>}
        {better !== 'neutral' && <span><i className="is-bad" />{t('europe.change.bad')}</span>}
      </p>
      {rows.map((r) => {
        const up = r.to > r.from;
        const good = better === 'neutral' ? null : (better === 'higher') === up;
        const pct = r.from ? ((r.to - r.from) / r.from) * 100 : 0;
        return (
          <button type="button" key={r.geo} onClick={() => onFocus(r.geo)} aria-pressed={r.geo === focus}
            className={`eu-change__row${r.geo === focus ? ' is-focus' : ''}${r.geo === 'HU' ? ' is-hu' : ''}`}
            title={t('europe.change.title', { name: nameOf(r.geo), fromYear: r.fromYear, from: format(r.from),
              toYear: r.toYear, to: format(r.to) })}>
            <span className="eu-pairs__name">{nameOf(r.geo)}</span>
            <span className="eu-pairs__track">
              <span className={`eu-change__bar${good === null ? '' : good ? ' is-good' : ' is-bad'}`}
                style={{ left: x(Math.min(r.from, r.to)), width: `${(Math.abs(r.to - r.from) / hi) * 100}%` }} />
              <i className="is-from" style={{ left: x(r.from) }} />
              <i className="is-to" style={{ left: x(r.to) }} />
            </span>
            <b>{format(r.to)} <small className={good === null ? '' : good ? 'is-good' : 'is-bad'}>
              {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(0)}%</small></b>
          </button>
        );
      })}
      {missing.length > 0 && (
        <p className="eu-rank__legend">{t('europe.change.missing', { list: missing.map(nameOf).join(', ') })}</p>
      )}
    </div>
  );
}
