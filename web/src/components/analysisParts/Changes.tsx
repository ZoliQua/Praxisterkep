// Elemző › Mi változott?: the archive's months held against each other, code by code.
import { MonthChanges, YearChanges } from '../ChangesSection';
import { Deferred } from '../Deferred';
import type { PartProps } from './types';

export default function Changes({ kind }: PartProps) {
  return (
    <>
      <YearChanges key={kind} kind={kind} />
      <Deferred ids={['valtozas-ho']}><MonthChanges key={kind} kind={kind} /></Deferred>
    </>
  );
}
