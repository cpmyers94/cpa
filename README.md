# Paycheck Planner

A web app for planning around your paychecks: gross-to-net breakdowns, bill
allocation, a payday/due-date calendar, savings goals, and debt payoff
tracking. Built with Next.js (App Router) and Supabase.

## Features

- **Paychecks** — add income sources (weekly, biweekly, semimonthly, or
  monthly) with itemized deductions and see net pay per paycheck.
- **Bills** — track recurring and one-time bills and assign each due date to
  the paycheck that covers it.
- **Calendar** — a month view of upcoming paydays and bill due dates.
- **Goals** — savings goals with progress bars and contribution logging.
- **Debts** — track balances/APR/minimum payments with a payoff calculator
  (months to payoff, total interest) and a suggested avalanche payoff order.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a [Supabase](https://supabase.com) project, then run the SQL in
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
   against it (SQL Editor, or `supabase db push` if you use the CLI). This
   creates all tables and row-level security policies, scoped per user.

3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon key (Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Until Supabase is
   configured, pages show a setup notice instead of erroring.

5. Sign up for an account on the `/login` page (Supabase Auth, email +
   password) — all data is private per user via row-level security.

## Project structure

- `app/(app)/` — authenticated pages (dashboard, paychecks, bills, calendar,
  goals, debts) behind a shared nav shell.
- `app/login/` — sign in / sign up.
- `lib/calc/` — pure functions for pay-schedule generation, bill occurrence
  generation, and money math (net pay, payoff calculators).
- `lib/supabase/` — browser/server Supabase clients, auth middleware, and
  shared types.
- `supabase/migrations/` — SQL schema.
