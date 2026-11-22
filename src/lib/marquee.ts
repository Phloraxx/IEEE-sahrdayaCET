/**
 * Horizontal rail speed, in CSS pixels per second.
 *
 * The home page has two auto-scrolling rails: the past-events archive and the
 * execom carousel. They sit one after another, so a visitor reads them as one
 * motion; both therefore read this constant rather than carrying their own
 * numbers. Keep the value in px/s: both implementations scale by elapsed time,
 * so the speed is the same on a 60 Hz and a 120 Hz display.
 */
export const RAIL_PX_PER_SECOND = 33;
