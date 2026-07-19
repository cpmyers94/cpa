# Roadmap

Ideas parked for later. Nothing here is committed to a timeline.

## Premium: Plaid bank integration

Turn the Plan page's spending evaluation from "based on what you've entered" into
"based on your real transactions" by connecting bank accounts through
[Plaid](https://plaid.com). Intended as a **paid/premium tier**, not part of the
free app.

**Why it's premium, not free:**

- **Needs a server component.** Plaid's secret keys can't live in the static
  GitHub Pages build. The token exchange and transaction sync would run in a
  Supabase Edge Function (already supported by our project), never in the
  browser.
- **Costs money + requires approval.** Plaid's sandbox is free, but connecting
  real accounts needs production access (an application) and pay-as-you-go
  pricing (~$0.30–0.50 per connected account per month). That ongoing cost is
  what makes a premium tier the right home for it.

**Security posture (for when we revisit):**

- For most major banks the user logs in **directly with their bank via OAuth**,
  so credentials never touch Plaid or our app.
- We'd hold only a revocable, **read-only** token — no ability to move money;
  the user can cut access from their bank at any time.
- Plaid is SOC 2 Type II audited and the industry standard (Venmo, Chime, etc.).
  Strong, but no integration can *guarantee* security.

**Free alternative if we want real spending data without the cost/approval:**

- **CSV import** — user downloads transactions from their bank and drops the file
  in. Less magical, zero cost, no third party. Could ship first as a stepping
  stone.

**Prerequisite for any of this:** a billing/subscription concept (plan tiers,
entitlement checks) — none exists yet.
