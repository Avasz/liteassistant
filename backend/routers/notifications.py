from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from pydantic import BaseModel
from .. import models, database
from ..notification_service import notification_service

router = APIRouter(
    prefix="/api/notifications",
    tags=["notifications"],
)

class NotificationConfigBase(BaseModel):
    provider: str
    enabled: bool
    config: Dict[str, Any]
    events: List[str]

class NotificationConfigCreate(NotificationConfigBase):
    pass

class NotificationConfigResponse(NotificationConfigBase):
    id: int

    class Config:
        from_attributes = True

class TestNotificationRequest(BaseModel):
    provider: str
    config: Dict[str, Any]

@router.get("/", response_model=List[NotificationConfigResponse])
async def get_notification_configs(db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.NotificationConfig))
    return result.scalars().all()

@router.post("/", response_model=NotificationConfigResponse)
async def create_notification_config(config: NotificationConfigCreate, db: AsyncSession = Depends(database.get_db)):
    # Check if config for this provider already exists
    result = await db.execute(
        select(models.NotificationConfig).filter(models.NotificationConfig.provider == config.provider)
    )
    existing_config = result.scalars().first()
    
    if existing_config:
        # Update existing
        existing_config.enabled = config.enabled
        existing_config.config = config.config
        existing_config.events = config.events
        await db.commit()
        await db.refresh(existing_config)
        
        # Reload service config
        await notification_service.load_config()
        return existing_config
    else:
        # Create new
        db_config = models.NotificationConfig(**config.dict())
        db.add(db_config)
        await db.commit()
        await db.refresh(db_config)
        
        # Reload service config
        await notification_service.load_config()
        return db_config

@router.delete("/{config_id}")
async def delete_notification_config(config_id: int, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(
        select(models.NotificationConfig).filter(models.NotificationConfig.id == config_id)
    )
    config = result.scalars().first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    await db.delete(config)
    await db.commit()
    
    # Reload service config
    await notification_service.load_config()
    return {"message": "Configuration deleted"}

@router.post("/test")
async def test_notification(request: TestNotificationRequest):
    try:
        message = "This is a test notification from LiteAssistant."
        if request.provider == "telegram":
            await notification_service.send_telegram(message, request.config)
        elif request.provider == "ntfy":
            await notification_service.send_ntfy(message, request.config)
        else:
            raise HTTPException(status_code=400, detail="Unknown provider")
            
        return {"message": "Test notification sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
