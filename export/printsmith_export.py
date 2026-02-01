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
from pathlib import Path

import psycopg2
from psycopg2 import OperationalError, DatabaseError
import requests
from dotenv import load_dotenv

# Load .env file from project root (parent of export/ directory)
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Program work accounts to exclude from highlights and insights
# These accounts have predictable scheduled orders that would skew results
# and take focus away from non-program business development
EXCLUDED_ACCOUNT_IDS = (
    20960,  # Strategic Healthcare Programs
    17204,  # CenCal Health
)


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


def get_target_date_range():
    """
    Get the target date range for export.
    
    Returns (start_date, end_date, is_weekend_catchup):
    - Monday: Returns (Friday, Sunday, True) to capture weekend activity
    - Tue-Sun: Returns (yesterday, yesterday, False) for single day
    """
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    
    if today.weekday() == 0:  # Monday
        # Capture Fri + Sat + Sun
        end_date = yesterday  # Sunday
        start_date = yesterday - timedelta(days=2)  # Friday
        logger.info(f"Monday detected - exporting weekend range: {start_date} to {end_date}")
        return start_date, end_date, True
    else:
        # Regular single-day export
        logger.info(f"Target date for export: {yesterday}")
        return yesterday, yesterday, False


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


def get_new_jobs_created(conn, start_date, end_date):
    """
    Query count of new jobs (invoices) created in a date range.
    Uses ordereddate which is when the job was entered into the system.
    """
    logger.info(f"Querying new jobs created from {start_date} to {end_date}...")
    
    query = """
        SELECT COUNT(*) AS jobs_created
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        WHERE DATE(ib.ordereddate) >= %s
          AND DATE(ib.ordereddate) <= %s
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
    """
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date))
            row = cur.fetchone()
            count = row[0] if row[0] else 0
            logger.info(f"Found {count} new jobs created")
            return count
    except Exception as e:
        logger.error(f"Error querying new jobs created: {e}")
        raise


def get_invoices_created_amount(conn, start_date, end_date):
    """
    Query total dollar value of invoices created in a date range.
    Uses ordereddate to match "Invoices Created" count.
    """
    logger.info(f"Querying invoice value for new jobs from {start_date} to {end_date}...")
    
    query = """
        SELECT COALESCE(SUM(ib.subtotal), 0) AS invoices_created_amount
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        WHERE DATE(ib.ordereddate) >= %s
          AND DATE(ib.ordereddate) <= %s
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
    """
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date))
            row = cur.fetchone()
            amount = float(row[0]) if row and row[0] else 0.0
            logger.info(f"Invoice value for new jobs: ${amount:,.2f}")
            return amount
    except Exception as e:
        logger.error(f"Error querying invoice value for new jobs: {e}")
        raise


def get_completed_invoices(conn, start_date, end_date):
    """
    Query completed (posted) invoices for a date range.
    Returns list of invoices and calculated totals.
    
    Note: Individual invoice amounts use subtotal (includes postage/shipping).
    The total_revenue comes from salesbase.totalsales (excludes postage/shipping).
    """
    logger.info(f"Querying completed invoices from {start_date} to {end_date}...")
    
    query = """
        SELECT 
            ib.invoicenumber,
            a.title AS customer_name,
            ib.name AS account_name,
            ib.takenby,
            COALESCE(s.name, '') AS salesrep,
            ib.subtotal,
            ib.weborderexternalid,
            ib.invoicetitle AS job_description,
            ib.account_id
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        LEFT JOIN account a ON ib.account_id = a.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE DATE(ib.pickupdate) >= %s
          AND DATE(ib.pickupdate) <= %s
          AND ib.onpendinglist = false
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
    """
    
    invoices = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date))
            rows = cur.fetchall()
            
            for row in rows:
                invoice = {
                    'invoicenumber': row[0],
                    'customer_name': row[1] or 'Unknown',
                    'account_name': row[2],
                    'takenby': row[3],
                    'salesrep': row[4],
                    'subtotal': float(row[5]) if row[5] else 0.0,
                    'weborderexternalid': row[6],
                    'job_description': row[7],
                    'account_id': row[8]
                }
                invoices.append(invoice)
            
            invoice_count = len(invoices)
            logger.info(f"Found {invoice_count} completed invoices")
        
        # Get total revenue from salesbase (excludes postage/shipping)
        total_revenue = get_revenue_from_salesbase(conn, start_date, end_date)
        logger.info(f"Daily revenue (from salesbase): ${total_revenue:,.2f}")
        
        return {
            'invoices': invoices,
            'total_revenue': total_revenue,
            'invoice_count': invoice_count
        }
            
    except Exception as e:
        logger.error(f"Error querying invoices: {e}")
        raise


def get_estimates_created(conn, start_date, end_date):
    """
    Query created estimates for a date range.
    Returns estimate count and list of top estimates by amount.
    """
    logger.info(f"Querying estimates created from {start_date} to {end_date}...")
    
    query = """
        SELECT 
            ib.invoicenumber,
            a.title AS customer_name,
            ib.name AS account_name,
            ib.takenby,
            ib.subtotal,
            ib.invoicetitle AS job_description,
            ib.account_id
        FROM estimate e
        JOIN invoicebase ib ON e.id = ib.id
        LEFT JOIN account a ON ib.account_id = a.id
        WHERE DATE(ib.ordereddate) >= %s
          AND DATE(ib.ordereddate) <= %s
          AND ib.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
    """
    
    estimates = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date))
            rows = cur.fetchall()
            
            for row in rows:
                estimate = {
                    'invoicenumber': row[0],
                    'customer_name': row[1] or 'Unknown',
                    'account_name': row[2],
                    'takenby': row[3],
                    'subtotal': float(row[4]) if row[4] else 0.0,
                    'job_description': row[5],
                    'account_id': row[6]
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


def get_new_customer_estimates(conn, start_date, end_date, limit=5):
    """
    Find new customers based on first-ever estimate created in date range.
    Returns a list of estimate details for shoutouts.
    """
    logger.info(f"Querying new customer estimates from {start_date} to {end_date}...")
    
    # Exclude program accounts
    excluded_accounts = tuple(EXCLUDED_ACCOUNT_IDS) or (0,)
    
    query = """
        WITH candidates AS (
            SELECT
                ib.invoicenumber,
                a.title AS customer_name,
                ib.name AS account_name,
                COALESCE(s.name, '') AS salesrep,
                ib.subtotal,
                ib.invoicetitle AS job_description,
                ib.account_id,
                ib.ordereddate,
                ROW_NUMBER() OVER (PARTITION BY ib.account_id ORDER BY ib.subtotal DESC) AS rn
            FROM estimate e
            JOIN invoicebase ib ON e.id = ib.id
            LEFT JOIN account a ON ib.account_id = a.id
            LEFT JOIN salesrep s ON ib.salesrep_id = s.id
            WHERE DATE(ib.ordereddate) >= %s
              AND DATE(ib.ordereddate) <= %s
              AND ib.isdeleted = false
              AND COALESCE(ib.voided, false) = false
              AND ib.account_id NOT IN %s
              AND NOT EXISTS (
                  SELECT 1
                  FROM estimate e2
                  JOIN invoicebase ib2 ON e2.id = ib2.id
                  WHERE ib2.account_id = ib.account_id
                    AND DATE(ib2.ordereddate) < %s
                    AND ib2.isdeleted = false
                    AND COALESCE(ib2.voided, false) = false
              )
        )
        SELECT
            invoicenumber,
            customer_name,
            account_name,
            salesrep,
            subtotal,
            job_description,
            account_id,
            ordereddate
        FROM candidates
        WHERE rn = 1
        ORDER BY subtotal DESC
        LIMIT %s
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date, excluded_accounts, start_date, limit))
            rows = cur.fetchall()
            
            for row in rows:
                items.append({
                    'accountId': row[6],
                    'accountName': row[1] or row[2] or 'Unknown',
                    'salesRep': row[3],
                    'estimateValue': float(row[4]) if row[4] else 0.0,
                    'jobDescription': row[5],
                    'orderedDate': row[7].isoformat() if row[7] else None,
                })
            
            logger.info(f"Found {len(items)} new customer estimate(s)")
            return items
            
    except Exception as e:
        logger.error(f"Error querying new customer estimates: {e}")
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
            COALESCE(SUM(ib.subtotal), 0) AS open_total_dollars
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        WHERE ib.onpendinglist = true
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
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
            s.name AS bd_name,
            COUNT(*) AS open_count,
            COALESCE(SUM(ib.subtotal), 0) AS open_total_dollars
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE ib.onpendinglist = true
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
          AND s.name IN %s
        GROUP BY s.name
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


def get_daily_pm_performance(conn, start_date, end_date):
    """
    Query new orders (invoices) created in date range grouped by PM.
    Returns list of PMs with their new orders and estimated revenue for the period.
    
    Note: Uses ordereddate (when job was created) instead of pickupdate (when completed)
    to show daily activity even on days without closeouts.
    """
    logger.info(f"Querying daily PM performance (new orders) from {start_date} to {end_date}...")
    
    valid_pms = ('Jim', 'Steve', 'Shelley', 'Ellie', 'Ellie Lemire')
    
    query = """
        SELECT 
            ib.takenby AS pm_name,
            COUNT(*) AS orders_count,
            COALESCE(SUM(ib.subtotal), 0) AS orders_revenue
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        WHERE DATE(ib.ordereddate) >= %s
          AND DATE(ib.ordereddate) <= %s
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
          AND ib.takenby IN %s
        GROUP BY ib.takenby
        ORDER BY orders_revenue DESC
    """
    
    pm_data = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date, valid_pms))
            rows = cur.fetchall()
            
            for row in rows:
                pm = {
                    'pm_name': row[0],
                    'completed_count': row[1],
                    'completed_revenue': float(row[2]) if row[2] else 0.0
                }
                pm_data.append(pm)
            
            logger.info(f"Found daily performance (new orders) for {len(pm_data)} PMs")
            return pm_data
            
    except Exception as e:
        logger.error(f"Error querying daily PM performance: {e}")
        raise


def get_daily_bd_performance(conn, start_date, end_date):
    """
    Query new orders (invoices) created in date range grouped by BD.
    Returns list of BDs with their new orders and estimated revenue for the period.
    
    Note: Uses ordereddate (when job was created) instead of pickupdate (when completed)
    to show daily activity even on days without closeouts.
    """
    logger.info(f"Querying daily BD performance (new orders) from {start_date} to {end_date}...")
    
    valid_bds = ('House', 'Paige Chamberlain', 'Sean Swaim', 'Mike Meyer', 'Dave Tanner', 'Rob Grayson', 'Robert Galle')
    
    query = """
        SELECT 
            s.name AS bd_name,
            COUNT(*) AS orders_count,
            COALESCE(SUM(ib.subtotal), 0) AS orders_revenue
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE DATE(ib.ordereddate) >= %s
          AND DATE(ib.ordereddate) <= %s
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
          AND s.name IN %s
        GROUP BY s.name
        ORDER BY orders_revenue DESC
    """
    
    bd_data = []
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date, valid_bds))
            rows = cur.fetchall()
            
            for row in rows:
                bd = {
                    'bd_name': row[0],
                    'completed_count': row[1],
                    'completed_revenue': float(row[2]) if row[2] else 0.0
                }
                bd_data.append(bd)
            
            logger.info(f"Found daily performance (new orders) for {len(bd_data)} BDs")
            return bd_data
            
    except Exception as e:
        logger.error(f"Error querying daily BD performance: {e}")
        raise


def get_revenue_from_salesbase(conn, start_date, end_date):
    """
    Query salesbase for total sales revenue (excludes postage and shipping).
    Uses salesbase.totalsales which represents actual sales only.
    
    Args:
        conn: Database connection
        start_date: Start date for the range (inclusive)
        end_date: End date for the range (inclusive)
    
    Returns:
        float: Total sales revenue for the date range
    """
    logger.info(f"Querying salesbase revenue from {start_date} to {end_date}...")
    
    query = """
        SELECT COALESCE(SUM(sb.totalsales), 0) AS total_sales
        FROM salesbase sb
        INNER JOIN dailysales ds ON sb.id = ds.id
        WHERE DATE(sb.closeoutdate) >= %s
          AND DATE(sb.closeoutdate) <= %s
          AND sb.isdeleted = false
    """
    
    try:
        with conn.cursor() as cur:
            cur.execute(query, (start_date, end_date))
            row = cur.fetchone()
            revenue = float(row[0]) if row[0] else 0.0
            logger.info(f"Salesbase revenue: ${revenue:,.2f}")
            return revenue
            
    except Exception as e:
        logger.error(f"Error querying salesbase revenue: {e}")
        raise


def get_mtd_metrics(conn):
    """
    Query month-to-date sales metrics for goal progress.
    Returns: revenue, sales_count (new jobs created), estimates_created, new_customers.
    
    Note: Revenue comes from salesbase.totalsales (excludes postage/shipping).
    Note: sales_count is now "new jobs created" - counted by ordereddate, not pickup.
    """
    today = datetime.now().date()
    first_of_month = today.replace(day=1)
    logger.info(f"Querying MTD metrics from {first_of_month} to {today}...")
    
    result = {
        'revenue': 0.0,
        'sales_count': 0,  # Now represents "new jobs created"
        'estimates_created': 0,
        'new_customers': 0
    }
    
    try:
        # Get revenue from salesbase (excludes postage/shipping)
        result['revenue'] = get_revenue_from_salesbase(conn, first_of_month, today)
        
        with conn.cursor() as cur:
            # Get new jobs created (by ordereddate, regardless of pending status)
            jobs_created_query = """
                SELECT COUNT(*) AS jobs_created
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(jobs_created_query, (first_of_month, today))
            row = cur.fetchone()
            result['sales_count'] = row[0] if row[0] else 0
            
            estimates_query = """
                SELECT COUNT(*) AS estimates_created
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(estimates_query, (first_of_month, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.account_id)
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM estimate e2
                      JOIN invoicebase ib2 ON e2.id = ib2.id
                      WHERE ib2.account_id = ib.account_id
                        AND DATE(ib2.ordereddate) < %s
                        AND ib2.isdeleted = false
                        AND COALESCE(ib2.voided, false) = false
                  )
            """
            cur.execute(new_customers_query, (first_of_month, today, first_of_month))
            row = cur.fetchone()
            result['new_customers'] = row[0] if row[0] else 0
            
            logger.info(f"MTD metrics: ${result['revenue']:,.2f} revenue, {result['sales_count']} new jobs, "
                       f"{result['estimates_created']} estimates, {result['new_customers']} new customers")
            
            return result
            
    except Exception as e:
        logger.error(f"Error querying MTD metrics: {e}")
        raise


def get_ytd_metrics(conn):
    """
    Query year-to-date sales metrics for annual goal progress.
    Returns: revenue, sales_count (new jobs created), estimates_created, new_customers.
    
    Note: Revenue comes from salesbase.totalsales (excludes postage/shipping).
    Note: sales_count is now "new jobs created" - counted by ordereddate, not pickup.
    """
    today = datetime.now().date()
    first_of_year = today.replace(month=1, day=1)
    logger.info(f"Querying YTD metrics from {first_of_year} to {today}...")
    
    result = {
        'revenue': 0.0,
        'sales_count': 0,  # Now represents "new jobs created"
        'estimates_created': 0,
        'new_customers': 0
    }
    
    try:
        # Get revenue from salesbase (excludes postage/shipping)
        result['revenue'] = get_revenue_from_salesbase(conn, first_of_year, today)
        
        with conn.cursor() as cur:
            # Get new jobs created (by ordereddate, regardless of pending status)
            jobs_created_query = """
                SELECT COUNT(*) AS jobs_created
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(jobs_created_query, (first_of_year, today))
            row = cur.fetchone()
            result['sales_count'] = row[0] if row[0] else 0
            
            estimates_query = """
                SELECT COUNT(*) AS estimates_created
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(estimates_query, (first_of_year, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.account_id)
                FROM estimate e
                JOIN invoicebase ib ON e.id = ib.id
                WHERE DATE(ib.ordereddate) >= %s
                  AND DATE(ib.ordereddate) <= %s
                  AND ib.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM estimate e2
                      JOIN invoicebase ib2 ON e2.id = ib2.id
                      WHERE ib2.account_id = ib.account_id
                        AND DATE(ib2.ordereddate) < %s
                        AND ib2.isdeleted = false
                        AND COALESCE(ib2.voided, false) = false
                  )
            """
            cur.execute(new_customers_query, (first_of_year, today, first_of_year))
            row = cur.fetchone()
            result['new_customers'] = row[0] if row[0] else 0
            
            logger.info(f"YTD metrics: ${result['revenue']:,.2f} revenue, {result['sales_count']} new jobs, "
                       f"{result['estimates_created']} estimates, {result['new_customers']} new customers")
            
            return result
            
    except Exception as e:
        logger.error(f"Error querying YTD metrics: {e}")
        raise


# ============================================================================
# AI INSIGHTS QUERIES
# ============================================================================

def get_anniversary_reorders(conn, exclude_account_ids=None):
    """
    Find large orders from 10-11 months ago that may need reordering.
    These customers may need the same job again this year!
    
    Args:
        conn: Database connection
        exclude_account_ids: Optional set of account IDs to exclude (recently shown)
    """
    logger.info("Querying anniversary reorder opportunities...")
    
    today = datetime.now().date()
    eleven_months_ago = today - timedelta(days=335)  # ~11 months
    ten_months_ago = today - timedelta(days=305)     # ~10 months
    
    # Combine program exclusions with recently shown exclusions
    all_excluded = set(EXCLUDED_ACCOUNT_IDS)
    if exclude_account_ids:
        all_excluded.update(exclude_account_ids)
    
    query = """
        SELECT 
            ib.invoicenumber,
            DATE(ib.pickupdate) AS pickup_date,
            a.title AS customer_name,
            ib.subtotal AS amount,
            ib.invoicetitle AS job_description,
            COALESCE(s.name, '') AS bd,
            ib.account_id
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        LEFT JOIN account a ON ib.account_id = a.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE DATE(ib.pickupdate) BETWEEN %s AND %s
          AND ib.subtotal >= 2000
          AND ib.account_id NOT IN %s
          AND ib.onpendinglist = false
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (eleven_months_ago, ten_months_ago, tuple(all_excluded) or (0,)))
            rows = cur.fetchall()
            
            for row in rows:
                items.append({
                    'name': row[2] or 'Unknown',
                    'detail': row[4] or 'Previous order',
                    'value': f"${float(row[3]):,.0f}" if row[3] else None,
                    'account_id': row[6]
                })
            
            logger.info(f"Found {len(items)} anniversary reorder opportunities")
            
    except Exception as e:
        logger.error(f"Error querying anniversary reorders: {e}")
    
    if items:
        return {
            'type': 'anniversary_reorders',
            'title': 'Anniversary Reorder Opportunities',
            'message': 'These customers had large orders 10-11 months ago - time to follow up!',
            'items': items
        }
    return None


def get_lapsed_accounts(conn, exclude_account_ids=None):
    """
    Find high-value accounts that haven't ordered in 6+ months.
    Time for a check-in call!
    
    Args:
        conn: Database connection
        exclude_account_ids: Optional set of account IDs to exclude (recently shown)
    """
    logger.info("Querying lapsed high-value accounts...")
    
    today = datetime.now().date()
    six_months_ago = today - timedelta(days=180)
    
    # Combine program exclusions with recently shown exclusions
    all_excluded = set(EXCLUDED_ACCOUNT_IDS)
    if exclude_account_ids:
        all_excluded.update(exclude_account_ids)
    
    query = """
        WITH account_stats AS (
            SELECT 
                ib.account_id,
                MAX(DATE(ib.pickupdate)) AS last_order_date,
                SUM(ib.subtotal) AS lifetime_value,
                COUNT(*) AS order_count
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE ib.onpendinglist = false
              AND ib.account_id NOT IN %s
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id
        )
        SELECT 
            ast.account_id,
            a.title AS customer_name,
            ast.last_order_date,
            ast.lifetime_value,
            ast.order_count
        FROM account_stats ast
        LEFT JOIN account a ON ast.account_id = a.id
        WHERE ast.lifetime_value >= 5000
          AND ast.last_order_date < %s
        ORDER BY ast.last_order_date DESC, ast.lifetime_value DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (tuple(all_excluded) or (0,), six_months_ago))
            rows = cur.fetchall()
            
            for row in rows:
                last_order = row[2].strftime('%b %Y') if row[2] else 'Unknown'
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"Last order: {last_order}",
                    'value': f"${float(row[3]):,.0f} lifetime" if row[3] else None,
                    'account_id': row[0]
                })
            
            logger.info(f"Found {len(items)} lapsed high-value accounts")
            
    except Exception as e:
        logger.error(f"Error querying lapsed accounts: {e}")
    
    if items:
        return {
            'type': 'lapsed_accounts',
            'title': 'Lapsed High-Value Accounts',
            'message': "These accounts haven't ordered in 6+ months but have strong history.",
            'items': items
        }
    return None


def get_past_due_accounts(conn, exclude_account_ids=None):
    """
    Find accounts with AR aging issues (30/60/90 day buckets).
    Friendly payment reminder needed!
    
    Args:
        conn: Database connection
        exclude_account_ids: Optional set of account IDs to exclude (recently shown)
    """
    logger.info("Querying past due accounts...")
    
    # Combine program exclusions with recently shown exclusions
    all_excluded = set(EXCLUDED_ACCOUNT_IDS)
    if exclude_account_ids:
        all_excluded.update(exclude_account_ids)
    
    # Note: This query uses PrintSmith's account balance fields
    query = """
        SELECT 
            a.id AS accountid,
            a.title AS account_name,
            COALESCE(a.balance30day, 0) + COALESCE(a.balance60day, 0) + COALESCE(a.balance90day, 0) AS past_due_total,
            a.balance AS total_balance
        FROM account a
        WHERE (COALESCE(a.balance30day, 0) + COALESCE(a.balance60day, 0) + COALESCE(a.balance90day, 0)) > 0
          AND a.id NOT IN %s
          AND a.isdeleted = false
        ORDER BY past_due_total DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (tuple(all_excluded) or (0,),))
            rows = cur.fetchall()
            
            for row in rows:
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"Total balance: ${float(row[3]):,.0f}" if row[3] else 'Balance unknown',
                    'value': f"${float(row[2]):,.0f} past due" if row[2] else None,
                    'account_id': row[0]
                })
            
            logger.info(f"Found {len(items)} past due accounts")
            
    except Exception as e:
        logger.warning(f"Could not query past due accounts: {e}")
    
    if items:
        return {
            'type': 'past_due_accounts',
            'title': 'Past Due Accounts',
            'message': 'Friendly payment reminder needed!',
            'items': items
        }
    return None


def get_hot_streak_accounts(conn, exclude_account_ids=None):
    """
    Find accounts that are increasing their order frequency.
    Compare last 3 months vs prior 3 months.
    
    Args:
        conn: Database connection
        exclude_account_ids: Optional set of account IDs to exclude (recently shown)
    """
    logger.info("Querying hot streak accounts...")
    
    today = datetime.now().date()
    three_months_ago = today - timedelta(days=90)
    six_months_ago = today - timedelta(days=180)
    
    # Combine program exclusions with recently shown exclusions
    all_excluded = set(EXCLUDED_ACCOUNT_IDS)
    if exclude_account_ids:
        all_excluded.update(exclude_account_ids)
    all_excluded_tuple = tuple(all_excluded) or (0,)
    
    query = """
        WITH recent_orders AS (
            SELECT 
                ib.account_id,
                COUNT(*) AS recent_count,
                SUM(ib.subtotal) AS recent_spend
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE DATE(ib.pickupdate) >= %s
              AND ib.account_id NOT IN %s
              AND ib.onpendinglist = false
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id
        ),
        prior_orders AS (
            SELECT 
                ib.account_id,
                COUNT(*) AS prior_count
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE DATE(ib.pickupdate) >= %s AND DATE(ib.pickupdate) < %s
              AND ib.account_id NOT IN %s
              AND ib.onpendinglist = false
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id
        )
        SELECT 
            r.account_id,
            a.title AS customer_name,
            r.recent_count,
            COALESCE(p.prior_count, 0) AS prior_count,
            r.recent_spend
        FROM recent_orders r
        LEFT JOIN account a ON r.account_id = a.id
        LEFT JOIN prior_orders p ON r.account_id = p.account_id
        WHERE r.recent_count > COALESCE(p.prior_count, 0)
          AND r.recent_spend >= 1000
        ORDER BY (r.recent_count - COALESCE(p.prior_count, 0)) DESC, r.recent_spend DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (three_months_ago, all_excluded_tuple, six_months_ago, three_months_ago, all_excluded_tuple))
            rows = cur.fetchall()
            
            for row in rows:
                recent = row[2] or 0
                prior = row[3] or 0
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"{recent} orders (was {prior})",
                    'value': f"${float(row[4]):,.0f} recent" if row[4] else None,
                    'account_id': row[0]
                })
            
            logger.info(f"Found {len(items)} hot streak accounts")
            
    except Exception as e:
        logger.error(f"Error querying hot streak accounts: {e}")
    
    if items:
        return {
            'type': 'hot_streak_accounts',
            'title': 'Hot Streak Accounts',
            'message': 'These accounts are ordering more frequently - nurture these relationships!',
            'items': items
        }
    return None


def get_high_value_pending_estimates(conn, exclude_account_ids=None):
    """
    Find big quotes that need follow-up ($1000+).
    Follow up to close the deal!
    
    Args:
        conn: Database connection
        exclude_account_ids: Optional set of account IDs to exclude (recently shown)
    """
    logger.info("Querying high-value pending estimates...")
    
    # Combine program exclusions with recently shown exclusions
    all_excluded = set(EXCLUDED_ACCOUNT_IDS)
    if exclude_account_ids:
        all_excluded.update(exclude_account_ids)
    
    query = """
        SELECT 
            ib.invoicenumber AS estimatenumber,
            a.title AS customer_name,
            ib.subtotal AS amount,
            DATE(ib.ordereddate) AS created_date,
            ib.invoicetitle AS job_description,
            ib.takenby AS pm,
            COALESCE(s.name, '') AS bd,
            ib.account_id
        FROM estimate e
        JOIN invoicebase ib ON e.id = ib.id
        LEFT JOIN account a ON ib.account_id = a.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE ib.onpendinglist = true
          AND ib.subtotal >= 1000
          AND ib.account_id NOT IN %s
          AND ib.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.ordereddate DESC, ib.subtotal DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (tuple(all_excluded) or (0,),))
            rows = cur.fetchall()
            
            for row in rows:
                created = row[3].strftime('%b %d') if row[3] else 'Unknown'
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"{row[4] or 'Estimate'} (created {created})",
                    'value': f"${float(row[2]):,.0f}" if row[2] else None,
                    'account_id': row[7]
                })
            
            logger.info(f"Found {len(items)} high-value pending estimates")
            
    except Exception as e:
        logger.error(f"Error querying high-value estimates: {e}")
    
    if items:
        return {
            'type': 'high_value_estimates',
            'title': 'High-Value Pending Estimates',
            'message': 'Follow up to close the deal!',
            'items': items
        }
    return None


def get_ai_insights(conn, exclude_account_ids=None, day_of_week=None):
    """
    Gather AI insights from various queries with freshness controls.
    
    Args:
        conn: Database connection
        exclude_account_ids: Set of account IDs to exclude (recently shown in past 14 days)
        day_of_week: Optional day override (0=Monday, 6=Sunday). If None, uses current day.
    
    Returns:
        List of insight objects, rotating types by day of week for variety.
    """
    logger.info("Gathering AI insights...")
    
    # Day-of-week rotation schedule - 2-3 insight types per day
    # This ensures variety across the week
    INSIGHT_ROTATION = {
        0: ['anniversary_reorders', 'hot_streak_accounts', 'high_value_estimates'],  # Monday
        1: ['lapsed_accounts', 'past_due_accounts'],                                   # Tuesday
        2: ['hot_streak_accounts', 'anniversary_reorders'],                            # Wednesday
        3: ['high_value_estimates', 'lapsed_accounts'],                                # Thursday
        4: ['past_due_accounts', 'hot_streak_accounts', 'anniversary_reorders'],      # Friday
        5: ['lapsed_accounts', 'high_value_estimates'],                                # Saturday
        6: ['anniversary_reorders', 'lapsed_accounts'],                                # Sunday
    }
    
    # Map insight type names to functions
    INSIGHT_FUNCTIONS = {
        'anniversary_reorders': get_anniversary_reorders,
        'lapsed_accounts': get_lapsed_accounts,
        'past_due_accounts': get_past_due_accounts,
        'hot_streak_accounts': get_hot_streak_accounts,
        'high_value_estimates': get_high_value_pending_estimates,
    }
    
    # Determine which insight types to run today
    if day_of_week is None:
        day_of_week = datetime.now().weekday()
    
    today_types = INSIGHT_ROTATION.get(day_of_week, list(INSIGHT_FUNCTIONS.keys()))
    logger.info(f"Day {day_of_week} insight types: {today_types}")
    
    insights = []
    
    for insight_type in today_types:
        func = INSIGHT_FUNCTIONS.get(insight_type)
        if not func:
            continue
        try:
            result = func(conn, exclude_account_ids=exclude_account_ids)
            if result:
                insights.append(result)
        except Exception as e:
            logger.warning(f"Error getting insight from {func.__name__}: {e}")
    
    logger.info(f"Gathered {len(insights)} AI insights")
    return insights


# ============================================================================
# EXPORT FUNCTIONS
# ============================================================================

def get_recently_shown_accounts(days: int = 14) -> set:
    """
    Fetch account IDs that were shown in recent digests.
    Used to exclude them from today's insights for freshness.
    
    Args:
        days: Number of days to look back (default 14)
    
    Returns:
        Set of account IDs to exclude, or empty set if API unavailable
    """
    api_url = os.environ.get('RENDER_API_URL')
    api_secret = os.environ.get('EXPORT_API_SECRET')
    
    if not api_url or not api_secret:
        logger.warning("Cannot fetch recent accounts: API URL or secret not set")
        return set()
    
    # Build the recent endpoint URL (replace /export with /export/recent)
    recent_url = api_url.replace('/api/export', '/api/export/recent')
    if recent_url == api_url:
        # Fallback: just append /recent
        recent_url = api_url.rstrip('/') + '/recent'
    
    recent_url = f"{recent_url}?days={days}"
    
    logger.info(f"Fetching recently shown accounts from: {recent_url}")
    
    headers = {
        'X-Export-Secret': api_secret
    }
    
    try:
        response = requests.get(recent_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        account_ids = set(data.get('accountIds', []))
        account_names = data.get('accountNames', [])
        
        logger.info(f"Found {len(account_ids)} recently shown account IDs to exclude")
        if account_names:
            logger.info(f"Recent accounts include: {', '.join(account_names[:5])}{'...' if len(account_names) > 5 else ''}")
        
        return account_ids
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"Could not fetch recent accounts (continuing without exclusions): {e}")
        return set()
    except Exception as e:
        logger.warning(f"Error parsing recent accounts response: {e}")
        return set()


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


def assemble_export_data(target_date, invoice_data, estimate_data, pm_open_data, bd_open_data, 
                         pm_daily_data, bd_daily_data, mtd_data, ytd_data, ai_insights,
                         daily_new_jobs: int = 0, daily_new_jobs_amount: float = 0.0,
                         new_customer_estimates: list = None) -> dict:
    """Assemble all exported data into the API payload format."""
    
    # Extract biggest order from invoices
    invoices = invoice_data.get('invoices', [])
    biggest_order = None
    if invoices:
        top_invoice = invoices[0]  # Already sorted by subtotal DESC
        biggest_order = {
            'accountName': top_invoice.get('account_name', 'Unknown'),
            'amount': top_invoice.get('subtotal', 0),
            'description': top_invoice.get('job_description'),
            'salesRep': top_invoice.get('salesrep'),
        }
    
    # Extract top performers from daily data
    top_pm = None
    if pm_daily_data:
        top = pm_daily_data[0]  # Already sorted by revenue DESC
        top_pm = {
            'name': top['pm_name'],
            'ordersCompleted': top['completed_count'],
            'revenue': top['completed_revenue'],
        }
    
    top_bd = None
    if bd_daily_data:
        top = bd_daily_data[0]  # Already sorted by revenue DESC
        top_bd = {
            'name': top['bd_name'],
            'ordersCompleted': top['completed_count'],
            'revenue': top['completed_revenue'],
        }
    
    # Generate highlights
    highlights = _generate_highlights(invoice_data, estimate_data)
    
    # Track shown items for freshness (to exclude in future digests)
    shown_account_ids = set()
    shown_account_names = []
    shown_insight_types = []
    
    # Collect account IDs from highlights (top invoices and estimates)
    filtered_invoices = [
        inv for inv in invoice_data.get('invoices', [])
        if inv.get('account_id') not in EXCLUDED_ACCOUNT_IDS
    ]
    for inv in filtered_invoices[:3]:
        if inv.get('account_id'):
            shown_account_ids.add(inv['account_id'])
            shown_account_names.append(inv.get('customer_name', 'Unknown'))
    
    filtered_estimates = [
        est for est in estimate_data.get('top_estimates', [])
        if est.get('account_id') not in EXCLUDED_ACCOUNT_IDS
    ]
    for est in filtered_estimates[:2]:
        if est.get('account_id'):
            shown_account_ids.add(est['account_id'])
            shown_account_names.append(est.get('customer_name', 'Unknown'))
    
    # Collect account IDs and types from AI insights
    for insight in ai_insights:
        insight_type = insight.get('type')
        if insight_type:
            shown_insight_types.append(insight_type)
        # Extract account IDs from insight items if available
        for item in insight.get('items', []):
            if item.get('account_id'):
                shown_account_ids.add(item['account_id'])
            # Also track account names for AI context
            if item.get('name'):
                shown_account_names.append(item['name'])
    
    new_customer_estimates = new_customer_estimates or []
    
    return {
        'export_date': target_date.isoformat(),
        'date': target_date.isoformat(),
        'metrics': {
            'dailyRevenue': invoice_data['total_revenue'],
            'dailySalesCount': daily_new_jobs,  # Now "new jobs created" instead of "orders completed"
            'dailyInvoicesCreatedAmount': daily_new_jobs_amount,
            'dailyEstimatesCreated': estimate_data['estimate_count'],
            'dailyNewCustomers': len(new_customer_estimates),
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
        'pm_table': pm_open_data,
        'bd_table': bd_open_data,
        'mtd_metrics': mtd_data,
        'ytd_metrics': ytd_data,
        'highlights': highlights,
        # Daily completed performance (for top performer display)
        'bdPerformance': [
            {'name': bd['bd_name'], 'ordersCompleted': bd['completed_count'], 'revenue': bd['completed_revenue']}
            for bd in bd_daily_data
        ],
        'pmPerformance': [
            {'name': pm['pm_name'], 'ordersCompleted': pm['completed_count'], 'revenue': pm['completed_revenue']}
            for pm in pm_daily_data
        ],
        # Explicit top performers for AI context
        'biggestOrder': biggest_order,
        'topPM': top_pm,
        'topBD': top_bd,
        'aiInsights': ai_insights,
        'newCustomerEstimates': new_customer_estimates,
        # Track what was shown for freshness/deduplication
        'shownInsights': {
            'date': target_date.isoformat(),
            'accountIds': list(shown_account_ids),
            'accountNames': list(set(shown_account_names)),  # Dedupe names
            'insightTypes': list(set(shown_insight_types)),
        },
    }


def _generate_highlights(invoice_data, estimate_data) -> list:
    """Generate highlight items from invoice and estimate data.
    
    Excludes program work accounts (defined in EXCLUDED_ACCOUNT_IDS) to focus
    on non-program business development opportunities.
    
    Format: "Completed order for **Customer Name** - Job Description - $Amount"
    """
    highlights = []
    
    # Filter out excluded program accounts from invoices
    filtered_invoices = [
        inv for inv in invoice_data.get('invoices', [])
        if inv.get('account_id') not in EXCLUDED_ACCOUNT_IDS
    ]
    
    # Add top invoices as highlights (excluding program work)
    for invoice in filtered_invoices[:3]:
        amount = invoice.get('subtotal', 0)
        customer_name = invoice.get('customer_name', 'Unknown')
        job_desc = invoice.get('job_description') or invoice.get('account_name') or ''
        
        if job_desc:
            description = f"Completed order for <strong>{customer_name}</strong> - {job_desc} - ${amount:,.2f}"
        else:
            description = f"Completed order for <strong>{customer_name}</strong> - ${amount:,.2f}"
        
        highlights.append({
            'type': 'invoice',
            'description': description
        })
    
    # Filter out excluded program accounts from estimates
    filtered_estimates = [
        est for est in estimate_data.get('top_estimates', [])
        if est.get('account_id') not in EXCLUDED_ACCOUNT_IDS
    ]
    
    # Add top estimates as highlights (excluding program work)
    for estimate in filtered_estimates[:2]:
        amount = estimate.get('subtotal', 0)
        customer_name = estimate.get('customer_name', 'Unknown')
        job_desc = estimate.get('job_description') or estimate.get('account_name') or ''
        
        if job_desc:
            description = f"New estimate for <strong>{customer_name}</strong> - {job_desc} - ${amount:,.2f}"
        else:
            description = f"New estimate for <strong>{customer_name}</strong> - ${amount:,.2f}"
        
        highlights.append({
            'type': 'estimate',
            'description': description
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
        start_date, end_date, is_weekend_catchup = get_target_date_range()
        
        invoice_data = get_completed_invoices(conn, start_date, end_date)
        logger.info(f"Invoice export: {invoice_data['invoice_count']} invoices, ${invoice_data['total_revenue']:,.2f} revenue")
        
        # Get new jobs created for the period (different from completed invoices)
        daily_new_jobs = get_new_jobs_created(conn, start_date, end_date)
        logger.info(f"New jobs created: {daily_new_jobs}")
        
        daily_new_jobs_amount = get_invoices_created_amount(conn, start_date, end_date)
        logger.info(f"New jobs value: ${daily_new_jobs_amount:,.2f}")
        
        estimate_data = get_estimates_created(conn, start_date, end_date)
        logger.info(f"Estimate export: {estimate_data['estimate_count']} estimates created")
        
        new_customer_estimates = get_new_customer_estimates(conn, start_date, end_date)
        logger.info(f"New customer estimates: {len(new_customer_estimates)}")
        
        pm_open_data = get_pm_open_invoices(conn)
        logger.info(f"PM open invoices: {len(pm_open_data)} PMs with open invoices")
        
        bd_open_data = get_bd_open_invoices(conn)
        logger.info(f"BD open invoices: {len(bd_open_data)} BDs with open invoices")
        
        # Get daily performance (new orders created for the period)
        pm_daily_data = get_daily_pm_performance(conn, start_date, end_date)
        logger.info(f"PM daily performance: {len(pm_daily_data)} PMs with new orders")
        
        bd_daily_data = get_daily_bd_performance(conn, start_date, end_date)
        logger.info(f"BD daily performance: {len(bd_daily_data)} BDs with new orders")
        
        mtd_data = get_mtd_metrics(conn)
        logger.info(f"MTD metrics: ${mtd_data['revenue']:,.2f} revenue, {mtd_data['sales_count']} new jobs")
        
        ytd_data = get_ytd_metrics(conn)
        logger.info(f"YTD metrics: ${ytd_data['revenue']:,.2f} revenue, {ytd_data['sales_count']} new jobs")
        
        # Fetch recently shown accounts for freshness (skip in dry-run mode to avoid API calls)
        recently_shown = set()
        if not args.dry_run:
            recently_shown = get_recently_shown_accounts(days=14)
        
        # Get AI Insights with freshness controls (exclude recently shown, rotate by day)
        ai_insights = get_ai_insights(conn, exclude_account_ids=recently_shown)
        logger.info(f"AI Insights: {len(ai_insights)} insights gathered")
        
        # Assemble all data (use end_date as the primary export_date)
        export_data = assemble_export_data(
            end_date, invoice_data, estimate_data, 
            pm_open_data, bd_open_data, pm_daily_data, bd_daily_data,
            mtd_data, ytd_data, ai_insights, daily_new_jobs, daily_new_jobs_amount,
            new_customer_estimates
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
