from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

class MQTTConfig(Base):
    __tablename__ = "mqtt_config"

    id = Column(Integer, primary_key=True, index=True)
    broker_host = Column(String, nullable=False)
    broker_port = Column(Integer, default=1883)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    discovery_prefix = Column(String, default="tasmota/discovery")
    custom_topics = Column(JSON, default=list)  # List of custom topic patterns

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    mqtt_topic = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    device_type = Column(String, nullable=True) # e.g., "relay", "sensor", "light"
    ip_address = Column(String, nullable=True)
    is_online = Column(Boolean, default=False)
    protected = Column(Boolean, default=False)
    attributes = Column(JSON, default={})
    dashboard_config = Column(JSON, default={}) # e.g., {"visible_sensors": ["Temperature", "Power"]}
    switch_labels = Column(JSON, default={}) # e.g., {"POWER1": "Garden Light", "POWER2": "Porch Light"}
    active_timers = Column(JSON, default={}) # e.g., {"POWER1": "2025-12-03T20:30:00Z", "POWER2": null}
    
    sensor_data = relationship("SensorData", back_populates="device", cascade="all, delete-orphan")

class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(JSON, nullable=False)

    device = relationship("Device", back_populates="sensor_data")

class Automation(Base):
    __tablename__ = "automations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    trigger_type = Column(String, nullable=False) # e.g., "mqtt", "time", "state"
    trigger_value = Column(JSON, nullable=False) # Configuration for the trigger
    action_type = Column(String, nullable=False) # e.g., "mqtt_publish", "delay"
    action_value = Column(JSON, nullable=False) # Configuration for the action

class AutomationLog(Base):
    __tablename__ = "automation_logs"

    id = Column(Integer, primary_key=True, index=True)
    automation_id = Column(Integer, ForeignKey("automations.id"))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    trigger_data = Column(JSON)  # What triggered it
    action_result = Column(JSON)  # Result of the action
    success = Column(Boolean, default=True)
    error_message = Column(String, nullable=True)

class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    switch_name = Column(String, default="POWER")  # POWER, POWER1, etc.
    
    # Schedule type: "once", "daily", "weekly", "interval"
    schedule_type = Column(String, nullable=False)
    
    # Time configuration
    time = Column(String, nullable=True)  # HH:MM format (not required for interval)
    days_of_week = Column(JSON, default=list)  # [0-6] for weekly, empty for daily/once
    date = Column(String, nullable=True)  # YYYY-MM-DD for one-time
    
    # Duration in minutes (for auto-off after execution)
    duration = Column(Integer, default=0)  # 0 = indefinite
    duration_unit = Column(String, default="minutes")  # "seconds", "minutes", "hours"
    
    # Interval configuration (for interval type)
    interval_value = Column(Integer, default=0)  # e.g., 30
    interval_unit = Column(String, default="minutes")  # "seconds", "minutes", "hours"
    total_duration_value = Column(Integer, default=0)  # e.g., 2
    total_duration_unit = Column(String, default="hours")  # "seconds", "minutes", "hours"
    start_time = Column(DateTime(timezone=True), nullable=True)  # When interval schedule started
    
    # Action: "ON", "OFF", "TOGGLE"
    action = Column(String, default="ON")

class NotificationConfig(Base):
    __tablename__ = "notification_config"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False) # telegram, ntfy, smtp
    enabled = Column(Boolean, default=False)
    config = Column(JSON, default={}) # API keys, URLs, etc.
    events = Column(JSON, default=[]) # ["automation", "schedule", "timer"]
