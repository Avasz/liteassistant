import asyncio
import logging
from typing import Dict, List
from datetime import datetime, timedelta
from sqlalchemy.future import select
from . import models, database, crud

logger = logging.getLogger(__name__)

class ScheduleEngine:
    def __init__(self):
        self.schedules: List[models.Schedule] = []
        self.mqtt_service = None
        self._running = False
        self._active_timers: Dict[int, asyncio.Task] = {}  # Map schedule_id -> Task

    async def start(self, mqtt_service):
        """Start the schedule engine"""
        self.mqtt_service = mqtt_service
        self._running = True
        
        # Load schedules from database
        await self.load_schedules()
        
        # Start monitoring loop
        asyncio.create_task(self._monitor_loop())
        
        logger.info("Schedule Engine started")

    async def load_schedules(self):
        """Load all enabled schedules from database"""
        async with database.AsyncSessionLocal() as db:
            result = await db.execute(
                select(models.Schedule).filter(models.Schedule.enabled == True)
            )
            self.schedules = result.scalars().all()
            logger.info(f"Loaded {len(self.schedules)} enabled schedules")

    async def reload_schedules(self):
        """Reload schedules (call this when schedules are updated)"""
        # Cancel all pending timers on reload
        for task in self._active_timers.values():
            task.cancel()
        self._active_timers.clear()
        
        await self.load_schedules()

    async def _monitor_loop(self):
        """Background loop to check schedules every minute"""
        while self._running:
            try:
                await self._check_schedules()
                await asyncio.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Error in schedule monitor loop: {e}")
                await asyncio.sleep(60)

    async def _check_schedules(self):
        """Check and execute matching schedules"""
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        current_date = now.strftime("%Y-%m-%d")
        current_weekday = now.weekday()  # 0 = Monday, 6 = Sunday
        
        logger.info(f"Checking schedules at {now.strftime('%Y-%m-%d %H:%M:%S')} (weekday: {current_weekday})")
        
        for schedule in self.schedules:
            if not schedule.enabled:
                continue
            
            try:
                should_execute = False
                
                if schedule.schedule_type == "once":
                    # One-time schedule: check date and time
                    if schedule.date == current_date and schedule.time == current_time:
                        should_execute = True
                        # Disable after execution
                        async with database.AsyncSessionLocal() as db:
                            result = await db.execute(
                                select(models.Schedule).filter(models.Schedule.id == schedule.id)
                            )
                            db_schedule = result.scalars().first()
                            if db_schedule:
                                db_schedule.enabled = False
                                await db.commit()
                
                elif schedule.schedule_type == "daily":
                    # Daily schedule: check time only
                    if schedule.time == current_time:
                        should_execute = True
                
                elif schedule.schedule_type == "weekly":
                    # Weekly schedule: check day of week and time
                    if current_weekday in schedule.days_of_week and schedule.time == current_time:
                        should_execute = True
                
                elif schedule.schedule_type == "interval":
                    # Interval schedule: run every X time units for Y total duration
                    should_execute = await self._check_interval_schedule(schedule, now)
                
                if should_execute:
                    logger.info(f"Executing schedule: {schedule.name} (ID: {schedule.id})")
                    await self._execute_schedule(schedule)
                    
            except Exception as e:
                logger.error(f"Error checking schedule {schedule.id}: {e}")

    async def _check_interval_schedule(self, schedule: models.Schedule, now: datetime) -> bool:
        """Check if an interval schedule should execute now"""
        from datetime import timezone
        
        # Convert interval to seconds
        interval_seconds = self._convert_to_seconds(schedule.interval_value, schedule.interval_unit)
        total_duration_seconds = self._convert_to_seconds(schedule.total_duration_value, schedule.total_duration_unit)
        
        if interval_seconds <= 0:
            return False
        
        # total_duration_seconds <= 0 means indefinite execution
        is_indefinite = total_duration_seconds <= 0
        
        # Initialize start_time if not set
        if not schedule.start_time:
            # Set start time to now and save it
            async with database.AsyncSessionLocal() as db:
                result = await db.execute(
                    select(models.Schedule).filter(models.Schedule.id == schedule.id)
                )
                db_schedule = result.scalars().first()
                if db_schedule:
                    db_schedule.start_time = now.replace(tzinfo=timezone.utc)
                    await db.commit()
                    schedule.start_time = db_schedule.start_time
        
        # Check if total duration has been exceeded
        start_time = schedule.start_time
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        
        now_utc = now.replace(tzinfo=timezone.utc)
        elapsed_seconds = (now_utc - start_time).total_seconds()
        
        if not is_indefinite and elapsed_seconds > total_duration_seconds:
            # Total duration exceeded, disable schedule
            logger.info(f"Interval schedule {schedule.name} total duration exceeded, disabling")
            async with database.AsyncSessionLocal() as db:
                result = await db.execute(
                    select(models.Schedule).filter(models.Schedule.id == schedule.id)
                )
                db_schedule = result.scalars().first()
                if db_schedule:
                    db_schedule.enabled = False
                    await db.commit()
            return False
        
        # Calculate next execution time aligned to midnight
        # Get seconds since midnight
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seconds_since_midnight = (now - midnight).total_seconds()
        
        # Check if current time aligns with interval from midnight
        # We check if we're within the current minute of an interval boundary
        remainder = seconds_since_midnight % interval_seconds
        
        # Execute if we're at the start of an interval period (within current minute)
        # Since we check every minute, we execute if remainder is less than 60 seconds
        if remainder < 60:
            return True
        
        return False
    
    def _convert_to_seconds(self, value: int, unit: str) -> int:
        """Convert time value and unit to seconds"""
        if unit == "seconds":
            return value
        elif unit == "minutes":
            return value * 60
        elif unit == "hours":
            return value * 3600
        return 0

    async def _execute_schedule(self, schedule: models.Schedule):
        """Execute a schedule's action"""
        try:
            async with database.AsyncSessionLocal() as db:
                device = await crud.get_device(db, schedule.device_id)
                if not device or not self.mqtt_service:
                    logger.error(f"Device {schedule.device_id} not found or MQTT not available")
                    return
                
                # Send command to turn on/off/toggle
                topic = f"cmnd/{device.mqtt_topic}/{schedule.switch_name}"
                await self.mqtt_service.publish(topic, schedule.action)
                logger.info(f"Executed schedule {schedule.name}: {topic} -> {schedule.action}")
                
                # Send notification
                from .notification_service import notification_service
                await notification_service.notify("schedule", f"Schedule '{schedule.name}' executed: {schedule.action} on {device.name}")
                
                # If duration > 0, set a timer to turn off
                if schedule.duration > 0 and schedule.action in ["ON", "TOGGLE"]:
                    # Cancel existing timer if any
                    if schedule.id in self._active_timers:
                        self._active_timers[schedule.id].cancel()
                    
                    # Create new timer
                    # Convert duration to seconds based on unit
                    duration_seconds = self._convert_to_seconds(schedule.duration, schedule.duration_unit)
                    task = asyncio.create_task(
                        self._delayed_turn_off(schedule, device, duration_seconds)
                    )
                    self._active_timers[schedule.id] = task
                    task.add_done_callback(lambda t: self._active_timers.pop(schedule.id, None))
                    
        except Exception as e:
            logger.error(f"Error executing schedule {schedule.id}: {e}")

    async def _delayed_turn_off(self, schedule: models.Schedule, device: models.Device, delay_seconds: int):
        """Wait for delay and then turn off the switch"""
        try:
            await asyncio.sleep(delay_seconds)
            topic = f"cmnd/{device.mqtt_topic}/{schedule.switch_name}"
            await self.mqtt_service.publish(topic, "OFF")
            logger.info(f"Schedule {schedule.name} duration expired, turned OFF")
            
            # Send notification for schedule turn-off
            from .notification_service import notification_service
            await notification_service.notify("schedule", f"Schedule '{schedule.name}' duration expired: Turned OFF {device.name}/{schedule.switch_name}")
        except asyncio.CancelledError:
            logger.info(f"Schedule {schedule.name} timer cancelled")
            
            # Send notification that schedule was stopped manually
            from .notification_service import notification_service
            await notification_service.notify("schedule", f"Schedule '{schedule.name}' stopped manually: {device.name}/{schedule.switch_name}")
            raise

    async def stop(self):
        """Stop the schedule engine"""
        self._running = False
        logger.info("Schedule Engine stopped")

# Global instance
schedule_engine = ScheduleEngine()
