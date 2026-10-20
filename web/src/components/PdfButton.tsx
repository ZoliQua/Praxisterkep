// The "PDF" button beside a page heading. The dialog and everything behind
// it (pdfmake, the fonts) load on the first click, not with the page.
import { useState } from 'react';
import { locale, t } from '../lib/i18n';

interface Props {
  level: 'county' | 'district' | 'analysis' | 'europe';
  /** the county or district; the two national pages have none */
  name?: string;
  /** the European page's current choice of countries and focus */
  group?: 'all' | 'cee' | 'v4';
  focus?: string;
}

export function PdfButton({ level, name, group, focus }: Props) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { openPdfDialog } = await import('../pdf/dialog');
      await openPdfDialog({ level, name, lang: locale, group, focus });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="pdf-btn" onClick={open} disabled={busy}
      title={name ? t('pdf.buttonTitle', { name }) : t(`pdf.buttonTitleLevel.${level}`)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
      </svg>
      <span>{t('pdf.button')}</span>
    </button>
  );
}
