# Desktop article contents follow-up

Live visual review exposed two sticky constraints: an outer horizontal-overflow-hidden wrapper became a vertical scroll container, and the inner sticky element was bounded by an equal-height aside. Use overflow-x:clip for decorative containment and position the aside itself as sticky. A viewport-bounded scroll area keeps long contents usable. This also restores the existing metadata sidebar's sticky behavior.

Regression: desktop contents remain at the 112px navigation offset after following the first section; all mobile/native reading, overflow and menu checks remain required. No stored content or backend runtime changes.
