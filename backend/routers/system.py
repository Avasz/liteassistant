from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/api/system", tags=["system"])

@router.get("/time")
async def get_server_time():
    """Get current server time"""
    now = datetime.now()
    return {
        "datetime": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "timezone": now.astimezone().tzname(),
        "weekday": now.weekday()
    }
