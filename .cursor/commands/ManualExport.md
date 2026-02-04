# ManualExport Command

When the user types `/ManualExport`, run the PrintSmith export script manually to send data to Render.

## Actions

1. **Verify prerequisites:**
   - Confirm .env file exists with required credentials
   - Check if user wants to run in dry-run mode first

2. **Ask for confirmation:**
   ```
   Ready to export PrintSmith data to Render.
   
   This will:
   - Connect to PrintSmith database
   - Query yesterday's sales data (or weekend data if Monday)
   - Send data to Render API
   - Mark export as "manual" source
   
   Continue? [Yes/No]
   ```

3. **Run the export:**
   ```bash
   cd export && python3 printsmith_export.py --source manual
   ```

4. **Monitor the output:**
   - Watch for successful database connection
   - Note any warnings or errors
   - Confirm data was posted to API successfully
   - Check for response confirmation from Render

5. **Verify the export:**
   After successful completion, automatically run:
   ```bash
   python3 check_last_export.py
   ```
   
   Confirm the new export appears with:
   - Today's date
   - "MANUAL" source
   - Recent timestamp (within last few minutes)

6. **Provide summary:**
   ```
   ✅ Manual export completed successfully!
   
   - Date: [export date]
   - Records: [invoice count], [estimate count]
   - Revenue: $[amount]
   - Status: Data sent to Render
   
   The digest can now be generated with today's data.
   ```

## Options

### Dry Run Mode
If user wants to test without sending data:
```bash
cd export && python3 printsmith_export.py --dry-run
```

This will:
- Query PrintSmith database
- Show what data would be sent
- NOT post to Render API

### Custom Source Tag
If user wants a different source identifier:
```bash
cd export && python3 printsmith_export.py --source "testing" 
```

## Troubleshooting

**Connection failed:**
- Check PrintSmith database credentials in .env
- Verify PrintSmith server is accessible
- Check network/VPN connection

**API post failed:**
- Verify RENDER_API_URL in .env
- Check EXPORT_API_SECRET matches Render configuration
- Ensure Render deployment is running

**Data looks wrong:**
- Use --dry-run to review data before sending
- Check date logic (Monday should get weekend data)
- Verify PrintSmith database has recent records
