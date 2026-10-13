from datetime import datetime
from pydantic import BaseModel, Field

class TariffUpdate(BaseModel):
    tariff_per_kwh: float = Field(gt=0, le=100000)

class ForecastRequest(BaseModel):
    horizon_days: int = Field(default=14, ge=1, le=90)

class ConsumptionPoint(BaseModel):
    timestamp: datetime
    energy_consumption_kwh: float
