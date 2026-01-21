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

## Render Cron Job Setup

Render supports cron jobs to trigger scheduled tasks. Set up the following cron jobs to send daily and weekly digests automatically.

### Daily Digest

- **Schedule**: `0 12 * * *` (12:00 UTC = 4:00 AM PST)
- **Endpoint**: `POST /api/digest/daily`
- **Header**: `X-Cron-Secret: <your-cron-secret>`

This sends the daily digest to all active recipients every morning before the workday starts.

### Weekly Digest

- **Schedule**: `0 2 * * 6` (02:00 UTC Saturday = 6:00 PM PST Friday)
- **Endpoint**: `POST /api/digest/weekly`
- **Header**: `X-Cron-Secret: <your-cron-secret>`

This sends the weekly summary digest at the end of the business week on Friday evening.

### Setting Up in Render

1. In your Render dashboard, go to your web service
2. Click **Cron Jobs** in the left sidebar
3. Click **Create Cron Job**
4. For each digest:
   - **Name**: `daily-digest` or `weekly-digest`
   - **Schedule**: Use the cron expression above
   - **Command**: Use curl to call the endpoint (see examples below)

### Example Curl Commands

**Daily Digest:**
```bash
curl -X POST https://your-app.onrender.com/api/digest/daily \
  -H "X-Cron-Secret: your-cron-secret-here"
```

**Weekly Digest:**
```bash
curl -X POST https://your-app.onrender.com/api/digest/weekly \
  -H "X-Cron-Secret: your-cron-secret-here"
```

### Testing Cron Jobs Locally

You can test the cron endpoints locally by running the curl commands against `http://localhost:3000`:

```bash
# Test daily digest
curl -X POST http://localhost:3000/api/digest/daily \
  -H "X-Cron-Secret: your-local-cron-secret"

# Test weekly digest
curl -X POST http://localhost:3000/api/digest/weekly \
  -H "X-Cron-Secret: your-local-cron-secret"
```

Expected responses:
- **Success**: `{"success":true,"sent":3,"failed":0}`
- **No data**: `{"error":"No digest data available"}`
- **Invalid secret**: `{"error":"Unauthorized"}`

## PrintSmith Export Script Setup

The export script runs on the PrintSmith server to extract sales data and send it to the Retriever Daily Digest web app.

### Prerequisites

1. **Install Python 3** (if not already installed):
   - Download Python 3.10+ from [python.org](https://www.python.org/downloads/windows/)
   - During installation, check "Add Python to PATH"
   - Verify installation: `python --version`

2. **Install pip** (usually included with Python 3):
   - Verify: `pip --version`
   - If missing: `python -m ensurepip --upgrade`

### Installation

1. Copy the `export/` folder to the PrintSmith server (e.g., `C:\Retriever\export\`)

2. Open Command Prompt as Administrator and navigate to the folder:
   ```cmd
   cd C:\Retriever\export
   ```

3. Install Python dependencies:
   ```cmd
   pip install -r requirements.txt
   ```

### Environment Variables

Configure the following environment variables on the PrintSmith server:

| Variable | Description | Example |
|----------|-------------|---------|
| `PRINTSMITH_HOST` | PrintSmith PostgreSQL host | `localhost` or `192.168.1.100` |
| `PRINTSMITH_PORT` | PostgreSQL port | `5432` |
| `PRINTSMITH_DB` | PrintSmith database name | `printsmiths` |
| `PRINTSMITH_USER` | Database username | `postgres` |
| `PRINTSMITH_PASSWORD` | Database password | `your-password` |
| `RETRIEVER_API_URL` | Retriever app URL | `https://your-app.onrender.com/api/export` |
| `EXPORT_API_SECRET` | API secret (must match server) | `your-export-secret` |

To set environment variables permanently on Windows:
1. Open System Properties → Advanced → Environment Variables
2. Add each variable under "System variables"

### Running Manually

Test the script manually before setting up scheduled tasks:

```cmd
cd C:\Retriever\export
python printsmith_export.py
```

Expected output:
```
2026-01-21 04:00:00 - INFO - Starting PrintSmith export...
2026-01-21 04:00:00 - INFO - Connecting to PrintSmith database...
2026-01-21 04:00:01 - INFO - Successfully connected to PrintSmith database
2026-01-21 04:00:01 - INFO - Target date for export: 2026-01-20
...
2026-01-21 04:00:05 - INFO - Export completed successfully
```

### Windows Task Scheduler Setup

Set up Task Scheduler to run the export at **4:00 AM EST daily**:

1. Open **Task Scheduler** (search in Start menu)
2. Click **Create Task** (not "Create Basic Task")
3. Configure the task:

**General Tab:**
- Name: `Retriever PrintSmith Export`
- Description: `Exports PrintSmith data to Retriever Daily Digest`
- Check "Run whether user is logged on or not"
- Check "Run with highest privileges"

**Triggers Tab:**
- Click **New...**
- Begin the task: On a schedule
- Daily, Start: `4:00:00 AM`
- Recur every: 1 day
- Check "Enabled"

**Actions Tab:**
- Click **New...**
- Action: Start a program
- Program/script: `python`
- Add arguments: `C:\Retriever\export\printsmith_export.py`
- Start in: `C:\Retriever\export`

**Conditions Tab:**
- Uncheck "Start only if the computer is on AC power" (for servers)

**Settings Tab:**
- Check "Allow task to be run on demand"
- Check "Run task as soon as possible after a scheduled start is missed"
- Check "If the task fails, restart every: 5 minutes" (up to 3 attempts)

4. Click **OK** and enter your Windows credentials when prompted

### Example Task Scheduler XML

You can import this XML directly into Task Scheduler:

```xml
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Exports PrintSmith data to Retriever Daily Digest</Description>
    <URI>\Retriever PrintSmith Export</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T04:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>Password</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>python</Command>
      <Arguments>C:\Retriever\export\printsmith_export.py</Arguments>
      <WorkingDirectory>C:\Retriever\export</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
```

To import:
1. Save the XML above as `retriever-export-task.xml`
2. Open Task Scheduler
3. Click **Import Task...** in the Actions panel
4. Select the XML file
5. Update the user credentials when prompted

### Troubleshooting

#### "python is not recognized as an internal or external command"

Python is not in your system PATH:
1. Find Python installation (usually `C:\Users\<user>\AppData\Local\Programs\Python\Python3X\`)
2. Add both the Python folder and its `Scripts` subfolder to your PATH
3. Restart Command Prompt

#### "ModuleNotFoundError: No module named 'psycopg2'"

Dependencies not installed:
```cmd
pip install -r requirements.txt
```

If pip fails, try:
```cmd
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

#### "Missing required environment variables"

Environment variables are not set or not visible to the scheduled task:
1. Set variables as **System variables** (not User variables)
2. Restart the computer after setting variables
3. Test by running the script manually first

#### "Failed to connect to database"

Check:
1. PrintSmith PostgreSQL is running
2. Host/port are correct (try `localhost` if on same machine)
3. Database name, username, password are correct
4. PostgreSQL is configured to accept connections (check `pg_hba.conf`)

#### "Connection refused" or timeout errors

1. Check Windows Firewall isn't blocking PostgreSQL (port 5432)
2. Verify PostgreSQL is listening on the correct interface
3. Check `postgresql.conf` has `listen_addresses = '*'` or correct IP

#### Task runs but no data appears in Retriever

1. Check the task's **History** tab for errors
2. Verify `RETRIEVER_API_URL` and `EXPORT_API_SECRET` are set correctly
3. Check Retriever app logs in Render dashboard
4. Test the API endpoint manually:
   ```cmd
   curl -X POST https://your-app.onrender.com/api/export -H "X-Export-Secret: your-secret" -H "Content-Type: application/json" -d "{\"test\":true}"
   ```

#### Script works manually but fails in Task Scheduler

1. Ensure "Run whether user is logged on or not" is checked
2. Make sure the user has "Log on as a batch job" rights
3. Use full paths for Python and the script in the Action settings
4. Set the correct "Start in" working directory
