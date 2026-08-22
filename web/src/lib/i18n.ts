import hu from '../i18n/hu.json';

type Dict = { [key: string]: string | Dict };

const dict: Dict = hu as Dict;

/** Look up a dot-separated key in the active locale (hu only in MVP). */
export function t(key: string, params?: Record<string, string | number>): string {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === undefined) break;
    node = node[part];
  }
  if (typeof node !== 'string') return key; // visible fallback: the key itself
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}
