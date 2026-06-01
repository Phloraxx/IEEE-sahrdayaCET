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

export const DEFAULT_TRANSITION: TransitionConfig = {
  label: 'default',
  colors: GLOBAL_PALETTE,
};

export function getTransitionConfig(_pathname: string): TransitionConfig {
  return DEFAULT_TRANSITION;
}
