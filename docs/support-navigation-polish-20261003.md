# Support navigation polish — 3 October 2026

Scope: staging public UI only. No registration/payment commands, notification operations, mail actions, backend hooks or migrations changed.

- Mobile More includes Help & branch links with active-page indication, while preserving the account section and modal focus handling.
- Contact surfaces tickets, certificate verification, pricing and refund-policy shortcuts. Account requirements are stated before navigation; all official contact details remain unchanged.
- About and policy pages retain their full copy, add native section contents links, readable columns and explicit numbered list styling. Mobile uses a native disclosure that works without JavaScript.
- Catalog event names wrap fully; event fees and pricing rules remain unchanged. Policy links are directly actionable and secondary actions have 44px minimum targets.

Regression coverage: short-phone sheet scrolling and route dismissal/focus, self-service navigation, native policy anchors without JavaScript, numbered markers, desktop sticky contents, complete catalog titles and overflow at 320/390/768/1440px. Live acceptance uses only public reads. CI runs against disposable data and fake mail capture.
