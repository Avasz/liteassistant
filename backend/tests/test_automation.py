import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from backend.automation_engine import AutomationEngine
from backend import models

@pytest.mark.asyncio
async def test_compare_values():
    engine = AutomationEngine()
    
    # Numeric comparisons
    assert engine._compare_values(10, 10, '==') is True
    assert engine._compare_values(10, 5, '>') is True
    assert engine._compare_values(10, 20, '<') is True
    assert engine._compare_values(10, 10, '>=') is True
    assert engine._compare_values(10, 10, '<=') is True
    assert engine._compare_values(10, 10, '!=') is False
    
    # String comparisons
    assert engine._compare_values("ON", "ON", '==') is True
    assert engine._compare_values("ON", "OFF", '!=') is True
    assert engine._compare_values("ON", "OFF", '==') is False

@pytest.mark.asyncio
async def test_handle_device_state_change_trigger():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.name = "Test Automation"
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "POWER",
        "value": "ON",
        "operator": "=="
    }
    
    engine.automations = [automation]
    
    # Test matching state
    old_state = {"POWER": "OFF"}
    new_state = {"POWER": "ON"}
    
    await engine.handle_device_state_change(1, old_state, new_state)
    
    engine.execute_automation.assert_called_once()
    args = engine.execute_automation.call_args
    assert args[0][0] == automation
    assert args[0][1]["trigger"] == "device_state"

@pytest.mark.asyncio
async def test_handle_device_state_change_no_trigger():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "POWER",
        "value": "ON",
        "operator": "=="
    }
    
    engine.automations = [automation]
    
    # Test non-matching state
    old_state = {"POWER": "OFF"}
    new_state = {"POWER": "OFF"} # Still OFF
    
    await engine.handle_device_state_change(1, old_state, new_state)
    
    engine.execute_automation.assert_not_called()

@pytest.mark.asyncio
async def test_handle_device_state_change_wrong_device():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = True
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "POWER",
        "value": "ON",
        "operator": "=="
    }
    
    engine.automations = [automation]
    
    # Test wrong device ID
    old_state = {"POWER": "OFF"}
    new_state = {"POWER": "ON"}
    
    await engine.handle_device_state_change(2, old_state, new_state) # Device ID 2
    
    engine.execute_automation.assert_not_called()

@pytest.mark.asyncio
async def test_handle_device_state_change_disabled():
    engine = AutomationEngine()
    engine.execute_automation = AsyncMock()
    
    # Mock automation
    automation = MagicMock(spec=models.Automation)
    automation.id = 1
    automation.enabled = False # Disabled
    automation.trigger_type = "device_state"
    automation.trigger_value = {
        "device_id": 1,
        "attribute": "POWER",
        "value": "ON",
        "operator": "=="
    }
    
    engine.automations = [automation]
    
    # Test matching state but disabled
    old_state = {"POWER": "OFF"}
    new_state = {"POWER": "ON"}
    
    await engine.handle_device_state_change(1, old_state, new_state)
    
    engine.execute_automation.assert_not_called()
