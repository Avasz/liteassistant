from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from .. import database, schemas, crud, models
from ..mqtt_service import mqtt_service
from ..websocket_manager import manager

router = APIRouter(
    prefix="/api/devices",
    tags=["devices"],
)

@router.get("", response_model=List[schemas.Device])
async def read_devices(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    devices = await crud.get_devices(db, skip=skip, limit=limit)
    return devices

@router.get("/{device_id}", response_model=schemas.Device)
async def read_device(device_id: int, db: AsyncSession = Depends(database.get_db)):
    # We need a get_device_by_id in crud, but for now let's filter
    # Optimization: Add get_device(id) to crud later
    devices = await crud.get_devices(db, skip=0, limit=1000)
    for d in devices:
        if d.id == device_id:
            return d
    raise HTTPException(status_code=404, detail="Device not found")

@router.post("/{device_id}/command")
async def send_command(device_id: int, command: str, payload: str, db: AsyncSession = Depends(database.get_db)):
    # Find device topic
    devices = await crud.get_devices(db, skip=0, limit=1000)
    device = next((d for d in devices if d.id == device_id), None)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    # Publish to cmnd/<topic>/<command>
    full_topic = f"cmnd/{device.mqtt_topic}/{command}"
    await mqtt_service.publish(full_topic, payload)
    
    return {"status": "sent", "topic": full_topic, "payload": payload}

@router.post("/scan")
async def scan_devices():
    # Publish to cmnd/tasmotas/STATUS 0 to trigger all devices
    await mqtt_service.publish("cmnd/tasmotas/STATUS", "0")
    return {"status": "scan_initiated"}

@router.put("/{device_id}", response_model=schemas.Device)
async def update_device(device_id: int, device_update: schemas.DeviceBase, db: AsyncSession = Depends(database.get_db)):
    # Check if device exists
    devices = await crud.get_devices(db, skip=0, limit=1000)
    device = next((d for d in devices if d.id == device_id), None)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Update device
    update_data = device_update.dict(exclude_unset=True)
    # We need to preserve the ID and mqtt_topic if not changed, but create_or_update uses mqtt_topic to find
    # So we need to make sure mqtt_topic is present
    if "mqtt_topic" not in update_data:
        update_data["mqtt_topic"] = device.mqtt_topic
        
    updated_device = await crud.create_or_update_device(db, update_data)
    return updated_device

@router.post("/{device_id}/timer")
async def set_timer(
    device_id: int, 
    switch: str, 
    background_tasks: BackgroundTasks,
    duration_seconds: int = 0, 
    duration_minutes: int = 0, 
    db: AsyncSession = Depends(database.get_db)
):
    """Set a timer to auto-off a switch after specified duration"""
    from datetime import datetime, timedelta, timezone
    
    devices = await crud.get_devices(db, skip=0, limit=1000)
    device = next((d for d in devices if d.id == device_id), None)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        # Calculate end time
        total_seconds = duration_seconds + (duration_minutes * 60)
        if total_seconds <= 0:
            raise HTTPException(status_code=400, detail="Duration must be positive")
            
        end_time = datetime.now(timezone.utc) + timedelta(seconds=total_seconds)
        
        # Update active_timers (create new dict for SQLAlchemy change detection)
        active_timers = dict(device.active_timers or {})
        active_timers[switch] = end_time.isoformat()
        
        # Turn on the switch
        full_topic = f"cmnd/{device.mqtt_topic}/{switch}"
        await mqtt_service.publish(full_topic, "ON")
        
        # Send notification for timer start (background task)
        from ..notification_service import notification_service
        duration_str = f"{duration_minutes}m {duration_seconds}s" if duration_minutes else f"{duration_seconds}s"
        message = f"Timer started for {device.name}/{switch}: {duration_str}. Switch turned ON."
        background_tasks.add_task(notification_service.notify, "timer", message)
        
        # Update device
        update_data = {"mqtt_topic": device.mqtt_topic, "active_timers": active_timers}
        updated_device = await crud.create_or_update_device(db, update_data)
        
        # Notify frontend via WebSocket
        await manager.broadcast({"type": "device_update"})
        
        return {"status": "timer_set", "switch": switch, "end_time": end_time.isoformat(), "device": updated_device}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error setting timer: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{device_id}/timer/{switch}")
async def cancel_timer(device_id: int, switch: str, db: AsyncSession = Depends(database.get_db)):
    """Cancel an active timer for a switch"""
    devices = await crud.get_devices(db, skip=0, limit=1000)
    device = next((d for d in devices if d.id == device_id), None)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Remove timer (create new dict for SQLAlchemy change detection)
    active_timers = dict(device.active_timers or {})
    timer_was_active = switch in active_timers
    if switch in active_timers:
        del active_timers[switch]
    
    # Send notification if timer was cancelled
    if timer_was_active:
        from ..notification_service import notification_service
        await notification_service.notify("timer", f"Timer cancelled manually for {device.name}/{switch}.")
    
    # Update device
    update_data = {"mqtt_topic": device.mqtt_topic, "active_timers": active_timers}
    updated_device = await crud.create_or_update_device(db, update_data)
    
    # Notify frontend via WebSocket
    await manager.broadcast({"type": "device_update"})
    
    return {"status": "timer_cancelled", "switch": switch, "device": updated_device}

@router.get("/{device_id}/history")
async def get_device_history(device_id: int, limit: int = 100, hours: int = None, db: AsyncSession = Depends(database.get_db)):
    """Get historical sensor data for a device"""
    history = await crud.get_sensor_history(db, device_id, limit, hours)
    return history
