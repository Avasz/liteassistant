from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from . import models, schemas, auth

async def get_user(db: AsyncSession, username: str):
    result = await db.execute(select(models.User).filter(models.User.username == username))
    return result.scalars().first()

async def create_user(db: AsyncSession, user: schemas.UserCreate):
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, password_hash=hashed_password)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def update_user(db: AsyncSession, user_id: int, user_update: schemas.UserCreate):
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    db_user = result.scalars().first()
    if db_user:
        db_user.username = user_update.username
        if user_update.password:
            db_user.password_hash = auth.get_password_hash(user_update.password)
        await db.commit()
        await db.refresh(db_user)
    return db_user

async def get_mqtt_config(db: AsyncSession):
    result = await db.execute(select(models.MQTTConfig))
    return result.scalars().first()

async def update_mqtt_config(db: AsyncSession, config: schemas.MQTTConfigCreate):
    result = await db.execute(select(models.MQTTConfig))
    db_config = result.scalars().first()
    
    if not db_config:
        db_config = models.MQTTConfig(**config.dict())
        db.add(db_config)
    else:
        for key, value in config.dict().items():
            setattr(db_config, key, value)
            
    await db.commit()
    await db.refresh(db_config)
    return db_config

async def get_devices(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(select(models.Device).order_by(models.Device.mqtt_topic).offset(skip).limit(limit))
    return result.scalars().all()

async def get_device_by_topic(db: AsyncSession, topic: str):
    result = await db.execute(select(models.Device).filter(models.Device.mqtt_topic == topic))
    return result.scalars().first()

async def get_device(db: AsyncSession, device_id: int):
    result = await db.execute(select(models.Device).filter(models.Device.id == device_id))
    return result.scalars().first()

async def create_or_update_device(db: AsyncSession, device_data: dict):
    # Check if device exists
    topic = device_data.get("mqtt_topic")
    result = await db.execute(select(models.Device).filter(models.Device.mqtt_topic == topic))
    db_device = result.scalars().first()

    if db_device:
        # Update existing
        for key, value in device_data.items():
            setattr(db_device, key, value)
    else:
        # Create new
        db_device = models.Device(**device_data)
        db.add(db_device)
    
    await db.commit()
    await db.refresh(db_device)
    return db_device

async def create_sensor_data(db: AsyncSession, device_id: int, data: dict):
    db_sensor = models.SensorData(device_id=device_id, data=data)
    db.add(db_sensor)
    await db.commit()
    await db.refresh(db_sensor)
    return db_sensor

async def get_sensor_history(db: AsyncSession, device_id: int, limit: int = 100, hours: int = None):
    query = select(models.SensorData).filter(models.SensorData.device_id == device_id)
    
    if hours:
        from datetime import datetime, timedelta
        since = datetime.now() - timedelta(hours=hours)
        query = query.filter(models.SensorData.timestamp >= since)
    
    result = await db.execute(
        query.order_by(models.SensorData.timestamp.desc()).limit(limit)
    )
    return result.scalars().all()

