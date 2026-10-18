// Strengths and weaknesses on one chart: every ranked measure of the branch,
// the country in focus placed from the worst of the group (left) to the best
// (right), the middle of the field drawn down the centre. The bars start at
// the middle, so a long bar either way is a measure the country stands out on.
import { t } from '../../lib/i18n';
import type { EuSection, ProfileRow } from '../../lib/europe';

export function EuProfile({ rows, onOpen }: {
  rows: ProfileRow[];
  onOpen: (section: EuSection, key: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="eu-profile">
      <p className="eu-profile__axis"><span>{t('europe.profile.worst')}</span>
        <span>{t('europe.profile.middle')}</span><span>{t('europe.profile.best')}</span></p>
      {rows.map((r) => {
        const d = r.score - 0.5;
        return (
          <button type="button" key={r.key} className="eu-profile__row" onClick={() => onOpen(r.section, r.key)}
            title={t('europe.overview.rank', { rank: r.rank, of: r.of })}>
            <span className="eu-profile__name">{t(`europe.ind.${r.key}.short`)}</span>
            <span className="eu-profile__track">
              <i className={d >= 0 ? 'is-good' : 'is-bad'}
                style={d >= 0 ? { left: '50%', width: `${d * 100}%` } : { right: '50%', width: `${-d * 100}%` }} />
            </span>
            <b>{r.rank}/{r.of}</b>
          </button>
        );
      })}
    </div>
  );
}
