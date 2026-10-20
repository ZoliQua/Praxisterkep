// A report, laid out as a PDF.
//
// pdfmake does the typesetting; this file only says how a report looks on
// paper: the Praxistérkép mark and name at the top of every page, the title
// block, headed sections, tables that repeat their header row across a page
// break, charts kept whole with their caption, and a footer in small print
// naming the program, where it lives, its version and the page.
//
// The three fonts are full TrueType files with the Hungarian letters ő and ű
// (the ones a "Latin-1" font lacks); only the one chosen is downloaded, and
// the PDF embeds just the glyphs it uses.
import pdfMake from 'pdfmake/build/pdfmake';
import plexR from '@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf?url';
import plexB from '@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf?url';
import plexI from '@expo-google-fonts/ibm-plex-sans/400Regular_Italic/IBMPlexSans_400Regular_Italic.ttf?url';
import plexBI from '@expo-google-fonts/ibm-plex-sans/700Bold_Italic/IBMPlexSans_700Bold_Italic.ttf?url';
import serifR from '@expo-google-fonts/source-serif-4/400Regular/SourceSerif4_400Regular.ttf?url';
import serifB from '@expo-google-fonts/source-serif-4/700Bold/SourceSerif4_700Bold.ttf?url';
import serifI from '@expo-google-fonts/source-serif-4/400Regular_Italic/SourceSerif4_400Regular_Italic.ttf?url';
import serifBI from '@expo-google-fonts/source-serif-4/700Bold_Italic/SourceSerif4_700Bold_Italic.ttf?url';
import robotoR from '@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?url';
import robotoB from '@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf?url';
import robotoI from '@expo-google-fonts/roboto/400Regular_Italic/Roboto_400Regular_Italic.ttf?url';
import robotoBI from '@expo-google-fonts/roboto/700Bold_Italic/Roboto_700Bold_Italic.ttf?url';
import { PALETTES } from './charts';
import { today } from './format';
import type { Translate } from './report';
import type { Block, FontKey, PdfOptions, Report, SizeKey } from './types';

type Style = 'normal' | 'bold' | 'italics' | 'bolditalics';

export const FONT_NAMES: Record<FontKey, string> = { plex: 'PlexSans', serif: 'SourceSerif', roboto: 'RobotoText' };

const FONT_FILES: Record<FontKey, Record<Style, string>> = {
  plex: { normal: plexR, bold: plexB, italics: plexI, bolditalics: plexBI },
  serif: { normal: serifR, bold: serifB, italics: serifI, bolditalics: serifBI },
  roboto: { normal: robotoR, bold: robotoB, italics: robotoI, bolditalics: robotoBI },
};

export const BASE_SIZE: Record<SizeKey, number> = { small: 8.5, normal: 10, large: 11.5 };

export const SITE_URL = 'https://praxisterkep.hu';

const loaded = new Set<FontKey>();

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

async function ensureFont(key: FontKey): Promise<string> {
  const name = FONT_NAMES[key];
  if (loaded.has(key)) return name;
  const files = FONT_FILES[key];
  const vfs: Record<string, string> = {};
  const map = {} as Record<Style, string>;
  await Promise.all((Object.keys(files) as Style[]).map(async (style) => {
    const res = await fetch(files[style]);
    if (!res.ok) throw new Error(`font ${files[style]}: ${res.status}`);
    const file = `${name}-${style}.ttf`;
    vfs[file] = base64(await res.arrayBuffer());
    map[style] = file;
  }));
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({ [name]: map });
  loaded.add(key);
  return name;
}

async function logo(): Promise<string | null> {
  try {
    const res = await fetch('/praxisterkep-favicon.svg');
    if (!res.ok) return null;
    // the title and description are for screen readers, not for paper
    return (await res.text()).replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>|<!--[\s\S]*?-->/g, '');
  } catch {
    return null;
  }
}

/** Content width in points for an A4 page with the margins below. */
export function contentWidth(orientation: PdfOptions['orientation']): number {
  return (orientation === 'landscape' ? 841.89 : 595.28) - 2 * 42;
}

export async function renderPdf(report: Report, o: PdfOptions, T: Translate, version: string):
  Promise<Blob> {
  pdfMake.setUrlAccessPolicy(() => false);
  const font = await ensureFont(o.font);
  const mark = await logo();
  const fs = BASE_SIZE[o.size];
  const pal = PALETTES[o.palette];
  const accent = pal.parts[0];
  const ink = '#1f2933';
  const muted = '#616e7c';
  const width = contentWidth(o.orientation);
  const made = today(o.lang);

  const block = (b: Block): unknown => {
    switch (b.kind) {
      case 'p':
        // a paragraph keeps its lines together: no last line alone on a page
        return { unbreakable: true, stack: [{ text: b.text, lineHeight: 1.25 }], margin: [0, 0, 0, fs * 0.6] };
      case 'note':
        return { unbreakable: true, table: { widths: ['*'], body: [[{ text: b.text, italics: true, color: muted,
          fontSize: fs * 0.85, lineHeight: 1.2 }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2 : 0),
          vLineColor: () => accent, fillColor: () => '#f5f7fa',
          paddingLeft: () => 8, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 0, 0, fs * 0.8] };
      case 'h3':
        // an indicator's own heading inside a section, kept with what follows
        return { text: b.text, bold: true, fontSize: fs * 1.15, color: ink, margin: [0, fs * 0.6, 0, fs * 0.3],
          headlineLevel: 2 };
      case 'highlight':
        return { unbreakable: true, table: { widths: ['*'], body: [[{ text: b.text, bold: true,
          fontSize: fs * 1.08, color: ink, lineHeight: 1.25 }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 4 : 0),
          vLineColor: () => accent, fillColor: () => '#eef2f6',
          paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8 },
        margin: [0, 0, 0, fs] };
      case 'facts':
        return { table: { widths: ['45%', '*'], body: b.rows.map(([k, v]) => [
          { text: k, color: muted }, { text: v, bold: true }]) },
        layout: { hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          (i === 0 || i === node.table.body.length ? 0 : 0.5), vLineWidth: () => 0,
          hLineColor: () => '#e3e8ee', paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [0, 0, 0, fs] };
      case 'chart':
        return { unbreakable: true, margin: [0, fs * 0.3, 0, fs], stack: [
          { text: b.title, bold: true, margin: [0, 0, 0, 4] },
          { svg: b.svg, width: b.width },
          { text: b.caption, italics: true, color: muted, fontSize: fs * 0.8, margin: [0, 3, 0, 0] },
        ] };
      case 'table': {
        const align = b.align ?? b.head.map(() => 'left');
        return { table: { headerRows: 1, dontBreakRows: true,
          widths: b.widths ?? b.head.map((_, i) => (i === 0 ? '*' : 'auto')),
          body: [b.head.map((h, i) => ({ text: h, bold: true, fillColor: '#eef2f6', alignment: align[i] })),
            ...b.rows.map((r, ri) => r.map((cell, i) => ({ text: cell, alignment: align[i],
              fillColor: ri % 2 ? '#fafbfc' : null })))] },
        layout: { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.3), vLineWidth: () => 0,
          hLineColor: () => '#d9e0e7', paddingTop: () => 2.5, paddingBottom: () => 2.5 },
        fontSize: fs * 0.86, margin: [0, 0, 0, fs] };
      }
      case 'cards':
        // side by side, each in a light frame: the ring, then the figure and
        // what it counts
        return { columns: b.cards.map((card) => ({ width: '*', table: { widths: ['*'], body: [[{
          columns: [
            { svg: card.svg, width: card.size, height: card.size },
            { width: '*', margin: [10, 0, 0, 0], stack: [
              { text: card.title.toUpperCase(), fontSize: fs * 0.72, bold: true, color: muted, characterSpacing: 0.6 },
              { text: card.value, fontSize: fs * 1.9, bold: true, margin: [0, 2, 0, 0] },
              { text: card.label, fontSize: fs * 0.88, margin: [0, 0, 0, 4] },
              // the swatch is drawn, not typed: "■" is not in every font
              ...card.legend.map((l) => ({ columns: [
                { canvas: [{ type: 'rect', x: 0, y: fs * 0.18, w: fs * 0.6, h: fs * 0.6, color: l.color }], width: fs * 0.95 },
                { text: l.text, color: muted, fontSize: fs * 0.76 },
              ], margin: [0, 0, 0, 1] })),
              ...(card.sub ? [{ text: card.sub, fontSize: fs * 0.76, color: muted, italics: true, margin: [0, 3, 0, 0] }] : []),
            ] },
          ] }]] },
        layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#dfe5ec', vLineColor: () => '#dfe5ec',
          fillColor: () => '#f7f9fb', paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 } })),
        columnGap: 12, margin: [0, 2, 0, fs] };
      default:
        return null;
    }
  };

  const content: unknown[] = [
    { text: report.title, fontSize: fs * 2.5, bold: true, color: ink, margin: [0, 4, 0, 2] },
    { text: report.subtitle, fontSize: fs * 1.15, color: accent, bold: true, margin: [0, 0, 0, 4] },
    ...(report.map ? [{ stack: [
      { svg: report.map.svg, width: report.map.width, height: report.map.height, alignment: 'center' },
      { text: report.map.caption, italics: true, color: muted, fontSize: fs * 0.8, alignment: 'center', margin: [0, 3, 0, 0] },
    ], margin: [0, 6, 0, 8] }] : []),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 1.2, lineColor: accent }],
      margin: [0, 8, 0, 6] },
  ];
  report.sections.forEach((s, i) => {
    content.push({
      // a heading never ends a page alone: it travels with what follows
      stack: [{ columns: [
        { canvas: [{ type: 'rect', x: 0, y: 1, w: 4, h: fs * 1.3, color: accent }], width: 10 },
        { text: s.title, fontSize: fs * 1.45, bold: true, color: ink },
      ] }], margin: [0, i ? fs * 1.1 : fs * 0.5, 0, fs * 0.6], headlineLevel: 1,
    });
    s.blocks.forEach((b) => content.push(block(b)));
  });

  const doc = {
    pageSize: 'A4',
    pageOrientation: o.orientation,
    pageMargins: [42, 62, 42, 48],
    info: {
      title: `${report.title} — ${report.subtitle}`,
      author: 'Dr. Dul Zoltán',
      subject: report.subtitle,
      creator: `Praxistérkép ${version}`,
      producer: `Praxistérkép ${version}`,
    },
    defaultStyle: { font, fontSize: fs, color: ink },
    header: () => ({
      margin: [42, 22, 42, 0],
      stack: [
        { columns: [
          ...(mark ? [{ svg: mark, width: 20, height: 20 }] : []),
          { text: 'PRAXISTÉRKÉP', bold: true, fontSize: 11, characterSpacing: 1.2, color: ink,
            margin: [mark ? 7 : 0, 4, 0, 0], width: 'auto' },
          { text: `${report.title} · ${report.subtitle}`, alignment: 'right', fontSize: 7.5,
            color: muted, margin: [0, 6, 0, 0] },
        ], columnGap: 0 },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: width, y2: 6, lineWidth: 0.5, lineColor: '#d9e0e7' }] },
      ],
    }),
    footer: (page: number, pages: number) => ({
      margin: [42, 12, 42, 0],
      fontSize: 6.5, color: muted,
      stack: [
        { text: T('pdf.footer.line', { version, url: SITE_URL.replace('https://', 'www.') }) },
        { columns: [
          { text: T('pdf.footer.made', { date: made }) },
          { text: o.pageNumbers ? T('pdf.footer.page', { page, pages }) : '', alignment: 'right' },
        ], margin: [0, 2, 0, 0] },
      ],
    }),
    // a heading never ends a page alone; a sub-heading needs room for its chart
    pageBreakBefore: (node: { headlineLevel?: number; startPosition: { verticalRatio: number } }) =>
      (node.headlineLevel === 1 && node.startPosition.verticalRatio > 0.86)
      || (node.headlineLevel === 2 && node.startPosition.verticalRatio > 0.8),
    content,
  };
  return pdfMake.createPdf(doc).getBlob();
}
