# Article and society reading pass

Scope: native mobile/tablet article contents, readable metadata, wrapping text, reliable archive/back-to-top navigation; generic society About shortcut, two-column semantic facts and wrapping headings. Existing page registers and public records are preserved.

No backend hooks, migrations, payment/registration commands, notifications or mail actions are changed. Staging mail remains disabled. WIE remains on its bespoke route.

Validation: responsive public browser checks at 320/390/768/1440px; native contents and anchors with JavaScript disabled; existing blog/society discovery tests; lint/typecheck/build; exact-head full CI, canonical staging deployment, live public checks and protected-table audit.

An unavailable recommendations list must not block a successfully loaded article. Primary article errors and missing-record 404 responses are preserved. Disposable CI gains two published stories, including native section anchors and long inline references/preformatted code; real staging content is never seeded or edited.
