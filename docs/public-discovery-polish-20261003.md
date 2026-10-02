# Staging public discovery polish

Scope: public Events, Blog and Execom usability. No backend, payments, notification delivery, email actions or production deployment. Staging MAIL_DELIVERY_MODE must remain disabled.

- Compact empty programme with a direct archive action and a full-width search/filter toolbar.
- Search every blog story, including featured content. Remove featured promotion during filtering; keep all topic options available, readable and reachable.
- Persist Blog and Execom search, topic/group and view in URL parameters. Query-only navigation reuses public data; explicit refresh and mutations retain normal revalidation.
- Improve directory labels, target sizes and wrapping; provide full-name mobile group selection and honest publication empty states.
- Use Radix for member profiles with inert background, focus containment, Escape and return to the opener.
- Keep page-specific branding, curated photo set, existing mobile navigation and identity.
- Render desktop navigation visibly in the server baseline; do not delay critical links behind an entrance animation.

Validation: lint, typecheck, unit tests, production build, full PR CI and read-only staging checks. Cover filtered result correctness, reload/Back, mobile group selection, profile focus/background isolation, empty states and overflow in grid/roster/index at 320/390/768/1024/1440. No registration submission, delivery, resend, OAuth or SMTP testing against staging.
