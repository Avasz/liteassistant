import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from backend.automation_engine import AutomationEngine
from backend import models

@pytest.mark.asyncio
async def test_automation_duration_success():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation with duration
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "STATUS",
        "value": "Idle",
        "operator": "==",
        "for_duration": 0.001 # Short duration for test (0.001 min = 0.06 sec)
    }
    # We need to patch the duration check to use seconds directly or sleep less
    # The code does `for_duration * 60`. 
    # If we set for_duration to 0.001, it sleeps 0.06s. That's fine.
    
    engine.automations = [automation]
    
    # 1. State changes to Idle -> Timer should start
    old_state = {"STATUS": "Active"}
    new_state = {"STATUS": "Idle"}
    
    await engine.handle_device_state_change(1, old_state, new_state)
    
    assert automation.id in engine._active_delays
    
    # 2. Wait for timer to expire
    await asyncio.sleep(0.1)
    
    # 3. Verify execution
    engine.execute_automation.assert_called_once()
    assert automation.id not in engine._active_delays

@pytest.mark.asyncio
async def test_automation_duration_cancellation():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation with duration
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "STATUS",
        "value": "Idle",
        "operator": "==",
        "for_duration": 0.005 # 0.3 seconds
    }
    
    engine.automations = [automation]
    
    # 1. State changes to Idle -> Timer starts
    await engine.handle_device_state_change(1, {"STATUS": "Active"}, {"STATUS": "Idle"})
    assert automation.id in engine._active_delays
    
    # 2. State changes to Active BEFORE timer expires -> Timer should cancel
    await asyncio.sleep(0.1) # Wait a bit but less than 0.3s
    await engine.handle_device_state_change(1, {"STATUS": "Idle"}, {"STATUS": "Active"})
    
    # 3. Verify cancellation
    # The task should be removed from _active_delays immediately
    assert automation.id not in engine._active_delays
    
    # 4. Wait longer to ensure it doesn't fire
    await asyncio.sleep(0.3)
    engine.execute_automation.assert_not_called()

@pytest.mark.asyncio
async def test_automation_duration_heartbeat():
    """Test that repeated matching updates don't reset the timer"""
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation with duration
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "STATUS",
        "value": "Idle",
        "operator": "==",
        "for_duration": 0.005 # 0.3 seconds
    }
    
    engine.automations = [automation]
    
    # 1. State changes to Idle -> Timer starts
    await engine.handle_device_state_change(1, {"STATUS": "Active"}, {"STATUS": "Idle"})
    original_task = engine._active_delays.get(automation.id)
    assert original_task is not None
    
    # 2. State update (heartbeat) still Idle -> Timer should continue (not reset)
    await asyncio.sleep(0.1)
    await engine.handle_device_state_change(1, {"STATUS": "Idle"}, {"STATUS": "Idle"})
    
    current_task = engine._active_delays.get(automation.id)
    assert current_task is original_task # Should be the same task object
    
    # 3. Wait for completion
    await asyncio.sleep(0.3)
    engine.execute_automation.assert_called_once()
