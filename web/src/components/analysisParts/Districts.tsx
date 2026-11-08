// Elemző › Járások és megyék: what a vacancy goes with — the deaths it may
// cost, and the circumstances that make a district hard to fill.
import { DistrictAnalysis } from '../DistrictAnalysis';
import { MortalitySection } from '../MortalitySection';
import { LivingSection } from '../LivingSection';
import { CensusSection } from '../CensusSection';
import { LinksSection } from '../LinksSection';
import { Deferred } from '../Deferred';

export default function Districts() {
  return (
    <>
      <DistrictAnalysis />
      <Deferred ids={['halalozas']}><MortalitySection /></Deferred>
      <Deferred ids={['jovedelem', 'allaskeresok', 'nepesseg']}><LivingSection /></Deferred>
      <Deferred ids={['nepszamlalas']}><CensusSection /></Deferred>
      <Deferred ids={['osszefuggesek']}><LinksSection /></Deferred>
    </>
  );
}
