# CheckExport Command

When the user types `/CheckExport`, run the export checking script to see when Render last received PrintSmith data.

## Actions

1. **Run the check script:**
   ```bash
   cd export && python3 check_last_export.py
   ```

2. **Interpret the results:**
   - Look for the most recent export date and time
   - Check if source is "SCHEDULED" or "MANUAL"
   - Note the timestamp to verify it matches expected schedule

3. **Provide guidance based on results:**

   **If last export is SCHEDULED:**
   - ✅ Scheduled task is working
   - Note the time it ran for future reference
   - Confirm digest should be ready

   **If last export is MANUAL:**
   - ⚠️ Scheduled task may not be running
   - Check if this is expected (e.g., testing phase)
   - Suggest checking again tomorrow to verify scheduled task

   **If no recent export found:**
   - ❌ No data received recently
   - Suggest running manual export
   - Recommend checking scheduled task configuration

4. **Show next steps:**
   - If everything looks good: "Export is current, digest should be ready"
   - If manual needed: "Run `/ManualExport` to send data now"
   - If scheduled task failed: "Check scheduled task logs on PrintSmith server"

## Example Output

```
## Export Status Check

📊 Last Export Received:
- Date: 2026-02-03
- Time: 06:15 AM UTC
- Source: SCHEDULED TASK (automatic)
- Status: ✅ Working correctly

✅ Scheduled task is running on time!
The digest should have fresh data for today.

Next automatic export expected: Tomorrow ~6:15 AM UTC
```

## Troubleshooting

If the command fails to connect:
- Verify RENDER_API_URL and EXPORT_API_SECRET are set in .env
- Check if Render deployment is running
- Verify network connectivity
