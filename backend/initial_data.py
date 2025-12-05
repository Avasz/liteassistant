import asyncio
import logging
import sys
import os

# Add the parent directory to sys.path to allow imports from backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import AsyncSessionLocal
from backend import crud, schemas
from backend.models import User
from sqlalchemy.future import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_data():
    async with AsyncSessionLocal() as db:
        logger.info("Checking for admin user...")
        result = await db.execute(select(User).filter(User.username == "admin"))
        user = result.scalars().first()
        
        if not user:
            logger.info("Admin user not found. Creating...")
            user_in = schemas.UserCreate(
                username="admin",
                password="admin123"
            )
            await crud.create_user(db, user_in)
            logger.info("Admin user created: admin / admin123")
        else:
            logger.info("Admin user already exists.")

if __name__ == "__main__":
    asyncio.run(init_data())
