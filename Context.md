# Retriever Daily Digest - Project Context

> **Last Updated:** 2026-01-24  
> **Current Phase:** Phase 2 Complete, Phase 3 Ready  
> **Status:** Production email verified, white logo deployed, PM/BD tables metric changed to "new orders" (ordereddate), ready for PrintSmith server setup

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
│   │   │   └── testing/      # Preview & send test digests
│   │   ├── api/
│   │   │   ├── digest/       # Daily/weekly digest triggers
│   │   │   ├── export/       # Receives data from PrintSmith
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
│   ├── schema.prisma         # Database schema
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

### Important: VPN Record
The `vpn` A record must be set to "DNS only" (gray cloud), not "Proxied" (orange cloud), otherwise VPN connections will fail.

---

## Session History

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
4. ✅ **Logo accessible** - https://www.booneproofs.net/email/Retriever_Logo_White.png (white PNG for email compatibility)
5. ✅ **Update Render EMAIL_FROM** - Changed to `Retriever Digest <digest@boonegraphics.net>`
6. **Test production email** - Send test from admin portal
7. **Set up Render cron jobs** for automated daily/weekly digests
8. **Phase 3**: Install export script on PrintSmith Windows server
9. **Phase 4**: End-to-end testing
10. **Phase 5**: Go live

### Optional Improvements
- Add more program accounts to exclusion list as needed
- Weekly digest could use `generateRichMotivationalSummary()` for more specific content

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
