// Elemző › Települések: the composite index, the cross-readings and the
// contiguous care deserts.
import { CompositeSection } from '../CompositeSection';
import { CrossSection } from '../CrossSection';
import { ClusterSection } from '../ClusterSection';
import { Deferred } from '../Deferred';

export default function Settlements() {
  return (
    <>
      <CompositeSection />
      <Deferred ids={['keresztmetszet']}><CrossSection /></Deferred>
      <Deferred ids={['hianyteruletek']}><ClusterSection /></Deferred>
    </>
  );
}
