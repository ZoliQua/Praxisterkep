// A translator for a language picked in the export dialog, which need not be
// the page's: an English report can be made from a Hungarian page. It reads
// the same two dictionaries as lib/i18n.ts, without that module's side
// effects (it sets the document's language on import, which a static English
// page must not have done to it).
import hu from '../i18n/hu.json';
import en from '../i18n/en.json';
import type { Translate } from './report';
import type { Lang } from './types';

type Dict = { [key: string]: string | string[] | Dict };

function lookup(root: Dict, key: string): string | undefined {
  let node: string | string[] | Dict | undefined = root;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === undefined) break;
    node = Array.isArray(node) ? node[Number(part)] : node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translator(lang: Lang): Translate {
  const dict = (lang === 'en' ? en : hu) as unknown as Dict;
  const fallback = hu as unknown as Dict;
  return (key, params) => {
    const node = lookup(dict, key) ?? lookup(fallback, key);
    if (node === undefined) return key;
    if (!params) return node;
    return node.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
  };
}
