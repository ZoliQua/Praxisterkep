import hu from '../i18n/hu.json';

type Dict = { [key: string]: string | string[] | Dict };

const dict: Dict = hu as unknown as Dict;

/** Look up a dot-separated key in the active locale (hu only in MVP). */
/** t() with the active kind's adjective/noun pre-filled ({kind}, {doctor}). */
export function tKind(key: string, kind: string, params?: Record<string, string | number>): string {
  return t(key, {
    kind: t(`kinds.${kind}.adj`),
    doctor: t(`kinds.${kind}.doctor`),
    ...params,
  });
}

export function t(key: string, params?: Record<string, string | number>): string {
  let node: string | string[] | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === undefined) break;
    node = Array.isArray(node) ? node[Number(part)] : node[part];
  }
  if (typeof node !== 'string') return key; // visible fallback: the key itself
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}
