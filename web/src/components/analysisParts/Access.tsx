// Elemző › Elérhetőség: on-call care, the GP, the hospital and the emergency
// department — as the crow flies, by car and by bus.
import { EmergencySection } from '../EmergencySection';
import { AccessSection } from '../AccessSection';
import { TravelTimeSection } from '../TravelTimeSection';
import { SboSection } from '../SboSection';
import { TransitSection } from '../TransitSection';
import { Deferred } from '../Deferred';
import type { PartProps } from './types';

export default function Access({ kind }: PartProps) {
  return (
    <>
      <EmergencySection kind={kind} />
      <Deferred ids={['tavolsag']}><AccessSection /></Deferred>
      <Deferred ids={['menetido']}><TravelTimeSection /></Deferred>
      <Deferred ids={['surgosseg']}><SboSection /></Deferred>
      <Deferred ids={['busz']}><TransitSection /></Deferred>
    </>
  );
}
