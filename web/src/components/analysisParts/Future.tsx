// Elemző › Mi várható?: what may go vacant, how long vacancies last, how many
// will be vacant in a year — and whether paying a doctor to settle has filled
// districts so far.
import { RiskSection } from '../RiskSection';
import { SurvivalSection } from '../SurvivalSection';
import { ForecastSection } from '../ForecastSection';
import { GrantsSection } from '../GrantsSection';
import { Deferred } from '../Deferred';
import type { PartProps } from './types';

export default function Future({ kind }: PartProps) {
  return (
    <>
      <RiskSection kind={kind} />
      <Deferred ids={['tulel']}><SurvivalSection kind={kind} /></Deferred>
      <Deferred ids={['elorejelzes']}><ForecastSection key={kind} kind={kind} /></Deferred>
      <Deferred ids={['tamogatasok']}><GrantsSection /></Deferred>
    </>
  );
}
