# Retriever Daily Digest - Metric Definitions

> **Last Updated:** 2026-02-01

This document defines all metrics and terminology used in the Retriever Daily Digest emails, organized by section.

---

## 1. Yesterday's Numbers

The main metrics displayed at the top of the daily digest.

| Term | Definition | Data Source |
|------|------------|-------------|
| **Revenue** | Total sales from jobs picked up/closed out that day. Excludes postage and shipping. | `salesbase.totalsales` where `pickupdate` = target date |
| **Invoices Created** | Count of new invoices/jobs entered into the system that day (regardless of pickup status). | `invoicebase` where `ordereddate` = target date |
| **Invoices Created ($)** | Total dollar value of invoices created that day (sum of subtotals). | `invoicebase.subtotal` where `ordereddate` = target date |
| **Estimates Created** | Count of new estimates created that day. | `estimate` joined to `invoicebase` where `ordereddate` = target date |
| **New Customers** | Currently shows 0 for daily. For MTD/YTD: count of distinct accounts whose first-ever estimate was created during the period. | Subquery checking no prior `ordereddate` for account (estimates) |

### Key Date Fields

- **pickupdate** - When the job was picked up/closed out (revenue recognized)
- **ordereddate** - When the job was entered into the system (order placed)

---

## 2. Highlights

Top performing invoices and estimates from the day.

| Term | Definition |
|------|------------|
| **Top Invoices** | Largest completed invoices by `subtotal` from jobs picked up that day |
| **Top Estimates** | Largest estimates created that day by `subtotal` |

**Display Format:** `<Account Name> - <Job Description> - $<Amount>`

**Note:** Program accounts (see Section 7) are excluded from highlights.

---

## 3. PM Performance Table

Performance metrics for Project Managers.

| Column | Definition |
|--------|------------|
| **PM** | Project Manager who took/entered the order (from `invoicebase.takenby`) |
| **Orders** | Count of jobs created (`ordereddate`) that day by this PM |
| **Revenue** | Sum of `subtotal` for those jobs |

### Valid PMs

Only these names are included in the PM table:
- Jim
- Steve
- Shelley
- Ellie
- Ellie Lemire

---

## 4. BD Performance Table

Performance metrics for Business Development / Sales Reps.

| Column | Definition |
|--------|------------|
| **BD** | Business Development rep assigned to the account (from `salesrep.name` via `invoicebase.salesrep_id`) |
| **Orders** | Count of jobs created (`ordereddate`) that day by this BD |
| **Revenue** | Sum of `subtotal` for those jobs |

### Valid BDs

Only these names are included in the BD table:
- House
- Paige Chamberlain
- Sean Swaim
- Mike Meyer
- Dave Tanner
- Rob Grayson
- Robert Galle

---

## 5. Goal Progress (MTD/YTD)

Progress toward monthly and annual goals.

| Term | Definition |
|------|------------|
| **MTD** | Month-to-Date: Aggregated from 1st of current month through today |
| **YTD** | Year-to-Date: Aggregated from January 1 through today |

Progress bars show percentage toward configured goals (set in Admin Portal > Goals tab).

**Metrics tracked:**
- Revenue (same definition as daily, aggregated)
- Invoices Created (same definition as daily, aggregated)
- Estimates Created (same definition as daily, aggregated)
- New Customers (count of accounts with first-ever estimate created during the period)

---

## 6. AI Insights

Actionable business intelligence generated from PrintSmith data.

| Insight Type | Definition | Criteria |
|--------------|------------|----------|
| **Anniversary Reorders** | Large orders from ~1 year ago that may be due for reorder | Orders $1,000+ from 10-11 months ago |
| **Lapsed Accounts** | High-value customers who haven't ordered recently | $5,000+ lifetime value, inactive 6+ months |
| **Hot Streak Accounts** | Customers with increasing order frequency | 3+ orders in last 90 days, up from prior period |
| **High-Value Estimates** | Pending quotes that need follow-up | Estimates over $1,000 still open |
| **Past Due Accounts** | Accounts with overdue AR balances | Overdue invoices (if AR data available) |

### Insight Rotation

To prevent repetitive content, insights rotate by day of week:
- **Monday:** Anniversary Reorders, Hot Streaks, High-Value Estimates
- **Tuesday:** Lapsed Accounts, Past Due
- **Wednesday:** Hot Streaks, Anniversary Reorders
- **Thursday:** High-Value Estimates, Lapsed Accounts
- **Friday:** Past Due, Hot Streaks, Anniversary Reorders

Recently shown accounts are excluded for 14 days.

---

## 7. Customer Feedback

Customer testimonials from LoyaltyLoop displayed near the bottom of the digest.

| Term | Definition |
|------|------------|
| **Testimonial** | Customer feedback/review from LoyaltyLoop surveys (4-5 star ratings only) |
| **Display Date** | Month and year the feedback was submitted (e.g., "October 2025") |

### Prioritization

1. **New testimonials** (within last 30 days) are shown first
2. **Older testimonials** are used as fallback if no new ones are available
3. Up to 2 testimonials are displayed per digest

### Data Source

- **API:** LoyaltyLoop REST API (`/api/v3/testimonials`)
- **Filter:** Only 4-5 star ratings (positive reviews)
- **Authentication:** Bearer token via `LOYALTYLOOP_API_KEY` environment variable

### Display Format

Each testimonial shows:
- Quote text (the customer's feedback)
- Customer name
- Location (city, state) if available
- Display date

---

## 8. Excluded Accounts

These accounts have predictable scheduled orders (program work) and are **excluded** from Highlights and AI Insights to keep content actionable.

| Account Name | Account ID |
|--------------|------------|
| Strategic Healthcare Programs | 20960 |
| CenCal Health | 17204 |

These accounts are still included in revenue totals and goal progress.

---

## 9. Amount Fields

PrintSmith has multiple amount fields. Here's what each represents:

| Field | Description | Used For |
|-------|-------------|----------|
| **subtotal** | Job amount before tax, includes postage/shipping | Individual invoice displays, highlights |
| **totalsales** | Daily closeout total, excludes postage/shipping | Revenue goals, MTD/YTD totals |
| **grandtotal** | Full total including all charges | Not used |
| **adjustedamountdue** | Amount after adjustments | Not used |

**Important:** Revenue goals use `salesbase.totalsales` to match PrintSmith's "Total Sales" reporting.

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **Invoice** | A job/order in PrintSmith (not just the billing document) |
| **Estimate** | A quote/proposal that may convert to an invoice |
| **Pending** | Job entered but not yet picked up (`onpendinglist = true`) |
| **Picked Up** | Job completed and closed out (`pickupdate` set, `onpendinglist = false`) |
| **Voided** | Cancelled job (`voided = true`) - excluded from all metrics |
| **Program Work** | Recurring scheduled orders for specific accounts |
