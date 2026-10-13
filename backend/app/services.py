from __future__ import annotations
from datetime import timedelta
from pathlib import Path
import io
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_PATH = PROJECT_ROOT / "data" / "sample_energy_data.csv"

def normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    required = {"timestamp", "energy_consumption_kwh"}
    if not required.issubset(set(frame.columns)):
        raise ValueError("CSV must contain timestamp and energy_consumption_kwh columns.")
    data = frame[["timestamp", "energy_consumption_kwh"]].copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")
    data["energy_consumption_kwh"] = pd.to_numeric(data["energy_consumption_kwh"], errors="coerce")
    data = data.dropna(subset=["timestamp", "energy_consumption_kwh"])
    if data.empty:
        raise ValueError("No valid rows found. Check dates and numeric consumption values.")
    if (data["energy_consumption_kwh"] < 0).any():
        raise ValueError("Energy consumption cannot be negative.")
    data = data.sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")
    data["timestamp"] = data["timestamp"].dt.tz_localize(None)
    return data.reset_index(drop=True)

def load_sample() -> pd.DataFrame:
    return normalize_frame(pd.read_csv(SAMPLE_PATH))

def frame_from_records(records) -> pd.DataFrame:
    return pd.DataFrame([{
        "timestamp": r.timestamp,
        "energy_consumption_kwh": r.energy_consumption_kwh
    } for r in records])

def feature_frame(values: np.ndarray, dates: pd.Series, index_positions: np.ndarray | None = None) -> pd.DataFrame:
    dates = pd.to_datetime(dates)
    out = pd.DataFrame({
        "day_of_week": dates.dt.dayofweek.to_numpy(),
        "day_of_year": dates.dt.dayofyear.to_numpy(),
        "month": dates.dt.month.to_numpy(),
        "day": dates.dt.day.to_numpy(),
        "trend": np.arange(len(dates)) if index_positions is None else index_positions
    })
    # Lag features are computed only from values available before each target.
    out["lag_1"] = pd.Series(values).shift(1).to_numpy()
    out["lag_7"] = pd.Series(values).shift(7).to_numpy()
    out["rolling_mean_7"] = pd.Series(values).shift(1).rolling(7, min_periods=3).mean().to_numpy()
    return out

def evaluate_models(data: pd.DataFrame) -> dict:
    data = normalize_frame(data)
    if len(data) < 25:
        return {"ready": False, "message": "At least 25 valid readings are recommended for model evaluation.", "models": [], "selected_model": None}
    data = data.sort_values("timestamp").reset_index(drop=True)
    values = data["energy_consumption_kwh"].to_numpy(dtype=float)
    dates = data["timestamp"]
    features = feature_frame(values, dates)
    dataset = features.copy()
    dataset["target"] = values
    dataset = dataset.replace([np.inf, -np.inf], np.nan).dropna().reset_index(drop=True)
    if len(dataset) < 20:
        return {"ready": False, "message": "Not enough rows remain after creating lag features.", "models": [], "selected_model": None}
    X, y = dataset.drop(columns=["target"]), dataset["target"]
    split = max(int(len(dataset) * 0.8), 1)
    if len(dataset) - split < 3:
        split = len(dataset) - 3
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]
    results = []
    candidates = [
        ("Linear Regression", make_pipeline(StandardScaler(), LinearRegression())),
        ("Random Forest", RandomForestRegressor(n_estimators=120, max_depth=8, random_state=42, min_samples_leaf=2))
    ]
    # Naive baseline predicts the latest known reading.
    baseline_pred = np.repeat(float(y_train.iloc[-1]), len(y_test))
    results.append({
        "model": "Naive Baseline",
        "mae": round(float(mean_absolute_error(y_test, baseline_pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test, baseline_pred))), 3)
    })
    fitted = {}
    for name, model in candidates:
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        results.append({
            "model": name,
            "mae": round(float(mean_absolute_error(y_test, pred)), 3),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, pred))), 3)
        })
        fitted[name] = model
    # Choose best MAE among the evaluated models; refit later on all available feature rows.
    selected = min(results, key=lambda x: x["mae"])["model"]
    return {
        "ready": True,
        "message": "Chronological holdout evaluation; metrics describe this dataset only.",
        "models": sorted(results, key=lambda x: x["mae"]),
        "selected_model": selected,
        "feature_columns": list(X.columns),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "usable_rows": int(len(dataset))
    }

def make_forecast(data: pd.DataFrame, horizon_days: int) -> dict:
    data = normalize_frame(data).sort_values("timestamp").reset_index(drop=True)
    if len(data) < 25:
        raise ValueError("At least 25 valid readings are recommended before forecasting.")
    # This implementation assumes one reading per day; aggregate sub-daily records to daily totals.
    data["date"] = data["timestamp"].dt.floor("D")
    daily = data.groupby("date", as_index=False)["energy_consumption_kwh"].sum()
    daily = daily.sort_values("date").reset_index(drop=True)
    if len(daily) < 25:
        raise ValueError("At least 25 daily observations are needed for this forecast.")
    evaluation = evaluate_models(daily.rename(columns={"date": "timestamp"}))
    if not evaluation["ready"]:
        raise ValueError(evaluation["message"])
    selected = evaluation["selected_model"]
    values = daily["energy_consumption_kwh"].to_numpy(dtype=float)
    dates = pd.to_datetime(daily["date"])
    features = feature_frame(values, dates)
    train = features.copy()
    train["target"] = values
    train = train.replace([np.inf, -np.inf], np.nan).dropna().reset_index(drop=True)
    X, y = train.drop(columns=["target"]), train["target"]
    if selected == "Naive Baseline":
        model = None
    elif selected == "Linear Regression":
        model = make_pipeline(StandardScaler(), LinearRegression()).fit(X, y)
    else:
        model = RandomForestRegressor(n_estimators=120, max_depth=8, random_state=42, min_samples_leaf=2).fit(X, y)

    forecast_rows = []
    working_values = list(values)
    last_date = pd.Timestamp(daily["date"].iloc[-1])
    for step in range(1, horizon_days + 1):
        future_date = last_date + pd.Timedelta(days=step)
        arr = np.asarray(working_values, dtype=float)
        feat = pd.DataFrame([{
            "day_of_week": future_date.dayofweek,
            "day_of_year": future_date.dayofyear,
            "month": future_date.month,
            "day": future_date.day,
            "trend": len(working_values),
            "lag_1": arr[-1],
            "lag_7": arr[-7] if len(arr) >= 7 else arr[-1],
            "rolling_mean_7": float(np.mean(arr[-7:]))
        }])
        if model is None:
            prediction = float(arr[-1])
        else:
            prediction = float(model.predict(feat[X.columns])[0])
        prediction = max(0.0, prediction)
        working_values.append(prediction)
        forecast_rows.append({
            "timestamp": future_date.strftime("%Y-%m-%d"),
            "predicted_kwh": round(prediction, 3)
        })
    return {
        "selected_model": selected,
        "forecast": forecast_rows,
        "metrics": evaluation["models"],
        "evaluation": {k: evaluation[k] for k in ("train_rows", "test_rows", "usable_rows")},
        "message": "Forecasts are estimates based on historical patterns, not guarantees."
    }
