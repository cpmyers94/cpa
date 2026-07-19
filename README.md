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
- **Expenses** — everyday spending as monthly budget categories (groceries,
  gas, dining). Mark one a subscription with a charge day and it also becomes a
  dated obligation in paycheck planning.
- **Debts** — track balances/APR/minimum payments (with a payoff calculator)
  and BNPL installment plans. Debt payments are assignable to paychecks just
  like bills.
- **Obligations & paycheck planning** — bills, debt payments, and dated
  subscriptions are unified as "obligations" you assign to the paycheck that
  covers them (manually or via one-click auto-assign), shown together on the
  calendar and dashboard.
- **Plan** — evaluates your monthly cash flow (income vs. bills, expenses,
  goals, and debt payments) and simulates a get-out-of-debt payoff (avalanche
  or snowball, BNPL plans on their fixed schedules).
- **Households** — share one consolidated budget across multiple accounts.
  Each person signs in with their own login; an invite code links them into a
  household, and everyone sees a combined view of all paychecks, bills, goals,
  and debts. An owner-controlled toggle decides whether everyone can edit
  everything or each person edits only their own entries. Entries stay tagged
  with who added them, and leaving a household takes your own entries with you.

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

The schema lives in `supabase/migrations/`. Run the files in order against a
fresh Supabase project (SQL editor or `supabase db push`) and update the keys.

- `0001_init.sql` — the 8 data tables (income sources, deductions, bills, bill
  allocations, savings goals, goal contributions, debts, debt payments).
- `0002_households.sql` — households, membership, and profiles; adds a
  `household_id` to every data table; and replaces the per-user RLS with
  household-scoped policies. Reads are scoped to your household; writes are
  gated by authorship or the household's owner-controlled `shared_editing`
  flag. Includes RPCs for joining/leaving a household and rotating the invite
  code, all `SECURITY DEFINER`.
- `0003_new_user_household.sql` — a trigger that gives every new signup a
  personal household automatically.

Every row carries a `user_id` (the author) and a `household_id` (the shared
budget it belongs to); visibility follows the household, and joining/leaving
moves your authored rows with you.

## Project structure

- `app/(app)/` — the authenticated pages (dashboard, paychecks, bills,
  calendar, goals, debts, household) behind a shared nav shell and client-side
  auth guard.
- `app/login/` — sign in / sign up.
- `components/auth.tsx` — auth context (user + household + members), route
  guard, and the `canEdit` / `nameFor` helpers used for permissions and
  attribution.
- `lib/calc/` — pure functions for pay-schedule generation, bill occurrence
  generation, and money math (net pay, payoff calculators).
- `lib/supabase/` — browser Supabase client and shared row types.
- `supabase/migrations/` — SQL schema.
