import hu from '../i18n/hu.json';

type Dict = { [key: string]: string | string[] | Dict };

export type Locale = 'hu' | 'en';

function detectLocale(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'hu') {
      localStorage.setItem('lang', q);
      return q;
    }
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'hu') return saved;
  } catch {
    // storage/URL may be unavailable (tests, previews)
  }
  return 'hu';
}

export const locale: Locale = typeof window === 'undefined' ? 'hu' : detectLocale();
// every page, not only the landing: screen readers and the browser's own
// translation offer read this
if (typeof document !== 'undefined') document.documentElement.lang = locale;

// Hungarian is the default and every lookup's fallback, so it ships with the
// page; the English dictionary is fetched only by a reader who asked for it
// (it is as large as the Hungarian one, and most visits never use it). The
// top-level await holds every module that translates until it has arrived.
const dict: Dict = (locale === 'en'
  ? (await import('../i18n/en.json')).default
  : hu) as unknown as Dict;
const fallback: Dict = hu as unknown as Dict;

function lookup(root: Dict, key: string): string | undefined {
  let node: string | string[] | Dict | undefined = root;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === undefined) break;
    node = Array.isArray(node) ? node[Number(part)] : node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** t() with the active kind's adjective/noun pre-filled ({kind}, {doctor}). */
export function tKind(key: string, kind: string, params?: Record<string, string | number>): string {
  return t(key, {
    kind: t(`kinds.${kind}.adj`),
    doctor: t(`kinds.${kind}.doctor`),
    ...params,
  });
}

/** Look up a dot-separated key in the active locale (hu fallback). */
export function t(key: string, params?: Record<string, string | number>): string {
  const node = lookup(dict, key) ?? lookup(fallback, key);
  if (node === undefined) return key; // visible fallback: the key itself
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}
