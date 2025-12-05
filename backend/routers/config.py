from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .. import database, schemas, crud, models
from ..mqtt_service import mqtt_service

router = APIRouter(
    prefix="/api/config/mqtt",
    tags=["config"],
)

@router.get("", response_model=schemas.MQTTConfig)
async def get_mqtt_config(db: AsyncSession = Depends(database.get_db)):
    config = await crud.get_mqtt_config(db)
    if not config:
        # Return default or empty
        return schemas.MQTTConfig(id=0, broker_host="", broker_port=1883, discovery_prefix="tasmota/discovery")
    return config

@router.post("", response_model=schemas.MQTTConfig)
async def update_mqtt_config(config: schemas.MQTTConfigCreate, db: AsyncSession = Depends(database.get_db)):
    updated_config = await crud.update_mqtt_config(db, config)
    
    # Reload MQTT service with new config
    # Reload MQTT service with new config
    await mqtt_service.restart()
    
    return updated_config

@router.post("/discover")
async def trigger_discovery(db: AsyncSession = Depends(database.get_db)):
    # Publish to Tasmota discovery topic or broadcast status command
    # Using cmnd/tasmotas/STATUS 0 to request status from all devices
    await mqtt_service.publish("cmnd/tasmotas/STATUS", "0")
    return {"status": "discovery_triggered"}
