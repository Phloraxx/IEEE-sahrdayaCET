// Per-route transition colour themes
// Updated: User requested grayscale / light blue for all pages currently.
export type TransitionConfig = {
  colors: [string, string, string, string, string];
  label: string;
};

// using the colors directly out of the provided Transition_Mobile.svg
// ['#ffffff', '#dce0ff', '#8da6fc', '#588bfa', '#2c5cb0']
const GLOBAL_PALETTE: [string, string, string, string, string] = [
  '#f8fafc', // almost white
  '#e2e8f0', // light grayscale
  '#dce0ff', // pale blue
  '#8da6fc', // soft blue
  '#588bfa', // primary light blue
];

export const ROUTE_TRANSITIONS: Record<string, TransitionConfig> = {
  '/': { label: 'home', colors: GLOBAL_PALETTE },
  '/events': { label: 'events', colors: GLOBAL_PALETTE },
  '/societies': { label: 'societies', colors: GLOBAL_PALETTE },
  '/full-execom': { label: 'execom', colors: GLOBAL_PALETTE },
  '/auth': { label: 'auth', colors: GLOBAL_PALETTE },
  '/setup-profile': { label: 'setup', colors: GLOBAL_PALETTE },
};

export const DEFAULT_TRANSITION: TransitionConfig = {
  label: 'default',
  colors: GLOBAL_PALETTE,
};

export function getTransitionConfig(pathname: string): TransitionConfig {
  if (ROUTE_TRANSITIONS[pathname]) return ROUTE_TRANSITIONS[pathname];
  for (const key of Object.keys(ROUTE_TRANSITIONS)) {
    if (key !== '/' && pathname.startsWith(key)) return ROUTE_TRANSITIONS[key];
  }
  return DEFAULT_TRANSITION;
}
