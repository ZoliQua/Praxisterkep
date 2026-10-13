// A count drawn as the things it counts.
//
// "11 on-call points" is a number; eleven shields, each one a town you can
// hover and open, is the county. The grid is not a chart — there is nothing
// to compare — it is an inventory, and its job is to make a small number
// feel like the places it stands for.
import { useState } from 'react';
import { t } from '../../lib/i18n';
import { IconAmbulance, IconOncall } from '../icons';
import type { EmergencyPoint } from '../../lib/counties';

const ICONS = { oncall: IconOncall, ambulance: IconAmbulance } as const;

export function PointGrid({ points, base }: {
  points: readonly EmergencyPoint[];
  /** where a settlement's own page lives */
  base: string;
}) {
  const [active, setActive] = useState<EmergencyPoint | null>(null);
  if (!points.length) return null;

  return (
    <div className="pointgrid" onPointerLeave={() => setActive(null)}>
      <div className="pointgrid__dots">
        {points.map((p, i) => {
          const Icon = ICONS[p.group] ?? IconOncall;
          const body = (
            <>
              <Icon />
              <span className={`pointgrid__name${p.settlement ? '' : ' is-unknown'}`}>
                {p.settlement || t('county.pointUnknownShort')}
              </span>
            </>
          );
          const className = `pointgrid__dot pointgrid__dot--${p.group}${
            active === p ? ' is-on' : ''}`;
          return p.slug ? (
            <a key={`${p.settlement}-${p.group}-${i}`} className={className}
              href={`${base}telepules/${p.slug}/`}
              onPointerEnter={() => setActive(p)} onFocus={() => setActive(p)}
              title={`${p.settlement} · ${t(`county.point.${p.group}`)}`}>
              {body}
            </a>
          ) : (
            <span key={`${p.settlement}-${p.group}-${i}`} className={className}
              onPointerEnter={() => setActive(p)}
              title={t(`county.point.${p.group}`)}>{body}</span>
          );
        })}
      </div>
      <p className="pointgrid__caption">
        {active
          ? <>
            <strong>{active.settlement || t('county.pointUnknown')}</strong>
            {' · '}{t(`county.point.${active.group}`)}
            {active.provider && <span className="pointgrid__provider">
              {' · '}{active.provider}</span>}
          </>
          : t('county.pointHint')}
      </p>
    </div>
  );
}
