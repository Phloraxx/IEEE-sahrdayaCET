# Verification and event detail polish — 3 October 2026

Staging public UX scope only. No issuer records, template assets, certificate delivery, emails, notification/payment/registration commands or production changes.

Credential ID lookup: required input and copy guidance; pending state with duplicate-submit prevention; immediate, announced/focused feedback before explanatory content; normalized ID restored on Back/Forward; native GET works without JavaScript. Registry transport/HTTP failures preserve the ID, return 503 and report temporary unavailability rather than invalidity. Existing public projection and cache/security headers remain intact. Invalid QR references offer a link back to ID lookup. Shared record typography is readable and recipient names wrap.

Generic event details: mobile facts precede artwork; desktop retains title/artwork then facts. Full venues wrap without clamping, labels gain readable contrast, navigation has 44px targets and critical content remains visible before JavaScript. About receives a semantic heading. Event lifecycle, capacity, fees and registration/payment behavior are unchanged; SustainX's bespoke story is preserved.

Checks: focused browser regressions cover native verification, result focus/history/pending, invalid-reference recovery, four viewport widths, complete facts and no-JavaScript visibility. Loader unit tests cover all statuses and unavailable/503 behavior. Full clean-room CI is required; live acceptance uses only public reads and synthetic invalid IDs, never real-person lookups or mail actions.
