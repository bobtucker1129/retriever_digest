# Retriever Daily Digest

Internal sales motivation tool for BooneGraphics - extracts data from PrintSmith Vision and delivers daily/weekly email digests with sales metrics, goal progress, and AI insights.

## Tech Stack

- **Frontend/Backend**: Next.js 14 with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Email**: Resend
- **AI**: OpenAI (for motivational quotes/jokes)
- **Hosting**: Render

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

1. Clone the repository
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Fill in the environment variables (see below)
4. Install dependencies:
   ```bash
   npm install
   ```
5. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
6. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```
7. (Optional) Seed the database:
   ```bash
   npm run prisma:seed
   ```
8. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `ADMIN_PASSWORD` | Password for admin portal access | Yes |
| `RESEND_API_KEY` | API key from Resend.com | Yes |
| `EMAIL_FROM` | Sender email (e.g., "Retriever <digest@boonegraphics.com>") | Yes |
| `CRON_SECRET` | Secret for authenticating cron job requests | Yes |
| `EXPORT_API_SECRET` | Secret for PrintSmith export API | Yes |
| `OPENAI_API_KEY` | OpenAI API key for AI content | No (falls back to hardcoded content) |

## Render Deployment

### Using render.yaml (Blueprint)

The `render.yaml` file configures the deployment:

1. Push the repository to GitHub
2. In Render, create a new Blueprint from the repository
3. Render will automatically create:
   - Web service for the Next.js app
   - PostgreSQL database (starter plan)
4. Set the secret environment variables in the Render dashboard:
   - `ADMIN_PASSWORD`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `CRON_SECRET`
   - `EXPORT_API_SECRET`
   - `OPENAI_API_KEY`

### Manual Setup

1. Create a PostgreSQL database in Render
2. Create a Web Service with:
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npm run start`
3. Set environment variables (see table above)
4. The `DATABASE_URL` should use the internal connection string from Render

## API Endpoints

### Protected by Admin Session

- `GET /api/preview/daily` - Preview daily digest HTML
- `GET /api/preview/weekly` - Preview weekly digest HTML
- `POST /api/test-email` - Send test digest to an email

### Protected by Cron Secret

- `POST /api/digest/daily` - Trigger daily digest send (requires `X-Cron-Secret` header)
- `POST /api/digest/weekly` - Trigger weekly digest send (requires `X-Cron-Secret` header)

### Public

- `POST /api/export` - Receive PrintSmith data export (requires `X-Export-Secret` header)
