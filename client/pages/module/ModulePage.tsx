import React from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Card, PageHeader } from '../../components/ui';
import { entityByKey, moduleByKey } from '../../../shared/registry';
import { canM } from '../../moduleUtil';
import ModuleTable from './ModuleTable';
import ModuleDashboard from './ModuleDashboard';
import ModuleReport from './ModuleReport';
import ModuleSettings from './ModuleSettings';
import CalendarPage from './CalendarPage';

export default function ModulePage() {
  const { module: mk = '', page: pk } = useParams();
  const { can } = useAuth();
  const mod = moduleByKey(mk);
  const notFound = <Card title="Not found">This page does not exist.</Card>;
  if (!mod) return notFound;
  if (!canM(can, mod.key, 'view')) return <Card title="Access denied">You do not have permission to view this page.</Card>;
  const page = pk ? mod.pages.find(p => p.key === pk) : mod.pages[0];
  if (!page) return notFound;

  switch (page.kind) {
    case 'dashboard': return <ModuleDashboard key={mod.key + page.key} moduleKey={mod.key} title={`${mod.label} - ${page.label}`} />;
    case 'table': {
      const ent = page.entity ? entityByKey(page.entity) : undefined;
      return ent ? <ModuleTable key={ent.key} moduleKey={mod.key} entity={ent} /> : notFound;
    }
    case 'report': return <ModuleReport key={mod.key + page.key} module={mod} title={`${mod.label} - ${page.label}`} />;
    case 'settings': return <ModuleSettings key={mod.key + page.key} module={mod} title={`${mod.label} - ${page.label}`} />;
    case 'calendar': return <CalendarPage key={mod.key + page.key} module={mod} title={`${mod.label} - ${page.label}`} />;
    case 'info': return <><PageHeader title={`${mod.label} - ${page.label}`} /><Card>{page.text ?? ''}</Card></>;
    default: return notFound;
  }
}
