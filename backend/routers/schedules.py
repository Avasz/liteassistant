from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from .. import models, database, crud

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

@router.get("", response_model=List[dict])
async def get_schedules(db: AsyncSession = Depends(database.get_db)):
    """Get all schedules"""
    result = await db.execute(select(models.Schedule))
    schedules = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "enabled": s.enabled,
            "device_id": s.device_id,
            "switch_name": s.switch_name,
            "schedule_type": s.schedule_type,
            "time": s.time,
            "days_of_week": s.days_of_week,
            "date": s.date,
            "duration": s.duration,
            "duration_unit": s.duration_unit,
            "interval_value": s.interval_value,
            "interval_unit": s.interval_unit,
            "total_duration_value": s.total_duration_value,
            "total_duration_unit": s.total_duration_unit,
            "action": s.action
        }
        for s in schedules
    ]

@router.post("", response_model=dict)
async def create_schedule(
    name: str,
    device_id: int,
    schedule_type: str,
    time: str,
    switch_name: str = "POWER",
    days_of_week: List[int] = None,
    date: str = None,
    duration: int = 0,
    duration_unit: str = "minutes",
    interval_value: int = 0,
    interval_unit: str = "minutes",
    total_duration_value: int = 0,
    total_duration_unit: str = "hours",
    action: str = "ON",
    db: AsyncSession = Depends(database.get_db)
):
    """Create a new schedule"""
    schedule = models.Schedule(
        name=name,
        device_id=device_id,
        switch_name=switch_name,
        schedule_type=schedule_type,
        time=time,
        days_of_week=days_of_week or [],
        date=date,
        duration=duration,
        duration_unit=duration_unit,
        interval_value=interval_value,
        interval_unit=interval_unit,
        total_duration_value=total_duration_value,
        total_duration_unit=total_duration_unit,
        action=action
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    
    # Reload schedules in the engine
    from ..schedule_engine import schedule_engine
    await schedule_engine.reload_schedules()
    
    return {
        "id": schedule.id,
        "name": schedule.name,
        "enabled": schedule.enabled,
        "device_id": schedule.device_id,
        "switch_name": schedule.switch_name,
        "schedule_type": schedule.schedule_type,
        "time": schedule.time,
        "days_of_week": schedule.days_of_week,
        "date": schedule.date,
        "duration": schedule.duration,
        "interval_value": schedule.interval_value,
        "interval_unit": schedule.interval_unit,
        "total_duration_value": schedule.total_duration_value,
        "total_duration_unit": schedule.total_duration_unit,
        "action": schedule.action
    }

@router.put("/{schedule_id}", response_model=dict)
async def update_schedule(
    schedule_id: int,
    name: str = None,
    device_id: int = None,
    switch_name: str = None,
    schedule_type: str = None,
    time: str = None,
    days_of_week: List[int] = None,
    date: str = None,
    duration: int = None,
    duration_unit: str = None,
    interval_value: int = None,
    interval_unit: str = None,
    total_duration_value: int = None,
    total_duration_unit: str = None,
    action: str = None,
    db: AsyncSession = Depends(database.get_db)
):
    """Update a schedule"""
    result = await db.execute(select(models.Schedule).filter(models.Schedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if name is not None:
        schedule.name = name
    if device_id is not None:
        schedule.device_id = device_id
    if switch_name is not None:
        schedule.switch_name = switch_name
    if schedule_type is not None:
        schedule.schedule_type = schedule_type
    if time is not None:
        schedule.time = time
    if days_of_week is not None:
        schedule.days_of_week = days_of_week
    if date is not None:
        schedule.date = date
    if duration is not None:
        schedule.duration = duration
    if duration_unit is not None:
        schedule.duration_unit = duration_unit
    if interval_value is not None:
        schedule.interval_value = interval_value
    if interval_unit is not None:
        schedule.interval_unit = interval_unit
    if total_duration_value is not None:
        schedule.total_duration_value = total_duration_value
    if total_duration_unit is not None:
        schedule.total_duration_unit = total_duration_unit
    if action is not None:
        schedule.action = action
    
    await db.commit()
    await db.refresh(schedule)
    
    # Reload schedules in the engine
    from ..schedule_engine import schedule_engine
    await schedule_engine.reload_schedules()
    
    return {
        "id": schedule.id,
        "name": schedule.name,
        "enabled": schedule.enabled,
        "device_id": schedule.device_id,
        "switch_name": schedule.switch_name,
        "schedule_type": schedule.schedule_type,
        "time": schedule.time,
        "days_of_week": schedule.days_of_week,
        "date": schedule.date,
        "duration": schedule.duration,
        "interval_value": schedule.interval_value,
        "interval_unit": schedule.interval_unit,
        "total_duration_value": schedule.total_duration_value,
        "total_duration_unit": schedule.total_duration_unit,
        "action": schedule.action
    }

@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: int, db: AsyncSession = Depends(database.get_db)):
    """Delete a schedule"""
    result = await db.execute(select(models.Schedule).filter(models.Schedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    await db.delete(schedule)
    await db.commit()
    
    # Reload schedules in the engine
    from ..schedule_engine import schedule_engine
    await schedule_engine.reload_schedules()
    
    return {"status": "deleted"}

@router.post("/{schedule_id}/toggle", response_model=dict)
async def toggle_schedule(schedule_id: int, db: AsyncSession = Depends(database.get_db)):
    """Toggle schedule enabled/disabled"""
    result = await db.execute(select(models.Schedule).filter(models.Schedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    schedule.enabled = not schedule.enabled
    await db.commit()
    await db.refresh(schedule)
    
    # Reload schedules in the engine
    from ..schedule_engine import schedule_engine
    await schedule_engine.reload_schedules()
    
    return {
        "id": schedule.id,
        "name": schedule.name,
        "enabled": schedule.enabled,
        "device_id": schedule.device_id,
        "switch_name": schedule.switch_name,
        "schedule_type": schedule.schedule_type,
        "time": schedule.time,
        "days_of_week": schedule.days_of_week,
        "date": schedule.date,
        "duration": schedule.duration,
        "interval_value": schedule.interval_value,
        "interval_unit": schedule.interval_unit,
        "total_duration_value": schedule.total_duration_value,
        "total_duration_unit": schedule.total_duration_unit,
        "action": schedule.action
    }
