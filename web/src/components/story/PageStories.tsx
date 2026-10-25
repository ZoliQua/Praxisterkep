// One story per page, each fed by the data that page already loads (the same
// stores and cached loaders, so nothing is fetched twice). A story whose data
// has not arrived yet is not drawn; a story that cannot be built is left out
// rather than taking the page down with it.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { t } from '../../lib/i18n';
import { useContextStore } from '../../lib/context';
import { useAppStore, useSnapshot, useTimeseriesMonths } from '../../store/useAppStore';
import { useCounties } from '../../lib/counties';
import { useDistricts } from '../../lib/districts';
import { useSurvival } from '../../lib/analysis';
import { useOutcomes } from '../../lib/outcomes';
import { useEurope, type GroupKey } from '../../lib/europe';
import { useVedono } from '../../lib/vedono';
import { useSpecialist } from '../../lib/specialist';
import { usePharmacy } from '../../lib/pharmacy';
import { useGyse } from '../../lib/gyse';
import sources from '../../lib/sources.json';
import { Story, type Mascot, type Scene } from './Story';
import {
  analysisScenes, countyOverviewScenes, countyScenes, districtOverviewScenes, districtScenes,
  europeScenes, highlightsScenes, landingScenes, methodScenes, specialistScenes,
  type EuropeSummaryInput, type HighlightsInput, type SpecialistInput,
} from './stories';
import type { PraxisKind } from '../../types';
import { dataUrl } from '../../lib/dataUrl';

function safe(build: () => Scene[]): Scene[] {
  try {
    return build();
  } catch {
    return [];
  }
}

function Shown({ title, mascot, scenes }: { title: string; mascot: Mascot; scenes: Scene[] }) {
  if (!scenes.length) return null;
  return <Story title={title} mascot={mascot} scenes={scenes} />;
}

const mascotOf = (kind: PraxisKind): Mascot => (kind === 'gp' ? 'house' : 'tooth');

/** A small JSON file the page itself does not load. */
function useJson<T>(file: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(dataUrl(file))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: T | null) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [file]);
  return data;
}

/** The landing, after the lead: the monthly picture of the chosen branch. */
export function LandingStory(): ReactElement | null {
  const kind = useAppStore((s) => s.kind);
  const snapshot = useSnapshot();
  const months = useTimeseriesMonths();
  const mode = useContextStore((s) => s.dissolved);
  const scenes = useMemo(() => (snapshot ? safe(() => landingScenes({ kind, snapshot, months, mode })) : []),
    [kind, snapshot, months, mode]);
  return (
    <Shown key={`${kind}-${mode}`} mascot={mascotOf(kind)} scenes={scenes}
      title={t('story.landing.title', { label: t(`kinds.${kind}.label`) })} />
  );
}

/** Under "Amit eddig senki nem számolt ki": the same four facts as the cards. */
export function HighlightsStory({ data }: { data: HighlightsInput }): ReactElement | null {
  const eu = useJson<EuropeSummaryInput>('europe_summary.json');
  const scenes = useMemo(() => safe(() => highlightsScenes(data, eu)), [data, eu]);
  // wait for the European half, so the story does not change length mid-play
  if (!eu) return null;
  return (
    <Story mascot="house" scenes={scenes}
      title={t('story.highlights.title', { heading: t('highlights.heading') })} />
  );
}

/** megye.html: the chosen county, or the twenty side by side before one is chosen. */
export function CountyStory(): ReactElement | null {
  const data = useCounties();
  const county = useContextStore((s) => s.county);
  const kind = useContextStore((s) => s.kind);
  const mode = useContextStore((s) => s.dissolved);
  const snapshot = useSnapshot();
  const picked = county && data?.counties.some((c) => c.name === county) ? county : null;
  const scenes = useMemo(() => {
    if (picked && data) return safe(() => countyScenes(data, picked, kind, snapshot));
    return snapshot ? safe(() => countyOverviewScenes(snapshot, kind, mode)) : [];
  }, [picked, data, kind, snapshot, mode]);
  const title = picked ? t('story.area.title', { name: picked }) : t('story.countyOverview.title');
  return <Story key={`${picked ?? ''}-${kind}-${mode}`} title={title} mascot={mascotOf(kind)} scenes={scenes} />;
}

/** jaras.html: the chosen járás, or the 197 side by side before one is chosen. */
export function DistrictStory(): ReactElement | null {
  const data = useDistricts();
  const district = useContextStore((s) => s.district);
  const kind = useContextStore((s) => s.kind);
  const snapshot = useSnapshot();
  const picked = district && data?.districts.some((d) => d.name === district) ? district : null;
  const scenes = useMemo(() => {
    if (!data) return [];
    return safe(() => (picked ? districtScenes(data, picked, kind, snapshot) : districtOverviewScenes(data, kind)));
  }, [picked, data, kind, snapshot]);
  if (!data) return null;
  const title = picked ? t('story.area.title', { name: picked }) : t('story.districtOverview.title');
  return <Story key={`${picked ?? ''}-${kind}`} title={title} mascot={mascotOf(kind)} scenes={scenes} />;
}

/** elemzo.html: the headline findings of the analyses, for the chosen branch. */
export function AnalysisStory({ kind }: { kind: PraxisKind }): ReactElement | null {
  const survival = useSurvival();
  const outcomes = useOutcomes();
  const scenes = useMemo(() => (survival && outcomes
    ? safe(() => analysisScenes(kind, survival.kinds[kind] ?? null, outcomes)) : []), [kind, survival, outcomes]);
  return <Shown key={kind} title={t('story.analysis.title')} mascot={mascotOf(kind)} scenes={scenes} />;
}

/** europa.html: Hungary against the chosen group, for the chosen branch. */
export function EuropeStory({ kind, group }: { kind: PraxisKind; group: GroupKey }): ReactElement | null {
  const raw = useEurope();
  const scenes = useMemo(() => (raw ? safe(() => europeScenes(raw, kind, group)) : []), [raw, kind, group]);
  return <Shown key={`${kind}-${group}`} title={t('story.europe.title')} mascot={mascotOf(kind)} scenes={scenes} />;
}

/** szakellato.html: health visitors, specialist care, pharmacies and medical aids. */
export function SpecialistStory(): ReactElement | null {
  const vedono = useVedono();
  const specialist = useSpecialist();
  const pharmacy = usePharmacy();
  const gyse = useGyse();
  const scenes = useMemo(() => (vedono && specialist && pharmacy && gyse
    ? safe(() => specialistScenes({ vedono, specialist, pharmacy, gyse } as unknown as SpecialistInput)) : []),
  [vedono, specialist, pharmacy, gyse]);
  return <Shown title={t('story.specialist.title')} mascot="house" scenes={scenes} />;
}

/** modszertan.html: the data pipeline itself. */
export function MethodStory(): ReactElement | null {
  const latest = useAppStore((s) => s.latest);
  const timeseries = useAppStore((s) => s.timeseries);
  const kind = useAppStore((s) => s.kind);
  const pipeline = useJson<{ finished: string; steps: { status: string }[] }>('pipeline.json');
  const slugs = useJson<{ settlements: Record<string, unknown> | unknown[] }>('settlement_slugs.json');
  const scenes = useMemo(() => {
    if (!latest || !timeseries || !pipeline || !slugs) return [];
    const s = slugs.settlements;
    const pages = Array.isArray(s) ? s.length : s ? Object.keys(s).length : null;
    return safe(() => methodScenes({
      sources, timeseries: timeseries.kinds, latest: latest.kinds, month: latest.month, pipeline, settlementPages: pages,
    }));
  }, [latest, timeseries, pipeline, slugs]);
  return <Shown title={t('story.method.title')} mascot={mascotOf(kind)} scenes={scenes} />;
}
