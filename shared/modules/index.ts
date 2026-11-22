import type { ModuleDef } from '../registry';
import { MODULES as sales1 } from './sales1';
import { MODULES as sales2 } from './sales2';
import { MODULES as ops1 } from './ops1';
import { MODULES as ops2 } from './ops2';
import { MODULES as people } from './people';

import { MODULES as marketing } from './marketing';
import { MODULES as tools } from './tools';

export const MODULES: ModuleDef[] = [...sales1, ...sales2, ...ops1, ...ops2, ...people, ...marketing, ...tools];
