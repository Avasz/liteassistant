from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
from .. import database, schemas, models

router = APIRouter(
    prefix="/api/automations",
    tags=["automations"],
)

@router.get("", response_model=List[schemas.Automation])
async def read_automations(db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Automation))
    return result.scalars().all()

@router.post("", response_model=schemas.Automation)
async def create_automation(automation: schemas.AutomationCreate, db: AsyncSession = Depends(database.get_db)):
    db_automation = models.Automation(**automation.dict())
    db.add(db_automation)
    await db.commit()
    await db.refresh(db_automation)
    return db_automation

@router.put("/{automation_id}", response_model=schemas.Automation)
async def update_automation(automation_id: int, automation: schemas.AutomationCreate, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Automation).filter(models.Automation.id == automation_id))
    db_automation = result.scalars().first()
    if not db_automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    for key, value in automation.dict().items():
        setattr(db_automation, key, value)
    
    await db.commit()
    await db.refresh(db_automation)
    return db_automation

@router.delete("/{automation_id}")
async def delete_automation(automation_id: int, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Automation).filter(models.Automation.id == automation_id))
    db_automation = result.scalars().first()
    if not db_automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    # Delete associated logs first to avoid foreign key violation
    await db.execute(delete(models.AutomationLog).where(models.AutomationLog.automation_id == automation_id))
    
    await db.delete(db_automation)
    await db.commit()
    
    # Reload automations in the engine
    from ..automation_engine import automation_engine
    await automation_engine.reload_automations()
    
    return {"status": "success"}

@router.post("/{automation_id}/toggle", response_model=schemas.Automation)
async def toggle_automation(automation_id: int, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Automation).filter(models.Automation.id == automation_id))
    db_automation = result.scalars().first()
    if not db_automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    db_automation.enabled = not db_automation.enabled
    await db.commit()
    await db.refresh(db_automation)
    
    # Reload automations in the engine
    from ..automation_engine import automation_engine
    await automation_engine.reload_automations()
    
    return db_automation

@router.get("/{automation_id}/logs", response_model=List[schemas.AutomationLog])
async def get_automation_logs(automation_id: int, limit: int = 50, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(
        select(models.AutomationLog)
        .filter(models.AutomationLog.automation_id == automation_id)
        .order_by(models.AutomationLog.timestamp.desc())
        .limit(limit)
    )
    return result.scalars().all()

@router.post("/{automation_id}/test")
async def test_automation(automation_id: int, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Automation).filter(models.Automation.id == automation_id))
    db_automation = result.scalars().first()
    if not db_automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    # Manually trigger the automation
    from ..automation_engine import automation_engine
    await automation_engine.execute_automation(
        db_automation,
        {"trigger": "manual_test", "timestamp": "now"}
    )
    
    return {"status": "triggered", "automation": db_automation.name}
