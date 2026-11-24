# SQLite schema migrations

How the application database is brought to the schema the running build expects,
what it refuses to touch, and what an operator does when it refuses.

`sqlite/schema.sql` is still the only schema source of truth. This page covers
the layer around it: `src/lib/db-migrate.server.ts`, reached through
`src/lib/db.server.ts`.

## Production storage is never invented

`new Database(path)` creates the file *and* its parent directory. That makes a
missing bind mount look like a working empty portal, so with
`DEPLOY_ENV=production` the app refuses to open storage it did not find populated:

| `SQLITE_PATH` | Result |
| --- | --- |
| `:memory:` | refuse `DB_STORAGE_INVALID` (`in_memory`) |
| Nothing at the path | refuse `DB_STORAGE_INVALID` (`missing`); no directory is created |
| A zero-byte file | refuse `DB_STORAGE_INVALID` (`empty`) |
| A file that is not a SQLite database, or has no tables | refuse `DB_STORAGE_INVALID` (`unrecognised`) |
| A SQLite file this build does not recognise | refuse `DB_SHAPE_INVALID` / `DB_UNRECOGNISED` |
| A populated v2 database | opens; a missing version marker is stamped (see below) |

The guard runs before any connection pragma, so a wrong file keeps its
`journal_mode`, its `synchronous` level and its bytes. The probe connection is
always closed. The file is then opened with `fileMustExist`, so a path that
changes between the check and the open is an error, not a new empty database.

Staging, local development and tests are unchanged: they create the directory and
the file, which is what the staging reset and the synthetic suites rely on.

### Provisioning a new database is a separate action

An empty production database is only ever created deliberately:

```bash
# Dry run: says what it would do.
SQLITE_PATH=/srv/ieee/data/portal.db npx tsx scripts/init-database.ts

# Create it.
SQLITE_PATH=/srv/ieee/data/portal.db npx tsx scripts/init-database.ts --apply
```

The script requires the parent directory to exist (a missing directory is a
missing mount), refuses anything already at the path that is not an empty file,
and refuses `:memory:`. It creates an **empty** database. If the path should hold
data, use `scripts/restore-backup.ts` or the PocketBase cutover instead.

## What happens at boot

The first database call opens the file and, before any statement from a
repository can run, `migrateSchema()` classifies it from `PRAGMA user_version`
and `sqlite_master` alone — no writes until the plan is decided:

| File | Plan |
| --- | --- |
| No tables (or only unrelated ones) | **create**: apply `schema.sql`, stamp the version |
| `user_version = 1`, exactly the v1 shape | **upgrade**: `v1 → v2` in one transaction |
| `user_version = 1`, not the v1 shape | refuse `DB_SHAPE_INVALID` |
| `user_version = 2`, exactly the v2 shape | **none**: already current |
| `user_version = 2`, not the v2 shape | refuse `DB_SHAPE_INVALID` |
| `user_version = 0`, exactly the v1 shape | **review**: upgrade, then stamp |
| `user_version = 0`, already the v2 shape | **review**: stamp only (rows untouched) |
| `user_version = 0`, this app's tables but neither shape | refuse `DB_UNRECOGNISED` |
| `user_version > 2` | refuse `DB_NEWER_THAN_BUILD` |
| Any other file with tables of its own | refuse `DB_UNRECOGNISED` |

Each step runs as `BEGIN IMMEDIATE … COMMIT` with `PRAGMA foreign_keys = OFF`
around it, `PRAGMA foreign_key_check` before the commit, and a row count compared
before any table is dropped. A failure rolls back and leaves `user_version`
exactly where it was, so the next boot reaches the same conclusion.

Every refusal is a `SchemaMigrationError` with a `code`. The process must not
serve requests against a database it cannot prove it understands, so a refusal is
a startup failure.

## Adding a schema version

1. Add the object to `sqlite/schema.sql`. Purely additive changes (a new table, a
   new index, a new nullable column on a **new** table) need nothing else: the
   file is `CREATE IF NOT EXISTS`, so a current database is left alone.
2. A change to an existing table — a type, a nullability, a CHECK — needs a
   forward step in `src/lib/db-migrate.server.ts`: a rebuild written once,
   copying every row and comparing counts, run inside `inStep()`.
3. Bump `SCHEMA_VERSION` there, add the new shape's markers to `SHAPE_MARKERS`,
   and make the step's target table's indexes part of the marker entry.
4. Extend `tests/fixtures/schema-shapes.mjs` and run
   `bun run test:integration`. `tests/integration-migrate-schema.mjs` proves the
   round trip on synthetic data; CI runs it only if it is wired into
   `test:integration` (see the note at the end of this page).

## What the migration does not do

- It never deletes, truncates or recreates a database. A database it does not
  understand is named in the error and left alone.
- It does not read `pb_migrations/`. PocketBase's history is frozen.
- It does not replace the cutover script. `scripts/migrate-pb-to-sqlite.ts`
  still builds a fresh database from a `pb_data` directory; this layer only moves
  a database that already exists from one version to the next.

## Operator procedures

**Inspect a database without changing it.** `inspectDatabaseFile(path)` opens the
file read-only and returns the plan a boot would follow. It is safe on a backup:

```bash
SQLITE_PATH=/path/to/portal.db bun -e '
  const m = await import("./src/lib/db-migrate.server.ts");
  console.log(JSON.stringify(m.inspectDatabaseFile(process.env.SQLITE_PATH), null, 2));
'
```

**A refused boot.** The log line says which code. Do not edit the file by hand:

| Code | What to do |
| --- | --- |
| `DB_NEWER_THAN_BUILD` | A newer build wrote this file. Deploy that build, or restore a backup taken before it. |
| `DB_SHAPE_INVALID` | The version marker and the tables disagree. Restore a backup. |
| `DB_UNRECOGNISED` | Not a shape any release produces. Restore a backup. |
| `MIGRATION_FAILED` / `MIGRATION_VERIFY_FAILED` | The step rolled back; the file is unchanged. Report the error with the log line. |
| `SCHEMA_FILE_MISSING` | The working directory has no `sqlite/schema.sql`. Fix the deployment, not the database. |
| `DB_STORAGE_INVALID` | Production storage is missing, empty, in memory, or not a database. Check `SQLITE_DATA_DIR` points at `portal.db`, restore a backup, or — only for a genuinely new environment — run `scripts/init-database.ts`. |

**Before a release that bumps the version.** Take a backup with
`scripts/ieee-backup-export.sh`, restore it into a scratch directory with
`scripts/restore-backup.ts`, and run the inspection command against the restored
copy. Never point staging at the production `portal.db`.

**Staging and synthetic CI.** A fresh file takes the *create* path. The staging
reset deletes its database, so it is a fresh file too. Nothing here requires
special handling on either. `DEPLOY_ENV` unset also counts as non-production, so a
laptop or a unit test is never held to the production storage rule.

**A database the cutover wrote but never stamped.** `user_version = 0` on a
database that already holds the current tables is recognised from the tables and
stamped in one transaction; the rows are copied nowhere and nothing is recreated.
An unmarked file that is neither exactly v1 nor exactly v2 is refused instead,
because no version can be named for it.

## Tests

- `tests/integration-migrate-schema.mjs` — every plan above, on synthetic
  fixtures; the upgrade's row preservation and new invariants; rollback; the
  read-only pre-flight; and the connection-queue cases.
- `tests/integration-storage-guard.mjs` — production refuses a missing path, an
  empty file, `:memory:` and a non-database without creating or changing
  anything; a populated unmarked v2 database is stamped, not emptied; staging
  still creates; provisioning refuses to run over data.
- `tests/integration-db.mjs` — builds a v1 fixture and exercises the boot path
  and every repository on the upgraded file.
- `tests/fixtures/schema-shapes.mjs` — the v1 shape, so the upgrade has a
  starting point that is not the current file.

`bun run test:integration` runs all four: `integration-db.mjs`,
`integration-migrate.mjs`, `integration-migrate-schema.mjs` and
`integration-storage-guard.mjs`. The CI `integration` job runs the same script,
so a suite added here is covered without a second workflow edit.
