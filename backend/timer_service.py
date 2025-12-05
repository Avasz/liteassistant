import asyncio
import logging
from datetime import datetime, timezone
from .database import AsyncSessionLocal
from .crud import get_devices, create_or_update_device
from .mqtt_service import mqtt_service

logger = logging.getLogger(__name__)

class TimerService:
    def __init__(self):
        self.running = False
        
    async def start(self):
        """Start the timer service background task"""
        self.running = True
        logger.info("Timer Service starting...")
        asyncio.create_task(self._check_timers_loop())
        
    async def stop(self):
        """Stop the timer service"""
        self.running = False
        logger.info("Timer Service stopped")
        
    async def _check_timers_loop(self):
        """Background task that checks for expired timers every 10 seconds"""
        while self.running:
            try:
                await self._check_and_execute_timers()
            except Exception as e:
                logger.error(f"Error in timer check loop: {e}")
            await asyncio.sleep(10)  # Check every 10 seconds
            
    async def _check_and_execute_timers(self):
        """Check all devices for expired timers and turn off switches"""
        async with AsyncSessionLocal() as db:
            devices = await get_devices(db, skip=0, limit=1000)
            now = datetime.now(timezone.utc)
            
            for device in devices:
                if not device.active_timers:
                    continue
                    
                updated_timers = {}
                timers_to_execute = []
                
                for switch, end_time_str in device.active_timers.items():
                    if not end_time_str:
                        continue
                        
                    try:
                        end_time = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                        
                        if now >= end_time:
                            # Timer expired - turn off switch
                            timers_to_execute.append((device.mqtt_topic, switch))
                            logger.info(f"Timer expired for {device.mqtt_topic}/{switch}")
                        else:
                            # Timer still active
                            updated_timers[switch] = end_time_str
                    except Exception as e:
                        logger.error(f"Error parsing timer for {device.mqtt_topic}/{switch}: {e}")
                
                # Execute expired timers
                for topic, switch in timers_to_execute:
                    try:
                        full_topic = f"cmnd/{topic}/{switch}"
                        await mqtt_service.publish(full_topic, "OFF")
                        logger.info(f"Turned off {full_topic}")
                        
                        # Send notification
                        from .notification_service import notification_service
                        await notification_service.notify("timer", f"Timer expired for {topic}/{switch}. Turned OFF.")
                    except Exception as e:
                        logger.error(f"Failed to turn off {topic}/{switch}: {e}")
                
                # Update device if timers changed
                if len(updated_timers) != len(device.active_timers):
                    await create_or_update_device(db, {
                        "mqtt_topic": device.mqtt_topic,
                        "active_timers": updated_timers
                    })

timer_service = TimerService()
