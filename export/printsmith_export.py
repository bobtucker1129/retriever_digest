#!/usr/bin/env python3
"""
PrintSmith Export Script
Connects to PrintSmith PostgreSQL database and exports sales data for Retriever Daily Digest.
"""

import os
import sys
import logging
from datetime import datetime

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


def main():
    """Main entry point for the export script."""
    logger.info("Starting PrintSmith export...")
    logger.info(f"Export timestamp: {datetime.now().isoformat()}")
    
    conn = None
    try:
        conn = connect_to_printsmith()
        
        # Future: Add data export functions here
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
