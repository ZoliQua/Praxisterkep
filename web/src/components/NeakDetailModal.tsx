// The NEAK record of a FILLED district: what the monthly contracted-provider
// registry publishes about it (NEAK code, provider, care level, unit type,
// surgery address, district, served settlements, contracted physician).
// Vacant and dissolved districts never reach this panel — they carry no name
// and no provider (CLAUDE.md rule 3).
import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import { formatMonth } from '../lib/format';
import { eesztLink } from '../lib/eeszt';
import { useAppStore } from '../store/useAppStore';
import type { PraxisKind } from '../types';

export function NeakDetailModal({ fin, kind, onClose }: {
  fin: string | null; kind: PraxisKind; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const snapshot = useAppStore((s) => s.latest?.kinds[kind] ?? null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (fin && !d.open) d.showModal();
    if (!fin && d.open) d.close();
  }, [fin]);

  const praxis = fin ? snapshot?.filledPraxes.find((f) => f.id === fin) : undefined;
  const facts: [string, React.ReactNode][] = [];
  if (praxis) {
    facts.push([t(`neak.fin.${kind}`),
      <a key="fin" className="eeszt-code" href={eesztLink('finszolg', 'FINKOD', praxis.id)}
        target="_blank" rel="noopener">{praxis.id}</a>]);
    if (praxis.neakCode) facts.push([t('neak.neakCode'), praxis.neakCode]);
    if (praxis.provider) facts.push([t('neak.provider'), praxis.provider]);
    if (praxis.level) facts.push([t('neak.level'), praxis.level]);
    facts.push([t('neak.unitType'), t(`praxisTypes.${praxis.type}`)]);
    facts.push([t('neak.site'), [
      [praxis.postalCode, praxis.settlement].filter(Boolean).join(' '),
      praxis.address,
    ].filter(Boolean).join(', ')]);
    facts.push([t('stats.thCounty'), praxis.county]);
    if (praxis.district) facts.push([t('neak.district'), `${praxis.district} járás`]);
    if (praxis.servedSettlements?.length) {
      facts.push([t('neak.served'), praxis.servedSettlements.join(', ')]);
    }
    if (praxis.doctor) facts.push([t('neak.doctor'), praxis.doctor]);
  }

  return (
    <dialog ref={ref} className="vacancy-dialog neak-dialog" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="vacancy-dialog__panel neak-dialog__panel">
        <header className="vacancy-dialog__head">
          <div>
            <h3>{t('neak.title')}</h3>
            <p>{praxis
              ? `${praxis.settlement} · ${praxis.id}`
              : t('neak.notFound')}</p>
          </div>
          <button className="vacancy-dialog__close" onClick={onClose}
            aria-label={t('stats.tableClose')}>×</button>
        </header>

        {praxis && (
          <>
            <dl className="neak-facts">
              {facts.map(([label, value]) => (
                <div key={label} className="neak-facts__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="neak-dialog__note">
              {snapshot ? t('neak.source', { month: formatMonth(snapshot.month) }) : ''}
            </p>
          </>
        )}
      </div>
    </dialog>
  );
}
