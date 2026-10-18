// The landing's opening. This is where a cold visitor decides whether the
// site is worth their attention, so it says one thing in one voice: the
// question, the branch it is asked about, and the one caveat that keeps the
// answer honest.
//
// It deliberately carries no figures — the showcase rail directly below is
// where the numbers live, and repeating them here would make the first screen
// read twice.
import { t } from '../lib/i18n';
import { formatMonth } from '../lib/format';
import { useAppStore, useSnapshot, useTimeseriesMonths } from '../store/useAppStore';
import { DissolvedSwitch } from './DissolvedSwitch';
import type { PraxisKind } from '../types';

export function Hero() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const monthCount = useTimeseriesMonths().length;
  const doctor = t(`kinds.${kind}.doctor`);
  const adj = t(`kinds.${kind}.adj`);

  return (
    <header className="hero container">
      <h1>
        {t(`kinds.${kind}.question`).replace('?', '')}
        <span className="accent">?</span>
      </h1>
      {/* the branch and the reading of "vacant" are one row: both decide
          what every number below them counts */}
      <div className="hero__switches">
        <div className="seg seg--kind" role="group">
          {(['gp', 'dental'] as PraxisKind[]).map((k) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`kinds.${k}.label`)}
            </button>
          ))}
        </div>
        {snapshot.national.dissolved > 0 && <DissolvedSwitch compact />}
      </div>

      {/* One block, one type scale. The lead states what the site is, the
          caveat states what "vacant" does not mean — rule 4 of the project —
          and the date says how fresh it all is. They used to be three
          paragraphs in three different styles. */}
      <div className="hero__intro">
        <p className="hero__lead">{t('site.lead', { doctor })}</p>
        <p className="hero__caveat">
          <strong>{t('hero.caveatLabel')}</strong>{' '}
          {t('hero.vacantVsUnserved', { doctor, kind: adj })}
        </p>
        <p className="hero__meta">
          {t('site.lastUpdate')}: <b>{formatMonth(snapshot.month)}</b>
          {' · '}{t('site.sourceShort')}
          {monthCount === 1 && <> · {t('site.firstMonthNote')}</>}
        </p>
      </div>
    </header>
  );
}
