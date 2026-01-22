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
            ib.invoicenumber,
            ib.name AS account_name,
            ib.takenby,
            COALESCE(s.name, '') AS salesrep,
            ib.subtotal,
            ib.weborderexternalid,
            ib.invoicetitle AS job_description
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE DATE(ib.pickupdate) = %s
          AND ib.onpendinglist = false
          AND ib.isdeleted = false
          AND i.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
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
                    'subtotal': float(row[4]) if row[4] else 0.0,
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
            ib.invoicenumber,
            ib.name AS account_name,
            ib.takenby,
            ib.subtotal
        FROM estimate e
        JOIN invoicebase ib ON e.id = ib.id
        WHERE DATE(ib.ordereddate) = %s
          AND ib.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
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
                    'subtotal': float(row[3]) if row[3] else 0.0
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
                    COALESCE(SUM(ib.subtotal), 0) AS revenue
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.pickupdate) >= %s
                  AND DATE(ib.pickupdate) <= %s
                  AND ib.onpendinglist = false
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
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
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(estimates_query, (first_of_month, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.account_id)
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.pickupdate) >= %s
                  AND DATE(ib.pickupdate) <= %s
                  AND ib.onpendinglist = false
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM invoicebase ib2
                      JOIN invoice i2 ON ib2.id = i2.id
                      WHERE ib2.account_id = ib.account_id
                        AND DATE(ib2.pickupdate) < %s
                        AND ib2.onpendinglist = false
                        AND ib2.isdeleted = false
                        AND i2.isdeleted = false
                        AND COALESCE(ib2.voided, false) = false
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
                    COALESCE(SUM(ib.subtotal), 0) AS revenue
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.pickupdate) >= %s
                  AND DATE(ib.pickupdate) <= %s
                  AND ib.onpendinglist = false
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
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
                  AND COALESCE(ib.voided, false) = false
            """
            cur.execute(estimates_query, (first_of_year, today))
            row = cur.fetchone()
            result['estimates_created'] = row[0] if row[0] else 0
            
            new_customers_query = """
                SELECT COUNT(DISTINCT ib.account_id)
                FROM invoicebase ib
                JOIN invoice i ON ib.id = i.id
                WHERE DATE(ib.pickupdate) >= %s
                  AND DATE(ib.pickupdate) <= %s
                  AND ib.onpendinglist = false
                  AND ib.isdeleted = false
                  AND i.isdeleted = false
                  AND COALESCE(ib.voided, false) = false
                  AND NOT EXISTS (
                      SELECT 1
                      FROM invoicebase ib2
                      JOIN invoice i2 ON ib2.id = i2.id
                      WHERE ib2.account_id = ib.account_id
                        AND DATE(ib2.pickupdate) < %s
                        AND ib2.onpendinglist = false
                        AND ib2.isdeleted = false
                        AND i2.isdeleted = false
                        AND COALESCE(ib2.voided, false) = false
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


# ============================================================================
# AI INSIGHTS QUERIES
# ============================================================================

def get_anniversary_reorders(conn):
    """
    Find large orders from 10-11 months ago that may need reordering.
    These customers may need the same job again this year!
    """
    logger.info("Querying anniversary reorder opportunities...")
    
    today = datetime.now().date()
    eleven_months_ago = today - timedelta(days=335)  # ~11 months
    ten_months_ago = today - timedelta(days=305)     # ~10 months
    
    query = """
        SELECT 
            ib.invoicenumber,
            DATE(ib.pickupdate) AS pickup_date,
            ib.name AS account_name,
            ib.subtotal AS amount,
            ib.invoicetitle AS job_description,
            COALESCE(s.name, '') AS bd
        FROM invoicebase ib
        JOIN invoice i ON ib.id = i.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE DATE(ib.pickupdate) BETWEEN %s AND %s
          AND ib.subtotal >= 2000
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
            cur.execute(query, (eleven_months_ago, ten_months_ago))
            rows = cur.fetchall()
            
            for row in rows:
                items.append({
                    'name': row[2] or 'Unknown',
                    'detail': row[4] or 'Previous order',
                    'value': f"${float(row[3]):,.0f}" if row[3] else None
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


def get_lapsed_accounts(conn):
    """
    Find high-value accounts that haven't ordered in 6+ months.
    Time for a check-in call!
    """
    logger.info("Querying lapsed high-value accounts...")
    
    today = datetime.now().date()
    six_months_ago = today - timedelta(days=180)
    
    query = """
        WITH account_stats AS (
            SELECT 
                ib.account_id,
                ib.name AS account_name,
                MAX(DATE(ib.pickupdate)) AS last_order_date,
                SUM(ib.subtotal) AS lifetime_value,
                COUNT(*) AS order_count
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE ib.onpendinglist = false
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id, ib.name
        )
        SELECT 
            account_id,
            account_name,
            last_order_date,
            lifetime_value,
            order_count
        FROM account_stats
        WHERE lifetime_value >= 5000
          AND last_order_date < %s
        ORDER BY lifetime_value DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (six_months_ago,))
            rows = cur.fetchall()
            
            for row in rows:
                last_order = row[2].strftime('%b %Y') if row[2] else 'Unknown'
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"Last order: {last_order}",
                    'value': f"${float(row[3]):,.0f} lifetime" if row[3] else None
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


def get_past_due_accounts(conn):
    """
    Find accounts with AR aging issues (30/60/90 day buckets).
    Friendly payment reminder needed!
    """
    logger.info("Querying past due accounts...")
    
    # Note: This query uses PrintSmith's account balance fields
    query = """
        SELECT 
            a.id AS accountid,
            a.title AS account_name,
            COALESCE(a.balance30day, 0) + COALESCE(a.balance60day, 0) + COALESCE(a.balance90day, 0) AS past_due_total,
            a.balance AS total_balance
        FROM account a
        WHERE (COALESCE(a.balance30day, 0) + COALESCE(a.balance60day, 0) + COALESCE(a.balance90day, 0)) > 0
          AND a.isdeleted = false
        ORDER BY past_due_total DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            for row in rows:
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"Total balance: ${float(row[3]):,.0f}" if row[3] else 'Balance unknown',
                    'value': f"${float(row[2]):,.0f} past due" if row[2] else None
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


def get_hot_streak_accounts(conn):
    """
    Find accounts that are increasing their order frequency.
    Compare last 3 months vs prior 3 months.
    """
    logger.info("Querying hot streak accounts...")
    
    today = datetime.now().date()
    three_months_ago = today - timedelta(days=90)
    six_months_ago = today - timedelta(days=180)
    
    query = """
        WITH recent_orders AS (
            SELECT 
                ib.account_id,
                ib.name AS account_name,
                COUNT(*) AS recent_count,
                SUM(ib.subtotal) AS recent_spend
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE DATE(ib.pickupdate) >= %s
              AND ib.onpendinglist = false
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id, ib.name
        ),
        prior_orders AS (
            SELECT 
                ib.account_id,
                COUNT(*) AS prior_count
            FROM invoicebase ib
            JOIN invoice i ON ib.id = i.id
            WHERE DATE(ib.pickupdate) >= %s AND DATE(ib.pickupdate) < %s
              AND ib.onpendinglist = false
              AND ib.isdeleted = false
              AND i.isdeleted = false
              AND COALESCE(ib.voided, false) = false
            GROUP BY ib.account_id
        )
        SELECT 
            r.account_id,
            r.account_name,
            r.recent_count,
            COALESCE(p.prior_count, 0) AS prior_count,
            r.recent_spend
        FROM recent_orders r
        LEFT JOIN prior_orders p ON r.account_id = p.account_id
        WHERE r.recent_count > COALESCE(p.prior_count, 0)
          AND r.recent_spend >= 1000
        ORDER BY (r.recent_count - COALESCE(p.prior_count, 0)) DESC, r.recent_spend DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, (three_months_ago, six_months_ago, three_months_ago))
            rows = cur.fetchall()
            
            for row in rows:
                recent = row[2] or 0
                prior = row[3] or 0
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"{recent} orders (was {prior})",
                    'value': f"${float(row[4]):,.0f} recent" if row[4] else None
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


def get_high_value_pending_estimates(conn):
    """
    Find big quotes that need follow-up ($1000+).
    Follow up to close the deal!
    """
    logger.info("Querying high-value pending estimates...")
    
    query = """
        SELECT 
            ib.invoicenumber AS estimatenumber,
            ib.name AS account_name,
            ib.subtotal AS amount,
            DATE(ib.ordereddate) AS created_date,
            ib.invoicetitle AS job_description,
            ib.takenby AS pm,
            COALESCE(s.name, '') AS bd
        FROM estimate e
        JOIN invoicebase ib ON e.id = ib.id
        LEFT JOIN salesrep s ON ib.salesrep_id = s.id
        WHERE ib.onpendinglist = true
          AND ib.subtotal >= 1000
          AND ib.isdeleted = false
          AND COALESCE(ib.voided, false) = false
        ORDER BY ib.subtotal DESC
        LIMIT 5
    """
    
    items = []
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            for row in rows:
                created = row[3].strftime('%b %d') if row[3] else 'Unknown'
                items.append({
                    'name': row[1] or 'Unknown',
                    'detail': f"{row[4] or 'Estimate'} (created {created})",
                    'value': f"${float(row[2]):,.0f}" if row[2] else None
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


def get_ai_insights(conn):
    """
    Gather all AI insights from various queries.
    Returns list of insight objects.
    """
    logger.info("Gathering AI insights...")
    
    insights = []
    
    # Run each insight query and collect results
    insight_functions = [
        get_anniversary_reorders,
        get_lapsed_accounts,
        get_past_due_accounts,
        get_hot_streak_accounts,
        get_high_value_pending_estimates,
    ]
    
    for func in insight_functions:
        try:
            result = func(conn)
            if result:
                insights.append(result)
        except Exception as e:
            logger.warning(f"Error getting insight from {func.__name__}: {e}")
    
    logger.info(f"Gathered {len(insights)} AI insights")
    return insights


# ============================================================================
# EXPORT FUNCTIONS
# ============================================================================

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


def assemble_export_data(target_date, invoice_data, estimate_data, pm_data, bd_data, mtd_data, ytd_data, ai_insights) -> dict:
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
        'aiInsights': ai_insights,
    }


def _generate_highlights(invoice_data, estimate_data) -> list:
    """Generate highlight items from invoice and estimate data."""
    highlights = []
    
    # Add top invoices as highlights
    for invoice in invoice_data.get('invoices', [])[:3]:
        amount = invoice.get('subtotal', 0)
        account = invoice.get('account_name', 'Unknown')
        highlights.append({
            'type': 'invoice',
            'description': f"Completed order for {account} - ${amount:,.2f}"
        })
    
    # Add top estimates as highlights
    for estimate in estimate_data.get('top_estimates', [])[:2]:
        amount = estimate.get('subtotal', 0)
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
        
        # Get AI Insights
        ai_insights = get_ai_insights(conn)
        logger.info(f"AI Insights: {len(ai_insights)} insights gathered")
        
        # Assemble all data
        export_data = assemble_export_data(
            target_date, invoice_data, estimate_data, 
            pm_open_data, bd_open_data, mtd_data, ytd_data,
            ai_insights
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
