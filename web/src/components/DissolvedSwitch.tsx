// The reader's choice: does a vacancy figure count the dissolved districts?
//
// It sits next to the numbers it governs, writes itself into the address bar
// (so a shared link carries the reading it was shared under) and is read by
// every indicator through lib/vacancy.
import { t } from '../lib/i18n';
import { useContextStore, type DissolvedMode } from '../lib/context';

const MODES: DissolvedMode[] = ['with', 'without'];

export function DissolvedSwitch({ compact = false }: { compact?: boolean }) {
  const mode = useContextStore((s) => s.dissolved);
  const setDissolved = useContextStore((s) => s.setDissolved);
  return (
    <div className={`dsw${compact ? ' dsw--compact' : ''}`}>
      <span className="dsw__label">{t('dissolved.label')}</span>
      <div className="seg seg--small" role="group" aria-label={t('dissolved.label')}>
        {MODES.map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setDissolved(m)}>
            {t(`dissolved.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The one-line footnote that says what the current reading leaves in or out. */
export function DissolvedNote({ dissolved }: { dissolved: number }) {
  const mode = useContextStore((s) => s.dissolved);
  if (!dissolved) return null;
  return (
    <p className="dsw__note">
      {t(mode === 'with' ? 'dissolved.noteWith' : 'dissolved.noteWithout', {
        n: String(dissolved),
      })}
    </p>
  );
}
