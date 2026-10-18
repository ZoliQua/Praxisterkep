// "Egészség és életkörülmények" on the járás page: the outcome analyses
// turned to one járás.
//
// Each card is one measure, with the járás's value, the rural median and its
// county beside it, and a strip of all 174 rural járás so the reader sees how
// far into the tail it sits. Under the cards: what its avoidable mortality is
// made of, its mortality by cause against the national rate (100), and two
// lines over time — jobseekers and income as a share of the median járás.
//
// A kerület has its own deaths and its own jobseekers, but KSH publishes the
// capital's income and population balances as one place; those cards say so
// rather than pass the capital's number off as the kerület's.
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, huArticle } from '../lib/format';
import {
  metaOf, ruralMedian, useOutcomes, valueOf, type OutcomeDistrict, type OutcomesRaw,
} from '../lib/outcomes';
import { StripYardstick } from './charts/StripYardstick';
import { TrendLines } from './charts/TrendLines';
import { AvoidableBar } from './AvoidableBar';
import { CrossSection } from './CrossSection';

const CARDS = ['avoidable', 'amenable', 'allCause', 'income', 'jobseekers',
  'naturalChange', 'migration', 'gpLoad', 'degree', 'employed', 'noDigital', 'poorHousing',
  'elderlyOnly', 'sboMinutes', 'gpRateIn12'] as const;
const CAUSES = ['all', 'circulatory', 'ischaemicHeart', 'cerebrovascular', 'cancer',
  'respiratory', 'chronicRespiratory', 'digestive', 'external', 'mental'];

/** 1 = the worst of the 174, counted in the direction the measure is bad. */
function worseRank(o: OutcomesRaw, key: string, value: number): { rank: number; of: number } {
  const meta = metaOf(key);
  const vals = o.districts.filter((r) => !r.capital).map((r) => valueOf(r, key))
    .filter((v): v is number => v !== null);
  const worse = vals.filter((v) => (meta.direction === 'higherWorse' ? v > value : v < value)).length;
  return { rank: worse + 1, of: vals.length };
}

function Card({ o, d, k }: { o: OutcomesRaw; d: OutcomeDistrict; k: (typeof CARDS)[number] }) {
  const meta = metaOf(k);
  const value = valueOf(d, k);
  const median = ruralMedian(o.districts, k);
  const county = o.counties.find((c) => c.name === d.county);
  const countyValue = county ? (county as unknown as Record<string, number | null>)[k] ?? null : null;
  const vals = o.districts.filter((r) => !r.capital).map((r) => valueOf(r, k))
    .filter((v): v is number => v !== null);
  const capitalWide = d.capital && meta.capitalWide;
  const rank = value !== null && !d.capital ? worseRank(o, k, value) : null;
  const tone = rank ? (rank.rank <= rank.of / 4 ? ' is-bad' : rank.rank > (3 * rank.of) / 4 ? ' is-good' : '') : '';
  return (
    <article className={`yard-card${tone}`}>
      <h3>{t(`outcomes.measure.${k}`)}</h3>
      <div className="yard-card__value">
        {value === null ? '–' : meta.format(value)}
        {capitalWide && <small>{t('outcomes.district.capitalWide')}</small>}
      </div>
      <StripYardstick values={vals} value={value} median={median}
        higherWorse={meta.direction === 'higherWorse'} mid={meta.mid} />
      <p className="yard-card__compare">
        {median !== null && <span>{t('outcomes.district.median')}: <b>{meta.format(median)}</b></span>}
        {countyValue !== null && countyValue !== undefined && (
          <span>{d.county}: <b>{meta.format(countyValue)}</b></span>
        )}
      </p>
      {rank && (
        <p className="yard-card__rank">{t('outcomes.district.rank', {
          article: huArticle(rank.rank), rank: rank.rank, of: rank.of,
        })}</p>
      )}
    </article>
  );
}

/** Mortality by cause, SHH: 100 is what the national rates predict. */
function CauseBars({ d }: { d: OutcomeDistrict }) {
  const vals = CAUSES.map((c) => ({ c, v: d.shh[c] ?? null }));
  const max = Math.max(160, ...vals.map((x) => x.v ?? 0));
  return (
    <div className="cause-bars">
      {vals.map(({ c, v }) => (
        <div key={c} className="cause-bars__row">
          <span className="cause-bars__label">{t(`outcomes.cause.${c}`)}</span>
          <span className="cause-bars__track">
            <i className="cause-bars__hundred" style={{ left: `${(100 / max) * 100}%` }} />
            {v !== null && (
              <i className={`cause-bars__bar${v > 100 ? ' is-over' : ' is-under'}`}
                style={{ width: `${(v / max) * 100}%` }} />
            )}
          </span>
          <b>{v === null ? '–' : formatNumber(Math.round(v))}</b>
        </div>
      ))}
      <p className="outcome__hint">{t('outcomes.district.shhNote')}</p>
    </div>
  );
}

export function DistrictOutcomes({ name }: { name: string }) {
  const o = useOutcomes();
  if (!o) return null;
  const d = o.districts.find((r) => r.name === name);
  if (!d) return null;
  const by = o.series.byDistrict;
  const timeaKey = d.capital ? 'Budapest' : d.name;
  const jobs = by.jobseekers[d.name];
  const income = by.incomeIndex[timeaKey];

  return (
    <>
      <h2 className="section__subheading" id="egeszseg">{t('outcomes.district.heading')}</h2>
      <p className="section__explain">{t('outcomes.district.explain', {
        year: o.sources.mortality.year,
      })}</p>
      <div className="yard-grid">
        {CARDS.map((k) => <Card key={k} o={o} d={d} k={k} />)}
      </div>
      <p className="outcome__hint">{t('outcomes.district.stripNote')}</p>

      <div className="outcome__pair">
        <div>
          <h3 className="outcome__sub">{t('outcomes.district.avoidHeading')}</h3>
          <AvoidableBar rows={o.districts} row={d} />
          <p className="section__explain">{t('outcomes.district.avoidExplain')}</p>
        </div>
        <div>
          <h3 className="outcome__sub">{t('outcomes.district.causeHeading')}</h3>
          <CauseBars d={d} />
        </div>
      </div>

      <div className="outcome__pair">
        {jobs && (
          <div>
            <h3 className="outcome__sub">{t('outcomes.district.jobsHeading')}</h3>
            <TrendLines labels={o.series.jobseekers.months}
              series={[{ key: d.name, label: d.name, values: jobs }]}
              reference={{ key: 'hu', label: t('outcomes.national'), values: o.series.jobseekers.national }}
              focus={d.name} format={(v) => `${formatDecimal(v.toFixed(1))}%`} />
          </div>
        )}
        {income && (
          <div>
            <h3 className="outcome__sub">{t('outcomes.district.incomeHeading')}</h3>
            <TrendLines labels={by.incomeYears}
              series={[{ key: timeaKey, label: d.capital ? t('outcomes.district.capital') : d.name,
                values: income }]}
              reference={{ key: 'median', label: t('outcomes.medianDistrict'),
                values: by.incomeYears.map(() => 100) }}
              focus={timeaKey} format={(v) => `${Math.round(v)}%`} minSpan={40} />
          </div>
        )}
      </div>
      <DistrictGrants o={o} name={d.name} />
      <CrossSection area={{ level: 'district', name: d.name }} />
      <p className="section__source">{t('outcomes.district.source')}</p>
    </>
  );
}

/** The grants taken up in this járás: where, when, and what became of them. */
function DistrictGrants({ o, name }: { o: OutcomesRaw; name: string }) {
  const rows = (['gp', 'dental'] as const).flatMap((kind) => o.grants.kinds[kind].winners
    .filter((w) => w.district === name).map((w) => ({ ...w, kind })))
    .sort((a, b) => b.year - a.year);
  if (!rows.length) return null;
  return (
    <div className="district-grants">
      <h3 className="outcome__sub">{t('outcomes.district.grantsHeading', { n: rows.length })}</h3>
      <ul className="tp-grants">
        {rows.map((w, i) => (
          <li key={i} className={`is-${w.status ?? 'unknown'}`}>
            <b>{w.year}</b> · {w.settlement} · {t(`outcomes.settlement.grants.${w.kind}.${w.programme}`)}
            <span>{w.contract ? t(`outcomes.settlement.grants.status.${w.status ?? 'unknown'}`)
              : t('outcomes.settlement.grants.noContract')}</span>
          </li>
        ))}
      </ul>
      <p className="outcome__hint"><a href="elemzo.html#tamogatasok">{t('outcomes.district.grantsLink')}</a></p>
    </div>
  );
}
