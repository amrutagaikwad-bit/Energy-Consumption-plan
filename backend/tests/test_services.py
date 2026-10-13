import pandas as pd
import pytest
from app.services import normalize_frame, evaluate_models

def test_normalize_sorts_and_removes_duplicate_timestamps():
    frame = pd.DataFrame({
        "timestamp": ["2026-01-02", "2026-01-01", "2026-01-01"],
        "energy_consumption_kwh": [22, 10, 11]
    })
    clean = normalize_frame(frame)
    assert len(clean) == 2
    assert clean.iloc[0]["energy_consumption_kwh"] == 11
    assert clean["timestamp"].is_monotonic_increasing

def test_negative_consumption_rejected():
    frame = pd.DataFrame({"timestamp": ["2026-01-01"], "energy_consumption_kwh": [-1]})
    with pytest.raises(ValueError):
        normalize_frame(frame)

def test_metrics_need_enough_data():
    frame = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=10),
        "energy_consumption_kwh": list(range(10))
    })
    result = evaluate_models(frame)
    assert result["ready"] is False
