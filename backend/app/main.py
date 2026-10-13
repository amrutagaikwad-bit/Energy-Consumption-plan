from __future__ import annotations
import io
from pathlib import Path
import pandas as pd
from fastapi import FastAPI, Depends, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from .database import Base, engine, SessionLocal, get_db
from .models import ConsumptionRecord, AppSetting
from .schemas import ForecastRequest, TariffUpdate
from .services import load_sample, normalize_frame, frame_from_records, evaluate_models, make_forecast, PROJECT_ROOT

app = FastAPI(title="EnergyPulse API", version="1.0.0", description="Energy consumption analytics and forecasting API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_tariff(db: Session) -> float:
    setting = db.get(AppSetting, "tariff_per_kwh")
    if setting is None:
        setting = AppSetting(key="tariff_per_kwh", value="8.0")
        db.add(setting)
        db.commit()
        return 8.0
    try:
        return float(setting.value)
    except ValueError:
        return 8.0

def replace_records(db: Session, frame: pd.DataFrame):
    db.query(ConsumptionRecord).delete()
    db.add_all([
        ConsumptionRecord(timestamp=row.timestamp.to_pydatetime(), energy_consumption_kwh=float(row.energy_consumption_kwh))
        for row in frame.itertuples(index=False)
    ])
    db.commit()

def records_frame(db: Session) -> pd.DataFrame:
    records = db.query(ConsumptionRecord).order_by(ConsumptionRecord.timestamp).all()
    if not records:
        sample = load_sample()
        replace_records(db, sample)
        records = db.query(ConsumptionRecord).order_by(ConsumptionRecord.timestamp).all()
    return frame_from_records(records)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(ConsumptionRecord).count() == 0:
            replace_records(db, load_sample())
        if db.get(AppSetting, "tariff_per_kwh") is None:
            db.add(AppSetting(key="tariff_per_kwh", value="8.0"))
            db.commit()
    finally:
        db.close()

@app.get("/api/health")
def health():
    return {"status": "ok", "application": "EnergyPulse API"}

@app.get("/api/consumption")
def get_consumption(db: Session = Depends(get_db)):
    frame = records_frame(db)
    return {
        "count": len(frame),
        "data": [{
            "timestamp": row.timestamp.isoformat(),
            "energy_consumption_kwh": round(float(row.energy_consumption_kwh), 3)
        } for row in frame.itertuples(index=False)]
    }

@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    frame = records_frame(db)
    tariff = get_tariff(db)
    total = float(frame["energy_consumption_kwh"].sum())
    average = float(frame["energy_consumption_kwh"].mean())
    peak_idx = frame["energy_consumption_kwh"].idxmax()
    recent = frame.tail(min(30, len(frame)))
    previous = frame.iloc[max(0, len(frame) - 60):max(0, len(frame) - 30)]
    change = None
    if len(previous) and float(previous["energy_consumption_kwh"].mean()) != 0:
        change = ((float(recent["energy_consumption_kwh"].mean()) - float(previous["energy_consumption_kwh"].mean())) / float(previous["energy_consumption_kwh"].mean())) * 100
    daily = frame.copy()
    daily["date"] = pd.to_datetime(daily["timestamp"]).dt.strftime("%Y-%m-%d")
    daily = daily.groupby("date", as_index=False)["energy_consumption_kwh"].sum()
    return {
        "total_kwh": round(total, 2),
        "average_kwh": round(average, 2),
        "peak_kwh": round(float(frame.loc[peak_idx, "energy_consumption_kwh"]), 2),
        "peak_date": str(frame.loc[peak_idx, "timestamp"].date()),
        "estimated_cost": round(total * tariff, 2),
        "tariff_per_kwh": tariff,
        "change_percent": round(change, 2) if change is not None else None,
        "record_count": len(frame),
        "synthetic_note": "Bundled readings are synthetic demonstration data unless replaced by your CSV."
    }

@app.post("/api/data/upload")
async def upload_data(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV file must be 10 MB or smaller.")
    try:
        frame = normalize_frame(pd.read_csv(io.BytesIO(raw)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if len(frame) > 100000:
        raise HTTPException(status_code=400, detail="Maximum supported upload is 100,000 valid rows.")
    replace_records(db, frame)
    return {"message": "Dataset imported successfully. The uploaded dataset replaced the previous readings.", "valid_rows": len(frame)}

@app.get("/api/data/sample")
def download_sample():
    sample_path = PROJECT_ROOT / "data" / "sample_energy_data.csv"
    return StreamingResponse(
        open(sample_path, "rb"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sample_energy_data.csv"'}
    )

@app.post("/api/data/reset")
def reset_data(db: Session = Depends(get_db)):
    replace_records(db, load_sample())
    return {"message": "Synthetic demonstration dataset restored."}

@app.get("/api/models/metrics")
def model_metrics(db: Session = Depends(get_db)):
    frame = records_frame(db)
    return evaluate_models(frame)

@app.post("/api/forecast")
def forecast(request: ForecastRequest, db: Session = Depends(get_db)):
    frame = records_frame(db)
    try:
        return make_forecast(frame, request.horizon_days)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/api/settings")
def settings(db: Session = Depends(get_db)):
    return {"tariff_per_kwh": get_tariff(db)}

@app.put("/api/settings")
def update_settings(request: TariffUpdate, db: Session = Depends(get_db)):
    setting = db.get(AppSetting, "tariff_per_kwh")
    if setting is None:
        setting = AppSetting(key="tariff_per_kwh", value=str(request.tariff_per_kwh))
        db.add(setting)
    else:
        setting.value = str(request.tariff_per_kwh)
    db.commit()
    return {"tariff_per_kwh": request.tariff_per_kwh}

@app.get("/api/reports/forecast.csv")
def forecast_csv(horizon_days: int = 14, db: Session = Depends(get_db)):
    if horizon_days < 1 or horizon_days > 90:
        raise HTTPException(status_code=400, detail="horizon_days must be between 1 and 90.")
    try:
        result = make_forecast(records_frame(db), horizon_days)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    content = pd.DataFrame(result["forecast"]).to_csv(index=False)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="energypulse_forecast.csv"'}
    )
