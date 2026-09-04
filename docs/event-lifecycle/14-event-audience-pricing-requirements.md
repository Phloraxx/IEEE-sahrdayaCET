# Event Audience, Pricing, Requirements & Ticket Experience — Implementation Plan

**Status:** Approved planning baseline; implementation not started
**Target branch:** `dev` / staging first
**Production:** must remain untouched until an explicit release decision
**Planning baseline:** `410e84a87bbf89ab7bfd9665689e690cc2f15c38`
**Date:** 2026-09-04

## 1. Objective

Upgrade the event lifecycle so organizers can define who may attend, standardize attendee academic data, offer IEEE-member pricing, communicate event requirements clearly, and make the confirmed ticket the attendee's practical event hub.

This work must preserve the existing registration/payment invariants:

- registration is a server-side command, not direct collection CRUD;
- capacity, waitlist reservations, pricing, ticket state and payment state remain transactional;
- client-side controls are never treated as authorization or financial enforcement;
- published-event operational/finance changes continue to require workflow review;
- production mail remains disabled during staging work;
- no FIFA/decommission branch divergence is promoted to production as part of this project.

## 2. Product decisions locked for implementation

1. Semesters are canonical values `S1` through `S8`.
2. Year mapping is derived: S1-S2 = Year 1, S3-S4 = Year 2, S5-S6 = Year 3, S7-S8 = Year 4.
3. Event eligibility defaults to all semesters and all programmes.
4. Organizer UX selects years first, with optional per-semester advanced control.
5. Programme/branch is a dropdown for canonical Sahrdaya programmes, with an `Other / external programme` escape hatch.
6. Restricted events require a semester value; unrestricted events may retain the current optional behavior for non-student/external attendees.
7. IEEE-member pricing is a first-class event rule, not a hidden coupon.
8. IEEE-member and coupon discounts do **not** stack; the better discount wins. IEEE member pricing wins ties so coupon capacity is not consumed unnecessarily.
9. A membership discount requires `isIeeeMember = true` and a non-empty IEEE Membership ID. This is a claim/audit check unless a trusted IEEE verification source is introduced later.
10. Event requirements are structured event data, not text buried inside the event description.
11. Requirements are public; attendee WhatsApp/meeting links are private to confirmed attendees.
12. Ticket QR lookup must remain safe for public scanners and must never expose attendee-only links.
13. IEEE Sahrdaya social links are centralized once and reused by footer/metadata/ticket surfaces.

## 3. Current system baseline

The repository already provides useful building blocks:

- `events.collectIeeeMember` controls whether the registration form asks IEEE status and Membership ID.
- registration responses already store `branch`, `semester`, `isIeeeMember`, and `ieeeMembershipId` inside `formResponses`.
- reusable registration memory remembers those values between events.
- paid registration already records `baseFeePaise`, `discountPaise`, `finalFeePaise`, `couponCode`, and final amount.
- event coupons are server-side validated inside the registration transaction.
- `event_private_details` already stores attendee-only `virtualJoinUrl` and `joinInstructions`.
- confirmed attendees retrieve private access through `/api/app/events/{id}/join-details`.
- events already have `whatsappLink`, but it currently lives on the ordinary event record.
- the ticket lookup intentionally exposes only minimal non-PII state publicly.
- ticket email and ticket page already exist and can be extended without creating a second ticket system.

Current gaps:

- branch/department and semester are free-text in the attendee form;
- there is no server-enforced audience eligibility;
- IEEE membership does not affect price;
- requirements are not structured or surfaced consistently;
- attendee WhatsApp is stored on a public event record;
- ticket page does not surface requirements, attendee links, organizer contacts, or canonical socials.

## 4. Canonical academic model

### 4.1 Semester and year constants

Canonical semesters:

`S1`, `S2`, `S3`, `S4`, `S5`, `S6`, `S7`, `S8`

Derived mapping:

| Year | Semesters |
| --- | --- |
| First year | S1, S2 |
| Second year | S3, S4 |
| Third year | S5, S6 |
| Fourth year | S7, S8 |

Normalization rules must accept harmless legacy variations such as `s6`, `Semester 6`, `sem 6`, and normalize them to `S6` when loading saved memory/backfilling records. Unknown values are preserved in legacy JSON but are not treated as canonical.

### 4.2 Programme catalogue

Use programme/branch terminology for attendee data. Do not use the college's administrative department names as the only source because current admissions include programme variants.

Initial canonical options, based on the official Sahrdaya 2026 admissions listing:

| Code | Display name |
| --- | --- |
| `CSE` | Computer Science & Engineering |
| `CSE_AIML` | Computer Science & Engineering (AI & ML) |
| `CPS` | Cyber Physical Systems |
| `ECE` | Electronics & Communication Engineering |
| `EEE` | Electrical & Electronics Engineering |
| `ELECTRICAL_COMPUTER` | Electrical and Computer Engineering |
| `CE` | Civil Engineering |
| `BME` | Biomedical Engineering |
| `BT` | Biotechnology |
| `IBT` | Integrated Programme in Biotech Engineering |
| `IVLSI` | Integrated Programme in VLSI |
| `OTHER` | Other / external programme |

Legacy aliases should normalize when confidence is high, for example:

- `CS`, `Computer Science`, `CSE` -> `CSE`
- `EC`, `ECE` -> `ECE`
- `EEE`, `Triple E` -> `EEE`
- `BMB`, `Biomedical`, `Biomedical Engineering` -> `BME`
- `Biotech`, `Biotechnology` -> `BT`

Do not silently remap ambiguous historical values such as Mechanical, Robotics & Automation, AI & DS, or other programmes not present in the current admissions catalogue. They should remain legacy data and map to `OTHER` only when the attendee explicitly confirms it.

### 4.3 Single source of truth

Academic options must not drift between React and PocketBase.

Preferred implementation:

- add a repository-level canonical JSON definition for programme codes, labels, aliases, semesters, and year groups;
- import the JSON from the web app (`resolveJsonModule` is enabled);
- copy the shared definition into the PocketBase image and load it from the enforcement helper;
- add a clean-room test proving both runtimes see the same codes.

If PocketBase JSVM cannot safely load the shared JSON at runtime, generate the web/PocketBase constants from the canonical JSON in CI and fail if generated files drift. Do not hand-maintain two independent lists without a parity test.

Reference reviewed 2026-09-04: `https://sahrdaya.ac.in/` admissions programme listing.

## 5. Data model changes

### 5.1 `events`

Add backwards-compatible fields with safe defaults:

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `eligibleSemesters` | JSON array | `[]` | Empty means all semesters/no semester restriction |
| `eligibleProgrammes` | JSON array | `[]` | Empty means all programmes/no programme restriction |
| `ieeeMemberDiscountPercent` | number 0-100 | `0` | Zero disables member pricing |
| `requirements` | JSON array of strings | `[]` | Public attendee preparation checklist |
| `attendeeNote` | text/editor | empty | Optional public note such as reporting time |

Rules:

- arrays store canonical codes only;
- never store derived year values; year is presentation sugar over semester codes;
- changing eligibility is an operational change;
- changing member discount is a finance-sensitive change;
- requirements/attendee note are content/operational changes but do not alter existing registrations.

### 5.2 `event_private_details`

Add:

| Field | Type | Meaning |
| --- | --- | --- |
| `whatsappGroupUrl` | text/url | Confirmed-attendee group invite |

Migration behavior for existing `events.whatsappLink`:

1. copy non-empty legacy values into `event_private_details.whatsappGroupUrl` for the same event;
2. keep the old event field temporarily for rollback/backward compatibility;
3. stop returning or editing the old field in normal application code;
4. remove the legacy field only in a later cleanup migration after staging/prod data is verified.

`virtualJoinUrl` and `joinInstructions` remain restricted to online/hybrid events. `whatsappGroupUrl` is valid for onsite, online, or hybrid events.

### 5.3 `registrations`

Add canonical snapshots so reporting does not depend forever on arbitrary JSON:

| Field | Type | Meaning |
| --- | --- | --- |
| `programmeCode` | text/select | Canonical programme snapshot |
| `semester` | select/text | Canonical `S1`-`S8` snapshot |
| `ieeeMember` | bool | Membership claim used during registration |
| `ieeeMemberId` | text | Membership ID snapshot |
| `discountSource` | select | `none`, `ieee_member`, or `coupon` |

Keep the corresponding values in `formResponses` during the transition because existing exports, registration memory, and older records use them.

Backfill existing registrations only where normalization is unambiguous. Never destroy the original `formResponses` value.

## 6. Shared eligibility helper

Create one semantic eligibility helper used by registration, waitlist, manual-registration checks, and tests.

Input:

- event eligible semester codes;
- event eligible programme codes;
- attendee normalized semester;
- attendee normalized programme code.

Output should be structured, e.g.:

```text
{
  eligible: true/false,
  code: ELIGIBLE | SEMESTER_REQUIRED | SEMESTER_NOT_ALLOWED |
        PROGRAMME_REQUIRED | PROGRAMME_NOT_ALLOWED,
  message: human-readable explanation
}
```

Rules:

- `eligibleSemesters = []` means no semester restriction;
- `eligibleProgrammes = []` means no programme restriction;
- if a restriction exists, the corresponding attendee value is mandatory;
- `OTHER` can be eligible only if the organizer explicitly includes it or programme restriction is empty;
- no frontend-only eligibility decisions.

## 7. Pricing model and IEEE-member discount

### 7.1 One pricing function

Create a shared PocketBase pricing helper and make both preview and final registration use it. The browser must never independently decide the payable amount.

Inputs:

- event base fee;
- event IEEE-member discount percent;
- normalized membership claim + Membership ID;
- optional coupon code and resolved coupon;
- provider constraints.

Outputs:

```text
baseFeePaise
ieeeDiscountPaise
couponDiscountPaise
appliedDiscountPaise
finalFeePaise
discountSource
appliedCouponCode
```

Rules:

1. Base fee is always the event's server-side fee snapshot.
2. IEEE discount is eligible only when the event discount is > 0, attendee claims membership, and Membership ID is non-empty.
3. Coupon discount is computed using the existing coupon validity/expiry/usage rules.
4. Compare discounts; apply only the larger one.
5. On an exact tie, apply `ieee_member`, not the coupon.
6. If IEEE pricing wins, `couponCode` stored on the registration is empty and coupon usage is not consumed.
7. If coupon wins, preserve existing coupon reservation/counting behavior.
8. Persist `discountSource`, `discountPaise`, `finalFeePaise`, and final amount from the same calculation.

### 7.2 Preview endpoint

Introduce `POST /api/app/events/{id}/pricing-preview` for authenticated attendees.

Request may include membership claim/ID and optional coupon code. Response returns the full pricing breakdown plus an explanatory label such as `IEEE member price applied` or `Coupon SAVE20 applied`.

Keep `/coupon-preview` temporarily for compatibility, but migrate `RegisterPage` to the unified pricing preview. Final registration always recalculates inside its SQLite transaction.

### 7.3 Payment-provider constraints

Kotak/PayGate currently requires a whole-rupee final amount because the verification fingerprint uses the paise suffix.

Therefore the event editor must validate every enabled discount path for Kotak:

- regular fee;
- IEEE member fee;
- each active coupon fee.

If any final amount would contain paise, block save/finance submission with an actionable message. Razorpay may continue to support paise amounts.

Examples:

- ₹200 with 20% member discount -> ₹160: valid for Kotak.
- ₹199 with 20% member discount -> ₹159.20: invalid for Kotak; organizer must change fee/discount or use Razorpay.

### 7.4 Membership verification limitation

Phase 1 does not claim active IEEE membership verification. The system records the attendee's claim and Membership ID for audit.

UI copy must avoid wording such as `verified IEEE member` unless a trusted roster/API is introduced. Recommended language: `IEEE member price` and `Membership ID required`.

## 8. Event editor UX

Keep the existing five setup sections. Do not add another top-level navigation item unless the registration section becomes unusably dense.

### 8.1 Registration — `Who can attend?`

Add an audience card before attendee questions:

- default: `All years`;
- quick-select chips: First, Second, Third, Fourth year;
- selecting a year selects both mapped semesters;
- `Advanced semester selection` exposes S1-S8 toggles;
- default: `All programmes`;
- optional programme multi-select from canonical codes;
- summary text updates live, e.g. `Second & Third year · All programmes`.

Empty arrays mean unrestricted. Never serialize all eight semesters merely to represent `All years`.

### 8.2 Registration — standard attendee fields

Update the organizer preview so it clearly states:

- Programme / branch — dropdown;
- Semester — dropdown S1-S8;
- when eligibility is restricted, the relevant field becomes required automatically;
- IEEE Membership ID appears when member collection/pricing is enabled.

### 8.3 Registration — requirements

Add `Before you attend` below audience eligibility and above custom questions.

Organizer can add/remove/reorder short checklist items such as:

- Personal laptop required
- Bring laptop charger
- College ID card required
- Install VS Code beforehand
- GitHub account required

Store trimmed non-empty strings only. Suggested limit: 12 items, 200 characters each. Avoid a separate requirements collection.

Add an optional `Attendee note` text area for one general instruction such as `Report 15 minutes before the session`.

### 8.4 Fees & discounts

For paid internal events add an `IEEE member pricing` card:

- toggle `Give IEEE members a discount`;
- percentage input 1-100 when enabled;
- enabling it automatically enables `collectIeeeMember`;
- show regular fee and calculated member fee side-by-side;
- explain that coupons and member pricing do not stack and the better price is used;
- validate Kotak whole-rupee compatibility immediately.

Member-discount changes must be included in finance-sensitive impact detection so prior finance approval returns to review.

### 8.5 Communication

Replace the ordinary event-record WhatsApp editor with a private attendee communication card:

- Attendee WhatsApp group URL — valid for all attendance modes;
- Meeting/join URL — online/hybrid only;
- Joining instructions — online/hybrid only.

The existing `Public supporting link` remains public and can continue to appear on the event page.

### 8.6 Review screen

The final organizer review should summarize at least:

- regular fee / IEEE member fee;
- eligible years/semesters;
- eligible programmes;
- capacity/waitlist;
- number of requirements and attendee note presence;
- WhatsApp configured/not configured;
- online join details configured/not configured;
- organization + finance approval status.

## 9. Registration page UX

### 9.1 Academic fields

Replace free-text `Branch / Department` with `Programme / Branch` select.

Behavior:

- show canonical Sahrdaya programmes;
- include `Other / external programme`;
- when `OTHER` is selected, reveal a short free-text `Programme name` field for display/export only;
- normalize reusable memory when an old value maps confidently to a canonical code;
- never silently erase an unknown remembered value.

Replace semester text input with a select containing S1-S8.

If the event has semester restrictions, show the eligibility context near the control. If the selected semester is not allowed, block continuation before submission and explain why.

### 9.2 Eligibility presentation

Before attendee details, show a compact `Eligibility` summary when any restriction exists, for example:

`Open to S3-S6 students · CSE, CSE (AI & ML), ECE`

For unrestricted events, avoid noisy `all/all` copy unless useful on the public event page.

Frontend validation is only a convenience. Server registration and waitlist commands must re-evaluate eligibility.

### 9.3 Membership and price preview

When member pricing is enabled:

- show the regular price and member price before registration;
- toggling IEEE membership reveals Membership ID and triggers server pricing preview;
- Membership ID is required for member pricing;
- applying a coupon triggers the same unified preview endpoint;
- clearly identify which discount actually wins;
- the amount displayed immediately before submit must be the most recent server preview.

If preview becomes stale because membership/coupon values change, disable paid submission until the new preview completes or the coupon is cleared.

## 10. Server enforcement boundaries

Eligibility must be checked before any scarce or financial resource is consumed.

In `registration-create.pb.js`, order the new checks so an ineligible attendee never:

1. consumes capacity;
2. consumes/reserves a coupon;
3. creates a payment session;
4. creates a registration row;
5. receives a waitlist seat.

Recommended order after event/window validation and required-form normalization:

- normalize academic responses;
- evaluate event eligibility;
- reject ineligible attendee with a specific 400/409 application error;
- reconcile waitlist/capacity;
- calculate pricing/discount winner;
- enforce payment-provider constraints;
- persist registration + counters transactionally.

The duplicate-registration replay path must continue to run before registration-window/eligibility changes where appropriate, so a compatible retry can recover its already-committed response. Do not accidentally make a legitimate retry fail because the organizer changed eligibility after the first successful transaction.

## 11. Waitlist and manual registration

### 11.1 Waitlist

Joining the waitlist must use the same eligibility helper. An ineligible attendee cannot reserve future capacity.

If eligibility changes after somebody is already waiting/offered, do not silently delete historical rows during the initial rollout. Define reconciliation behavior explicitly before automating removals. Phase 1 recommendation: existing waiting/offered entries remain historical until organizer action, but new seat acceptance rechecks current eligibility.

### 11.2 Manual / walk-in registration

Admin manual registration should obey event eligibility by default.

If organizers genuinely need exceptions, add an explicit `Override audience eligibility` control gated by an appropriate event-management capability. The command must require a reason and write an audit entry. Do not make manual registrations an implicit bypass.

## 12. Public event page

Expose safe public fields needed before somebody decides to register:

- audience eligibility summary;
- requirements checklist;
- attendee note;
- regular fee;
- IEEE member fee/discount availability;
- existing public supporting link.

Never expose attendee WhatsApp group, private join URL, or joining instructions through public SSR, search metadata, PocketBase public event fields, or public ticket lookup.

## 13. Ticket and attendee hub

The existing ticket page remains the single event pass. Extend it rather than creating a separate confirmation page.

### 13.1 Public ticket lookup remains minimal

`GET /api/tickets/lookup` may continue to resolve a real ticket without authentication for QR/check-in use.

Safe additions to the public event snapshot are limited to information already suitable for the event page, such as requirements, attendee note, and public supporting link.

Do **not** add WhatsApp group, private meeting URL, joining instructions, attendee email/phone, or other private resources to the public lookup response.

### 13.2 Owner-only attendee resources

When the ticket owner is authenticated, the ticket page can use the event ID to call the existing confirmed-attendee private endpoint.

Extend `/api/app/events/{id}/join-details` to return:

```text
{
  whatsappGroupUrl,
  virtualJoinUrl,
  joinInstructions
}
```

For onsite events, return WhatsApp if configured while forcing `virtualJoinUrl` and `joinInstructions` empty. For online/hybrid events, return all configured attendee-only resources.

The endpoint must continue requiring a confirmed registration for the authenticated user.

### 13.3 Ticket page sections

Keep the existing event-pass/QR visual hierarchy, then add a practical section below it:

- `Before the event` — requirements checklist + attendee note;
- `Participant links` — WhatsApp, online join link, public supporting/resource link;
- `Need help?` — event contact email/phone when configured;
- `Stay connected` — IEEE Sahrdaya Instagram, LinkedIn, YouTube;
- existing Payment receipt, Add to calendar, and My Events actions.

If private attendee resources cannot load, the ticket and QR must still render. Show a small recoverable message rather than failing the whole ticket.

## 14. Ticket email / notification behavior

Ticket email should include a short requirements summary when requirements exist.

For private attendee links, prefer a CTA such as `Open your e-ticket for participant links` instead of embedding the raw WhatsApp/meeting URL in email. This keeps access behind the confirmed-attendee endpoint and allows links to be changed without invalidating old emails.

The email must continue to avoid exposing payment-recovery IDs as real ticket IDs.

## 15. Canonical social links

Create one canonical IEEE Sahrdaya social-link source used by:

- root organization schema / metadata;
- footer;
- ticket attendee hub;
- any future contact/social component.

Current repository references should be reconciled because Footer and root metadata use different Instagram/LinkedIn variants.

Initial branch-level links to verify and centralize:

- Instagram
- LinkedIn
- YouTube

Phase 1 should use branch-level socials only. Society-specific social overrides can be added later if there is a clear administrative owner and data source; do not block this project on a new society-social schema.

## 16. Admin operations, exports and reporting

Update registration/admin views to prefer canonical snapshot fields:

- programme display from `programmeCode`;
- semester from canonical registration `semester`;
- IEEE member claim + Membership ID;
- discount source + discount amount;
- coupon code only when coupon actually won pricing.

CSV export should add stable columns for programme code/display, semester, derived year, IEEE member, Membership ID, discount source, base fee, discount and final fee.

Keep legacy `formResponses.branch`/`formResponses.semester` fallback for old registrations until a later cleanup project.

Admin filters can be added after the data is canonical. They are useful but not required for the first schema/registration PR.

## 17. Event workflow / approval semantics

Update the event workflow helper's sensitive-field classification.

Operational-sensitive changes:

- `eligibleSemesters`
- `eligibleProgrammes`
- `requirements` when the event is already published
- attendee-private WhatsApp configuration if operational review should cover communication changes

Finance-sensitive changes:

- `ieeeMemberDiscountPercent`
- existing base fee/payment provider/coupon changes

Expected behavior:

- draft events can be edited normally;
- a published event cannot silently change eligibility or finance rules;
- organizer returns it to draft, saves the sensitive change, and re-enters the existing review flow;
- member pricing > 0 on a paid event requires finance approval exactly like other financial configuration.

Changing requirements alone should not rewrite or invalidate already-issued tickets. Tickets read current event requirements at view time, so organizers can correct preparation guidance after approval if policy allows it; decide this explicitly in implementation tests.

## 18. Migration and backward compatibility

The migration must be additive and safe for existing events/registrations.

### Existing events

- `eligibleSemesters = []` -> unrestricted;
- `eligibleProgrammes = []` -> unrestricted;
- `ieeeMemberDiscountPercent = 0` -> no pricing behavior change;
- `requirements = []`, `attendeeNote = ''`;
- copy legacy non-empty `events.whatsappLink` into private details without deleting the source field.

### Existing registrations

- preserve `formResponses` exactly;
- normalize/backfill canonical semester/programme only where unambiguous;
- set `discountSource = coupon` when an existing registration has a non-empty coupon and positive discount, otherwise `none`;
- do not reinterpret historical discounts as IEEE-member discounts.

### Rehearsal

Before staging deployment, run the migration against a copied production backup and verify SQLite integrity plus hashes/counts for unrelated application tables. No production volume is mounted into the rehearsal container.

## 19. Test matrix

### 19.1 Pure/unit tests

Academic normalization:

- S1-S8 accepted;
- lowercase/legacy semester strings normalize correctly;
- S9/unknown rejected as canonical;
- year grouping is exact;
- programme aliases normalize only when unambiguous;
- canonical web/PocketBase programme sets remain in parity.

Eligibility helper:

- unrestricted event accepts blank academic values;
- semester-restricted event requires semester;
- allowed semester accepted; disallowed rejected;
- programme-restricted event requires programme;
- `OTHER` behavior follows restriction rules;
- combined semester + programme restrictions require both.

Pricing helper:

- no discount;
- IEEE member discount;
- membership claim without Membership ID gets no member price / validation error;
- coupon wins;
- IEEE member price wins;
- equal discount chooses IEEE member source;
- 100% discount creates free confirmed registration;
- Kotak whole-rupee valid/invalid cases;
- Razorpay paise case remains valid.

### 19.2 Fresh PocketBase backend smoke

Characterize server command behavior, not source strings:

- eligible attendee registers successfully;
- ineligible semester rejected before capacity/payment/coupon mutation;
- ineligible programme rejected;
- restricted event with missing semester/programme rejected;
- unrestricted legacy-style attendee still registers;
- waitlist join and seat acceptance recheck eligibility;
- member discount snapshots correct fields;
- losing coupon does not consume coupon usage;
- winning coupon does consume usage;
- duplicate retry returns original committed pricing/ticket state;
- manual-registration override, if implemented, requires reason and audit entry;
- private WhatsApp endpoint denies non-attendee and pending attendee, permits confirmed owner.

### 19.3 Browser E2E

Add focused Playwright coverage for the real user flow:

1. organizer creates/edits an event with selected years/programmes, requirements and member discount;
2. registration page renders programme + semester selects and eligibility summary;
3. disallowed semester cannot continue;
4. member toggle + Membership ID updates server-derived price;
5. coupon/member precedence is displayed correctly;
6. free final price bypasses payment and produces a real ticket;
7. paid flow still routes to the correct payment provider;
8. confirmed ticket renders requirements;
9. authenticated ticket owner sees WhatsApp/private join resources;
10. unauthenticated/public ticket view does not contain private links;
11. ticket still renders if private-resource fetch fails;
12. social links point to the centralized canonical URLs.

Do not contact real Razorpay/Kotak/WhatsApp services in E2E. Reuse existing fake PayGate and local payment fixtures.

### 19.4 Regression gates

Every implementation PR must continue to pass:

- runtime syntax;
- ESLint;
- React Router typegen + TypeScript;
- full Vitest suite;
- production client + SSR build;
- fresh PocketBase backend invariants;
- 200-recipient certificate scale;
- Razorpay integration smoke;
- temporary Kotak PayGate smoke;
- Browser E2E;
- web + PocketBase container builds;
- `git diff --check`.

## 20. Phased PR execution plan

Keep changes reviewable. Do not implement this as one giant PR.

### PR A — Academic domain + schema foundation

- canonical programme/semester source;
- normalization/year helpers;
- additive event/registration/private-detail migration;
- legacy WhatsApp copy;
- production-backup migration rehearsal;
- schema + normalization tests.

**No registration behavior changes yet.**

### PR B — Eligibility enforcement + registration dropdowns

- event eligibility fields in admin editor;
- programme/semester dropdowns in registration;
- reusable-memory normalization;
- server eligibility helper;
- registration + waitlist enforcement;
- canonical registration snapshots;
- admin manual-registration default enforcement;
- unit/backend/browser eligibility tests.

**Acceptance:** an ineligible attendee cannot create registration, payment, coupon usage, waitlist reservation, or capacity consumption even through direct API calls.

### PR C — IEEE member pricing engine

- `ieeeMemberDiscountPercent` editor UI;
- unified server pricing helper;
- `pricing-preview` endpoint;
- RegisterPage pricing preview;
- discount-source snapshots;
- coupon/member better-price precedence;
- Kotak whole-rupee editor/server validation;
- finance-sensitive workflow classification;
- pricing/backend/payment E2E tests.

**Acceptance:** displayed preview, persisted registration amount, and provider charge/request amount are derived from the same server calculation.

### PR D — Requirements + public event presentation

- requirement-list editor;
- attendee note;
- event review summary;
- public event DTO/SSR fields;
- public event page eligibility/member-price/requirements presentation;
- ticket public event snapshot additions;
- tests for sanitization/limits/public visibility.

### PR E — Private attendee links + ticket hub

- private `whatsappGroupUrl` editor/storage;
- stop normal app writes/reads of public legacy `events.whatsappLink`;
- extend confirmed-attendee join-details response;
- ticket requirements/participant links/help/social sections;
- centralized branch social links and Footer/root reconciliation;
- notification email requirements summary + e-ticket CTA;
- privacy/browser tests.

### PR F — Admin reporting/export polish

- registration detail canonical academic display;
- CSV stable columns;
- discount-source display;
- optional programme/semester filters if valuable;
- legacy fallback characterization.

## 21. Staging rollout and acceptance

Each merged PR follows the normal immutable staging gate:

1. PR head CI fully green on the exact SHA.
2. Merge with expected-head guard.
3. Post-merge `dev` CI green on the exact merge SHA.
4. CD pins `deploy/staging` to that exact SHA.
5. Dokploy checkout matches the pin.
6. staging web + PocketBase are healthy.
7. `/healthz` and `/api/health` return 200.
8. existing staging `/FIFA` remains 404.
9. production refs/checkouts remain unchanged.
10. production PocketBase remains healthy and `MAIL_DELIVERY_MODE=disabled`.

For schema PRs, additionally confirm migration IDs and field/index presence from a consistent SQLite snapshot including WAL state when applicable.

## 22. End-to-end staging scenario

Before this work is considered complete, exercise one realistic event from start to finish on staging:

- create a paid internal event;
- allow only Year 2 + Year 3;
- allow selected programmes;
- require a personal laptop and college ID;
- set regular fee and IEEE-member discount;
- configure a coupon whose discount is lower than member pricing;
- configure attendee WhatsApp group;
- publish through organization + finance approval;
- register an eligible non-member and verify normal price;
- register an eligible IEEE member and verify member price;
- attempt an ineligible semester and confirm rejection;
- attempt an ineligible programme and confirm rejection;
- verify payment/free transition according to final amount;
- open confirmed ticket and verify requirements/socials/private resources;
- confirm public/anonymous ticket lookup cannot see WhatsApp/private join details;
- verify admin operations/CSV contain canonical academic and discount snapshots.

No real email or production payment should be sent during this acceptance.

## 23. Non-goals for this implementation

Do not expand scope into:

- active IEEE membership verification against IEEE systems unless a trusted API/data source is separately approved;
- a generic rule engine for arbitrary attendee eligibility;
- per-requirement completion tracking;
- a new notification provider;
- automatic WhatsApp messaging;
- society-specific social-link administration unless required by an actual event owner;
- deletion of legacy registration response fields before all exports/admin views have migrated;
- production promotion of unrelated staging-only FIFA decommission changes.

## 24. Risks and safeguards

### Pricing drift

**Risk:** browser preview and registration charge disagree.
**Safeguard:** one server pricing helper; final transaction always recalculates.

### Eligibility bypass

**Risk:** attendee calls registration API directly.
**Safeguard:** eligibility enforced in registration/waitlist commands before capacity/payment mutation.

### Legacy academic data

**Risk:** old free-text values are misclassified.
**Safeguard:** normalize only high-confidence aliases; preserve originals; use `OTHER` only on explicit confirmation.

### Private-link leakage

**Risk:** WhatsApp or meeting URL becomes visible through public ticket/event lookup.
**Safeguard:** keep these in `event_private_details`; owner endpoint requires confirmed registration.

### Existing-event behavior change

**Risk:** migration unexpectedly blocks old events.
**Safeguard:** empty eligibility arrays mean unrestricted; zero member discount preserves current pricing.

### Kotak fractional pricing

**Risk:** a percentage discount produces a paise amount incompatible with temporary PayGate.
**Safeguard:** validate all discount paths in editor and again server-side.

## 25. Definition of done

This project is complete only when all of the following are true:

- [ ] Event editor supports year/semester eligibility.
- [ ] Event editor supports programme eligibility.
- [ ] Registration uses canonical programme and semester controls.
- [ ] Eligibility is enforced server-side for registration and waitlist.
- [ ] Existing unrestricted events behave exactly as before.
- [ ] IEEE-member discount is configured per event and uses Membership ID claim.
- [ ] Coupon/member discounts do not stack; better price wins consistently.
- [ ] Pricing preview and final transaction use one server calculation.
- [ ] Kotak invalid fractional outcomes are blocked before payment creation.
- [ ] Requirements and attendee note appear before registration and on ticket.
- [ ] WhatsApp group is private to confirmed attendees.
- [ ] Public ticket lookup contains no attendee-only links or PII expansion.
- [ ] Ticket owner sees attendee links without weakening QR/check-in behavior.
- [ ] IEEE Sahrdaya social URLs come from one canonical source.
- [ ] Ticket email reflects requirements and links back to private attendee resources safely.
- [ ] Admin registration detail and CSV use canonical academic snapshots.
- [ ] Migration rehearsal passes against copied production backup.
- [ ] Fresh PocketBase, payment rails, Browser E2E and container builds pass.
- [ ] Full staging lifecycle scenario passes.
- [ ] Production remains unchanged until separately authorized.

## 26. Likely implementation touchpoints

This list is directional; characterize before editing and avoid unrelated cleanup inside feature PRs.

Frontend / shared:

- `src/features/admin/events/event-form.tsx`
- `src/features/register/RegisterPage.tsx`
- `src/features/ticket/TicketPage.tsx`
- `src/routes/events.$slug.tsx`
- `src/lib/data/public-client.ts`
- `src/server/public/events.server.ts`
- `src/lib/registration-memory.ts`
- `src/lib/csv-export.ts`
- canonical academic/social helper files to be added

PocketBase:

- additive migration under `pb_migrations/`
- `pb_hooks/registration-create.pb.js`
- `pb_hooks/registration-helpers.js`
- `pb_hooks/attendee-lifecycle*.js`
- `pb_hooks/event-private-details*.js`
- `pb_hooks/registrations.pb.js` ticket lookup
- `pb_hooks/notification-helpers.js`
- event workflow/sensitive-field helper(s)
- pricing/academic helper module(s) to be added

## 27. Implementation start sequence

When implementation begins, start with PR A only.

Before writing the migration:

1. snapshot current `dev` and confirm no concurrent event-schema PR is open;
2. inspect latest events/registrations/private-details schemas rather than relying only on this document;
3. characterize current production-backup values for `formResponses.branch`, `formResponses.semester`, IEEE membership fields, and legacy `whatsappLink`;
4. finalize canonical aliases using actual stored values, not guesses;
5. write pure normalization tests first;
6. write the additive migration and clean-room schema assertions;
7. rehearse against a copied production backup;
8. merge/deploy PR A only after exact-head and post-merge CI are green.

Then proceed through PR B-F in order unless an executable test reveals that two phases must be rearranged.

## 28. Decision log

Decisions intentionally made now to avoid re-litigating them during implementation:

- **Year mapping:** S1/S2, S3/S4, S5/S6, S7/S8.
- **Eligibility representation:** canonical semester/programme code arrays; empty means unrestricted.
- **Programme terminology:** academic programme/branch, not only administrative department.
- **External programmes:** explicit `OTHER` escape hatch; no forced incorrect mapping.
- **Member verification:** claim + Membership ID in Phase 1, not presented as externally verified.
- **Discount precedence:** no stacking; best discount wins; IEEE wins ties.
- **Pricing authority:** server only; preview and final registration share calculation semantics.
- **Requirements:** public structured checklist + optional attendee note.
- **WhatsApp:** private confirmed-attendee resource, not public event/ticket lookup data.
- **Socials:** centralized IEEE Sahrdaya links in Phase 1; society overrides deferred.
- **Ticket:** extend the existing e-ticket into an attendee hub; do not create a parallel confirmation product.
- **Rollout:** staging first, production only through a separately authorized release.

---

This document is the execution baseline for the feature. If implementation discovers a necessary product change, update this decision log in the same PR that introduces that change, with the reason and corresponding tests.
