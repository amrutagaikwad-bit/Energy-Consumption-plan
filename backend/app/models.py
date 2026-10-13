from sqlalchemy import Column, DateTime, Float, Integer, String
from .database import Base

class ConsumptionRecord(Base):
    __tablename__ = "consumption_records"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, index=True, unique=True)
    energy_consumption_kwh = Column(Float, nullable=False)

class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
