import asyncio
import asyncpg
import os
from urllib.parse import urlparse
import sys

async def init_db():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set. Skipping DB creation check.")
        return

    # Handle sqlalchemy+asyncpg format
    if "postgresql+asyncpg://" in db_url:
        clean_url = db_url.replace("postgresql+asyncpg://", "postgres://")
    else:
        clean_url = db_url
        
    try:
        parsed = urlparse(clean_url)
        user = parsed.username
        password = parsed.password
        host = parsed.hostname
        port = parsed.port or 5432
        dbname = parsed.path.lstrip('/')
        
        if not dbname:
            print("No database name specified in DATABASE_URL.")
            return

        print(f"Checking if database '{dbname}' exists on {host}:{port}...")

        # Connect to 'postgres' database to perform checks/creation
        # We assume the user has permissions to connect to 'postgres' and create databases
        try:
            sys_conn = await asyncpg.connect(
                user=user,
                password=password,
                host=host,
                port=port,
                database='postgres'
            )
        except Exception as e:
            print(f"Could not connect to 'postgres' database to check existence: {e}")
            # Fallback: maybe the user can't connect to postgres db but the target db exists?
            # If we can't connect to postgres db, we probably can't create a db anyway.
            return

        try:
            exists = await sys_conn.fetchval(f"SELECT 1 FROM pg_database WHERE datname = '{dbname}'")
            if not exists:
                print(f"Database '{dbname}' does not exist. Creating...")
                await sys_conn.execute(f'CREATE DATABASE "{dbname}"')
                print(f"Database '{dbname}' created successfully.")
            else:
                print(f"Database '{dbname}' already exists.")
        except Exception as e:
            print(f"Error checking/creating database: {e}")
        finally:
            await sys_conn.close()

    except Exception as e:
        print(f"Error parsing DATABASE_URL or initializing: {e}")

if __name__ == "__main__":
    asyncio.run(init_db())
