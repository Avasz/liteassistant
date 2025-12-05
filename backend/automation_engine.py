import asyncio
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.future import select
from . import models, database, crud
from .websocket_manager import manager

logger = logging.getLogger(__name__)

class AutomationEngine:
    def __init__(self):
        self.automations: List[models.Automation] = []
        self.mqtt_service = None
        self._running = False
        self._tasks = set()
        self._active_delays: Dict[int, asyncio.Task] = {}  # Map automation_id -> Task

    async def start(self, mqtt_service):
        """Start the automation engine"""
        self.mqtt_service = mqtt_service
        self._running = True
        
        # Load automations from database
        await self.load_automations()
        
        # Start monitoring tasks
        task = asyncio.create_task(self._monitor_loop())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        
        logger.info("Automation Engine started")

    async def load_automations(self):
        """Load all enabled automations from database"""
        async with database.AsyncSessionLocal() as db:
            result = await db.execute(
                select(models.Automation).filter(models.Automation.enabled == True)
            )
            self.automations = result.scalars().all()
            logger.info(f"Loaded {len(self.automations)} enabled automations")

    async def reload_automations(self):
        """Reload automations (call this when automations are updated)"""
        # Cancel all pending delays on reload to avoid stale state
        for task in self._active_delays.values():
            task.cancel()
        self._active_delays.clear()
        
        await self.load_automations()

    async def _monitor_loop(self):
        """Background loop for time-based triggers"""
        while self._running:
            try:
                # Check time-based triggers every minute
                await self._check_time_triggers()
                await asyncio.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Error in automation monitor loop: {e}")
                await asyncio.sleep(60)

    async def _check_time_triggers(self):
        """Check and execute time-based automations"""
        now = datetime.now()
        
        for automation in self.automations:
            # Skip disabled automations
            if not automation.enabled:
                continue
                
            if automation.trigger_type == "time":
                try:
                    trigger_config = automation.trigger_value
                    # Simple time trigger: {"hour": 6, "minute": 0}
                    if trigger_config.get("hour") == now.hour and trigger_config.get("minute") == now.minute:
                        await self.execute_automation(automation, {"trigger": "time", "time": now.isoformat()})
                except Exception as e:
                    logger.error(f"Error checking time trigger for automation {automation.id}: {e}")

    async def handle_mqtt_message(self, topic: str, payload: str):
        """Check if any automation should be triggered by this MQTT message"""
        for automation in self.automations:
            # Skip disabled automations
            if not automation.enabled:
                continue
                
            if automation.trigger_type == "mqtt":
                try:
                    trigger_config = automation.trigger_value
                    # trigger_value format: {"topic": "tele/pump/STATE", "payload_contains": "ON"}
                    
                    trigger_topic = trigger_config.get("topic", "")
                    payload_contains = trigger_config.get("payload_contains")
                    payload_json_path = trigger_config.get("payload_json_path")
                    payload_json_value = trigger_config.get("payload_json_value")
                    
                    # Check if topic matches (support wildcards)
                    if self._topic_matches(topic, trigger_topic):
                        # Check payload conditions
                        should_trigger = False
                        
                        if payload_contains and payload_contains in payload:
                            should_trigger = True
                        elif payload_json_path and payload_json_value:
                            # Check JSON path (e.g., "POWER" == "ON")
                            try:
                                payload_data = json.loads(payload)
                                actual_value = payload_data.get(payload_json_path)
                                if str(actual_value) == str(payload_json_value):
                                    should_trigger = True
                            except json.JSONDecodeError:
                                pass
                        elif not payload_contains and not payload_json_path:
                            # No payload condition, just topic match
                            should_trigger = True
                        
                        if should_trigger:
                            await self.execute_automation(
                                automation,
                                {"trigger": "mqtt", "topic": topic, "payload": payload}
                            )
                except Exception as e:
                    logger.error(f"Error checking MQTT trigger for automation {automation.id}: {e}")

    def _compare_values(self, actual, expected, operator='=='):
        """Compare values using the specified operator"""
        result = False
        try:
            # Try numeric comparison first
            actual_num = float(actual)
            expected_num = float(expected)
            
            if operator == '==':
                result = actual_num == expected_num
            elif operator == '!=':
                result = actual_num != expected_num
            elif operator == '<':
                result = actual_num < expected_num
            elif operator == '<=':
                result = actual_num <= expected_num
            elif operator == '>':
                result = actual_num > expected_num
            elif operator == '>=':
                result = actual_num >= expected_num
        except (ValueError, TypeError):
            # Fall back to string comparison
            if operator == '==':
                result = str(actual) == str(expected)
            elif operator == '!=':
                result = str(actual) != str(expected)
        
        logger.debug(f"Compare: {actual} {operator} {expected} -> {result}")
        return result

    async def handle_device_state_change(self, device_id: int, old_state: Dict, new_state: Dict):
        """Handle device state changes and check for matching triggers"""
        for automation in self.automations:
            # Skip disabled automations
            if not automation.enabled:
                continue
                
            if automation.trigger_type == "device_state":
                try:
                    trigger_config = automation.trigger_value
                    # trigger_value format: {"device_id": 1, "attribute": "POWER", "value": "ON", "operator": "==", "for_duration": 5}
                    
                    if trigger_config.get("device_id") == device_id:
                        attribute = trigger_config.get("attribute")
                        expected_value = trigger_config.get("value")
                        operator = trigger_config.get("operator", "==")
                        for_duration = trigger_config.get("for_duration", 0) # Duration in minutes
                        
                        old_value = old_state.get(attribute)
                        new_value = new_state.get(attribute)
                        
                        # Check if state matches using comparison operator
                        logger.info(f"Checking automation {automation.id}: {attribute} (old={old_value}, new={new_value}) {operator} {expected_value}")
                        is_match = self._compare_values(new_value, expected_value, operator)
                        logger.info(f"Automation {automation.id} match result: {is_match}")
                        
                        if is_match:
                            # If we have a duration requirement
                            if for_duration > 0:
                                # Start a delayed trigger if not already running
                                if automation.id not in self._active_delays:
                                    logger.info(f"Starting delayed trigger for automation {automation.id} ({for_duration} mins)")
                                    task = asyncio.create_task(self._delayed_execution(automation, for_duration * 60, {
                                        "trigger": "device_state_duration",
                                        "device_id": device_id,
                                        "attribute": attribute,
                                        "value": new_value,
                                        "duration": for_duration
                                    }))
                                    self._active_delays[automation.id] = task
                                    task.add_done_callback(lambda t: self._active_delays.pop(automation.id, None))
                            
                            # Immediate trigger if no duration and value changed
                            elif old_value != new_value:
                                await self.execute_automation(
                                    automation,
                                    {
                                        "trigger": "device_state",
                                        "device_id": device_id,
                                        "attribute": attribute,
                                        "old_value": old_value,
                                        "new_value": new_value
                                    }
                                )
                        else:
                            # State does not match, cancel any pending delay
                            if automation.id in self._active_delays:
                                logger.info(f"Cancelling delayed trigger for automation {automation.id} (condition no longer met)")
                                self._active_delays[automation.id].cancel()
                                del self._active_delays[automation.id]

                except Exception as e:
                    logger.error(f"Error checking device state trigger for automation {automation.id}: {e}")

    async def _delayed_execution(self, automation, delay_seconds, trigger_data):
        """Wait for delay and then execute automation"""
        try:
            await asyncio.sleep(delay_seconds)
            logger.info(f"Delayed trigger fired for automation {automation.id}")
            await self.execute_automation(automation, trigger_data)
        except asyncio.CancelledError:
            logger.info(f"Delayed trigger cancelled for automation {automation.id}")
            raise

    async def execute_automation(self, automation: models.Automation, trigger_data: Dict[str, Any]):
        """Execute an automation's action"""
        logger.info(f"Executing automation: {automation.name} (ID: {automation.id})")
        
        success = True
        error_message = None
        action_result = {}
        
        try:
            action_type = automation.action_type
            action_config = automation.action_value
            
            if action_type == "mqtt_publish":
                # action_value format: {"topic": "cmnd/pump/POWER", "payload": "ON"}
                topic = action_config.get("topic")
                payload = action_config.get("payload")
                
                if self.mqtt_service and topic and payload:
                    await self.mqtt_service.publish(topic, payload)
                    action_result = {"published": topic, "payload": payload}
                    logger.info(f"Published MQTT: {topic} -> {payload}")
                else:
                    raise ValueError("Invalid MQTT publish configuration")
            
            elif action_type == "device_command":
                # action_value format: {"device_id": 2, "command": "POWER", "payload": "ON"}
                device_id = action_config.get("device_id")
                command = action_config.get("command")
                payload = action_config.get("payload")
                
                async with database.AsyncSessionLocal() as db:
                    device = await crud.get_device(db, device_id)
                    if device and self.mqtt_service:
                        topic = f"cmnd/{device.mqtt_topic}/{command}"
                        await self.mqtt_service.publish(topic, payload)
                        action_result = {"device": device.name, "command": command, "payload": payload}
                        logger.info(f"Sent command to device {device.name}: {command} {payload}")
                    else:
                        raise ValueError(f"Device {device_id} not found or MQTT not available")
            
            elif action_type == "delay":
                # action_value format: {"seconds": 5}
                seconds = action_config.get("seconds", 0)
                await asyncio.sleep(seconds)
                action_result = {"delayed": seconds}
            
            else:
                raise ValueError(f"Unknown action type: {action_type}")
            
            # Broadcast automation execution via WebSocket
            await manager.broadcast({
                "type": "automation_executed",
                "automation_id": automation.id,
                "automation_name": automation.name,
                "success": True
            })

            # Send notification
            from .notification_service import notification_service
            if success:
                # Construct a friendly message
                msg = f"Automation '{automation.name}' executed successfully."
                if action_result:
                    msg += f"\nAction: {json.dumps(action_result)}"
                await notification_service.notify("automation", msg)
            
        except Exception as e:
            success = False
            error_message = str(e)
            logger.error(f"Error executing automation {automation.id}: {e}")
        
        # Log execution
        await self._log_execution(automation.id, trigger_data, action_result, success, error_message)

    async def _log_execution(self, automation_id: int, trigger_data: Dict, action_result: Dict, success: bool, error_message: Optional[str]):
        """Log automation execution to database"""
        async with database.AsyncSessionLocal() as db:
            log_entry = models.AutomationLog(
                automation_id=automation_id,
                trigger_data=trigger_data,
                action_result=action_result,
                success=success,
                error_message=error_message
            )
            db.add(log_entry)
            await db.commit()

    def _topic_matches(self, actual_topic: str, pattern: str) -> bool:
        """Check if MQTT topic matches pattern (supports + and # wildcards)"""
        actual_parts = actual_topic.split("/")
        pattern_parts = pattern.split("/")
        
        if len(pattern_parts) > len(actual_parts):
            return False
        
        for i, pattern_part in enumerate(pattern_parts):
            if pattern_part == "#":
                return True  # # matches everything after
            elif pattern_part == "+":
                continue  # + matches single level
            elif i >= len(actual_parts) or pattern_part != actual_parts[i]:
                return False
        
        return len(actual_parts) == len(pattern_parts)

    async def stop(self):
        """Stop the automation engine"""
        self._running = False
        logger.info("Automation Engine stopped")

# Global instance
automation_engine = AutomationEngine()
