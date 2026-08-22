import { t } from '../lib/i18n';
import { formatMonth } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

export function Footer() {
  const snapshot = useAppStore((s) => s.snapshot)!;
  return (
    <footer className="footer" id="forrasok">
      <div className="container">
        <h3>{t('footer.sources')}</h3>
        <ul>
          <li>{t('footer.sourceNeak')}</li>
          <li>{t('footer.sourceOsm')}</li>
        </ul>
        <p className="disclaimer">{t('footer.disclaimer')}</p>
        <p>
          {t('footer.updated')}: {formatMonth(snapshot.month)} · {t('footer.license')}
        </p>
        <p>{t('footer.author')}</p>
      </div>
    </footer>
  );
}
