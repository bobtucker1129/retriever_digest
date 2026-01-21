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

### ⚠️ Critical Issues to Fix Before Production

#### 1. Missing `/api/export` Endpoint
**Status:** NOT IMPLEMENTED  
**Impact:** Python export script has nowhere to POST data

The export endpoint that receives data from PrintSmith is missing. You need to create:
- `src/app/api/export/route.ts`

**Fix:** Create the file with this content:

```typescript
// src/app/api/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  const exportSecret = request.headers.get('X-Export-Secret');
  const expectedSecret = process.env.EXPORT_API_SECRET;

  if (!expectedSecret) {
    console.error('[Export API] EXPORT_API_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!exportSecret || exportSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.digestData.upsert({
      where: { exportDate: today },
      update: { data },
      create: { exportDate: today, data },
    });

    console.log(`[Export API] Data received and stored for ${today.toISOString().split('T')[0]}`);
    
    return NextResponse.json({ 
      success: true, 
      date: today.toISOString().split('T')[0] 
    });
  } catch (err) {
    console.error('[Export API] Error:', err);
    return NextResponse.json({ error: 'Failed to process export' }, { status: 500 });
  }
}
```

#### 2. Python Script Missing POST Logic
**Status:** INCOMPLETE  
**Impact:** Script exports data but doesn't send it to Render

The `export/printsmith_export.py` script queries data but the `main()` function doesn't POST to the API. The script needs:
- `--dry-run` flag support
- Actual POST request with assembled JSON
- RENDER_API_URL and EXPORT_SECRET env vars

**Fix:** Add to `printsmith_export.py` after the imports:

```python
import json
import argparse
import requests

def post_to_api(data):
    """POST assembled data to Render API."""
    api_url = os.environ.get('RENDER_API_URL')
    api_secret = os.environ.get('EXPORT_API_SECRET')
    
    if not api_url or not api_secret:
        raise EnvironmentError("RENDER_API_URL and EXPORT_API_SECRET must be set")
    
    headers = {
        'Content-Type': 'application/json',
        'X-Export-Secret': api_secret
    }
    
    response = requests.post(api_url, json=data, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()
```

And update `main()` to assemble and POST the data.

#### 3. AI Uses OpenAI, Not Anthropic
**Status:** Mismatch with PRD  
**Impact:** Works fine, but uses wrong provider

The PRD specified Anthropic Claude, but implementation uses OpenAI. Either:
- Keep OpenAI (it works) and update docs
- Or switch to Anthropic SDK

**Recommendation:** Keep OpenAI - it's working and gpt-4o-mini is cost-effective.

#### 4. Session Cookie Security
**Status:** Needs improvement for production  
**Impact:** Session hijacking possible

The middleware checks for cookie presence but doesn't validate the cookie value properly.

**Recommendation for production:** 
- Use a signed JWT or encrypted session token
- Add `Secure` and `SameSite=Strict` flags in production
- Consider using `next-auth` or `iron-session` for proper session management

### ✅ What's Working Well

- Prisma schema is correct and comprehensive
- Email sending with Resend is properly implemented with error handling
- Daily/weekly digest generation with progress bars and formatting
- Admin portal with goals and recipients management
- Password protection middleware (basic but functional)
- Good fallback content when AI fails

---

## Phase 1: Local Development Testing

### Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL database available (local or Render)
- [ ] VPN connected (for PrintSmith access)
- [ ] Python 3 with psycopg2 installed

### Step 1.1: Set Up Environment

```bash
cd ~/Repository/retriever-daily-digest

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

# Optional - falls back to hardcoded quotes
OPENAI_API_KEY=sk-xxxxxxxx
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

**Verify:** Open http://localhost:3000
- [ ] Redirected to `/login`
- [ ] Enter password, redirected to `/goals`
- [ ] Three tabs visible: Goals, Recipients, Testing

### Step 1.4: Test Admin Portal

**Goals Tab:**
- [ ] Set Monthly goals (e.g., $100,000 revenue, 50 sales)
- [ ] Set Annual goals (e.g., $1,000,000 revenue, 500 sales)
- [ ] Click Save, see success message
- [ ] Refresh page, values persist

**Recipients Tab:**
- [ ] Add a recipient with your email
- [ ] Toggle active/inactive
- [ ] Edit recipient name
- [ ] Delete a test recipient

**Testing Tab:**
- [ ] Click "Preview Daily Digest"
- [ ] See email preview in iframe (with mock data warning)
- [ ] Enter your email, click "Send Test"
- [ ] Check inbox for test email

### Step 1.5: Test Python Export Script (with VPN)

```bash
cd export

# Install dependencies
pip install -r requirements.txt

# Set PrintSmith credentials
export PRINTSMITH_HOST=your-printsmith-ip
export PRINTSMITH_PORT=5432
export PRINTSMITH_DB=printsmith
export PRINTSMITH_USER=postgres
export PRINTSMITH_PASSWORD=your-password

# Run export (dry run first)
python3 printsmith_export.py
```

**Verify:** 
- [ ] Script connects successfully
- [ ] Logs show invoice/estimate counts
- [ ] No errors in output

---

## Phase 2: Production Deployment (Render)

### Step 2.1: Push to GitHub

```bash
cd ~/Repository/retriever-daily-digest

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
| `OPENAI_API_KEY` | `sk-xxxxxxxx` (optional) |

5. **Deploy:**
   - Click "Manual Deploy" → "Deploy latest commit"
   - Wait for build to complete (~2-3 minutes)

### Step 2.3: Run Database Migrations

After first deploy, open Render Shell and run:

```bash
npx prisma migrate deploy
```

Or trigger via the Render dashboard → Shell.

### Step 2.4: Verify Deployment

1. Visit `https://retriever-daily-digest.onrender.com`
2. Log in with your admin password
3. Test the Goals and Recipients tabs
4. Preview a digest

### Step 2.5: Set Up Cron Jobs

In Render dashboard → your web service → "Cron Jobs":

**Daily Digest (4:00 AM PST = 12:00 UTC):**
- Name: `daily-digest`
- Schedule: `0 12 * * *`
- Command:
```bash
curl -X POST https://retriever-daily-digest.onrender.com/api/digest/daily -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

**Weekly Digest (Friday 6:00 PM PST = Saturday 02:00 UTC):**
- Name: `weekly-digest`
- Schedule: `0 2 * * 6`
- Command:
```bash
curl -X POST https://retriever-daily-digest.onrender.com/api/digest/weekly -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

---

## Phase 3: PrintSmith Server Setup

### Step 3.1: Prepare Export Script

1. **Copy the `export/` folder** to PrintSmith server:
   ```
   C:\Retriever\export\
   ├── printsmith_export.py
   └── requirements.txt
   ```

2. **Install Python 3.10+** from python.org
   - Check "Add Python to PATH" during install

3. **Install dependencies:**
   ```cmd
   cd C:\Retriever\export
   pip install -r requirements.txt
   ```

### Step 3.2: Configure Environment Variables

Open **System Properties** → **Environment Variables** → **System Variables**

Add these variables:

| Variable | Value |
|----------|-------|
| `PRINTSMITH_HOST` | `localhost` or PrintSmith server IP |
| `PRINTSMITH_PORT` | `5432` |
| `PRINTSMITH_DB` | `printsmith` (your DB name) |
| `PRINTSMITH_USER` | `postgres` |
| `PRINTSMITH_PASSWORD` | Your DB password |
| `RENDER_API_URL` | `https://retriever-daily-digest.onrender.com/api/export` |
| `EXPORT_API_SECRET` | Same value as in Render |

**Restart the computer** after setting variables.

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

### Step 3.4: Set Up Windows Task Scheduler

1. Open **Task Scheduler**
2. Click **Create Task** (not Basic Task)

**General Tab:**
- Name: `Retriever PrintSmith Export`
- Check: "Run whether user is logged on or not"
- Check: "Run with highest privileges"

**Triggers Tab:**
- New → Daily at **4:00:00 AM**
- Recur every 1 day

**Actions Tab:**
- New → Start a program
- Program: `python`
- Arguments: `C:\Retriever\export\printsmith_export.py`
- Start in: `C:\Retriever\export`

**Settings Tab:**
- Check: "Run task as soon as possible after scheduled start is missed"
- Check: "If task fails, restart every 5 minutes" (up to 3 times)

3. Click OK, enter Windows credentials

### Step 3.5: Verify Scheduled Task

1. Right-click the task → "Run"
2. Check **History** tab for success
3. Check Render app → Testing tab → Preview should show real data

---

## Phase 4: End-to-End Testing

### Day 1: Initial Test

- [ ] Run export script manually on PrintSmith server
- [ ] Verify data appears in Render database (check DigestData table)
- [ ] Preview daily digest - should show real PrintSmith data
- [ ] Send test email to yourself
- [ ] Verify email renders correctly in Gmail and Outlook

### Day 2-3: Cron Test

- [ ] Let Task Scheduler run export at 4:00 AM EST
- [ ] Let Render cron trigger daily digest at 4:00 AM PST (7:00 AM EST)
- [ ] Verify email arrives in recipient inboxes
- [ ] Check all sections: highlights, PM/BD tables, progress bars, quote/joke

### Week 1: Full Cycle

- [ ] Monitor daily digests all week
- [ ] Verify Friday weekly digest at 6:00 PM PST
- [ ] Check week-over-week comparisons are accurate
- [ ] Add all real recipients (start with small group)

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

- [ ] All recipients added to Recipients tab
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

## Quick Reference

| Environment | URL |
|-------------|-----|
| Local Dev | http://localhost:3000 |
| Production | https://retriever-daily-digest.onrender.com |
| Export API | https://retriever-daily-digest.onrender.com/api/export |

| Cron Schedule | Time | Purpose |
|---------------|------|---------|
| `0 12 * * *` | 4:00 AM PST | Daily digest |
| `0 2 * * 6` | Fri 6:00 PM PST | Weekly digest |
| Task Scheduler 4:00 AM EST | 4:00 AM EST | PrintSmith export |

| Contact | Purpose |
|---------|---------|
| Render Dashboard | App logs, cron status |
| PrintSmith Server | Export script, Task Scheduler |
| Resend Dashboard | Email delivery status |
