import React from 'react';
import { PageHeader, Card } from '../components/ui';

export default function Requests({ kind }: { kind: 'buy' | 'rent' }) {
  return (
    <>
      <PageHeader title={kind === 'buy' ? "Buy Requests" : "Rental Requests"} />
      <Card>Coming soon</Card>
    </>
  );
}
