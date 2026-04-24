import json
import asyncio
from datetime import datetime, timedelta

from fastmcp import FastMCP
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import AsyncSessionLocal
from backend import crud, models, schemas
from backend.mqtt_service import mqtt_service
from backend.notification_service import notification_service

# Initialize FastMCP Server
mcp = FastMCP("LiteAssistantMCP")

_services_started = False

async def ensure_services():
    """Ensure background services (MQTT, Notifications) are started."""
    global _services_started
    if not _services_started:
        await mqtt_service.start()
        await notification_service.load_config()
        _services_started = True

@mcp.tool()
async def list_devices() -> str:
    """Returns a list of all discovered Tasmota devices and their online status."""
    await ensure_services()
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
            "device_type": d.device_type
        })
    return json.dumps(result, indent=2)

@mcp.tool()
async def toggle_device(device_id: int, state: str) -> str:
    """
    Sends the MQTT command to flip a switch.
    :param device_id: The ID of the device to toggle.
    :param state: 'ON', 'OFF', or 'TOGGLE'.
    """
    await ensure_services()
    async with AsyncSessionLocal() as db:
        device = await crud.get_device(db, device_id)
        if not device:
            return f"Error: Device {device_id} not found."
    
    state = state.upper()
    if state not in ["ON", "OFF", "TOGGLE"]:
        return "Error: state must be ON, OFF, or TOGGLE."
        
    topic = f"cmnd/{device.mqtt_topic}/POWER"
    await mqtt_service.publish(topic, state)
    return f"Sent {state} to {device.name or device.mqtt_topic} ({topic})"

@mcp.tool()
async def get_sensor_data(device_id: int) -> str:
    """Fetches current sensor readings and state for a device."""
    await ensure_services()
    async with AsyncSessionLocal() as db:
        device = await crud.get_device(db, device_id)
        if not device:
            return f"Error: Device {device_id} not found."
            
    return json.dumps({
        "device": device.name or device.mqtt_topic,
        "is_online": device.is_online,
        "attributes": device.attributes
    }, indent=2)

@mcp.tool()
async def get_historical_summary(device_id: int, hours: int = 24) -> str:
    """Queries the DB for a text summary of sensor trends over the specified hours."""
    await ensure_services()
    async with AsyncSessionLocal() as db:
        device = await crud.get_device(db, device_id)
        if not device:
            return f"Error: Device {device_id} not found."
            
        history = await crud.get_sensor_history(db, device_id, limit=1000, hours=hours)
        
    if not history:
        return f"No historical data found for device {device_id} in the last {hours} hours."
        
    summary = f"Summary for {device.name or device.mqtt_topic} (last {hours} hours):\n"
    summary += f"Total records found: {len(history)}\n\n"
    
    # Get latest reading
    latest = history[0].data
    summary += f"Latest readings:\n{json.dumps(latest, indent=2)}\n\n"
    
    # Get oldest reading in range to show trend
    oldest = history[-1].data
    summary += f"Oldest readings in range:\n{json.dumps(oldest, indent=2)}\n"
    
    return summary

@mcp.tool()
async def create_interval_schedule(device_id: int, on_duration: int, interval: int) -> str:
    """
    Injects a new interval schedule into the app logic.
    :param device_id: The ID of the device.
    :param on_duration: How long the switch should stay ON (in seconds).
    :param interval: How often the switch should turn ON (in minutes).
    """
    await ensure_services()
    async with AsyncSessionLocal() as db:
        device = await crud.get_device(db, device_id)
        if not device:
            return f"Error: Device {device_id} not found."
            
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
        
        # Trigger schedule engine reload to pick up the new schedule immediately
        try:
            from backend.schedule_engine import schedule_engine
            await schedule_engine.load_schedules(db)
        except Exception as e:
            return f"Created interval schedule for device {device_id}, but failed to hot-reload engine: {e}"
        
    return f"Successfully created interval schedule for {device.name or device.mqtt_topic}: ON for {on_duration}s every {interval}m."

@mcp.tool()
async def send_notification(message: str) -> str:
    """Triggers the existing Telegram/Ntfy notification system."""
    await ensure_services()
    await notification_service.notify("mcp_event", message)
    return "Notification triggered via configured providers."

if __name__ == "__main__":
    # Start the FastMCP server with SSE transport on port 8101
    mcp.run(transport="sse", port=8101)
