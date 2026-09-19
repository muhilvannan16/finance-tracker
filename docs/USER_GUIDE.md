# finance-tracker — User Guide

A walkthrough of every feature, from adding your first account to
running a debt payoff simulation. For setup instructions, see the
[README](../README.md#getting-started--running-locally).

## Table of Contents

- [Accounts](#accounts)
- [Transactions](#transactions)
- [Transfers](#transfers)
- [Balance Projection](#balance-projection)
- [Recurring-Charge Detection](#recurring-charge-detection)
- [Budgets](#budgets)
- [Net Worth](#net-worth)
- [Debt Payoff](#debt-payoff)

---

## Accounts

Every transaction and transfer belongs to an account. Create one from
the **Accounts** card on the Tracker page: give it a name, a starting
balance, and a **Type**.

- **Asset** — checking, savings, cash, anything you own.
- **Liability** — a credit card, loan, or anything you owe. Liability
  accounts store their balance as a positive "amount owed" (a $500
  card balance is entered as `500`, not `-500`), and unlock two extra
  fields:
  - **Interest Rate (APR %)** — the card or loan's annual rate.
  - **Minimum Payment (% of balance)** — your minimum payment as a
    percentage of the current balance, not a flat dollar amount.

For a liability account, transactions and transfers work in reverse
compared to an asset account: an **expense** transaction or a
transfer *out* increases the amount you owe, while an **income**
transaction or a transfer *in* decreases it — the same way a real
purchase adds to a credit card balance and a real payment reduces it.

Both are required for a liability account, since they power the Debt
Payoff calculator (see below). Click **Edit** on any account to
change its name, balance, or type later.

If you're upgrading from an older version of the app, any account
created before types existed will show up on the Planner page under
**Assign Account Types**, prompting you to pick Asset or Liability
before Net Worth or Debt Payoff can be calculated.

---

## Transactions

Add a transaction from the **Add Transaction** card: a label, a
category (a fixed list — Groceries, Dining, Transport, Utilities,
Rent, Entertainment, Health, Shopping, Income, or **Other** with a
custom category you type in), an amount, direction (income or
expense), a date, and which account it belongs to.

Set **Frequency** to **Monthly** for a recurring charge (like rent or
a subscription) — the app treats it as a template and expands it into
every occurrence automatically wherever a calculation needs it
(balance projection, budgets, net worth), rather than you having to
add the same transaction every month by hand.

---

## Transfers

Use the **Transfers** card to move money between two of your own
accounts — paying down a credit card from your checking account, for
example. A transfer debits the "from" account and credits the "to"
account on the date you choose.

---

## Balance Projection

The **Project Future Balance** card projects a single account's
balance to any date, past or future, accounting for every transaction
and transfer up to that point — including recurring monthly charges,
expanded correctly. Click **Show Chart** for a month-by-month line
chart of the same projection.

---

## Recurring-Charge Detection

Click **Check for Recurring Charges** to scan your transactions for
patterns you haven't marked as monthly yourself — matching label,
category, similar amount, and a roughly-monthly gap between charges.
Each match becomes a suggestion you can accept (turns it into a real
recurring transaction) or dismiss.

If you've added a Groq API key under **AI Settings**, transactions the
rule-based pass didn't match get a second look from an LLM, which can
catch recurring charges billed under slightly inconsistent labels.
This is entirely optional — see the AI Features section in the
[README](../README.md#ai-features--privacy-note) for what data that
involves.

---

## Budgets

On the **Planner** page, the **Budgets** card lets you set a spending
limit for a category over a custom date range — not tied to a
calendar month, so you can budget "this pay period" or "this trip"
just as easily as "this month."

1. Pick a category (or **Other**, with your own custom category).
2. Set a limit amount (must be greater than $0).
3. Pick a start and end date (start must be before end).
4. Click **Add Budget**.

You can't create two budgets for the same category with overlapping
date ranges — the app blocks that to keep spending totals unambiguous.

Each saved budget shows a progress bar and "`$X of $Y spent`," pulled
from your real expense transactions in that category and date range
(recurring monthly transactions are expanded correctly, and spending
is capped at today's date so a future-dated planned expense doesn't
count as already spent). The bar turns red once you're over the limit.

---

## Net Worth

The **Net Worth** card charts assets minus liabilities over a date
range you choose. Every account needs a type first (see
[Accounts](#accounts) above) — if any account is still untyped, the
card will tell you to assign one before it can calculate anything.

Pick a start and end date and click **Show Chart** for a line chart
of your net worth trend, computed at monthly checkpoints using the
same balance-projection logic as the rest of the app.

---

## Debt Payoff

The **Debt Payoff** card simulates paying off every liability account
at once, month by month, and tells you how long it'll take and how
much interest you'll pay in total.

1. **Choose a strategy:**
   - **Avalanche** — extra money goes to whichever debt has the
     highest interest rate first. Minimizes total interest paid.
   - **Snowball** — extra money goes to whichever debt has the
     smallest balance first. Clears individual debts faster, which
     can help with motivation, even if it costs slightly more in
     interest overall.
2. **Set an Extra Monthly Payment** — any amount above every debt's
   own minimum payment. It's applied to your chosen strategy's target
   debt each month, and automatically rolls onto the next debt in
   line once one is paid off — even within the same month, if there's
   money left over.
3. Click **Calculate.**

Every liability account needs its interest rate and minimum payment
percentage filled in first — the **Complete Debt Details** card will
prompt you if any are missing.

**A note on minimum payments:** since minimum payment here is a
percentage of the current balance, not a flat dollar amount, it's
possible — with no extra payment — for a debt's minimum to never
quite outpace its own monthly interest. If that happens, the
calculator reports that the debt can't be paid off within 50 years
under those terms, rather than guessing at a number. Increasing your
extra payment (or the minimum payment percentage) resolves this.
