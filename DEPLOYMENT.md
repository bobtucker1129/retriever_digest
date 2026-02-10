# Retriever Daily Digest - Deployment Guide

This document provides step-by-step instructions for dev testing, PrintSmith server setup, and production deployment.

---

## Table of Contents

1. [Code Review Findings](#code-review-findings)
2. [Phase 1: Local Development Testing](#phase-1-local-development-testing)
3. [Phase 2: Production Deployment (Render)](#phase-2-production-deployment-render)
4. [Phase 3: PrintSmith Server Setup](#phase-3-printsmith-server-setup)
5. [Phase 4: End-to-End Testing](#phase-4-end-to-end-testing)
6. [Phase 5: Go Live Checklist](#phase-5-go-live-checklist)

---

## Code Review Findings

### ✅ Previously Identified Issues - NOW RESOLVED

#### 1. `/api/export` Endpoint
**Status:** ✅ IMPLEMENTED  
Located at `src/app/api/export/route.ts` - accepts POST requests with `X-Export-Secret` header.

#### 2. Python Script POST Logic
**Status:** ✅ IMPLEMENTED  
The `export/printsmith_export.py` script includes:
- `--dry-run` flag for testing
- Full POST request with assembled JSON
- AI Insights queries (anniversary reorders, lapsed accounts, hot streaks, etc.)
- Proper error handling and logging

#### 3. AI Provider
**Status:** ✅ USING ANTHROPIC CLAUDE  
The application uses Anthropic Claude (claude-sonnet-4-20250514) for:
- Daily motivational summaries (team-focused, no individual callouts)
- Inspirational quotes and jokes
- Automatic fallback content if API unavailable

#### 4. Session Cookie Security
**Status:** ⚠️ Basic but functional  
The middleware checks for cookie presence with basic validation.

**Recommendation for production:** 
- Use a signed JWT or encrypted session token
- Add `Secure` and `SameSite=Strict` flags in production
- Consider using `next-auth` or `iron-session` for proper session management

### ✅ What's Working Well

- Prisma schema is correct and comprehensive
- Email sending with Resend is properly implemented with error handling
- Daily/weekly digest generation with progress bars and formatting
- AI-generated motivational team summaries at top of each digest
- Admin portal with goals and recipients management
- Password protection middleware (basic but functional)
- Good fallback content when AI fails
- Professional, clean email design suitable for medical printing industry

---

## Phase 1: Local Development Testing ✅ COMPLETE

**Completed: 2026-01-21**

### Prerequisites Checklist

- [x] Node.js 18+ installed (v24.13.0)
- [x] PostgreSQL database available (Render external URL)
- [x] VPN connected (for PrintSmith access)
- [x] Python 3 with psycopg2 installed (v3.9.6)

### Step 1.1: Set Up Environment

```bash
cd "/Users/tate/Library/CloudStorage/GoogleDrive-state@boonegraphics.net/Shared drives/LordTate/Repository/retriever-daily-digest"

# Copy example env and fill in values
cp .env.example .env
```

Edit `.env` with your values:

```env
# Use a local Postgres or Render's external URL
DATABASE_URL=postgresql://user:pass@localhost:5432/retriever

# Pick a simple password for testing
ADMIN_PASSWORD=testpassword123

# Get from https://resend.com/api-keys
RESEND_API_KEY=re_xxxxxxxx

# Your verified domain or Resend's test domain
EMAIL_FROM="Retriever <onboarding@resend.dev>"

# Generate with: openssl rand -hex 32
CRON_SECRET=your-random-secret-here
EXPORT_API_SECRET=your-random-export-secret

# Optional - falls back to hardcoded quotes/motivation
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

### Step 1.2: Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Create database tables
npx prisma migrate deploy

# Seed with sample data
npm run prisma:seed
```

**Verify:** Open your database tool and confirm tables exist: `Goal`, `Recipient`, `DigestData`

### Step 1.3: Start Dev Server

```bash
npm run dev
```

**Verify:** Open http://localhost:3000 (or next available port)
- [x] Redirected to `/login`
- [x] Enter password, redirected to `/goals`
- [x] Three tabs visible: Goals, Recipients, Testing

### Step 1.4: Test Admin Portal

**Goals Tab:**
- [x] Set Monthly goals (e.g., $100,000 revenue, 50 sales)
- [x] Set Annual goals (e.g., $1,000,000 revenue, 500 sales)
- [x] Click Save, see success message
- [x] Refresh page, values persist

**Recipients Tab:**
- [x] Add a recipient with your email
- [x] Toggle active/inactive
- [x] Edit recipient name
- [x] Delete a test recipient

**Testing Tab:**
- [x] Click "Preview Daily Digest"
- [x] See email preview in iframe (with real PrintSmith data after export)
- [x] Enter your email, click "Send Test"
- [x] Check inbox for test email

### Step 1.5: Test Python Export Script (with VPN)

```bash
cd export

# Install dependencies
pip install -r requirements.txt

# PrintSmith credentials should be in .env file
# Run export (dry run first to verify)
python3 printsmith_export.py --dry-run

# Then run actual export to local API
export RENDER_API_URL=http://localhost:3002/api/export
python3 printsmith_export.py
```

**Verify:** 
- [x] Script connects successfully
- [x] Logs show invoice/estimate counts
- [x] No errors in output

**Results from 2026-01-21 test:**
- Daily Revenue: $11,860.06 (24 invoices)
- MTD Revenue: $653,529.65 (373 sales)
- 13 estimates created
- 5 AI insight categories generated

---

## Phase 2: Production Deployment (Render)

> **Status:** Ready to begin. Phase 1 completed 2026-01-21.

### Step 2.1: Push to GitHub

```bash
cd "/Users/tate/Library/CloudStorage/GoogleDrive-state@boonegraphics.net/Shared drives/LordTate/Repository/retriever-daily-digest"

# Initialize git if needed
git init

# Add all files
git add -A

# Commit
git commit -m "Initial commit: Retriever Daily Digest"

# Create GitHub repo and push
# (Create repo at github.com/your-org/retriever-daily-digest)
git remote add origin git@github.com:your-org/retriever-daily-digest.git
git branch -M main
git push -u origin main
```

### Step 2.2: Create Render Resources

1. **Go to [render.com](https://render.com)** and log in

2. **Create PostgreSQL Database:**
   - Click "New" → "PostgreSQL"
   - Name: `retriever-db`
   - Region: Oregon (or closest to you)
   - Instance Type: Starter (free tier)
   - Click "Create Database"
   - **Copy the "Internal Database URL"** (starts with `postgres://...`)

3. **Create Web Service:**
   - Click "New" → "Web Service"
   - Connect your GitHub repo
   - Name: `retriever-daily-digest`
   - Region: Same as database
   - Runtime: Node
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npm run start`
   - Instance Type: Starter ($7/month) or Free

4. **Set Environment Variables** in Web Service settings:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | (paste Internal Database URL from step 2) |
| `ADMIN_PASSWORD` | `your-secure-password` |
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `EMAIL_FROM` | `Retriever <digest@boonegraphics.com>` |
| `CRON_SECRET` | (generate with `openssl rand -hex 32`) |
| `EXPORT_API_SECRET` | (generate with `openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | `sk-ant-xxxxxxxx` (optional - enables AI motivational summaries) |

5. **Deploy:**
   - Click "Manual Deploy" → "Deploy latest commit"
   - Wait for build to complete (~2-3 minutes)

### Step 2.3: Run Database Migrations

After first deploy, open Render Shell and run:

```bash
npx prisma migrate deploy
```

**Note:** This must include the latest `TestimonialDisplay` migration for testimonial de-dup tracking.

Or trigger via the Render dashboard → Shell.

### Step 2.4: Verify Deployment

1. Visit `https://retriever-daily-digest.onrender.com`
2. Log in with your admin password
3. Test the Goals and Recipients tabs
4. Preview a digest

### Step 2.5: Set Up Cron Jobs

In Render dashboard → your web service → "Cron Jobs":

**Daily Digest (7:00 AM EST Mon-Fri = 12:00 UTC Mon-Fri):**
- Name: `daily-digest-weekdays`
- Schedule: `0 12 * * 1-5` (Monday-Friday only)
- Command:
```bash
curl -X POST https://retriever-digest.onrender.com/api/digest/daily -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

**Weekly Digest (Friday 9:00 PM EST = Saturday 02:00 UTC):**
- Name: `weekly-digest-friday`
- Schedule: `0 2 * * 6`
- Command:
```bash
curl -X POST https://retriever-digest.onrender.com/api/digest/weekly -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

**Note:** Daily digest only sends Mon-Fri. Monday's email will include Fri+Sat+Sun aggregated data from the weekend exports.

---

## Phase 3: PrintSmith Server Setup ✅ COMPLETE (2026-02-01)

### Step 3.1: Prepare Export Script

1. **Copy the `export/` folder** to PrintSmith server:
   ```
   C:\Retriever\export\
   ├── printsmith_export.py
   └── requirements.txt
   ```
   **Status:** ✅ Complete - Files at `C:\Retriever\export\`

2. **Install Python 3.10+** from python.org
   - Check "Add Python to PATH" during install
   - **IMPORTANT:** Select "Install for all users" to install to `C:\Program Files\Python313\`
   **Status:** ✅ Complete - Python 3.13 at `C:\Program Files\Python313\python.exe`

3. **Install dependencies:**
   ```cmd
   cd C:\Retriever\export
   pip install -r requirements.txt
   ```
   **Status:** ✅ Complete - psycopg2, requests, python-dotenv installed

### Step 3.2: Configure Environment Variables

**Option A (Recommended):** Create `.env` file at `C:\Retriever\.env`:
```
PRINTSMITH_HOST=localhost
PRINTSMITH_PORT=5432
PRINTSMITH_DB=printsmith
PRINTSMITH_USER=postgres
PRINTSMITH_PASSWORD=your_password
RENDER_API_URL=https://retriever-digest.onrender.com/api/export
EXPORT_API_SECRET=your_secret
```
The Python script automatically loads from `C:\Retriever\.env` (parent of export folder).

**Option B:** System Environment Variables via **System Properties** → **Environment Variables** → **System Variables**

**Status:** ✅ Complete - Using `.env` file at `C:\Retriever\.env`

### Step 3.3: Test Export Script

Open Command Prompt:

```cmd
cd C:\Retriever\export
python printsmith_export.py
```

**Expected output:**
```
2026-01-21 04:00:00 - INFO - Starting PrintSmith export...
2026-01-21 04:00:01 - INFO - Successfully connected to PrintSmith database
2026-01-21 04:00:01 - INFO - Target date for export: 2026-01-20
2026-01-21 04:00:02 - INFO - Found 15 completed invoices
...
2026-01-21 04:00:05 - INFO - Export completed successfully
2026-01-21 04:00:05 - INFO - Data posted to API: {"success": true}
```

### Step 3.4: Set Up Windows Task Scheduler ✅ COMPLETE

You need to create **TWO tasks**: one for daily exports and one for Friday evening.

**IMPORTANT:** The PrintSmith server is in **Pacific Time (PT)**. Convert times accordingly:
- 4:00 AM ET = 1:00 AM PT
- 8:00 PM ET = 5:00 PM PT

#### Task 1: Daily Export (All Days) ✅

- **Name:** `Retriever Daily Export`
- **Trigger:** Daily at **1:00 AM PT** (4:00 AM ET)
- **Action:**
  - Program: `"C:\Program Files\Python313\python.exe"` (with quotes!)
  - Arguments: `printsmith_export.py --source scheduled`
  - Start in: `C:\Retriever\export`
- **Run as:** Administrator (or account with access to `.env` file and Python). Password must match the account.
- **Status:** ✅ Tested and working (2026-02-01)

#### Task 2: Friday Evening Export ✅

- **Name:** `Retriever Friday Evening Export2`
- **Trigger:** Weekly on **Friday** at **5:00 PM PT** (8:00 PM ET)
- **Action:**
  - Program: `"C:\Program Files\Python313\python.exe"` (with quotes!)
  - Arguments: `printsmith_export.py --source scheduled`
  - Start in: `C:\Retriever\export`
- **Run as:** Administrator (or account with access to `.env` file and Python). Password must match the account.
- **Status:** ✅ Tested and working (2026-02-01)

**Note:** Path must be quoted because "Program Files" contains a space.

**Why Two Tasks?**
- Daily 4am export: Captures previous day's data (Mon exports Fri+Sat+Sun combined)
- Friday 8pm export: Ensures Friday's data is included in weekly digest (sends at 9pm EST)

### Step 3.5: Verify Scheduled Tasks ✅ COMPLETE

1. Right-click each task → "Run"
2. Check **History** tab for success (Event 102 = Task completed)
3. Check Render app → Testing tab → Preview should show real data

**Verification Results (2026-02-01):**
- Daily Export: ✅ Task completed successfully
- Friday Evening Export: ✅ Task completed successfully
- Script connects to PrintSmith DB and retrieves data
- YTD metrics confirmed: $662,378.04 revenue, 479 jobs

---

## Phase 4: End-to-End Testing ⏳ IN PROGRESS

### Day 1: Initial Test ✅ COMPLETE

- [x] Run export script manually on PrintSmith server - Tested 2026-02-01
- [x] Verify data appears in Render database (check DigestData table)
- [x] Preview daily digest - should show real PrintSmith data
- [x] Verify AI motivational summary appears at top (team-focused, positive tone)
- [x] Send test email to yourself - Tested 2026-01-27
- [x] Verify email renders correctly in Gmail and Outlook (SPF fix applied)
- [x] Confirm logo is visible (RETRIEVER@3x.png on brand red header #A1252B) - Updated 2026-02-03
- [x] Check professional styling (tight spacing, clean fonts)

### Day 2-3: Cron Test ✅ COMPLETE

- [x] Let Task Scheduler run export automatically - Verified 2026-02-06 at 8:00 PM EST
- [x] Export tracking system operational (`/CheckExport` command)
- [x] Source tracking working (manual vs scheduled exports)
- [x] Render cron triggering daily digest at 7:00 AM EST
- [x] Emails arriving in recipient inboxes
- [x] All sections rendering: highlights, PM/BD tables (with Estimates), progress bars

### Week 1: Full Cycle ⏳ IN PROGRESS

- [x] Monitor daily digests all week
- [x] PM Performance enhanced with Estimates column (deployed 2026-02-06)
- [x] **Verify Monday digest (Feb 10th)** - Weekend aggregation confirmed (Fri+Sat+Sun)
  - Daily scheduled export ran at 1:00 AM PT (9:00 AM UTC) on Feb 10 - SCHEDULED source confirmed
  - Manual weekend export tested Feb 9 - 25 invoices, $34,123.81 revenue
- [ ] Verify Friday weekly digest at 6:00 PM PST (9:00 PM EST)
- [ ] Check week-over-week comparisons are accurate

### Status Notes (2026-02-10)

**PM Estimates Bug Fix (Session 24):**
- PM Performance table was showing 0 estimates for all PMs despite summary showing 15
- Root cause: estimates sub-query in `get_daily_pm_performance()` filtered by `takenby IN valid_pms` which was dropping results
- Fix: removed `takenby` filter from estimates query; all estimates now counted by actual PM name
- Added diagnostic logging for `takenby` values on estimates
- **Action needed:** Copy updated `printsmith_export.py` to `C:\Retriever\export\` for scheduled exports

**Scheduled Task Fix (Session 23):**
- Daily task had **Logon Mode: "Interactive only"** which prevented it from running when nobody was logged in
- Fixed to **"Run whether user is logged on or not"** (same as Friday task)
- Script at `C:\Retriever\export\` was outdated - synced with repo version
- Both tasks now include `--source scheduled` in arguments
- Daily export confirmed working automatically: Feb 10 at 1:00 AM PT
- Friday evening export confirmed working: Feb 6 at 5:00 PM PT

**Monday Digest Logic Confirmed:**
- Monday 1:00 AM PT: Export runs and captures Fri+Sat+Sun data
- Monday 7:00 AM ET: Digest email sends with weekend aggregation
- This is the first time Friday's data appears (not shown on Friday)

**Cursor Commands Available:**
- `/CheckExport` - Verify export status and timing
- `/ManualExport` - Run manual export when needed
- `/ExportHelp` - Troubleshooting and documentation

---

## Phase 5: Go Live Checklist

### Security

- [ ] All secrets are unique and secure (not reused)
- [ ] `.env` file is NOT committed to git
- [ ] Admin password is strong (12+ characters)
- [ ] Verified sender domain in Resend (for deliverability)

### Monitoring

- [ ] Render logs are accessible
- [ ] Task Scheduler history is enabled
- [ ] Someone monitors for failed exports

### Backup Plan

- [ ] Document how to manually trigger digest if cron fails
- [ ] Know how to check export logs on PrintSmith server
- [ ] Have fallback contact if emails don't arrive

### Recipients

- [x] All recipients added to Recipients tab (33 team members added 2026-02-01)
- [ ] Verified email addresses are correct
- [ ] Test email sent to each recipient

### Sign-Off

- [ ] Stakeholder approves email design
- [ ] Sample digest reviewed for accuracy
- [ ] Go-live date communicated to team

---

## Troubleshooting

### Export script fails to connect
- Check VPN is connected (if running remotely)
- Verify PostgreSQL is running on PrintSmith server
- Check firewall allows port 5432

### Digest shows "mock data"
- Export hasn't run yet today
- Check Task Scheduler history for errors
- Manually run export and check Render logs

### Emails not arriving
- Check Resend dashboard for delivery status
- Verify EMAIL_FROM domain is verified
- Check spam folders
- Confirm RESEND_API_KEY is correct

### Cron job not running
- Check Render cron job logs
- Verify CRON_SECRET matches between cron command and env var
- Manually trigger with curl to test

---

## AI Features

### Motivational Team Summary
Each digest begins with an AI-generated motivational message that:
- Highlights team achievements (never individual callouts)
- References actual metrics from the period (revenue, orders, etc.)
- Maintains a professional tone appropriate for medical printing industry
- Falls back to pre-written content if Anthropic API is unavailable

### Daily Inspiration
At the bottom of each digest, a rotating quote or joke:
- Business/sales motivational quotes
- Clean, workplace-appropriate humor
- Automatic fallback if API fails
- Also includes short thoughtful reflections/mini-poems
- Avoids repeating recent inspirations based on DigestData cache

### AI Insights (from PrintSmith Data)
The Python export script generates intelligent insights:
- **Anniversary Reorders**: Large orders from 10-11 months ago
- **Lapsed Accounts**: High-value customers inactive for 6+ months
- **Hot Streak Accounts**: Customers increasing order frequency
- **High-Value Estimates**: Pending quotes over $1,000 needing follow-up
- **Past Due Accounts**: AR aging opportunities (if data available)

---

## Quick Reference

| Environment | URL |
|-------------|-----|
| Local Dev | http://localhost:3000 |
| Production | https://retriever-daily-digest.onrender.com |
| Export API | https://retriever-daily-digest.onrender.com/api/export |

| Cron Schedule | Time | Purpose |
|---------------|------|---------|
| `0 12 * * 1-5` | 7:00 AM ET (Mon-Fri) | Daily digest email |
| `0 2 * * 6` | 9:00 PM ET Friday | Weekly digest email |
| Task Scheduler Daily | 1:00 AM PT / 4:00 AM ET (All days) | PrintSmith export |
| Task Scheduler Friday | 5:00 PM PT / 8:00 PM ET (Friday only) | Friday evening export |

**Note:** PrintSmith server is in Pacific Time (PT), business operates in Eastern Time (ET).

| Contact | Purpose |
|---------|---------|
| Render Dashboard | App logs, cron status |
| PrintSmith Server | Export script, Task Scheduler |
| Resend Dashboard | Email delivery status |
