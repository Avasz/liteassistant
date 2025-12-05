from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from .database import engine, Base
from .routers import auth, config, devices, automations, schedules, system, notifications
from .mqtt_service import mqtt_service
from .websocket_manager import manager
import asyncio

app = FastAPI(title="LiteAssistant")

app.include_router(auth.router)
app.include_router(config.router)
app.include_router(devices.router)
app.include_router(automations.router)
app.include_router(schedules.router)
app.include_router(system.router)
app.include_router(notifications.router)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, maybe handle incoming messages if needed
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.on_event("startup")
async def startup_event():
    print("Starting up...")
    try:
        # Start MQTT Service
        print("Initializing MQTT Service...")
        asyncio.create_task(mqtt_service.start())
        print("MQTT Service task created.")
        
        # Start Automation Engine
        from .automation_engine import automation_engine
        print("Initializing Automation Engine...")
        asyncio.create_task(automation_engine.start(mqtt_service))
        print("Automation Engine task created.")
        
        # Start Timer Service
        from .timer_service import timer_service
        print("Initializing Timer Service...")
        asyncio.create_task(timer_service.start())
        print("Timer Service task created.")
        
        # Start Schedule Engine
        from .schedule_engine import schedule_engine
        print("Initializing Schedule Engine...")
        asyncio.create_task(schedule_engine.start(mqtt_service))
        print("Schedule Engine task created.")

        # Initialize Notification Service
        from .notification_service import notification_service
        print("Initializing Notification Service...")
        await notification_service.load_config()
        print("Notification Service initialized.")
    except Exception as e:
        print(f"Error during startup: {e}")

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# Mount static files (Frontend will be built to 'backend/static')
from fastapi.responses import FileResponse
import os

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    # Mount assets explicitly
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    
    # Mount other static files if needed (e.g. vite.svg)
    app.mount("/vite.svg", StaticFiles(directory=static_dir), name="vite")

    # Catch-all for SPA
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Check if file exists in static directory first (for favicon, etc)
        file_path = os.path.join(static_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html for SPA routing
        return FileResponse(os.path.join(static_dir, "index.html"))
else:
    print(f"Warning: Static directory '{static_dir}' does not exist. Frontend will not be served.")
