#!/usr/bin/env python3
"""
PrintSmith Export Script
Connects to PrintSmith PostgreSQL database and exports sales data for Retriever Daily Digest.
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime, timedelta
from decimal import Decimal

import psycopg2
from psycopg2 import OperationalError, DatabaseError
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def get_connection_config():
    """Read database connection configuration from environment variables."""
    required_vars = [
        'PRINTSMITH_HOST',
        'PRINTSMITH_PORT',
        'PRINTSMITH_DB',
        'PRINTSMITH_USER',
        'PRINTSMITH_PASSWORD'
    ]
    
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        raise EnvironmentError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    return {
        'host': os.environ['PRINTSMITH_HOST'],
        'port': os.environ['PRINTSMITH_PORT'],
        'database': os.environ['PRINTSMITH_DB'],
        'user': os.environ['PRINTSMITH_USER'],
        'password': os.environ['PRINTSMITH_PASSWORD']
    }


def get_target_date():
    """
    Get the target date for export.
    Returns yesterday's date, but if yesterday was Saturday or Sunday, returns Friday.
    """
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    
    weekday = yesterday.weekday()
    if weekday == 5:  # Saturday
        target = yesterday - timedelta(days=1)  # Friday
    elif weekday == 6:  # Sunday
        target = yesterday - timedelta(days=2)  # Friday
    else:
        target = yesterday
    
    logger.info(f"Target date for export: {target}")
    return target


def connect_to_printsmith():
    """Establish connection to PrintSmith PostgreSQL database."""
    logger.info("Connecting to PrintSmith database...")
    
    try:
        config = get_connection_config()
        conn = psycopg2.connect(
            host=config['host'],
            port=config['port'],
            database=config['database'],
            user=config['user'],
            password=config['password'],
            connect_timeout=30
        )
        logger.info("Successfully connected to PrintSmith database")
        return conn
    except EnvironmentError as e:
        logger.error(f"Configuration error: {e}")
        raise
    except OperationalError as e:
        logger.error(f"Failed to connect to database: {e}")
        raise
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        raise


def get_completed_invoices(conn, target_date):
    """
    Query yesterday's completed (posted) invoices.
    Returns list of invoices and calculated totals.
    """
    logger.info(f"Querying completed invoices for {target_date}...")
    
    query = """
        SELECT 
            i.invoicenumber,
            ib.accountname AS account_name,
            ib.takenby,
            ib.salesrep,
            ib.adjustedamountdue,
            ib.weborderexternalid,
            ib.description AS job_description
        FROM invoice i
        JOIN invoicebase ib ON i.id = ib.id
        WHERE DATE(i.pickupdate) = %s
          AND i.onpendinglist = false
          AND ib.isdeleted = false
          AND ib.voided = false
        ORDER BY ib.adjustedamountdue DESC
    """
    
    invoices = []
    total_revenue = Decimal('0.00')
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (target_date,))
            rows = cur.fetchall()
            
            for row in rows:
                invoice = {
                    'invoicenumber': row[0],
                    'account_name': row[1],
                    'takenby': row[2],
                    'salesrep': row[3],
                    'adjustedamountdue': float(row[4]) if row[4] else 0.0,
                    'weborderexternalid': row[5],
                    'job_description': row[6]
                }
                invoices.append(invoice)
                if row[4]:
                    total_revenue += Decimal(str(row[4]))
            
            invoice_count = len(invoices)
            logger.info(f"Found {invoice_count} completed invoices")
            logger.info(f"Total revenue: ${total_revenue:,.2f}")
            
            return {
                'invoices': invoices,
                'total_revenue': float(total_revenue),
                'invoice_count': invoice_count
            }
            
    except Exception as e:
        logger.error(f"Error querying invoices: {e}")
        raise


def get_estimates_created(conn, target_date):
    """
    Query yesterday's created estimates.
    Returns estimate count and list of top estimates by amount.
    """
    logger.info(f"Querying estimates created on {target_date}...")
    
    query = """
        SELECT 
            e.estimatenumber AS invoicenumber,
            ib.accountname AS account_name,
            ib.takenby,
            ib.adjustedamountdue
        FROM estimate e
        JOIN invoicebase ib ON e.id = ib.id
        WHERE DATE(ib.ordereddate) = %s
          AND ib.isdeleted = false
          AND ib.voided = false
        ORDER BY ib.adjustedamountdue DESC
    """
    
    estimates = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (target_date,))
            rows = cur.fetchall()
            
            for row in rows:
                estimate = {
                    'invoicenumber': row[0],
                    'account_name': row[1],
                    'takenby': row[2],
                    'adjustedamountdue': float(row[3]) if row[3] else 0.0
                }
                estimates.append(estimate)
            
            estimate_count = len(estimates)
            logger.info(f"Found {estimate_count} estimates created")
            
            return {
                'estimate_count': estimate_count,
                'top_estimates': estimates[:10]  # Return top 10 by amount
            }
            
    except Exception as e:
        logger.error(f"Error querying estimates: {e}")
        raise


def get_pm_open_invoices(conn):
    """
    Query open (pending) invoices grouped by PM (takenby field).
    Returns list of PMs with their open invoice count and total dollars.
    """
    logger.info("Querying open invoices by PM...")
    
    valid_pms = ('Jim', 'Steve', 'Shelley', 'Ellie', 'Ellie Lemire')
    
    query = """
        SELECT 
            ib.takenby AS pm_name,
            COUNT(*) AS open_count,
            COALESCE(SUM(ib.adjustedamountdue), 0) AS open_total_dollars
        FROM invoice i
        JOIN invoicebase ib ON i.id = ib.id
        WHERE i.onpendinglist = true
          AND ib.isdeleted = false
          AND ib.voided = false
          AND ib.takenby IN %s
        GROUP BY ib.takenby
        ORDER BY open_total_dollars DESC
    """
    
    pm_data = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (valid_pms,))
            rows = cur.fetchall()
            
            for row in rows:
                pm = {
                    'pm_name': row[0],
                    'open_count': row[1],
                    'open_total_dollars': float(row[2]) if row[2] else 0.0
                }
                pm_data.append(pm)
            
            logger.info(f"Found open invoices for {len(pm_data)} PMs")
            return pm_data
            
    except Exception as e:
        logger.error(f"Error querying PM open invoices: {e}")
        raise


def get_bd_open_invoices(conn):
    """
    Query open (pending) invoices grouped by BD (salesrep field).
    Returns list of BDs with their open invoice count and total dollars.
    """
    logger.info("Querying open invoices by BD...")
    
    valid_bds = ('House', 'Paige Chamberlain', 'Sean Swaim', 'Mike Meyer', 'Dave Tanner', 'Rob Grayson', 'Robert Galle')
    
    query = """
        SELECT 
            ib.salesrep AS bd_name,
            COUNT(*) AS open_count,
            COALESCE(SUM(ib.adjustedamountdue), 0) AS open_total_dollars
        FROM invoice i
        JOIN invoicebase ib ON i.id = ib.id
        WHERE i.onpendinglist = true
          AND ib.isdeleted = false
          AND ib.voided = false
          AND ib.salesrep IN %s
        GROUP BY ib.salesrep
        ORDER BY open_total_dollars DESC
    """
    
    bd_data = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (valid_bds,))
            rows = cur.fetchall()
            
            for row in rows:
                bd = {
                    'bd_name': row[0],
                    'open_count': row[1],
                    'open_total_dollars': float(row[2]) if row[2] else 0.0
                }
                bd_data.append(bd)
            
            logger.info(f"Found open invoices for {len(bd_data)} BDs")
            return bd_data
            
    except Exception as e:
        logger.error(f"Error querying BD open invoices: {e}")
        raise


def get_mtd_metrics(conn):
    """
    Query month-to-date sales metrics for goal progress.
    Returns: revenue, sales_count, estimates_created, new_customers.
    """
    today = datetime.now().date()
    first_of_month = today.replace(day=1)
    logger.info(f"Querying MTD metrics from {first_of_month} to {today}...")
    
    result = {
        'revenue': 0.0,
        'sales_count': 0,
        'estimates_created': 0,
        'new_customers': 0
    }
    
    try:
        with conn.cursor() as cur:
            revenue_query = """
                SELECT 
                    COUNT(*) AS sales_count,
                    COALESCE(SUM(ib.adjustedamountdue), 0) AS revenue
                FROM invoice i
                JOIN invoicebase ib ON i.id = ib.id
                WHERE DATE(i.pickupdate) >= %s
                  AND DATE(i.pickupdate) <= %s
                  AND i.onpendinglist = false
                  AND ib.isdeleted = false
                  AND ib.voided = false
            """
            cur.execute(revenue_query, (first_of_month, today))
            row = cur.fetchone()
            result['sales_count'] = row[0] if row[0] else 0
            result['revenue'] = float(row[1]) if row[1] else 0.0
            
            estimates_query = """
                SELECT COUNT(*) AS estimates_created
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND ib.voided = false
            """
            cur.execute(estimates_query, (first_of_month, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.accountid)
                FROM invoice i
                JOIN invoicebase ib ON i.id = ib.id
                WHERE DATE(i.pickupdate) >= %s
                  AND DATE(i.pickupdate) <= %s
                  AND i.onpendinglist = false
                  AND ib.isdeleted = false
                  AND ib.voided = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM invoice i2
                      JOIN invoicebase ib2 ON i2.id = ib2.id
                      WHERE ib2.accountid = ib.accountid
                        AND DATE(i2.pickupdate) < %s
                        AND i2.onpendinglist = false
                        AND ib2.isdeleted = false
                        AND ib2.voided = false
                  )
            """
            cur.execute(new_customers_query, (first_of_month, today, first_of_month))
            row = cur.fetchone()
            result['new_customers'] = row[0] if row[0] else 0
            
            logger.info(f"MTD metrics: ${result['revenue']:,.2f} revenue, {result['sales_count']} sales, "
                       f"{result['estimates_created']} estimates, {result['new_customers']} new customers")
            
            return result
            
    except Exception as e:
        logger.error(f"Error querying MTD metrics: {e}")
        raise


def get_ytd_metrics(conn):
    """
    Query year-to-date sales metrics for annual goal progress.
    Returns: revenue, sales_count, estimates_created, new_customers.
    """
    today = datetime.now().date()
    first_of_year = today.replace(month=1, day=1)
    logger.info(f"Querying YTD metrics from {first_of_year} to {today}...")
    
    result = {
        'revenue': 0.0,
        'sales_count': 0,
        'estimates_created': 0,
        'new_customers': 0
    }
    
    try:
        with conn.cursor() as cur:
            revenue_query = """
                SELECT 
                    COUNT(*) AS sales_count,
                    COALESCE(SUM(ib.adjustedamountdue), 0) AS revenue
                FROM invoice i
                JOIN invoicebase ib ON i.id = ib.id
                WHERE DATE(i.pickupdate) >= %s
                  AND DATE(i.pickupdate) <= %s
                  AND i.onpendinglist = false
                  AND ib.isdeleted = false
                  AND ib.voided = false
            """
            cur.execute(revenue_query, (first_of_year, today))
            row = cur.fetchone()
            result['sales_count'] = row[0] if row[0] else 0
            result['revenue'] = float(row[1]) if row[1] else 0.0
            
            estimates_query = """
                SELECT COUNT(*) AS estimates_created
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND ib.voided = false
            """
            cur.execute(estimates_query, (first_of_year, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.accountid)
                FROM invoice i
                JOIN invoicebase ib ON i.id = ib.id
                WHERE DATE(i.pickupdate) >= %s
                  AND DATE(i.pickupdate) <= %s
                  AND i.onpendinglist = false
                  AND ib.isdeleted = false
                  AND ib.voided = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM invoice i2
                      JOIN invoicebase ib2 ON i2.id = ib2.id
                      WHERE ib2.accountid = ib.accountid
                        AND DATE(i2.pickupdate) < %s
                        AND i2.onpendinglist = false
                        AND ib2.isdeleted = false
                        AND ib2.voided = false
                  )
            """
            cur.execute(new_customers_query, (first_of_year, today, first_of_year))
            row = cur.fetchone()
            result['new_customers'] = row[0] if row[0] else 0
            
            logger.info(f"YTD metrics: ${result['revenue']:,.2f} revenue, {result['sales_count']} sales, "
                       f"{result['estimates_created']} estimates, {result['new_customers']} new customers")
            
            return result
            
    except Exception as e:
        logger.error(f"Error querying YTD metrics: {e}")
        raise


def post_to_api(data: dict) -> dict:
    """POST assembled data to Render API."""
    api_url = os.environ.get('RENDER_API_URL')
    api_secret = os.environ.get('EXPORT_API_SECRET')
    
    if not api_url:
        raise EnvironmentError("RENDER_API_URL environment variable not set")
    if not api_secret:
        raise EnvironmentError("EXPORT_API_SECRET environment variable not set")
    
    logger.info(f"Posting data to API: {api_url}")
    
    headers = {
        'Content-Type': 'application/json',
        'X-Export-Secret': api_secret
    }
    
    try:
        response = requests.post(api_url, json=data, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
        logger.info(f"API response: {result}")
        return result
    except requests.exceptions.Timeout:
        logger.error("API request timed out")
        raise
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {e}")
        raise


def assemble_export_data(target_date, invoice_data, estimate_data, pm_data, bd_data, mtd_data, ytd_data) -> dict:
    """Assemble all exported data into the API payload format."""
    return {
        'export_date': target_date.isoformat(),
        'date': target_date.isoformat(),
        'metrics': {
            'dailyRevenue': invoice_data['total_revenue'],
            'dailySalesCount': invoice_data['invoice_count'],
            'dailyEstimatesCreated': estimate_data['estimate_count'],
            'dailyNewCustomers': 0,  # Calculated separately if needed
            'monthToDateRevenue': mtd_data['revenue'],
            'monthToDateSalesCount': mtd_data['sales_count'],
            'monthToDateEstimatesCreated': mtd_data['estimates_created'],
            'monthToDateNewCustomers': mtd_data['new_customers'],
            'yearToDateRevenue': ytd_data['revenue'],
            'yearToDateSalesCount': ytd_data['sales_count'],
            'yearToDateEstimatesCreated': ytd_data['estimates_created'],
            'yearToDateNewCustomers': ytd_data['new_customers'],
        },
        'yesterday_invoices': invoice_data,
        'yesterday_estimates': estimate_data,
        'pm_table': pm_data,
        'bd_table': bd_data,
        'mtd_metrics': mtd_data,
        'ytd_metrics': ytd_data,
        'highlights': _generate_highlights(invoice_data, estimate_data),
        'bdPerformance': [
            {'name': bd['bd_name'], 'ordersCompleted': bd['open_count'], 'revenue': bd['open_total_dollars']}
            for bd in bd_data
        ],
        'pmPerformance': [
            {'name': pm['pm_name'], 'ordersCompleted': pm['open_count'], 'revenue': pm['open_total_dollars']}
            for pm in pm_data
        ],
    }


def _generate_highlights(invoice_data, estimate_data) -> list:
    """Generate highlight items from invoice and estimate data."""
    highlights = []
    
    # Add top invoices as highlights
    for invoice in invoice_data.get('invoices', [])[:3]:
        amount = invoice.get('adjustedamountdue', 0)
        account = invoice.get('account_name', 'Unknown')
        highlights.append({
            'type': 'invoice',
            'description': f"Completed order for {account} - ${amount:,.2f}"
        })
    
    # Add top estimates as highlights
    for estimate in estimate_data.get('top_estimates', [])[:2]:
        amount = estimate.get('adjustedamountdue', 0)
        account = estimate.get('account_name', 'Unknown')
        highlights.append({
            'type': 'estimate',
            'description': f"New estimate for {account} - ${amount:,.2f}"
        })
    
    return highlights


def main():
    """Main entry point for the export script."""
    parser = argparse.ArgumentParser(description='Export PrintSmith data to Retriever Daily Digest')
    parser.add_argument('--dry-run', action='store_true', help='Print JSON output without posting to API')
    args = parser.parse_args()
    logger.info("Starting PrintSmith export...")
    logger.info(f"Export timestamp: {datetime.now().isoformat()}")
    
    conn = None
    try:
        conn = connect_to_printsmith()
        target_date = get_target_date()
        
        invoice_data = get_completed_invoices(conn, target_date)
        logger.info(f"Invoice export: {invoice_data['invoice_count']} invoices, ${invoice_data['total_revenue']:,.2f} revenue")
        
        estimate_data = get_estimates_created(conn, target_date)
        logger.info(f"Estimate export: {estimate_data['estimate_count']} estimates created")
        
        pm_open_data = get_pm_open_invoices(conn)
        logger.info(f"PM open invoices: {len(pm_open_data)} PMs with open invoices")
        
        bd_open_data = get_bd_open_invoices(conn)
        logger.info(f"BD open invoices: {len(bd_open_data)} BDs with open invoices")
        
        mtd_data = get_mtd_metrics(conn)
        logger.info(f"MTD metrics: ${mtd_data['revenue']:,.2f} revenue, {mtd_data['sales_count']} sales")
        
        ytd_data = get_ytd_metrics(conn)
        logger.info(f"YTD metrics: ${ytd_data['revenue']:,.2f} revenue, {ytd_data['sales_count']} sales")
        
        # Assemble all data
        export_data = assemble_export_data(
            target_date, invoice_data, estimate_data, 
            pm_open_data, bd_open_data, mtd_data, ytd_data
        )
        
        if args.dry_run:
            logger.info("Dry run mode - printing JSON output:")
            print(json.dumps(export_data, indent=2, default=str))
        else:
            # POST to API
            result = post_to_api(export_data)
            logger.info(f"Export completed successfully: {result}")
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")


if __name__ == '__main__':
    main()
