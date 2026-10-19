// The export dialog: what goes into the PDF and how it looks.
//
// Plain DOM, not React, so the same dialog opens on the app's county and
// járás pages and on the 6354 static settlement pages, which carry no React.
// It speaks the page's language; the export's own language is one of the
// choices. The last choices are remembered in this browser (a convenience,
// nothing more: without storage the defaults simply come back).
import { contentWidth, FONT_NAMES, renderPdf } from './render';
import { translator } from './i18n';
import { countyReport, districtReport, settlementReport, type Ctx } from './report';
import { countyInput, districtInput, settlementInput } from './sources';
import { PALETTES } from './charts';
import {
  defaultOptions, SECTIONS, type BranchChoice, type Lang, type Level, type PdfOptions, type Report,
} from './types';

declare const __APP_VERSION__: string;

export interface ExportRequest {
  level: Level;
  /** the county or district name; a settlement page reads its own data */
  name?: string;
  /** the page's language: the dialog speaks it, and the export starts in it */
  lang: Lang;
  branch?: BranchChoice;
}

const STORE = 'praxisterkep.pdf';

function remembered(level: Level): Partial<PdfOptions> {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return all[level] ?? {};
  } catch {
    return {};
  }
}

function remember(level: Level, o: PdfOptions): void {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    // the language follows the page next time, not the last export
    const { lang: _lang, ...rest } = o;
    all[level] = rest;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* storage blocked: the defaults come back next time */ }
}

async function build(req: ExportRequest, o: PdfOptions): Promise<{ report: Report; month: string }> {
  const T = translator(o.lang);
  const c: Ctx = { T, o, width: contentWidth(o.orientation), font: FONT_NAMES[o.font] };
  if (req.level === 'county') {
    const input = await countyInput(req.name!);
    return { report: countyReport(c, input), month: input.counties.dataMonth };
  }
  if (req.level === 'district') {
    const input = await districtInput(req.name!);
    return { report: districtReport(c, input), month: input.districts.dataMonth };
  }
  const input = settlementInput();
  return { report: settlementReport(c, input), month: input.dataMonth };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {},
  ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

let open: HTMLElement | null = null;

export function openPdfDialog(req: ExportRequest): void {
  if (open) return;
  const T = translator(req.lang);
  const level = req.level;
  const stored = remembered(level);
  const base = defaultOptions(level, req.lang, req.branch ?? 'both');
  const o: PdfOptions = { ...base, ...stored, lang: req.lang,
    // a section this level no longer offers is dropped, a new one is not
    sections: (stored.sections ?? base.sections).filter((s) => SECTIONS[level].includes(s)) };
  const opener = document.activeElement as HTMLElement | null;
  let uid = 0;
  const id = () => `pdfx-${(uid += 1)}`;

  const radio = (name: keyof PdfOptions, values: [string, string][]) => el('div', { class: 'pdfx__choices' },
    ...values.map(([value, label]) => {
      const input = el('input', { type: 'radio', name: `pdfx-${String(name)}`, value });
      input.checked = String(o[name]) === value;
      input.addEventListener('change', () => {
        (o as unknown as Record<string, unknown>)[name] = typeof base[name] === 'number' ? Number(value) : value;
      });
      return el('label', { class: 'pdfx__choice' }, input, el('span', {}, label));
    }));
  const check = (name: 'grid' | 'labels' | 'notes' | 'pageNumbers', label: string) => {
    const input = el('input', { type: 'checkbox' });
    input.checked = o[name];
    input.addEventListener('change', () => { o[name] = input.checked; });
    return el('label', { class: 'pdfx__check' }, input, el('span', {}, label));
  };
  const group = (title: string, ...body: Node[]) => el('fieldset', { class: 'pdfx__group' },
    el('legend', {}, title), ...body);

  // sections
  const boxes = SECTIONS[level].filter((s) => s !== 'notes').map((s) => {
    const input = el('input', { type: 'checkbox', value: s });
    input.checked = o.sections.includes(s);
    input.addEventListener('change', () => {
      o.sections = SECTIONS[level].filter((x) => (x === s ? input.checked : o.sections.includes(x)));
    });
    return { s, input, node: el('label', { class: 'pdfx__check' }, input, el('span', {}, T(`pdf.section.${s}`))) };
  });
  const setAll = (on: boolean) => {
    boxes.forEach((b) => { b.input.checked = on; });
    o.sections = on ? boxes.map((b) => b.s) : [];
  };
  const allBtn = el('button', { type: 'button', class: 'pdfx__link' }, T('pdf.dialog.all'));
  const noneBtn = el('button', { type: 'button', class: 'pdfx__link' }, T('pdf.dialog.none'));
  allBtn.addEventListener('click', () => setAll(true));
  noneBtn.addEventListener('click', () => setAll(false));

  // palettes, each with its colours shown
  const palettes = el('div', { class: 'pdfx__choices pdfx__choices--palette' },
    ...(Object.keys(PALETTES) as (keyof typeof PALETTES)[]).map((key) => {
      const input = el('input', { type: 'radio', name: 'pdfx-palette', value: key });
      input.checked = o.palette === key;
      input.addEventListener('change', () => { o.palette = key; });
      const sw = el('span', { class: 'pdfx__swatches', 'aria-hidden': 'true' },
        ...[PALETTES[key].focus, ...PALETTES[key].parts.slice(0, 3), PALETTES[key].other]
          .map((color) => el('i', { style: `background:${color}` })));
      return el('label', { class: 'pdfx__choice pdfx__choice--palette' }, input,
        el('span', {}, T(`pdf.dialog.palette.${key}`)), sw);
    }));

  const fonts = el('div', { class: 'pdfx__choices' }, ...(['plex', 'serif', 'roboto'] as const).map((key) => {
    const input = el('input', { type: 'radio', name: 'pdfx-font', value: key });
    input.checked = o.font === key;
    input.addEventListener('change', () => { o.font = key; });
    return el('label', { class: 'pdfx__choice' }, input, el('span', {},
      el('b', { class: `pdfx__font pdfx__font--${key}` }, T(`pdf.dialog.font.${key}`)),
      el('small', {}, T('pdf.dialog.fontSample'))));
  }));

  const status = el('p', { class: 'pdfx__status', role: 'status', 'aria-live': 'polite' });
  const go = el('button', { type: 'submit', class: 'pdfx__go' }, T('pdf.dialog.go'));
  const cancel = el('button', { type: 'button', class: 'pdfx__cancel' }, T('pdf.dialog.cancel'));
  const close = el('button', { type: 'button', class: 'pdfx__close', 'aria-label': T('pdf.dialog.cancel') }, '×');
  const titleId = id();

  const form = el('form', { class: 'pdfx__form' },
    group(T('pdf.dialog.contents'),
      el('div', { class: 'pdfx__bulk' }, allBtn, noneBtn),
      el('div', { class: 'pdfx__grid' }, ...boxes.map((b) => b.node)),
      ...(level === 'settlement' ? [] : [el('p', { class: 'pdfx__label' }, T('pdf.dialog.settlementLimit')),
        radio('settlementLimit', [['25', T('pdf.dialog.top', { n: 25 })], ['50', T('pdf.dialog.top', { n: 50 })],
          ['0', T('pdf.dialog.allSettlements')]])]),
      check('notes', T('pdf.dialog.notes'))),
    group(T('pdf.dialog.languageBranch'),
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.language')),
      radio('lang', [['hu', 'Magyar'], ['en', 'English']]),
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.branch')),
      radio('branch', [['both', T('pdf.dialog.branchBoth')], ['gp', T('pdf.dialog.branchGp')],
        ['dental', T('pdf.dialog.branchDental')]])),
    group(T('pdf.dialog.typography'),
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.font.label')), fonts,
      el('p', { class: 'pdfx__hint' }, T('pdf.dialog.fontNote')),
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.size')),
      radio('size', [['small', T('pdf.dialog.sizeSmall')], ['normal', T('pdf.dialog.sizeNormal')],
        ['large', T('pdf.dialog.sizeLarge')]])),
    group(T('pdf.dialog.charts'),
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.palette.label')), palettes,
      el('p', { class: 'pdfx__label' }, T('pdf.dialog.chartSize')),
      radio('chartSize', [['compact', T('pdf.dialog.chartCompact')], ['normal', T('pdf.dialog.chartNormal')],
        ['large', T('pdf.dialog.chartLarge')]]),
      check('grid', T('pdf.dialog.grid')), check('labels', T('pdf.dialog.labels')),
      el('p', { class: 'pdfx__hint' }, T('pdf.dialog.chartNote'))),
    group(T('pdf.dialog.page'),
      radio('orientation', [['portrait', T('pdf.dialog.portrait')], ['landscape', T('pdf.dialog.landscape')]]),
      check('pageNumbers', T('pdf.dialog.pageNumbers'))),
    el('div', { class: 'pdfx__actions' }, status, cancel, go),
  );

  const panel = el('div', { class: 'pdfx__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('header', { class: 'pdfx__head' },
      el('div', {}, el('h2', { id: titleId }, T('pdf.dialog.title')),
        el('p', {}, T(`pdf.dialog.subtitle.${level}`, { name: req.name ?? document.title.split(' — ')[0] }))),
      close),
    form);
  const overlay = el('div', { class: 'pdfx' }, panel);

  const shut = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    open = null;
    opener?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') shut();
    // keep the tab key inside the dialog
    if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll<HTMLElement>('button, input, select')].filter((x) => !x.hasAttribute('disabled'));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) shut(); });
  close.addEventListener('click', shut);
  cancel.addEventListener('click', shut);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!o.sections.length && !o.notes) { status.textContent = T('pdf.dialog.nothing'); return; }
    go.setAttribute('disabled', '');
    status.textContent = T('pdf.dialog.working');
    try {
      const { report, month } = await build(req, o);
      const blob = await renderPdf(report, o, translator(o.lang), __APP_VERSION__);
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `praxisterkep-${report.fileSlug}-${month}.pdf` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      remember(level, o);
      shut();
    } catch (err) {
      console.error(err);
      status.textContent = T('pdf.dialog.failed');
      go.removeAttribute('disabled');
    }
  });

  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  open = overlay;
  go.focus();
}
