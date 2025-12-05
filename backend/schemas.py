from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class MQTTConfigBase(BaseModel):
    broker_host: str
    broker_port: int
    username: Optional[str] = None
    password: Optional[str] = None
    discovery_prefix: str = "tasmota/discovery"
    custom_topics: Optional[List[str]] = []

class MQTTConfigCreate(MQTTConfigBase):
    pass

class MQTTConfig(MQTTConfigBase):
    id: int

    class Config:
        from_attributes = True

class DeviceBase(BaseModel):
    mqtt_topic: str
    name: Optional[str] = None
    device_type: Optional[str] = None
    ip_address: Optional[str] = None
    is_online: bool = False
    protected: bool = False
    attributes: Dict[str, Any] = {}
    dashboard_config: Dict[str, Any] = {}
    switch_labels: Dict[str, str] = {}
    active_timers: Dict[str, Optional[str]] = {}

class Device(DeviceBase):
    id: int

    class Config:
        from_attributes = True

class AutomationBase(BaseModel):
    name: str
    enabled: bool = True
    trigger_type: str
    trigger_value: Dict[str, Any]
    action_type: str
    action_value: Dict[str, Any]

class AutomationCreate(AutomationBase):
    pass

class Automation(AutomationBase):
    id: int

    class Config:
        from_attributes = True

class AutomationLogBase(BaseModel):
    automation_id: int
    trigger_data: Dict[str, Any]
    action_result: Dict[str, Any]
    success: bool
    error_message: Optional[str] = None

class AutomationLog(AutomationLogBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
