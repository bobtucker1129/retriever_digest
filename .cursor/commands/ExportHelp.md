# ExportHelp Command

When the user types `/ExportHelp`, provide comprehensive guidance on the PrintSmith export system.

## Actions

1. **Display overview:**
   ```
   # PrintSmith Export System
   
   The export system connects to your PrintSmith database and sends 
   daily sales data to Render for the digest email.
   
   ## Available Commands:
   - `/CheckExport` - See when last export was received
   - `/ManualExport` - Run export manually right now
   - `/ExportHelp` - Show this help guide (you're here!)
   ```

2. **Show common workflows:**

   ### Daily Check (Recommended)
   ```
   1. Run `/CheckExport` each morning
   2. Verify scheduled task ran overnight
   3. If no scheduled export found, run `/ManualExport`
   ```

   ### Testing Scheduled Task
   ```
   1. Wait for scheduled time to pass
   2. Run `/CheckExport`
   3. Look for "SCHEDULED" source in results
   4. Verify timestamp matches expected time
   ```

   ### Emergency Manual Export
   ```
   1. Run `/ManualExport` immediately
   2. Wait for completion
   3. Confirm with `/CheckExport`
   4. Troubleshoot scheduled task later
   ```

3. **Display file locations:**
   ```
   ## Important Files:
   
   Scripts:
   - `export/printsmith_export.py` - Main export script
   - `export/check_last_export.py` - Check status script
   
   Documentation:
   - `export/README.md` - Quick reference guide
   - `export/SCHEDULING.md` - Scheduled task setup guide
   
   Configuration:
   - `.env` - Database and API credentials (not in git)
   - `.env.example` - Template for required variables
   ```

4. **Show scheduled task setup:**
   Open and display key sections from `export/SCHEDULING.md`:
   - How to configure Windows Task Scheduler
   - Required command-line arguments
   - Testing procedures

5. **Provide troubleshooting tree:**
   ```
   ## Quick Troubleshooting:
   
   ❓ "Did scheduled task run?"
      → Run `/CheckExport`
      → Look for "SCHEDULED" source
   
   ❓ "Need to run manually?"
      → Run `/ManualExport`
      → Use `--source manual` flag
   
   ❓ "What data will be exported?"
      → Run: `python3 export/printsmith_export.py --dry-run`
      → Review output without sending
   
   ❓ "Can't connect to PrintSmith?"
      → Check .env has PRINTSMITH_* credentials
      → Verify network/VPN access
      → Check PrintSmith server is running
   
   ❓ "Can't reach Render API?"
      → Check .env has RENDER_API_URL
      → Verify EXPORT_API_SECRET matches
      → Test Render deployment is running
   ```

6. **Show environment variables needed:**
   Display contents of `.env.example` relevant to exports:
   ```bash
   # PrintSmith Database
   PRINTSMITH_HOST=
   PRINTSMITH_PORT=
   PRINTSMITH_DB=
   PRINTSMITH_USER=
   PRINTSMITH_PASSWORD=
   
   # Render API
   RENDER_API_URL=https://your-app.onrender.com/api/export
   EXPORT_API_SECRET=
   ```

## Additional Resources

Offer to open any of these files for detailed information:
- `export/README.md` - Script usage
- `export/SCHEDULING.md` - Scheduled task guide
- `export/printsmith_export.py` - View the script code
- `.env.example` - See all required variables

## Interactive Help

After showing the overview, ask:
```
What would you like to do?
1. Check export status now
2. Run manual export
3. View scheduling guide
4. See script documentation
5. Troubleshoot an issue
```

And route to the appropriate command or documentation based on their choice.
