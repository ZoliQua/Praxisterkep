// "Adatok" — every file the site serves, with what it contains, how big it is
// and where it came from, so anyone can build on the same numbers. The list
// comes from the manifest the sync step writes, never from a hardcoded list,
// so the page cannot advertise a file that is not there.
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';

interface ManifestFile {
  path: string;
  bytes: number;
  modified: string;
  count?: number;
  from?: string;
  to?: string;
}

interface Manifest {
  generated: string;
  files: ManifestFile[];
}

const REPO = 'https://github.com/ZoliQua/OEP-Alapellatas';

/** the files we can describe; anything else is listed without a description */
const DESCRIBED = new Set([
  'latest.json', 'timeseries.json', 'history.json', 'months/', 'eeszt.json',
  'dental_extra.json', 'crosscheck.json', 'access.json', 'providers.json',
  'operating.json', 'kedvezmenyezett.json', 'counties.geojson', 'jaras.geojson',
  'cities.geojson', 'budapest.geojson', 'vedono.json', 'specialist.json',
  'risk.json', 'survival.json', 'coverage.json', 'composite.json', 'age.json',
  'settlements.geojson', 'emergency.json', 'workforce.json', 'clusters.json',
  'traveltime.json', 'transit.json',
]);

/** "access.json" -> "access_json", "months/" -> "months" (t() splits on dots) */
function keyOf(path: string): string {
  return path.replace(/\/$/, '').replace(/[./]/g, '_');
}

function size(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export function DataSection() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`${import.meta.env.BASE_URL}data/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => { if (alive) setManifest(m); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!manifest?.files?.length) return null;
  const base = `${window.location.origin}${import.meta.env.BASE_URL}data/`;

  return (
    <section className="section container" id="adatok">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('data.heading')}</h2>
      </div>
      <p className="section__explain">{t('data.explain')}</p>

      <div className="data-files">
        <table className="info-table data-files__table">
          <thead>
            <tr>
              <th>{t('data.thFile')}</th>
              <th>{t('data.thContent')}</th>
              <th className="is-num">{t('data.thSize')}</th>
              <th className="is-num">{t('data.thUpdated')}</th>
            </tr>
          </thead>
          <tbody>
            {manifest.files.map((f) => (
              <tr key={f.path}>
                <td>
                  {f.path.endsWith('/') ? (
                    <code>{f.path}</code>
                  ) : (
                    <a href={`${base}${f.path}`} download>
                      <code>{f.path}</code>
                    </a>
                  )}
                </td>
                <td>
                  {DESCRIBED.has(f.path) ? t(`data.file.${keyOf(f.path)}`) : t('data.fileOther')}
                  {f.count ? ` (${formatNumber(f.count)} ${t('data.months')}: ${f.from} – ${f.to})` : ''}
                </td>
                <td className="is-num">{size(f.bytes)}</td>
                <td className="is-num">{f.modified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section__subheading">{t('data.useHeading')}</h3>
      <ul className="info-list">
        <li>{t('data.use1')}</li>
        <li>{t('data.use2')}</li>
        <li>{t('data.use3')}</li>
      </ul>
      <pre className="embed-snippet"><code>{`curl -O ${base}latest.json`}</code></pre>

      <p className="extra-note">
        {t('data.sources')}{' '}
        <a href={`${REPO}/tree/main/data/raw`} target="_blank" rel="noopener">
          {t('data.rawArchive')}
        </a>
        {' · '}
        <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener">
          {t('data.changelog')}
        </a>
      </p>
    </section>
  );
}
