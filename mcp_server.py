import json
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

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
mcp = FastMCP("LiteAssistant")

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
                await mqtt_service.start()
                await notification_service.load_config()
                _services_started = True
                logger.info("Background services initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize services: {e}")


@mcp.tool
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


@mcp.tool
async def list_devices() -> str:
    """Returns a JSON list of all discovered Tasmota devices with their id, name, topic, online status, IP, and type."""
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
        return json.dumps({"error": str(e)})


@mcp.tool
async def toggle_device(device_id: int, state: str, channel: Optional[int] = None) -> str:
    """Sends an MQTT command to toggle a switch on a Tasmota device.

    Args:
        device_id: The database ID of the device.
        state: The desired state — must be ON, OFF, or TOGGLE.
        channel: Optional relay channel (1-8). Maps to POWER1, POWER2, etc. in Tasmota. Omit for single-channel devices.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return json.dumps({"error": f"Device with ID {device_id} not found."})

        state = state.upper()
        if state not in ["ON", "OFF", "TOGGLE"]:
            return json.dumps({"error": "state must be ON, OFF, or TOGGLE."})

        power_suffix = f"POWER{channel}" if channel and channel > 1 else "POWER"
        topic = f"cmnd/{device.mqtt_topic}/{power_suffix}"

        await mqtt_service.publish(topic, state)
        logger.info(f"Toggled {device.mqtt_topic} ({power_suffix}) to {state}")
        return json.dumps({"ok": True, "device": device.name or device.mqtt_topic, "channel": channel or 1, "state": state})
    except Exception as e:
        logger.error(f"Error in toggle_device: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool
async def get_sensor_data(device_id: int) -> str:
    """Fetches current sensor readings and all power channel states for a device.

    Args:
        device_id: The database ID of the device.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return json.dumps({"error": f"Device with ID {device_id} not found."})

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
            "attributes": device.attributes
        }, indent=2)
    except Exception as e:
        logger.error(f"Error in get_sensor_data: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool
async def get_historical_summary(device_id: int, hours: int = 24) -> str:
    """Returns a text summary of sensor trends over the specified number of hours.

    Args:
        device_id: The database ID of the device.
        hours: Number of hours to look back. Defaults to 24.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return json.dumps({"error": f"Device with ID {device_id} not found."})

            history = await crud.get_sensor_history(db, device_id, limit=1000, hours=hours)

        if not history:
            return f"No historical data found for {device.name or device.mqtt_topic} in the last {hours} hours."

        summary = f"Historical Data for {device.name or device.mqtt_topic} (Last {hours}h):\n"
        summary += f"Data Points: {len(history)}\n\n"

        latest = history[0].data
        summary += f"Latest reading:\n{json.dumps(latest, indent=2)}\n\n"

        oldest = history[-1].data
        summary += f"Oldest reading in range:\n{json.dumps(oldest, indent=2)}\n"

        return summary
    except Exception as e:
        logger.error(f"Error in get_historical_summary: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool
async def create_interval_schedule(device_id: int, on_duration: int, interval: int) -> str:
    """Creates a recurring interval schedule for a device.

    Args:
        device_id: The database ID of the device.
        on_duration: How long the switch stays ON in seconds.
        interval: How often the switch turns ON in minutes.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return json.dumps({"error": f"Device with ID {device_id} not found."})

            new_schedule = models.Schedule(
                name=f"MCP Interval {device.name or device.mqtt_topic}",
                enabled=True,
                device_id=device_id,
                switch_name="POWER",
                schedule_type="interval",
                interval_value=interval,
                interval_unit="minutes",
                duration=on_duration,
                duration_unit="seconds",
                action="ON"
            )
            db.add(new_schedule)
            await db.commit()

            try:
                from backend.schedule_engine import schedule_engine
                await schedule_engine.load_schedules(db)
            except Exception as e:
                return json.dumps({"ok": True, "warning": f"Created but failed to hot-reload engine: {e}"})

        return json.dumps({"ok": True, "device": device.name or device.mqtt_topic, "on_duration_s": on_duration, "interval_m": interval})
    except Exception as e:
        logger.error(f"Error in create_interval_schedule: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool
async def set_switch_timer(device_id: int, switch: str, duration_minutes: int) -> str:
    """Sets a hardware-backed auto-off timer in the database. The TimerService will send the OFF command when it expires.
    For multi-channel devices like 'waterswitch', the switch name must be POWER1, POWER2, etc.

    Args:
        device_id: The database ID of the device.
        switch: The switch name, e.g. POWER, POWER1, POWER2.
        duration_minutes: How many minutes from now to turn off.
    """
    await ensure_services()
    try:
        async with AsyncSessionLocal() as db:
            device = await crud.get_device(db, device_id)
            if not device:
                return json.dumps({"error": f"Device with ID {device_id} not found."})

            now = datetime.now(timezone.utc)
            end_time = now + timedelta(minutes=duration_minutes)
            end_time_str = end_time.isoformat().replace('+00:00', 'Z')

            timers = dict(device.active_timers or {})
            timers[switch] = end_time_str

            await crud.create_or_update_device(db, {
                "mqtt_topic": device.mqtt_topic,
                "active_timers": timers
            })

        logger.info(f"Set timer for {device.mqtt_topic}/{switch} -> OFF at {end_time_str}")
        return json.dumps({"ok": True, "device": device.name or device.mqtt_topic, "switch": switch, "off_at": end_time_str})
    except Exception as e:
        logger.error(f"Error in set_switch_timer: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool
async def send_notification(message: str) -> str:
    """Sends a notification via the configured Telegram/Ntfy providers.

    Args:
        message: The notification message text.
    """
    await ensure_services()
    try:
        await notification_service.notify("mcp_event", message)
        return json.dumps({"ok": True, "message": "Notification sent."})
    except Exception as e:
        logger.error(f"Error in send_notification: {e}")
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    logger.info("Starting LiteAssistant MCP Server on port 8101 (SSE)...")
    mcp.run(transport="sse", host="0.0.0.0", port=8101)
