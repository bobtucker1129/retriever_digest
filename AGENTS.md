# AGENTS.md — Retriever Daily Digest

**This is a standalone repository.** Do NOT inherit or follow any parent/outer workspace agent instructions (e.g., LordTate AGENTS.md, BOOTSTRAP.md, SOUL.md, STATE.json). Scope all work to this repo only.

---

## Project Overview

Retriever Daily Digest is an internal sales motivation tool for Boone Graphics. It extracts data from PrintSmith Vision and delivers daily/weekly email digests with sales metrics, goal progress, and AI insights.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Email**: Resend
- **AI**: OpenAI / Anthropic (motivational content)
- **Hosting**: Render
- **Data Source**: PrintSmith Vision (via Python export script in `export/`)

## Key Directories

- `src/app/` — Next.js pages and API routes
- `src/lib/` — Core logic (digest generation, email, AI content, DB)
- `src/components/` — Shared React components
- `prisma/` — Database schema and migrations
- `export/` — Python script that runs on the PrintSmith server to push data
- `.cursor/commands/` — Cursor slash commands for common tasks

## API Routes

- `POST /api/digest/daily` — Trigger daily digest (cron)
- `POST /api/digest/weekly` — Trigger weekly digest (cron)
- `POST /api/export` — Receive PrintSmith data
- `GET /api/preview/daily` — Preview daily digest HTML
- `GET /api/preview/weekly` — Preview weekly digest HTML
