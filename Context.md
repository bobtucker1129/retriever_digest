# Retriever Daily Digest - Project Context

> **Last Updated:** 2026-01-22  
> **Current Phase:** Phase 2 Complete, Phase 3 Ready  
> **Status:** Deployed to Render, AI content working, needs AI improvements

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

## Session History

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

### PRIORITY: AI Content Improvements
The current AI content is too repetitive and lacks context. Users won't read it after day 3. Need to:

1. **Add goal-awareness to AI prompts**
   - Pass monthly/annual goals to AI
   - Include progress percentages ("71% to goal with 10 days left")
   - AI can say "on track" or "need to push" based on progress

2. **Add trend/comparison context**
   - Pass yesterday's numbers for comparison
   - Include week-over-week trends
   - AI can reference improvements or declines

3. **Fix Daily Inspiration (quote/joke)**
   - Currently shows same content repeatedly
   - Needs same caching fixes as motivational summary

4. **Review all AI sections:**
   - Motivational summary (top) ✅ Fixed basic caching
   - Highlights section
   - Sales insights
   - Hot streaks
   - Anniversary reorders
   - Daily inspiration (quote/joke) - NOT WORKING

### Other Tasks
5. **Set up Render cron jobs** for automated daily/weekly digests
6. **Phase 3**: Install export script on PrintSmith Windows server
7. **Phase 4**: End-to-end testing
8. **Phase 5**: Go live

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
