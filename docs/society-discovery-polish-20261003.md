# Society discovery and profile usability

## Scope

Continue staging UI/UX improvements within the IEEE public register. No email, notification, payment, registration, backend hook or schema changes. Production is outside this release.

## Changes

- URL search and view state, including server-rendered defaults and Back/reload persistence.
- Honest subset counts, bounded status layout, labelled view controls and distinct unpublished/filtered empty states.
- Readable labels, complete community names and tablet list columns that do not squeeze names beside descriptions.
- Named network nodes with 44px targets; searched-out destinations disabled.
- Shared public-listing query-only revalidation behavior.
- Generic society profile metadata, wrapping titles, contact spacing and activity touch targets.
- Directory headline and rows visible before JavaScript loads.

## Validation

Lint, typecheck, unit/build gates, focused directory/profile browser tests and full PR CI. Repeat public read-only checks on deployed staging. Verify disabled mail delivery, unchanged protected record hashes and zero event counter drift. No staging registration, SMTP, mail, notification or delivery actions.
