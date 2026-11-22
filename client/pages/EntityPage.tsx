import React from 'react';
import { PageHeader, Card } from '../components/ui';

export default function EntityPage({ entity }: { entity: 'owners' | 'staff' | 'agents' | 'brokers' | 'clients' }) {
  return (
    <>
      <PageHeader title={entity} />
      <Card>Coming soon</Card>
    </>
  );
}
