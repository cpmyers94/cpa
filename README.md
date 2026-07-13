# Paycheck Planner

A web app for planning around your paychecks: gross-to-net breakdowns, bill
allocation, a payday/due-date calendar, savings goals, and debt payoff
tracking.

**Live app:** https://cpmyers94.github.io/cpa/

Built with Next.js (App Router, static export) and Supabase. The app runs
entirely in the browser — auth and data go straight from the browser to
Supabase, and every table is protected by row-level security so each account
only ever sees its own data.

## Features

- **Paychecks** — add income sources (weekly, biweekly, semimonthly, or
  monthly) with itemized deductions and see net pay per paycheck.
- **Bills** — track recurring and one-time bills and assign each due date to
  the paycheck that covers it.
- **Calendar** — a month view of upcoming paydays and bill due dates.
- **Goals** — savings goals with progress bars and contribution logging.
- **Debts** — track balances/APR/minimum payments with a payoff calculator
  (months to payoff, total interest) and a suggested avalanche payoff order.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL
   and anon key (Supabase dashboard → Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Until Supabase is
   configured, pages show a setup notice instead of erroring.

## Deployment

Pushes to `claude/paycheck-planner-rebuild-7le3gl` trigger
[`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml),
which builds a static export (`output: "export"`, base path `/cpa`) and
publishes it to GitHub Pages. The Supabase anon key baked into the build is
public by design — data access is enforced by row-level security, not key
secrecy.

## Database

The schema lives in
[`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql):
8 tables (income sources, deductions, bills, bill allocations, savings goals,
goal contributions, debts, debt payments), each with RLS policies scoping
every row to the signed-in user (`auth.uid()`). To recreate the backend on a
fresh Supabase project, run that file in the SQL editor and update the keys.

## Project structure

- `app/(app)/` — the authenticated pages (dashboard, paychecks, bills,
  calendar, goals, debts) behind a shared nav shell and client-side auth
  guard.
- `app/login/` — sign in / sign up.
- `components/auth.tsx` — auth context + route guard.
- `lib/calc/` — pure functions for pay-schedule generation, bill occurrence
  generation, and money math (net pay, payoff calculators).
- `lib/supabase/` — browser Supabase client and shared row types.
- `supabase/migrations/` — SQL schema.
