// "Honnan tudjuk, hogy egy körzet megszűnt?" — the site infers a dissolved
// district from a FIN code disappearing out of the monthly registry, because
// NEAK publishes no dissolved list for GP. Its referral master list does
// publish one, for every branch, and this block holds the two against each
// other: every exit it names should be a district we already call dissolved.
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { DataTableModal } from './DataTableModal';
import type { ColDef, Row } from '../lib/eesztTable';

interface ReferralRow {
  period: string;
  fin: string;
  county: string;
  neakCode: string;
  institution: string;
  type: string;
  label: string;
  labelWithheld: boolean;
  ourStatus?: string;
}

interface ReferralRaw {
  period: string;
  dataMonth: string;
  types: Record<string, string>;
  stats: {
    rows: number; districts: number; entered: number; exited: number;
    changed: number; oursInMaster: number; oursMissing: number;
    exitedKnownToUs: number; labelsWithheld: number;
    byType: Record<string, number>;
  };
  entered: ReferralRow[];
  exited: ReferralRow[];
}

const COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'typeLabel', labelKey: 'referral.colType', type: 'enum', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'institution', labelKey: 'specialist.colInstitution', type: 'text', visible: true },
  { key: 'label', labelKey: 'referral.colLabel', type: 'text', visible: true },
  { key: 'ourStatusLabel', labelKey: 'referral.colOurStatus', type: 'enum', visible: true },
  { key: 'period', labelKey: 'referral.colPeriod', type: 'text', visible: false },
];

let cache: ReferralRaw | null = null;
let pending: Promise<ReferralRaw | null> | null = null;

function useReferral(): ReferralRaw | null {
  const [data, setData] = useState<ReferralRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/referral.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ReferralRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export function ReferralBlock() {
  const data = useReferral();
  const [open, setOpen] = useState<'entered' | 'exited' | null>(null);

  if (!data) return null;
  const st = data.stats;
  const rows = (list: ReferralRow[]): Row[] => list.map((r) => ({
    ...r,
    typeLabel: data.types[r.type] ?? r.type,
    label: r.labelWithheld ? t('referral.labelWithheld') : r.label,
    ourStatusLabel: r.ourStatus ? t(`status.${r.ourStatus}`) : t('referral.notOurs'),
  }));

  return (
    <div className="extra-block" id="megszunes">
      <h3 className="why__chain-title">{t('referral.heading')}</h3>
      <p>{t('referral.explain', { period: data.period })}</p>
      <p>{t('referral.check', {
        exited: formatNumber(st.exited),
        ours: formatNumber(st.exitedKnownToUs),
        entered: formatNumber(st.entered),
        master: formatNumber(st.oursInMaster),
        missing: formatNumber(st.oursMissing),
      })}</p>
      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('exited')}>
          {t('referral.openExited', { n: formatNumber(st.exited) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('entered')}>
          {t('referral.openEntered', { n: formatNumber(st.entered) })}
        </button>
      </div>
      <p className="extra-note">{t('referral.note', {
        withheld: formatNumber(st.labelsWithheld),
      })}</p>

      {open && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={t(open === 'exited' ? 'referral.exitedTitle' : 'referral.enteredTitle')}
          subtitle={t(open === 'exited' ? 'referral.exitedSubtitle' : 'referral.enteredSubtitle')}
          rows={rows(open === 'exited' ? data.exited : data.entered)}
          columns={COLUMNS}
          filename={`praxisterkep-${open === 'exited' ? 'kileptek' : 'befeptek'}`}
          countUnit="rows"
        />
      )}
    </div>
  );
}
