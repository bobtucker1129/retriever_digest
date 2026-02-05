# PrintSmith Export Scheduling Guide

## Quick Reference

### Using Cursor Commands (Recommended)

If you're in Cursor, just type:
- `/CheckExport` - Check if scheduled task worked
- `/ManualExport` - Run export manually
- `/ExportHelp` - Show full help and troubleshooting

### Using Command Line

Alternatively, run scripts directly.

**On PrintSmith server (Windows):**
```cmd
cd C:\Retriever\export
"C:\Program Files\Python313\python.exe" check_last_export.py
```

**On Mac/Linux:**
```bash
python3 export/check_last_export.py
```

This will show:
- When the last export was received
- Whether it was MANUAL or SCHEDULED
- Timestamp to verify it matches your scheduled task time

**Manual Export (when scheduled task fails):**

On PrintSmith server:
```cmd
cd C:\Retriever\export
"C:\Program Files\Python313\python.exe" printsmith_export.py --source manual
```

On Mac/Linux:
```bash
python3 export/printsmith_export.py --source manual
```

### Scheduled Task Configuration

On the PrintSmith server, the scheduled task should run:

```bash
python3 /path/to/printsmith_export.py --source scheduled
```

**Important:** Add `--source scheduled` to distinguish automatic exports from manual ones.

## How It Works

1. **Export Script** runs on the PrintSmith server (either manually or via scheduled task)
2. **Marks the source** as "manual" or "scheduled" 
3. **Sends data** to Render's API endpoint
4. **Render stores** the data with a timestamp (`createdAt`)
5. **Check script** queries Render to see when last export was received and from what source

## Troubleshooting

### Problem: Scheduled task not running

**Check:**
1. Run `check_last_export.py` - if the last export shows "MANUAL", the scheduled task didn't work
2. Verify the scheduled task time matches when you expect it to run
3. Check the scheduled task logs on the PrintSmith server

**Temporary fix:**
Run manual export: `python3 export/printsmith_export.py --source manual`

### Problem: Can't tell if scheduled task worked

**Solution:**
- After today's manual export, wait until tomorrow morning
- Run `check_last_export.py` 
- Look for a new export with source "SCHEDULED"
- Check the timestamp - it should match your scheduled task time

## Scheduled Task Setup (Windows Task Scheduler)

When configuring the scheduled task on the PrintSmith server:

**Program/Script:**
```
"C:\Program Files\Python313\python.exe"
```
(Quotes required because of the space in "Program Files".)

**Arguments:**
```
printsmith_export.py --source scheduled
```

**Start in:**
```
C:\Retriever\export
```

**Run as:** Administrator (or account with access to `C:\Retriever\.env`). The stored password must match the account.

**Schedule:**
- Daily at 1:00 AM PT (4:00 AM ET) for daily export
- Friday at 5:00 PM PT (8:00 PM ET) for Friday evening export
- Before the digest email is sent

## Testing Tomorrow

1. **Today:** Run manual export if needed
   ```bash
   python3 export/printsmith_export.py --source manual
   ```

2. **Tomorrow morning:** Check if scheduled task worked
   ```bash
   python3 export/check_last_export.py
   ```

3. **Look for:**
   - New export dated today
   - Source shows "SCHEDULED TASK (automatic)"
   - Timestamp matches your scheduled task time

4. **If it didn't work:**
   - You'll only see yesterday's MANUAL export
   - Run manual export again as temporary fix
   - Troubleshoot the scheduled task later
