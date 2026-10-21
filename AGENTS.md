# Kkeutbal

Kkeutbal records live Seotda, Go-Stop, and poker games without handling real-money payments. It is a Next.js application backed by Supabase PostgreSQL and Realtime.

## Read Order

1. This file
2. `docs/README.md`
3. `TODO.md`
4. The spec or runbook that owns the surface being changed

## Source Ownership

- `src/app/` owns routes, layouts, and route handlers.
- `src/features/` owns product domains. Keep game engines pure and keep UI data access in feature hooks, actions, or queries.
- `src/lib/` owns cross-cutting infrastructure such as environment validation, database access, authentication, i18n, and Realtime.
- `database/schema.ts` owns the typed schema; `database/migrations/` owns ordered Drizzle DDL and Supabase policy history. Preserve migration order and executable content.
- `docs/spec/` owns current technical contracts; `docs/runbooks/` owns operating procedures; `docs/README.md` is the document index.

## Local Commands

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
```

`pnpm build` is run by the user unless they explicitly ask an agent to run it. Database migration applies irreversible state changes and follows `docs/runbooks/01-database-migrations.md` after explicit approval. Runtime secrets are supplied through the process environment. Do not add Doppler or another secret-injection path without an explicit decision.
