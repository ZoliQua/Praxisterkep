// "Tippelj!" — guess the number of vacant districts in a county, then see
// the sourced reality. Pure engagement widget; the revealed number comes
// straight from the current snapshot.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { useAppStore, useSnapshot } from '../store/useAppStore';

export function GuessGame() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const counties = useMemo(
    () => [...snapshot.counties].sort((a, b) => a.name.localeCompare(b.name, 'hu')),
    [snapshot],
  );
  const [county, setCounty] = useState(counties[0]?.name ?? '');
  const [guess, setGuess] = useState('');
  const [revealed, setRevealed] = useState(false);

  const actual = useMemo(() => {
    const c = snapshot.counties.find((x) => x.name === county);
    return c ? c.vacant + c.dissolved : 0;
  }, [snapshot, county]);

  const g = parseInt(guess, 10);
  const valid = Number.isFinite(g) && g >= 0;

  function verdict(): string {
    if (!valid) return '';
    if (g === actual) return t('ranking.guessSpotOn');
    const diff = Math.abs(g - actual) / Math.max(actual, 1);
    if (diff <= 0.25) return t('ranking.guessClose');
    return g < actual
      ? t('ranking.guessLow', { n: g, actual })
      : t('ranking.guessHigh', { n: g, actual });
  }

  function reset() {
    setRevealed(false);
    setGuess('');
  }

  const maxBar = Math.max(actual, valid ? g : 0, 1);
  return (
    <div className="guess">
      <h3 className="why__chain-title">{t('ranking.guessTitle')}</h3>
      <div className="guess__row">
        <span>{t('ranking.guessQuestion1', { kind: t(`kinds.${kind}.adj`) })}</span>
        <select value={county}
          onChange={(e) => { setCounty(e.target.value); reset(); }}>
          {counties.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.total ? ` (${t('ranking.guessTotal', { n: c.total })})` : ''}
            </option>
          ))}
        </select>
        <span>{t('ranking.guessQuestion2')}</span>
        <input type="number" min={0} inputMode="numeric" value={guess}
          placeholder={t('ranking.guessPlaceholder')}
          onChange={(e) => { setGuess(e.target.value); setRevealed(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) setRevealed(true); }} />
        <button className="guess__btn" disabled={!valid}
          onClick={() => setRevealed(true)}>
          {t('ranking.guessShow')}
        </button>
      </div>
      {revealed && valid && (
        <div className="guess__result">
          <div className="guess__bars">
            <div className="guess__bar">
              <span className="guess__bar-label">{t('ranking.guessYours')}</span>
              <div className="guess__bar-track">
                <div className="guess__bar-fill guess__bar-fill--guess"
                  style={{ width: `${(g / maxBar) * 100}%` }} />
              </div>
              <span className="guess__bar-value">{g}</span>
            </div>
            <div className="guess__bar">
              <span className="guess__bar-label">{t('ranking.guessReality')}</span>
              <div className="guess__bar-track">
                <div className="guess__bar-fill guess__bar-fill--actual"
                  style={{ width: `${(actual / maxBar) * 100}%` }} />
              </div>
              <span className="guess__bar-value">{actual}</span>
            </div>
          </div>
          <p className="guess__verdict">{verdict()}</p>
          <button className="guess__btn guess__btn--again" onClick={reset}>
            {t('ranking.guessAgain')}
          </button>
        </div>
      )}
    </div>
  );
}
