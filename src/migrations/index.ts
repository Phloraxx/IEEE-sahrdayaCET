import * as migration_20260604_103004 from './20260604_103004';
import * as migration_20260604_132617 from './20260604_132617';

export const migrations = [
  {
    up: migration_20260604_103004.up,
    down: migration_20260604_103004.down,
    name: '20260604_103004',
  },
  {
    up: migration_20260604_132617.up,
    down: migration_20260604_132617.down,
    name: '20260604_132617'
  },
];
