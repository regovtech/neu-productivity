# neu-productivity

[![CI](https://github.com/regovtech/neu-productivity/actions/workflows/ci.yml/badge.svg)](https://github.com/regovtech/neu-productivity/actions/workflows/ci.yml)

B2CB2B productivity platform — enabling employers, employees, and employable personnel to stay productive at all times with incremental productivity goals and measurable outcomes.

## Stack

- **Framework**: Next.js 14 (App Router)
- **API**: tRPC v11
- **Database**: PostgreSQL 16 with Row-Level Security
- **Auth**: NextAuth v5 (Google OAuth + Email/Password)
- **Monorepo**: pnpm workspaces

## Getting Started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your credentials
pnpm db:migrate
pnpm dev
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm typecheck` | TypeScript type check |
| `pnpm lint` | ESLint |
| `pnpm test` | Run integration tests (requires `DATABASE_URL`) |
| `pnpm db:migrate` | Apply database migrations |
