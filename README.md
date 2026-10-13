# EnergyPulse — Energy Consumption Analysis & Prediction

A local full-stack demo application for analysing electricity consumption, forecasting future usage, and estimating energy costs.

## Features
- Dashboard KPIs and historical charts
- CSV upload with validation
- Daily consumption analysis
- Chronological ML evaluation (baseline, Linear Regression, Random Forest)
- Forecast generation and CSV export
- Configurable electricity tariff
- SQLite database for imported readings and settings
- FastAPI Swagger documentation
- Synthetic sample data clearly labelled as demo data

## Requirements
- Python 3.11 or 3.12 recommended
- Node.js 20 LTS or newer
- VS Code

Check installations in PowerShell:
```powershell
python --version
node --version
npm --version
```

## 1. Open the project
Extract the ZIP, then in VS Code select **File → Open Folder** and open `energy-consumption-analysis`.

## 2. Start the backend
Open a VS Code terminal (PowerShell). From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

If PowerShell blocks virtual-environment activation, use this command for the current terminal only, then activate again:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Backend URLs:
- API health: http://127.0.0.1:8000/api/health
- Swagger UI: http://127.0.0.1:8000/docs

The backend automatically creates `backend/energy_pulse.db` and imports the bundled sample CSV on first launch if the database is empty.

Keep this terminal open.

## 3. Start the frontend
Open a **second** VS Code terminal. From the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually http://localhost:5173.

Keep both terminals open while using the website.

## 4. CSV format
Minimum required columns:
```csv
timestamp,energy_consumption_kwh
2026-01-01,24.5
2026-01-02,26.2
```
The timestamp must be parseable as a date/time and consumption must be numeric and non-negative. The app accepts `timestamp` and `energy_consumption_kwh` column names. Uploading a new CSV replaces the current dataset, rather than appending duplicate rows.

The included `data/sample_energy_data.csv` contains synthetic demonstration readings; it is not real utility data.

## 5. Tests
With the backend virtual environment activated and terminal in `backend`:
```powershell
python -m pytest
```
Frontend production build (in a second terminal, from `frontend`):
```powershell
npm run build
```

## 6. Restart later
1. Open the project folder in VS Code.
2. Terminal 1: `cd backend`, then `.\.venv\Scripts\Activate.ps1`, then `python -m uvicorn app.main:app --reload`.
3. Terminal 2: `cd frontend`, then `npm run dev`.
4. Open the Vite URL.

## Troubleshooting
- **`python` not found:** install Python 3.11/3.12 and enable “Add Python to PATH”; reopen VS Code.
- **`npm` not found:** install Node.js LTS; reopen VS Code.
- **Port 8000 busy:** run `python -m uvicorn app.main:app --reload --port 8001` and update `VITE_API_URL` in `frontend/.env` to `http://127.0.0.1:8001`.
- **Port 5173 busy:** Vite may offer another port; open the exact URL it prints.
- **Frontend cannot reach API:** ensure backend terminal is running and `VITE_API_URL` is `http://127.0.0.1:8000`.
- **No forecast:** the sample dataset needs enough rows; use the bundled sample or upload a longer series.
- **Reset database:** stop the backend, delete `backend/energy_pulse.db`, then start the backend again. This recreates the demo database.

## Important interpretation notes
- Forecasts are estimates based on historical patterns; they are not guarantees.
- The included sample data is synthetic.
- Cost is a simple estimate: kWh × configured tariff. Actual bills can include taxes, fixed charges, and slab pricing.
- Chronological holdout evaluation is used to reduce time-series leakage. Metrics do not guarantee future performance.
