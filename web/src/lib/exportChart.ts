// Client-side chart exports. SVG charts use CSS custom properties, which a
// standalone rasterized copy cannot resolve — so computed styles are inlined
// onto a clone before rendering to canvas.

const STYLE_PROPS = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity',
  'font-size', 'font-family', 'font-weight',
] as const;

function inlineStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  for (const prop of STYLE_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (v) (dst as SVGElement).setAttribute(prop, v);
  }
  for (let i = 0; i < src.children.length; i++) {
    inlineStyles(src.children[i], dst.children[i]);
  }
}

export function exportSvgToPng(svg: SVGSVGElement, filename: string): void {
  const vb = svg.viewBox.baseVal;
  const w = vb?.width || svg.clientWidth;
  const h = vb?.height || svg.clientHeight;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  const bg = window.getComputedStyle(svg.closest('.chart-card') ?? svg)
    .getPropertyValue('background-color');
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const blob = new Blob([new XMLSerializer().serializeToString(clone)],
    { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#101823';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (png) downloadBlob(png, filename);
    }, 'image/png');
  };
  img.src = url;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function downloadCsv(rows: (string | number | null)[][], filename: string): void {
  const text = rows
    .map((r) => r.map((v) => (v === null ? '' : String(v))).join(';'))
    .join('\n');
  // BOM so Excel opens the UTF-8 Hungarian text correctly
  downloadBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), filename);
}
