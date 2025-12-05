import asyncio
import json
import logging
from typing import Optional, Callable, Dict, Any
import aiomqtt
from sqlalchemy.future import select
from . import models, database, schemas, crud
from .websocket_manager import manager

logger = logging.getLogger(__name__)

class MQTTService:
    def __init__(self):
        self.client: Optional[aiomqtt.Client] = None
        self.config: Optional[models.MQTTConfig] = None
        self.is_connected = False
        self._tasks = set()

    async def load_config(self):
        print("Loading MQTT config...")
        try:
            async with database.AsyncSessionLocal() as db:
                result = await db.execute(select(models.MQTTConfig))
                self.config = result.scalars().first()
                if self.config:
                    print(f"Loaded config: {self.config.broker_host}")
                else:
                    print("No MQTT config found in DB")
        except Exception as e:
            print(f"Error loading config: {e}")

    async def start(self):
        print("MQTT Service starting...")
        await self.load_config()
        if not self.config:
            print("MQTT Service: No config, aborting start.")
            return

        try:
            print(f"Initializing MQTT Client for {self.config.broker_host}...")
            self.client = aiomqtt.Client(
                hostname=self.config.broker_host,
                port=self.config.broker_port,
                username=self.config.username,
                password=self.config.password
            )
            
            task = asyncio.create_task(self._connect_loop())
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            
        except Exception as e:
            logger.error(f"Failed to initialize MQTT client: {e}")

    async def _connect_loop(self):
        print("Entering _connect_loop...")
        if not self.client:
            print("Client is None in _connect_loop")
            return

        while True:
            try:
                print(f"Attempting to connect to MQTT Broker at {self.config.broker_host}:{self.config.broker_port}...")
                async with self.client:
                    self.is_connected = True
                    print(f"Connected to MQTT Broker at {self.config.broker_host}:{self.config.broker_port}")
                    
                    # Subscribe to Tasmota discovery and status topics
                    # Assuming standard Tasmota topics
                    topics = [
                        "tele/+/LWT",
                        "stat/+/STATUS0",
                        "tele/+/STATE",
                        "tele/+/SENSOR",
                        "stat/+/RESULT",
                        "tasmota/discovery/#",
                        "tasmota/+/tele/SENSOR",  # New format for sensor data
                        "tasmota/+/tele/STATE",   # New format for state
                        "tasmota/+/stat/RESULT"   # New format for results
                    ]
                    
                    # Add custom topics from config
                    if self.config.custom_topics:
                        for custom_topic in self.config.custom_topics:
                            if custom_topic and custom_topic.strip():
                                topics.append(custom_topic.strip())
                    
                    for topic in topics:
                        await self.client.subscribe(topic)
                        print(f"Subscribed to: {topic}")
                    
                    async for message in self.client.messages:
                        await self.handle_message(message)
            except aiomqtt.MqttError as e:
                self.is_connected = False
                logger.error(f"MQTT Connection lost: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Unexpected MQTT error: {e}")
                await asyncio.sleep(5)

    async def handle_message(self, message):
        topic = message.topic.value
        try:
            payload = message.payload.decode()
        except UnicodeDecodeError:
            payload = str(message.payload)
            
        logger.info(f"MQTT RX: {topic} -> {payload}")
        
        # Broadcast raw message to frontend for real-time updates
        await manager.broadcast({
            "type": "mqtt_message",
            "topic": topic,
            "payload": payload
        })
        
        # Notify automation engine of MQTT message
        from .automation_engine import automation_engine
        await automation_engine.handle_mqtt_message(topic, payload)
        
        try:
            # Parse Topic - support both formats:
            # Old: tele/device/SENSOR
            # New: tasmota/device/tele/SENSOR
            parts = topic.split("/")
            
            is_tasmota = False
            device_topic = None
            prefix = None
            suffix = None
            
            # Determine format and extract device_topic
            if parts[0] == "tasmota" and len(parts) >= 4:
                # New format: tasmota/device_id/tele/SENSOR
                device_topic = parts[1]
                prefix = parts[2]  # tele, stat
                suffix = "/".join(parts[3:])  # SENSOR, STATE, RESULT
                is_tasmota = True
            elif len(parts) >= 3 and parts[0] in ["tele", "stat", "cmnd"]:
                # Old format: tele/device/SENSOR
                prefix = parts[0]  # tele, stat, cmnd
                device_topic = parts[1]
                suffix = "/".join(parts[2:])
                is_tasmota = True
            
            # Generic/Custom topic handling fallback
            if not is_tasmota:
                 device_topic = topic

            async with database.AsyncSessionLocal() as db:
                # Fetch existing device to get old attributes
                existing_device = await crud.get_device_by_topic(db, device_topic)
                old_attributes = existing_device.attributes.copy() if existing_device and existing_device.attributes else {}
                
                updated_device = None

                if is_tasmota:
                    # 1. LWT - Online/Offline Status
                    if prefix == "tele" and suffix == "LWT":
                        is_online = (payload == "Online")
                        updated_device = await crud.create_or_update_device(db, {
                            "mqtt_topic": device_topic,
                            "is_online": is_online
                        })
                        
                        if is_online:
                            # Request full status
                            await self.publish(f"cmnd/{device_topic}/STATUS", "0")

                    # 2. STATUS0 - Full Metadata
                    elif prefix == "stat" and suffix == "STATUS0":
                        data = json.loads(payload)
                        status = data.get("Status", {})
                        status_net = data.get("StatusNET", {})
                        
                        device_name = status.get("DeviceName", device_topic)
                        friendly_name_val = status.get("FriendlyName", [device_name])
                        if isinstance(friendly_name_val, list) and len(friendly_name_val) > 0:
                            friendly_name = friendly_name_val[0]
                        else:
                            friendly_name = str(friendly_name_val)
                        ip_address = status_net.get("IPAddress")
                        
                        updated_device = await crud.create_or_update_device(db, {
                            "mqtt_topic": device_topic,
                            "name": friendly_name,
                            "ip_address": ip_address,
                            "is_online": True,
                            "attributes": data
                        })

                    # 3. STATE - Telemetry (Power, Wifi, etc.)
                    elif prefix == "tele" and suffix == "STATE":
                        data = json.loads(payload)
                        updated_device = await crud.create_or_update_device(db, {
                            "mqtt_topic": device_topic,
                            "is_online": True,
                            "attributes": data
                        })

                    # 4. SENSOR - Sensor Data
                    elif prefix == "tele" and suffix == "SENSOR":
                        data = json.loads(payload)
                        
                        # Merge sensor data into existing attributes
                        merged_attrs = old_attributes.copy()
                        merged_attrs.update(data)
                        
                        updated_device = await crud.create_or_update_device(db, {
                            "mqtt_topic": device_topic,
                            "is_online": True,
                            "attributes": merged_attrs
                        })
                        
                        # Store history
                        await crud.create_sensor_data(db, updated_device.id, data)
                        
                    # 5. RESULT - Command feedback (Power state change)
                    elif prefix == "stat" and suffix == "RESULT":
                        data = json.loads(payload)
                        # Merge new result into attributes
                        merged_attrs = old_attributes.copy()
                        merged_attrs.update(data)
                        updated_device = await crud.create_or_update_device(db, {
                            "mqtt_topic": device_topic,
                            "attributes": merged_attrs
                        })
                else:
                    # Generic / Custom Topic Handling
                    try:
                        data = json.loads(payload)
                    except:
                        data = {"value": payload}
                    
                    merged_attrs = old_attributes.copy()
                    if isinstance(data, dict):
                        merged_attrs.update(data)
                    
                    updated_device = await crud.create_or_update_device(db, {
                        "mqtt_topic": device_topic,
                        "is_online": True,
                        "attributes": merged_attrs
                    })
                    
                    # Store history for custom topics too
                    await crud.create_sensor_data(db, updated_device.id, data if isinstance(data, dict) else {"value": payload})

                # Notify automation engine of device state change
                if updated_device:
                    # Check for manual switch OFF to cancel timers
                    # We need to check if any POWER* attribute changed to OFF
                    # updated_device.attributes contains the NEW state
                    # old_attributes contains the OLD state
                    
                    new_timers = updated_device.active_timers.copy() if updated_device.active_timers else {}
                    timers_changed = False
                    
                    current_attrs = updated_device.attributes or {}
                    
                    # Iterate over all keys to find POWER*
                    for key, value in current_attrs.items():
                        if key.startswith("POWER"):
                            # Check if it is OFF
                            if str(value).upper() == "OFF":
                                # If it was ON before (or we just want to be safe), and there is a timer, remove it
                                if key in new_timers:
                                    logger.info(f"Manual OFF detected for {updated_device.mqtt_topic}/{key}. Cancelling timer.")
                                    del new_timers[key]
                                    timers_changed = True
                    
                    if timers_changed:
                        await crud.create_or_update_device(db, {
                            "mqtt_topic": updated_device.mqtt_topic,
                            "active_timers": new_timers
                        })

                    logger.info(f"Calling handle_device_state_change for device {updated_device.id}")
                    await automation_engine.handle_device_state_change(
                        updated_device.id,
                        old_attributes,
                        updated_device.attributes
                    )
            
            # Broadcast update to ensure frontend has latest state
            broadcast_msg = {"type": "device_update"}
            if updated_device:
                try:
                    # Use Pydantic to serialize
                    device_data = schemas.Device.model_validate(updated_device).model_dump()
                    # Convert datetime objects to strings if necessary (model_dump might keep them as objects)
                    # But json.dumps (used by manager.broadcast) needs strings. 
                    # Pydantic's model_dump(mode='json') handles this in v2.
                    device_data = schemas.Device.model_validate(updated_device).model_dump(mode='json')
                    broadcast_msg["device"] = device_data
                except Exception as e:
                    logger.error(f"Error serializing device for broadcast: {e}")
            
            await manager.broadcast(broadcast_msg)

        except Exception as e:
            logger.error(f"Error handling message {topic}: {e}")

    async def publish(self, topic: str, payload: str):
        if self.client and self.is_connected:
            await self.client.publish(topic, payload)
        else:
            logger.warning("Cannot publish, MQTT not connected")

    async def stop(self):
        logger.info("Stopping MQTT Service...")
        if self.client:
            try:
                # aiomqtt client disconnects on context exit, but we can force it if needed
                # or just cancelling the task will trigger the context exit
                pass 
            except Exception as e:
                logger.error(f"Error disconnecting: {e}")
            self.client = None
        
        # Cancel tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()
        self._tasks.clear()
        self.is_connected = False

    async def restart(self):
        logger.info("Restarting MQTT Service...")
        await self.stop()
        # Give it a moment to cleanup
        await asyncio.sleep(1)
        await self.start()

mqtt_service = MQTTService()
