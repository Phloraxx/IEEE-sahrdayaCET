---
name: Repository docs
description: Keep the IEEE Sahrdaya README, AGENTS.md and docs/ accurate when architecture, security, deployment or product behavior changes. Use when a change alters how the system runs, how it is deployed, what a role can do, or what a command does — and whenever asked to update the README or docs.
---

# Repository docs

Documentation is part of the change, not a follow-up. This skill is the map and
the checklist; the hard check is `scripts/audit/check-docs.mjs`.

## Live vs historical

**Live docs** describe the system as it is now. Update them in the same branch as
the change:

```text
README.md                     overview, stack, commands, CI/CD, release flow
AGENTS.md                     contributor/agent contract and boundaries
DESIGN.md                     visual and interaction contract
PRODUCT.md                    product scope and behavior
docs/architecture.md          runtime, ownership, storage, branch model
docs/security-architecture.md trust boundary, authz, audit, secrets
docs/deployment.md            environments, CI/CD, deploy, verify, backup
docs/release-checklist.md     the release runbook
.opencode/skill/*/SKILL.md    repeatable procedures
```

**Historical docs** (`docs/*2026*.md`, `docs/event-lifecycle/*`, dated audits and
implementation notes) are records. Do not rewrite them to match today. If a
decision changed, add a short dated note and link it; correcting history makes it
impossible to tell what was believed at the time.

## Process

1. Read `AGENTS.md` and the doc you will touch. Identify the fact that changed
   (runtime, command, permission, deployment lane, URL, version).
2. Find every place it is stated:

   ```bash
   rg -n "deploy/staging|DOCKPLOY_WEBHOOK_DEV|Vite 7|/api/health|BlogPosting|PocketBase" README.md AGENTS.md docs
   ```

3. Update the live doc that owns the fact. Link to it from README instead of
   repeating the details there.
4. If a repeatable procedure changed (deploy, audit, release, migration), update
   the matching skill, and its expected baseline numbers.
5. Run the checker and fix everything it reports:

   ```bash
   node scripts/audit/check-docs.mjs
   ```

6. Re-read the diff as a reader who has never seen the change. If a sentence only
   makes sense to the person who wrote the code, rewrite it.

## Facts that go stale most often

Check these with `rg` before declaring docs done:

- **Deployment lanes** — production: `dev → main` PR → CI → CD → Dokploy pulls
  `:production`. Staging: `./scripts/deploy-local.sh --staging` from the
  worktree. `dev` pushes run CI but deploy nothing. `deploy/staging`,
  `DOCKPLOY_WEBHOOK_DEV` and the staging GitHub environment are retired.
- **Image flow** — arm64 image per commit tree, `:production` moved by
  `docker buildx imagetools create`, rollback by repointing `deploy/production`.
- **Runtime** — one app server; SQLite is the only database; PocketBase is a
  rollback target and must not be described as serving API or auth.
- **Blog** — removed 2026-11-22. Do not document routes, admin screens, RSS,
  sitemap entries or JSON-LD for it. Historical rows still exist in the database.
- **Audit trail** — command routes, generic collection create/update/delete and
  image uploads all write `admin_audit_log` in the same transaction.
- **CI jobs** — `checks`, `smoke-backend` (dev PRs), `clean-room-backend`
  (main PRs/main), `container-builds`, `web-image`. The browser suite is local.
- **Versions** — read `package.json`; do not trust prose. Vite is 8.3,
  React Router 7.18, React 19, Bun 1.4.5 in CI.
- **Health and discovery** — `/healthz` exists; `/api/health` does not.
  Production serves `/sitemap.xml`; staging answers 404 and sends `noindex`.
- **Staging DB** — never open it from the host with `sqlite3`; it leaves WAL
  files owned by your user and breaks container writes.

## Style

- Present tense, active voice, concrete nouns: "CD pins the tested SHA", not
  "the tested SHA should be pinned".
- Prefer a command block or a small table over prose for procedures.
- Measured claims carry a date and the environment: "39 s on staging,
  2026-11-22". Do not present a benchmark as a guarantee.
- No marketing, no exclamation marks, no "simply"/"just".
- Link to the source of truth instead of duplicating a table that will drift.
- Never commit secrets, tokens, production backup locations, private keys or
  personal data. Example values are fine.

## When adding a doc

- Put dated design/implementation notes in `docs/` with a date suffix.
- Add it to any index that lists docs (`docs/event-lifecycle/README.md` for that
  series), and to the README only if it is a starting point for readers.
- Give it a `# Title`, a one-paragraph scope, and the commands to reproduce its
  claims.

## When adding or changing a skill

- Frontmatter must contain `name` and `description`; the description says when
  to use it, not what it contains.
- Put the procedure, expected output and safety rules in the body.
- Keep destructive steps explicit, with the exact cleanup command.
- `check-docs.mjs` validates the frontmatter and the links.
