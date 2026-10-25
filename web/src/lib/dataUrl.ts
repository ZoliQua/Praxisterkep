// Where a data file is fetched from. Each name carries its content hash
// (scripts/data-versions.mjs, filled in at build time), so the browser may
// keep it until the content changes: vercel.json marks /data/*?v= immutable.
// A name the build did not see (or a test without data) stays unversioned
// and is revalidated on every visit, as before.
declare const __DATA_VERSIONS__: Record<string, string> | undefined;

const versions: Record<string, string> =
  typeof __DATA_VERSIONS__ === 'undefined' ? {} : __DATA_VERSIONS__;

/** The URL of data/<path>, e.g. dataUrl('latest.json'). */
export function dataUrl(path: string): string {
  const v = versions[path];
  return `${import.meta.env.BASE_URL}data/${path}${v ? `?v=${v}` : ''}`;
}
