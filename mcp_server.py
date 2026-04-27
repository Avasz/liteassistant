import json
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastmcp import FastMCP
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import AsyncSessionLocal
from backend import crud, models, schemas
from backend.mqtt_service import mqtt_service
from backend.notification_service import notification_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("mcp_server")

# Initialize FastMCP Server
mcp = FastMCP(
    "LiteAssistant",
    title="LiteAssistant Home Automation MCP",
    description="Control and monitor Tasmota-based smart home devices."
)

_services_started = False
_service_lock = asyncio.Lock()

async def ensure_services():
    """Ensure background services (MQTT, Notifications) are started once."""
    global _services_started
    if _services_started:
        return
        
    async with _service_lock:
        if not _services_started:
            logger.info("Initializing background services...")
            try:
                # Start MQTT service (which handles discovery and state updates)
                await mqtt_service.start()
                # Load notification configurations
                await notification_service.load_config()
                _services_started = True
                logger.info("Background services initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize services: {e}")
                # Don't set _services_started = True so we can retry

@mcp.tool()
async def check_health() -> str:
    """Returns the health status of the MCP server and its connection to services."""
    await ensure_services()
    status = {
        "mcp_server": "online",
        "mqtt_connected": mqtt_service.is_connected,
        "services_initialized": _services_started,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    return json.dumps(status, indent=2)

@mcp.tool()
async def list_devices() -> str:
    """Returns a list of all discovered Tasmota devices and their online status."""
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            devices = await crud.get_devices(db, skip=0, limit=1000)
        
        result = []
        for d in devices:
            result.append({
                "id": d.id,
                "name": d.name or d.mqtt_topic,
                "topic": d.mqtt_topic,
                "is_online": d.is_online,
                "ip_address": d.ip_address,
                "device_type": d.device_type,
                "protected": d.protected
            })
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.error(f"Error in list_devices: {e}")
        return f"Error: Failed to retrieve devices: {str(e)}"

@mcp.tool()
async def toggle_device(device_id: int, state: str, channel: int = None) -> str:
    """
    Sends the MQTT command to flip a switch on a device.
    :param device_id: The ID of the device to toggle.
    :param state: 'ON', 'OFF', or 'TOGGLE'.
    :param channel: Optional relay channel number (e.g. 1 to 8). This maps to POWER1, POWER2, etc. Defaults to base POWER.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return f"Error: Device with ID {device_id} not found."
        
        state = state.upper()
        if state not in ["ON", "OFF", "TOGGLE"]:
            return "Error: state must be ON, OFF, or TOGGLE."
            
        power_suffix = f"POWER{channel}" if channel and channel > 1 else "POWER"
        topic = f"cmnd/{device.mqtt_topic}/{power_suffix}"
        
        await mqtt_service.publish(topic, state)
        logger.info(f"Toggled device {device.mqtt_topic} ({power_suffix}) to {state}")
        return f"Successfully sent {state} to {device.name or device.mqtt_topic} (channel {channel or 1})."
    except Exception as e:
        logger.error(f"Error in toggle_device: {e}")
        return f"Error: Failed to toggle device: {str(e)}"

@mcp.tool()
async def get_sensor_data(device_id: int) -> str:
    """Fetches current sensor readings and all available power channel states for a device."""
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return f"Error: Device with ID {device_id} not found."
                
        # Extract power states to surface them easily
        power_states = {}
        if isinstance(device.attributes, dict):
            for key, value in device.attributes.items():
                if key.startswith("POWER"):
                    power_states[key] = value
                    
        return json.dumps({
            "id": device.id,
            "device": device.name or device.mqtt_topic,
            "is_online": device.is_online,
            "power_states": power_states,
            "attributes": device.attributes,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }, indent=2)
    except Exception as e:
        logger.error(f"Error in get_sensor_data: {e}")
        return f"Error: Failed to fetch sensor data: {str(e)}"

@mcp.tool()
async def get_historical_summary(device_id: int, hours: int = 24) -> str:
    """Queries for a text summary of sensor trends over the specified hours."""
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return f"Error: Device with ID {device_id} not found."
                
            history = await crud.get_sensor_history(db, device_id, limit=1000, hours=hours)
            
        if not history:
            return f"No historical data found for {device.name or device.mqtt_topic} in the last {hours} hours."
            
        summary = f"Historical Data for {device.name or device.mqtt_topic} (Last {hours}h):\n"
        summary += f"Data Points: {len(history)}\n\n"
        
        # Get latest reading
        latest = history[0].data
        summary += f"Latest reading ({history[0].timestamp.isoformat()}):\n{json.dumps(latest, indent=2)}\n\n"
        
        # Get oldest reading in range
        oldest = history[-1].data
        summary += f"Oldest reading in range ({history[-1].timestamp.isoformat()}):\n{json.dumps(oldest, indent=2)}\n"
        
        return summary
    except Exception as e:
        logger.error(f"Error in get_historical_summary: {e}")
        return f"Error: Failed to retrieve historical data: {str(e)}"

@mcp.tool()
async def set_switch_timer(device_id: int, switch: str, duration_minutes: int) -> str:
    """
    Sets a hardware-backed timer in the database. REQUIRED for all scheduled turn-offs.
    Gemma: Do not wait internally; offload to this tool immediately.
    For multi-channel devices like 'waterswitch', the switch name must be POWER1, POWER2, etc.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return f"Error: Device with ID {device_id} not found."
                
            now = datetime.now(timezone.utc)
            end_time = now + timedelta(minutes=duration_minutes)
            # Use ISO format for consistency with backend TimerService
            end_time_str = end_time.isoformat().replace('+00:00', 'Z')
            
            # Merge existing timers
            timers = dict(device.active_timers or {})
            timers[switch] = end_time_str
            
            # Update device record
            await crud.create_or_update_device(db, {
                "mqtt_topic": device.mqtt_topic,
                "active_timers": timers
            })
            
        logger.info(f"Set timer for {device.mqtt_topic}/{switch} to turn off at {end_time_str}")
        return f"Successfully set timer for {device.name or device.mqtt_topic}/{switch} to turn OFF at {end_time_str}."
    except Exception as e:
        logger.error(f"Error in set_switch_timer: {e}")
        return f"Error: Failed to set timer: {str(e)}"

@mcp.tool()
async def send_notification(message: str) -> str:
    """Triggers the Telegram/Ntfy notification system with a custom message."""
    await ensure_services()
    try:
        await notification_service.notify("mcp_event", message)
        return "Notification sent successfully."
    except Exception as e:
        logger.error(f"Error in send_notification: {e}")
        return f"Error: Failed to send notification: {str(e)}"

if __name__ == "__main__":
    # Start the FastMCP server with SSE transport on port 8101
    logger.info("Starting LiteAssistant MCP Server on port 8101 (SSE)...")
    mcp.run(transport="sse", host="0.0.0.0", port=8101)
