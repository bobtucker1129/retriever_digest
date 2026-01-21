#!/usr/bin/env python3
"""
PrintSmith Export Script
Connects to PrintSmith PostgreSQL database and exports sales data for Retriever Daily Digest.
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from decimal import Decimal

import psycopg2
from psycopg2 import OperationalError, DatabaseError

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


def main():
    """Main entry point for the export script."""
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
        
        logger.info("Export completed successfully")
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")


if __name__ == '__main__':
    main()
