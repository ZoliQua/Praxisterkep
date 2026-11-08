// Elemző › Országos kép: how vacancy developed, and the two branches side by side.
import { StatsSection } from '../StatsSection';
import { VersusSection } from '../VersusSection';
import { CoverageSection } from '../CoverageSection';
import { Deferred } from '../Deferred';
import type { PartProps } from './types';

export default function National({ kind }: PartProps) {
  return (
    <>
      <StatsSection />
      <Deferred ids={['osszevetes']}><VersusSection /></Deferred>
      <Deferred ids={['lefedettseg']}><CoverageSection kind={kind} /></Deferred>
    </>
  );
}
