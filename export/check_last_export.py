#!/usr/bin/env python3
"""
Check Last Export Script
Queries Render API to see when the last PrintSmith export was received.
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import requests
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(env_path)


def check_last_export():
    """Query Render API for recent exports."""
    api_url = os.environ.get('RENDER_API_URL')
    api_secret = os.environ.get('EXPORT_API_SECRET')
    
    if not api_url or not api_secret:
        print("ERROR: RENDER_API_URL or EXPORT_API_SECRET not set in .env")
        sys.exit(1)
    
    # Build the recent endpoint URL
    recent_url = api_url.replace('/api/export', '/api/export/recent')
    if recent_url == api_url:
        recent_url = api_url.rstrip('/') + '/recent'
    
    recent_url = f"{recent_url}?days=7"
    
    headers = {
        'X-Export-Secret': api_secret
    }
    
    try:
        print(f"Checking last export from: {recent_url}\n")
        response = requests.get(recent_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        recent_digests = data.get('recentDigests', [])
        
        if not recent_digests:
            print("No exports found in the last 7 days")
            return
        
        print(f"Found {len(recent_digests)} export(s) in the last 7 days:\n")
        
        for digest in recent_digests:
            export_date = digest.get('date', 'Unknown')
            received_at = digest.get('receivedAt', 'Unknown')
            export_source = digest.get('exportSource', 'unknown')
            
            print(f"📅 Export Date: {export_date}")
            
            # Show source with appropriate emoji
            if export_source == 'scheduled':
                print(f"   🤖 Source: SCHEDULED TASK (automatic)")
            elif export_source == 'manual':
                print(f"   👤 Source: MANUAL (run by hand)")
            else:
                print(f"   ❓ Source: {export_source}")
            
            if received_at != 'Unknown':
                # Parse and display in EST/EDT timezone
                try:
                    dt_utc = datetime.fromisoformat(received_at.replace('Z', '+00:00'))
                    # Convert to Eastern Time (handles EST/EDT automatically)
                    dt_eastern = dt_utc.astimezone(ZoneInfo('America/New_York'))
                    tz_name = dt_eastern.strftime('%Z')  # Will show EST or EDT
                    local_time = dt_eastern.strftime('%Y-%m-%d %I:%M:%S %p')
                    print(f"   ⏰ Received: {local_time} {tz_name}")
                    
                    # Calculate how long ago
                    now = datetime.now(ZoneInfo('America/New_York'))
                    delta = now - dt_eastern
                    hours_ago = delta.total_seconds() / 3600
                    if hours_ago < 1:
                        print(f"   📊 {int(delta.total_seconds() / 60)} minutes ago")
                    elif hours_ago < 24:
                        print(f"   📊 {int(hours_ago)} hours ago")
                    else:
                        print(f"   📊 {int(hours_ago / 24)} days ago")
                except Exception:
                    print(f"   ⏰ Received: {received_at}")
            
            if 'accountNames' in digest and digest['accountNames']:
                print(f"   👥 Featured accounts: {', '.join(digest['accountNames'][:3])}")
            print()
        
        # Show most recent export details
        if recent_digests:
            latest = recent_digests[0]
            print("\n" + "="*60)
            print("📈 LATEST EXPORT SUMMARY")
            print("="*60)
            print(f"Export date: {latest.get('date')}")
            print(f"Source: {latest.get('exportSource', 'unknown').upper()}")
            if latest.get('receivedAt'):
                try:
                    dt_utc = datetime.fromisoformat(latest['receivedAt'].replace('Z', '+00:00'))
                    dt_eastern = dt_utc.astimezone(ZoneInfo('America/New_York'))
                    tz_name = dt_eastern.strftime('%Z')  # Will show EST or EDT
                    print(f"Received at: {dt_eastern.strftime('%Y-%m-%d %I:%M:%S %p')} {tz_name}")
                    
                    if latest.get('exportSource') == 'manual':
                        print(f"\n⚠️  This was a MANUAL export.")
                        print(f"   Tomorrow, check if a SCHEDULED export appears automatically.")
                    else:
                        print(f"\n✅ This was from the scheduled task!")
                        print(f"   Tomorrow's export should appear around the same time.")
                    
                    print(f"\n💡 To check tomorrow, run this script again:")
                    print(f"   python3 export/check_last_export.py")
                    print(f"   or type: /CheckExport")
                except Exception:
                    pass
        
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to connect to Render API: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    check_last_export()
