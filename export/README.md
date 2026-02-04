# PrintSmith Export Scripts

This directory contains scripts for exporting PrintSmith data to the Retriever Daily Digest application.

## Quick Start (Cursor Commands)

If you're using Cursor IDE, you can use these commands for easy access:

- **Type `/CheckExport`** - Check if scheduled task worked
- **Type `/ManualExport`** - Run export manually  
- **Type `/ExportHelp`** - Show full help guide

See [`.cursor/commands/`](../.cursor/commands/) for all available commands.

## Scripts

### `printsmith_export.py`
Main export script that connects to PrintSmith database and sends data to Render.

**Usage:**
```bash
# Manual export (default)
python3 printsmith_export.py

# Manual export (explicit)
python3 printsmith_export.py --source manual

# Scheduled task export (for automated tasks)
python3 printsmith_export.py --source scheduled

# Dry run (test without sending to API)
python3 printsmith_export.py --dry-run
```

**Options:**
- `--source` - Identifies export source: `manual`, `scheduled`, or custom identifier
- `--dry-run` - Print JSON output without posting to API

### `check_last_export.py`
Check when the last export was received by Render and its source.

**Usage:**
```bash
python3 check_last_export.py
```

**Shows:**
- All exports from the last 7 days
- When each export was received (timestamp)
- Whether it was MANUAL or SCHEDULED
- Time since last export

## Configuration

Both scripts require a `.env` file in the project root with:

```bash
# PrintSmith Database
PRINTSMITH_HOST=
PRINTSMITH_PORT=
PRINTSMITH_DB=
PRINTSMITH_USER=
PRINTSMITH_PASSWORD=

# Render API
RENDER_API_URL=https://your-app.onrender.com/api/export
EXPORT_API_SECRET=your-secret-key
```

## Workflow

### Daily Manual Export
When the scheduled task isn't working:

1. Run export manually:
   ```bash
   python3 printsmith_export.py --source manual
   ```

2. Verify it was received:
   ```bash
   python3 check_last_export.py
   ```

### Checking Scheduled Task
To verify if the scheduled task is working:

1. Wait for scheduled time to pass
2. Run check script:
   ```bash
   python3 check_last_export.py
   ```
3. Look for export with source "SCHEDULED TASK (automatic)"
4. Verify timestamp matches expected scheduled time

## See Also

- `SCHEDULING.md` - Detailed guide for setting up and troubleshooting scheduled tasks
- `requirements.txt` - Python dependencies
