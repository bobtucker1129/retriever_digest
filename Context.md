# Retriever Daily Digest - Project Context

> **Last Updated:** 2026-02-01  
> **Current Phase:** Phase 2 Complete, Phase 3 Ready  
> **Status:** All 33 production recipients added to database

---

## Project Overview

**Retriever Daily Digest** is an internal sales motivation tool for BooneGraphics (a medical printing company). It automatically generates and emails daily/weekly sales digest reports to team members.

### What It Does

1. **Exports data from PrintSmith** (their print shop management system) via a Python script running on the PrintSmith server
2. **Stores metrics** in a PostgreSQL database on Render
3. **Generates AI-enhanced digest emails** with motivational summaries, progress bars, and actionable insights
4. **Sends automated emails** via Resend to configured recipients

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend/Admin | Next.js 14, React 18, TypeScript |
| Database | PostgreSQL (Render hosted) |
| ORM | Prisma 7.2 with PrismaPg adapter |
| Email | Resend API |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Data Export | Python 3 + psycopg2 |
| Hosting | Render (Web Service + PostgreSQL) |

---

## Current Build Status

### Phase 1: Local Development Testing ✅ COMPLETE
- Environment configured with Render database
- Prisma migrations applied, database seeded
- Dev server runs on localhost
- Admin portal functional (Goals, Recipients, Testing tabs)
- Python export script tested with real PrintSmith data
- Successfully exported: $16,154.43 daily revenue (subtotal), 24 invoices, 13 estimates
- Export queries audited and updated to use `subtotal` field (matches PrintSmith home screen)

### Phase 2: Production Deployment (Render) ✅ COMPLETE
- Pushed code to GitHub (bobtucker1129/retriever_digest)
- Created Render Web Service at https://retriever-digest.onrender.com
- Configured all environment variables
- AI content generation working
- Cron jobs still need setup
- Testimonial de-dup tracking added (requires migration deploy)

### Phase 3: PrintSmith Server Setup ⏳ NEXT
- Install Python on PrintSmith Windows server
- Configure Windows Task Scheduler
- Set up daily 4:00 AM export

### Phase 4: End-to-End Testing 🔲 PENDING
### Phase 5: Go Live 🔲 PENDING

---

## Key Files & Structure

```
retriever-daily-digest/
├── src/
│   ├── app/
│   │   ├── (admin)/          # Admin portal pages
│   │   │   ├── goals/        # Monthly/Annual goal management
│   │   │   ├── recipients/   # Email recipient management
│   │   │   ├── shoutouts/    # View/manage team shoutouts
│   │   │   └── testing/      # Preview & send test digests
│   │   ├── shoutout/         # Public shoutout submission form (no auth)
│   │   ├── api/
│   │   │   ├── digest/       # Daily/weekly digest triggers
│   │   │   ├── export/       # Receives data from PrintSmith
│   │   │   ├── shoutout/     # Shoutout inbound webhook (future use)
│   │   │   └── preview/      # Generate digest previews
│   │   └── (auth)/login/     # Password-protected login
│   └── lib/
│       ├── ai-content.ts     # Anthropic Claude integration
│       ├── daily-digest.ts   # Daily email HTML generation
│       ├── weekly-digest.ts  # Weekly email HTML generation
│       ├── db.ts             # Prisma client setup
│       └── email.ts          # Resend email sending
├── export/
│   ├── printsmith_export.py  # Python script for PrintSmith
│   └── requirements.txt      # Python dependencies
├── prisma/
│   ├── schema.prisma         # Database schema (includes Shoutout model)
│   ├── seed.ts               # Sample data seeding
│   └── migrations/           # Database migrations
├── DEPLOYMENT.md             # Step-by-step deployment guide
└── Context.md                # This file
```

---

## PrintSmith Database Knowledge

### Schema Notes (Learned 2026-01-21)

The PrintSmith PostgreSQL database has a specific structure that differs from typical expectations:

#### Table Structure
- **`invoice`** table: Only contains `id` and `isdeleted` - it's a marker/type table
- **`invoicebase`** table: Contains ALL actual invoice data (numbers, amounts, dates, etc.)
- **`estimate`** table: Only contains `id` and `isdeleted` - similar to invoice
- **`account`** table: Customer accounts, uses `title` for account name (not `accountname`)
- **`salesrep`** table: Sales reps with `name` column (not `salesrep`)
- **`salesbase`** table: Daily closeout totals (join to `dailysales` on `id`)
- **`dailysales`** table: Links salesbase to dates via `closeoutdate`

#### Revenue Calculation (Learned 2026-01-23)
For revenue goals, use `salesbase.totalsales` NOT `invoicebase.subtotal`:
- `invoicebase.subtotal` includes postage and shipping
- `salesbase.totalsales` excludes postage/shipping - matches PrintSmith "Total Sales"

```sql
-- Correct way to get revenue for date range
SELECT COALESCE(SUM(sb.totalsales), 0) AS revenue
FROM salesbase sb
INNER JOIN dailysales ds ON sb.id = ds.id
WHERE DATE(sb.closeoutdate) >= '2026-01-01'
  AND DATE(sb.closeoutdate) <= '2026-01-22'
  AND sb.isdeleted = false
```

#### Program Work Accounts (Excluded from Insights)
These accounts have predictable scheduled orders and are excluded from highlights/insights:
- Strategic Healthcare Programs (account_id: 20960)
- CenCal Health (account_id: 17204)

#### Key Column Mappings

| What You Need | Actual Location |
|---------------|-----------------|
| Invoice number | `invoicebase.invoicenumber` |
| Account/Job name | `invoicebase.name` |
| Pickup date | `invoicebase.pickupdate` |
| Is pending | `invoicebase.onpendinglist` |
| Sales rep name | `salesrep.name` (via `invoicebase.salesrep_id`) |
| PM name | `invoicebase.takenby` |
| **Amount (use this)** | `invoicebase.subtotal` |
| Amount (alt) | `invoicebase.adjustedamountdue` |
| Amount (alt) | `invoicebase.grandtotal` |
| Account ID | `invoicebase.account_id` |
| Voided flag | `COALESCE(invoicebase.voided, false)` |

#### Amount Field Discovery (2026-01-21)

PrintSmith has multiple amount fields. After auditing against the PrintSmith home screen:
- **`subtotal`** - Best match for "Sales" figures on home screen
- `adjustedamountdue` - Different calculation, doesn't match home screen
- `grandtotal` - Includes additional charges, higher than home screen

**Use `subtotal` for revenue calculations to match PrintSmith's native reporting.**

#### Working Query Pattern

```sql
SELECT 
    ib.invoicenumber,
    ib.name AS account_name,
    ib.takenby AS pm,
    COALESCE(s.name, '') AS salesrep,
    ib.subtotal
FROM invoicebase ib
LEFT JOIN salesrep s ON ib.salesrep_id = s.id
WHERE DATE(ib.pickupdate) = '2026-01-20'
  AND ib.onpendinglist = false
  AND ib.isdeleted = false
  AND COALESCE(ib.voided, false) = false
ORDER BY ib.subtotal DESC
```

#### Valid Team Members (Hardcoded in export script)

**PMs (takenby field):**
- Jim, Steve, Shelley, Ellie, Ellie Lemire

**BDs (salesrep.name):**
- House, Paige Chamberlain, Sean Swaim, Mike Meyer, Dave Tanner, Rob Grayson, Robert Galle

---

## Environment Variables

### Required for Web App (.env)
```
DATABASE_URL=postgresql://...      # Render PostgreSQL connection
ADMIN_PASSWORD=...                 # Admin portal password
RESEND_API_KEY=re_...             # Resend email API key
EMAIL_FROM="Retriever <...>"       # Sender email address
CRON_SECRET=...                    # Secret for cron job auth
EXPORT_API_SECRET=...              # Secret for export API auth
ANTHROPIC_API_KEY=sk-ant-...       # Optional, for AI features
```

### Required for Python Export Script
```
PRINTSMITH_HOST=...                # PrintSmith server IP
PRINTSMITH_PORT=5432               # PostgreSQL port
PRINTSMITH_DB=printsmith           # Database name
PRINTSMITH_USER=postgres           # Database user
PRINTSMITH_PASSWORD=...            # Database password
RENDER_API_URL=https://...         # Export API endpoint
EXPORT_API_SECRET=...              # Must match web app
```

---

## DNS & Email Configuration

### Domain: boonegraphics.net
- **Registrar:** Register.com (Network Solutions)
- **DNS Provider:** Cloudflare (moved from Wix 2026-01-24)
- **Nameservers:** `jay.ns.cloudflare.com`, `laura.ns.cloudflare.com`

### Resend Email Configuration
- **Domain:** boonegraphics.net (fully verified)
- **Sender:** `Retriever Digest <digest@boonegraphics.net>`
- **DNS Records Added:**
  - DKIM: `resend._domainkey` TXT record
  - SPF: `send` TXT record (`v=spf1 include:amazonses.com ~all`)
  - MX: `send` MX record (`feedback-smtp.us-east-1.amazonses.com`)

### SPF Fix ✅ COMPLETE (2026-01-27)
Amazon SES authorized in SPF record for improved deliverability.

**Current main domain SPF:**
```
v=spf1 mx ip4:185.230.63.171 ip4:185.230.63.186 ip4:185.230.63.107 ip4:23.236.62.147 include:_spf.google.com include:_spf.salesforce.com include:sendgrid.net include:amazonses.com ~all
```

### Important: VPN Record
The `vpn` A record must be set to "DNS only" (gray cloud), not "Proxied" (orange cloud), otherwise VPN connections will fail.

---

## Automation Schedule

### Export Schedule (PrintSmith Windows Server)

**Daily Export:** 4:00 AM EST (7 days/week via Windows Task Scheduler)
- **Monday-Friday:** Exports previous day's data
- **Monday Special:** Exports Fri+Sat+Sun combined (captures weekend web orders and home estimates)
- **Saturday/Sunday:** Exports previous day (activity saved but no email sent until Monday)

**Friday Evening Export:** 8:00 PM EST (Weekly, Windows Task Scheduler)
- Exports Friday's data 1 hour before weekly digest
- Ensures Friday activity included in weekly summary

### Email Schedule (Render Cron Jobs)

**Daily Digest:** 7:00 AM EST Monday-Friday
- Pulls most recent DigestData record
- Monday shows Fri+Sat+Sun aggregated numbers
- Tuesday-Friday show previous business day

**Weekly Digest:** 9:00 PM EST Friday (6:00 PM PST)
- Aggregates all DigestData records from Mon-Fri
- Week-over-week comparisons
- Sent after Friday evening export completes

### How It Works

**Export Script:** All exports are identical - they query PrintSmith for a date range and POST to `/api/export`, which stores data in DigestData table.

**Digest Generation:**
- **Daily:** `getLatestDigestData()` fetches most recent single record
- **Weekly:** `getWeeklyDigestData()` fetches all records from current week's date range and aggregates them

The same export script handles all scenarios - differences are in timing and how the app processes the stored data.

---

## Session History
### 2026-02-01 (Session 18): Production Recipients Added
- **Bulk Recipient Import:** Added all 33 production recipients to the database
  - Created temporary bulk-add script with proper Prisma adapter configuration
  - Successfully imported: 33 team members (PMs, BDs, production staff, leadership)
  - All recipients set to `active: true` by default
  - Mix of boonegraphics.net emails and personal emails for team members
- **Recipients Ready:** System now fully configured with production team list
- **Next:** Phase 3 - PrintSmith server setup (Python + Task Scheduler)

### 2026-02-01 (Session 17): Automation Setup - Render Cron Jobs Complete
- **Export Script Updates:** Modified `printsmith_export.py` for Monday weekend aggregation
  - Changed `get_target_date()` to `get_target_date_range()` returning (start_date, end_date, is_weekend_catchup)
  - Updated all query functions to accept date ranges instead of single dates
  - Monday exports now capture Fri+Sat+Sun combined data
  - Queries use `>= start_date AND <= end_date` pattern
- **DEPLOYMENT.md Updates:** Added complete scheduling documentation
  - Daily digest: 7am EST Mon-Fri (`0 12 * * 1-5`)
  - Weekly digest: 9pm EST Friday (`0 2 * * 6`)
  - Two Windows Task Scheduler tasks documented (daily 4am, Friday 8pm)
  - Updated Quick Reference table with new schedules
- **Render Cron Jobs Created and Tested:**
  - `daily-digest-weekdays`: Mon-Fri at 12:00 UTC (7am EST)
  - `weekly-digest-friday`: Saturday 02:00 UTC (Fri 9pm EST)
  - Both tested successfully: sent 4 emails each with 0 failures
- **Context.md:** Added "Automation Schedule" section documenting export and email timing
- **Next:** Set up Windows Task Scheduler on PrintSmith server (will be done in separate session on server)

### 2026-02-01 (Session 16): SPF Verification + Automation Schedule Planning
- **SPF Record Verified:** Confirmed `include:amazonses.com` already added to boonegraphics.net SPF record
  - Updated Context.md to mark SPF fix as complete
- **Automation Schedule Clarified:** Documented complete export and email schedule
  - Daily exports at 4am EST (7 days/week)
  - Friday evening export at 8pm EST for weekly digest
  - Daily emails Mon-Fri at 7am EST (no weekend emails)
  - Weekly email Friday at 9pm EST
  - Monday emails show Fri+Sat+Sun combined (weekend web orders + home estimates)
- **Technical Understanding:** Confirmed all exports are identical - daily vs weekly is handled by digest aggregation logic
- **Next:** Plan and implement automation setup (Render cron jobs + Windows Task Scheduler)

### 2026-02-01 (Session 14): Invoices Created ($) + Personalization (In Progress)
- **New Metric:** Added “Invoices Created ($)” as sum of invoice subtotals for ordereddate
  - Export script now computes `dailyInvoicesCreatedAmount`
  - Yesterday’s Numbers updated to 3-over-2 grid
- **Docs:** Updated DEFINITIONS.md for new metric
- **Preview/Test:** LoyaltyLoop fallback limited to 2 testimonials; preview fixed to avoid NaN
- **Personalization:** Started first-name greeting in AI summaries for daily/weekly
  - Current issue: local preview build failing due to duplicate `recipientFirstName` definition in `daily-digest.ts`
- **Export Run:** Posted 2026-01-30 data; new jobs value logged at $9,176.81

### 2026-02-01 (Session 15): Preview Fix + House→Team Replacement
- **Preview Build Error Fixed:** Resolved duplicate `recipientFirstName` definition in `daily-digest.ts`
  - Added missing `const recipientFirstName = getRecipientFirstName(recipientName)` in `generateDailyDigestWithMockFallback`
- **TestimonialDisplay Migration:** Applied `20260201023017_add_testimonial_display` migration locally
  - Testimonial de-dup tracking now functional
  - Regenerated Prisma client with new model
- **TypeScript Compilation Fixes:** Fixed Prisma JsonValue type casting issues
  - Changed `as DigestDataPayload` to `as unknown as DigestDataPayload` in daily-digest.ts and weekly-digest.ts
  - Resolved build failures on Render deployment
- **House Sales Rep Replacement:** Implemented "House" → "The Team" in new customer shoutouts
  - Modified `generateNewCustomerShoutout()` in `src/lib/ai-content.ts`
  - Only affects NEW CUSTOMER ALERT messages, not BD Performance tables or other sections
  - Makes shoutouts more natural when PM takes a house account
- **Deployed:** All fixes committed and pushed to production
  - Preview now working correctly locally and on Render
  - Build successful with all type errors resolved

### 2026-02-01 (Session 13): Digest Enhancements & De-dup Tracking
- **New Customer Shoutouts:** Added daily/weekly “NEW CUSTOMER ALERT” from first-ever estimates
  - Export now includes `newCustomerEstimates`
  - MTD/YTD new customers now based on first-ever estimate created
- **Labels Updated:** “New Jobs” renamed to “Invoices Created” in digest and goals
- **Team Shoutouts Spacing:** Adjusted top/bottom spacing for consistency
- **AI Inspiration Mix:** Added quotes, jokes, and thoughtful reflections with repeat avoidance
  - Inspiration stored in DigestData cache for de-dup across days
  - Preview/test uses cache without writing
- **Testimonials De-dup:** Added `TestimonialDisplay` model and selection logic
  - Shows new unshown first, then older unshown, then least-shown
  - Migration created: `20260201023017_add_testimonial_display`
- **Commands:** Moved AgentOpen/AgentClose to Cursor commands

### 2026-01-28 (Session 12): Team Shoutouts Feature
- **Team Shoutouts Feature:** Allow recipients to submit messages for inclusion in digests
  - Added `Shoutout` model to Prisma schema with Recipient relationship
  - Created public `/shoutout` page - no login required, validates email against recipients list
  - Added admin Shoutouts tab to view pending messages and delete if needed
  - Integrated "Team Shoutouts" section into daily and weekly digest emails
  - Messages automatically deleted after being included in a digest
  - Spam protection: max 3 pending shoutouts per person
- **Originally planned email-based submission** but Resend Inbound not available in dashboard
  - Pivoted to web form approach - simpler, no additional service setup needed
  - Public URL: `https://retriever-digest.onrender.com/shoutout`
- **Files Created:**
  - `src/app/shoutout/page.tsx` - Public submission form
  - `src/app/shoutout/actions.ts` - Form submission server action
  - `src/app/(admin)/shoutouts/page.tsx` - Admin view
  - `src/app/(admin)/shoutouts/actions.ts` - Admin actions
  - `src/app/(admin)/shoutouts/ShoutoutsContent.tsx` - Admin UI component
  - `src/app/api/shoutout/inbound/route.ts` - Webhook endpoint (kept for future use)
  - `prisma/migrations/20260129022228_add_shoutout_model/` - Database migration
- **Files Modified:**
  - `prisma/schema.prisma` - Added Shoutout model
  - `src/lib/daily-digest.ts` - Added shoutouts section rendering
  - `src/lib/weekly-digest.ts` - Added shoutouts section rendering
  - `src/components/Navigation.tsx` - Added Shoutouts tab
  - `src/middleware.ts` - Added `/shoutout` to public paths
  - `src/app/globals.css` - Added public form and admin page styles
  - `.env.example` - Added shoutout-related env vars
- **Deployed:** Committed and pushed to Render
- **Export Run:** Ran PrintSmith export with VPN - Jan 27 data: $8,494.82 revenue, 23 new jobs

### 2026-01-28 (Session 11): LoyaltyLoop Integration & Documentation
- **DEFINITIONS.md Created:** Comprehensive metric definitions document
  - Documents all digest sections: Yesterday's Numbers, Highlights, PM/BD tables, etc.
  - Explains date fields (pickupdate vs ordereddate)
  - Lists valid PMs and BDs, excluded accounts
  - Added to AgentClose rule for ongoing maintenance
- **LoyaltyLoop Testimonials Integration:** Customer feedback in digest emails
  - Created `src/lib/loyaltyloop.ts` API client
  - Fetches 4-5 star testimonials from LoyaltyLoop API
  - Prioritizes new testimonials (last 30 days), falls back to older
  - "Customer Feedback" section added near bottom of digest (before Daily Inspiration)
  - Requires `LOYALTYLOOP_API_KEY` environment variable on Render
  - **Note:** Only "published" testimonials appear in API - must approve in LoyaltyLoop dashboard
- **Login Debug Logging:** Added password length/match logging to diagnose auth issues
  - Discovered Render ADMIN_PASSWORD was different from local .env
  - Logs help troubleshoot without revealing actual passwords
- **Files Created:**
  - `DEFINITIONS.md` - Metric definitions reference
  - `src/lib/loyaltyloop.ts` - LoyaltyLoop API client
- **Files Modified:**
  - `src/lib/daily-digest.ts` - Added testimonials section
  - `src/app/api/auth/login/route.ts` - Debug logging
  - `.cursor/rules/AgentClose.md` - Added DEFINITIONS.md to update checklist
  - `.env.example` - Added LOYALTYLOOP_API_KEY

### 2026-01-27 (Session 10): Email Testing & Deliverability Fixes
- **PM/BD Tables Fix:** Committed and deployed `ordereddate` logic for PM/BD performance tables
- **Logo Optimization:** Reduced logo from 226KB to 27KB for Gmail compatibility
  - Original was timing out in Gmail's image proxy
  - New URL: `https://www.booneproofs.net/email/Retriever_Logo_White_smaller.png`
- **Weekly Test Email:** Added support for testing weekly digest emails
  - `test-email` route now accepts `type` parameter ('daily' or 'weekly')
  - Testing page passes active preview type when sending
  - Button shows "Send Weekly Test" or "Send Daily Test" based on context
- **EMAIL_FROM Fix:** Removed quotes from Render env var (was breaking Resend API)
- **SPF Deliverability Issue:** Identified missing `include:amazonses.com` on main domain
  - Emails were going to spam because SPF check failed
  - Fix: Add `include:amazonses.com` to main domain's SPF record in Cloudflare
  - Current SPF on `boonegraphics.net` doesn't include Amazon SES (Resend's sender)
- **Files Modified:**
  - `src/lib/daily-digest.ts` - Optimized logo URL
  - `src/lib/weekly-digest.ts` - Optimized logo URL
  - `src/app/api/test-email/route.ts` - Added weekly digest support
  - `src/app/(admin)/testing/page.tsx` - Pass type to test email, dynamic button text

### 2026-01-24 (Session 9): White Logo & PM/BD Metric Change
- **Logo Fix:** Updated logo URL to white PNG version for visibility on dark red background
  - Changed `LOGO_URL` in both `daily-digest.ts` and `weekly-digest.ts`
  - New URL: `https://www.booneproofs.net/email/Retriever_Logo_White.png`
  - Removed CSS `filter: brightness(0) invert(1)` (not supported in email clients)
- **PM/BD Tables Metric:** Changed from "orders picked up/closed out" to "new orders created"
  - Updated `get_daily_pm_performance()` and `get_daily_bd_performance()` in `printsmith_export.py`
  - Now uses `ordereddate` instead of `pickupdate`
  - Removed `onpendinglist = false` filter (not relevant for new orders)
  - Better day-to-day metric since pickups don't happen every day
- **Files Modified:**
  - `src/lib/daily-digest.ts` - White logo URL
  - `src/lib/weekly-digest.ts` - White logo URL
  - `export/printsmith_export.py` - PM/BD queries use `ordereddate`

### 2026-01-24 (Session 8): Production Email Setup & "New Jobs" Metric
- **Email Domain Verification:** Successfully configured Resend with boonegraphics.net
  - Moved DNS from Wix to Cloudflare (Wix doesn't support MX records on subdomains)
  - Added DKIM, SPF, and MX records for Resend verification
  - Domain fully verified with all green lights
  - EMAIL_FROM now: `Retriever Digest <digest@boonegraphics.net>`
- **Logo Fix:** Uploaded Retriever_Logo.svg to https://www.booneproofs.net/email/
- **VPN Fix:** Changed `vpn` A record in Cloudflare from "Proxied" to "DNS only"
- **Metric Improvement:** Replaced "Orders Completed" with "New Jobs"
  - Old metric: Counted completed/closed orders (by `pickupdate`) - redundant with Revenue
  - New metric: Counts jobs created (by `ordereddate`) - shows pipeline growth
  - Now displays: Revenue ($), New Jobs (#), Estimates (#), New Customers (#)
  - Provides well-rounded, non-redundant analytics
- **RENDER_API_URL Fix:** Corrected URL from `retriever-daily-digest` to `retriever-digest`
- **Files Modified:**
  - `export/printsmith_export.py` - Added `get_new_jobs_created()`, updated MTD/YTD queries
  - `src/lib/daily-digest.ts` - Changed labels to "New Jobs"
  - `src/lib/weekly-digest.ts` - Changed labels to "New Jobs"
  - `src/app/(admin)/goals/GoalForm.tsx` - Changed label to "New Jobs"
  - `.env` - Updated EMAIL_FROM and RENDER_API_URL

### 2026-01-23 (Session 7): Weekly Digest Audit & AI Logging
- **Problem 1:** Weekly highlights not showing bold account names (showing old data format)
- **Solution:** Modified `aggregateHighlights()` to prioritize recent records (newest first)
- **Problem 2:** AI quote/joke always using fallback content in production
- **Solution:** Added comprehensive logging to `generateAIContent()` to diagnose issues
  - Logs API key presence, content type, API call, response parsing
  - Matches logging pattern used in `generateMotivationalSummary()`
- **Testing:** Ran fresh export locally, confirmed both daily and weekly digests show:
  - Bold account names in highlights: `<strong>Customer Name</strong> - Job Description`
  - Fresh AI-generated quotes and jokes (not fallback)
- **Deployed:** Committed and pushed all changes to Render
- Updated mock data in both digest files to use proper highlight format

#### Key Finding
- Production AI fallback was likely due to `ANTHROPIC_API_KEY` not being set in Render environment
- Weekly highlights issue was due to aggregating older records first (before account name enhancement)

### 2026-01-23 (Session 6): Account Names & Fresh Daily Insights System
- **Enhancement 1:** Added account names (from `account.title`) to HIGHLIGHTS and Sales Insights sections
  - Updated all queries to JOIN `account` table
  - Format: `<strong>Customer Name</strong> - Job Description - $Amount`
  - Example: "Completed order for **Santa Maria Elks** - February Elks Horn Newsletter - $3,791.89"
- **Enhancement 2:** Implemented Fresh Daily Insights System to prevent repetitive content
  - Added `shownInsights` tracking in export payload (account IDs, names, insight types)
  - Created `/api/export/recent` endpoint to fetch recently shown accounts
  - All insight queries now accept `exclude_account_ids` parameter
  - Queries prioritize newly-eligible items (most recently lapsed first, newest estimates first)
  - Day-of-week rotation: 2-3 insight types per day instead of all 5
    - Mon: Anniversary Reorders, Hot Streaks, High-Value Estimates
    - Tue: Lapsed Accounts, Past Due
    - Wed: Hot Streaks, Anniversary Reorders
    - Thu: High-Value Estimates, Lapsed Accounts
    - Fri: Past Due, Hot Streaks, Anniversary Reorders
  - AI context now includes recent digest headlines and mentioned accounts
  - AI prompt explicitly told to avoid repeating recent headlines/accounts

#### New Files Created
- `src/app/api/export/recent/route.ts` - GET endpoint for recently shown account IDs

### 2026-01-23 (Session 5): Revenue Fix & Program Account Exclusion
- **Problem 1:** YTD revenue showing $611K but should be $442K - was including postage ($168K) and shipping ($6.5K)
- **Solution:** Created `get_revenue_from_salesbase()` function to query `salesbase.totalsales` which excludes postage/shipping
- Updated `get_mtd_metrics()`, `get_ytd_metrics()`, and `get_completed_invoices()` to use salesbase for revenue totals
- Revenue now matches PrintSmith "Total Sales" figure exactly: **$442,031.06**
- **Problem 2:** Program work accounts (Strategic Healthcare Programs, CenCal Health) dominated highlights and insights
- **Solution:** Added `EXCLUDED_ACCOUNT_IDS` constant with account IDs (20960, 17204)
- Updated `_generate_highlights()` to filter out program accounts
- Updated all AI insight queries to exclude program accounts: anniversary reorders, lapsed accounts, hot streaks, high-value estimates, past due accounts
- Highlights now show non-program orders (e.g., MOLLI Recall $7,894 instead of HHCAHPS $159K)

#### New PrintSmith Knowledge Discovered
- `salesbase` table contains daily closeout totals
- `salesbase.totalsales` = actual sales (excludes postage/shipping) - USE THIS FOR GOALS
- `salesbase.shipping` = shipping charges
- `salesbase.totalother` = postage + shipping + other
- Join `salesbase` to `dailysales` on `id` for date filtering via `closeoutdate`

### 2026-01-22 (Session 4): AI Content Deep Rewrite
- **Problem:** AI content was generic garbage ("Excellent Teamwork! Great job team!") - nobody would read after day 3
- **Solution:** Complete rewrite of AI context system to pass ALL available data to the AI
- Created `RichAIContext` interface with comprehensive data fields
- Added `getPreviousDayDigestData()` for day-over-day comparisons
- Added `buildRichAIContext()` to aggregate: metrics, comparisons, goals, pace, insights, top performers
- Created `generateRichMotivationalSummary()` with structured prompt that requires specific references
- Added Python queries: `get_daily_pm_performance()`, `get_daily_bd_performance()`
- Export now includes `biggestOrder`, `topPM`, `topBD` explicit fields
- **Result:** AI now generates content like:
  > "Jim crushed it with 6 orders totaling $6,942 while Paige led BD with 9 orders worth $8,292. We're ahead of pace at 80% of monthly goal. Quick win: HHCAHPS anniversary reorders ($157,750) are due."
- Added `/api/preview` to public paths for easier testing

### 2026-01-22 (Session 3): Render Deployment & AI Fixes
- Deployed to Render at https://retriever-digest.onrender.com
- Fixed revenue discrepancy ($653K→$612K) by adding JOIN to `invoice` table
- Fixed AI content not generating: was being statically cached at build time
- Added `export const dynamic = 'force-dynamic'` and `fetchCache = 'force-no-store'`
- Fixed repetitive "Strong ___" headlines with better prompts
- Added `temperature: 1` for more variety
- Added `python-dotenv` to export script for local .env loading
- Created debug endpoint `/api/debug/ai` for troubleshooting
- **Known Issue:** AI content needs more context (goals, trends) to be useful

### 2026-01-21 (Session 2): PrintSmith Query Audit
- Audited export queries against PrintSmith home screen dashboard
- Discovered multiple amount fields: `subtotal`, `adjustedamountdue`, `grandtotal`
- Found `subtotal` best matches PrintSmith's native "Sales" reporting
- Updated ALL queries in `printsmith_export.py` to use `subtotal`
- New test results: 24 invoices, $16,154.43 daily revenue (subtotal)
- MTD Revenue now: $677,362.11 (closer to PrintSmith home screen)

### 2026-01-21 (Session 1): Phase 1 Completion
- Verified Node.js, Python, PostgreSQL setup
- Generated Prisma client, confirmed migrations
- Started dev server on localhost:3002
- Discovered PrintSmith schema differences (invoice vs invoicebase tables)
- Updated `printsmith_export.py` with correct column names
- Successfully tested export: 24 invoices
- Data posted to local API and stored in database
- Created Context.md and Cursor rules (AgentOpen, AgentClose)

---

## Next Steps

### Revenue & Insights ✅ COMPLETE
- ✅ Revenue now uses `salesbase.totalsales` (excludes postage/shipping)
- ✅ YTD/MTD/Daily revenue matches PrintSmith "Total Sales" exactly
- ✅ Program accounts (Strategic Healthcare, CenCal) excluded from highlights/insights
- ✅ Highlights now show actionable non-program orders with account names
- ✅ AI insights focus on business development opportunities

### Fresh Insights System ✅ COMPLETE
- ✅ Account names displayed in bold before job descriptions
- ✅ Day-of-week rotation for insight types (2-3 per day)
- ✅ Recently shown accounts excluded for 14 days
- ✅ AI context includes recent headlines to avoid repetition
- ✅ Queries prioritize newly-eligible items

### Remaining Tasks
1. ✅ **Commit changes** - All enhancements committed and pushed
2. ✅ **Deploy to Render** - Auto-deployed via GitHub push
3. ✅ **Email domain verified** - Resend configured with boonegraphics.net via Cloudflare
4. ✅ **Logo accessible** - https://www.booneproofs.net/email/Retriever_Logo_White_smaller.png (optimized 27KB for Gmail)
5. ✅ **Update Render EMAIL_FROM** - Changed to `Retriever Digest <digest@boonegraphics.net>` (no quotes)
6. ✅ **Test production email** - Tested daily and weekly from admin portal
7. ✅ **Fix SPF record** - Added `include:amazonses.com` to main domain SPF in Cloudflare (verified 2026-02-01)
8. ✅ **Apply new migrations** - TestimonialDisplay migration deployed (shares same DB as local)
9. ✅ **Fix preview build error** - recipientFirstName and TypeScript errors resolved
10. **Set up Render cron jobs** for automated daily/weekly digests
11. **Phase 3**: Install export script on PrintSmith Windows server
12. **Phase 4**: End-to-end testing
13. **Phase 5**: Go live

### LoyaltyLoop Integration ✅ COMPLETE
- ✅ API client created (`src/lib/loyaltyloop.ts`)
- ✅ Customer Feedback section added to daily digest
- ✅ Prioritizes new testimonials (last 30 days)
- ✅ Deployed to Render with `LOYALTYLOOP_API_KEY` configured
- **Action Required:** Publish recent testimonials in LoyaltyLoop dashboard (only published ones appear in API)

### Team Shoutouts Feature ✅ COMPLETE
- ✅ Public submission form at `/shoutout` (no login required)
- ✅ Validates sender against recipients list
- ✅ Admin Shoutouts tab to view/delete pending messages
- ✅ Integrated into daily and weekly digests
- ✅ Auto-cleanup after digest sends
- **Share URL:** `https://retriever-digest.onrender.com/shoutout`

### Optional Improvements
- Add more program accounts to exclusion list as needed
- Weekly digest could use `generateRichMotivationalSummary()` for more specific content
- Add testimonials to weekly digest (currently daily only)

---

## Useful Commands

```bash
# Start dev server
npm run dev

# Run PrintSmith export (dry run)
cd export && python3 printsmith_export.py --dry-run

# Run PrintSmith export (actual)
cd export && python3 printsmith_export.py

# Regenerate Prisma client
npx prisma generate

# Check migration status
npx prisma migrate status

# Open Prisma Studio (database GUI)
npx prisma studio
```
