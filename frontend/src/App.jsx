import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Bolt, CalendarDays, CheckCircle2, ChevronDown,
  CircleHelp, CloudUpload, Download, Gauge, Leaf, Lightbulb, Menu,
  RefreshCw, Settings, TrendingDown, TrendingUp, Upload, X, Zap
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, BarChart, Bar
} from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
const number = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value || 0)

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new Error(body?.detail || 'Something went wrong while contacting the API.')
  return body
}

function MetricCard({ icon: Icon, label, value, unit, foot, tone = 'green' }) {
  return <div className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={19} /></div>
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}<span>{unit}</span></div>
    <div className="metric-foot">{foot}</div>
  </div>
}

function SectionTitle({ eyebrow, title, subtitle, right }) {
  return <div className="section-title">
    <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {right && <div className="section-right">{right}</div>}
  </div>
}

export default function App() {
  const [page, setPage] = useState('Overview')
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [horizon, setHorizon] = useState(14)
  const [tariff, setTariff] = useState(8)
  const [tariffInput, setTariffInput] = useState('8')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  async function refresh() {
    setLoading(true); setError('')
    try {
      const [s, r, t, m] = await Promise.all([
        api('/api/dashboard/summary'), api('/api/consumption'), api('/api/settings'), api('/api/models/metrics')
      ])
      setSummary(s); setRecords(r.data); setTariff(t.tariff_per_kwh); setTariffInput(String(t.tariff_per_kwh)); setMetrics(m)
    } catch (e) {
      setError(`${e.message} Check that the backend is running at ${API}.`)
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const chartData = useMemo(() => records.map(r => ({
    date: new Date(r.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    fullDate: r.timestamp.slice(0, 10),
    usage: Number(r.energy_consumption_kwh)
  })), [records])

  const recentData = useMemo(() => chartData.slice(-30), [chartData])
  const weekdayData = useMemo(() => {
    const buckets = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => ({ day, total: 0, count: 0 }))
    records.forEach(r => { const d = new Date(r.timestamp).getDay(); buckets[d].total += Number(r.energy_consumption_kwh); buckets[d].count += 1 })
    return buckets.map(b => ({ day: b.day, average: b.count ? +(b.total / b.count).toFixed(2) : 0 }))
  }, [records])

  async function runForecast() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api('/api/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horizon_days: Number(horizon) }) })
      setForecast(result); setPage('Prediction Studio')
      setNotice('Forecast generated using the selected model.')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function uploadCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const form = new FormData(); form.append('file', file)
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api('/api/data/upload', { method: 'POST', body: form })
      setNotice(`${result.message} Imported ${result.valid_rows} valid rows.`); setForecast(null); await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false); event.target.value = '' }
  }

  async function saveTariff(event) {
    event.preventDefault()
    const value = Number(tariffInput)
    if (!Number.isFinite(value) || value <= 0) { setError('Enter a tariff greater than zero.'); return }
    try {
      const result = await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tariff_per_kwh: value }) })
      setTariff(result.tariff_per_kwh); setNotice('Electricity tariff updated.'); setError(''); await refresh()
    } catch (e) { setError(e.message) }
  }

  async function resetData() {
    if (!window.confirm('Restore the bundled synthetic demo dataset? Your currently imported dataset will be replaced.')) return
    setBusy(true)
    try { await api('/api/data/reset', { method: 'POST' }); setForecast(null); setNotice('Demo dataset restored.'); await refresh() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  function downloadForecast() {
    window.open(`${API}/api/reports/forecast.csv?horizon_days=${horizon}`, '_blank', 'noopener,noreferrer')
  }

  const nav = [
    { name: 'Overview', icon: Gauge, group: 'WORKSPACE' },
    { name: 'Consumption Analytics', icon: BarChart3, group: 'WORKSPACE' },
    { name: 'Prediction Studio', icon: Activity, group: 'INTELLIGENCE' },
    { name: 'Cost Optimizer', icon: Bolt, group: 'INTELLIGENCE' },
    { name: 'Data Management', icon: CloudUpload, group: 'DATA' },
    { name: 'Model Insights', icon: TrendingUp, group: 'DATA' },
    { name: 'Settings', icon: Settings, group: 'SYSTEM' }
  ]

  const groups = [...new Set(nav.map(n => n.group))]
  const displayedForecast = forecast?.forecast || []
  const combinedForecast = [
    ...recentData.slice(-14).map(r => ({ date: r.date, actual: r.usage, predicted: null })),
    ...displayedForecast.map(r => ({ date: new Date(`${r.timestamp}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), actual: null, predicted: r.predicted_kwh }))
  ]

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Zap size={22} fill="currentColor" /></div><div><strong>EnergyPulse</strong><span>ENERGY INTELLIGENCE</span></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={19}/></button></div>
      <div className="workspace-label">WORKSPACE <ChevronDown size={14}/></div>
      {groups.map(group => <div className="nav-group" key={group}>
        <div className="nav-group-title">{group}</div>
        {nav.filter(n => n.group === group).map(item => <button key={item.name} className={`nav-item ${page === item.name ? 'active' : ''}`} onClick={() => { setPage(item.name); setMobileNav(false) }}>
          <item.icon size={18}/><span>{item.name}</span>{item.name === 'Prediction Studio' && <span className="nav-dot"/>}
        </button>)}
      </div>)}
      <div className="sidebar-bottom"><div className="eco-badge"><div className="eco-icon"><Leaf size={19}/></div><strong>Smarter energy,<br/>lighter footprint.</strong><span>Turn insights into impact.</span></div><div className="profile"><div className="avatar">EP</div><div><strong>EnergyPulse Demo</strong><span>Local workspace</span></div><CircleHelp size={17}/></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div></div><div className="topbar-right"><span className="system-status"><i/> System operational</span><button className="icon-button" onClick={refresh} title="Refresh data"><RefreshCw size={17}/></button><div className="top-avatar">EP</div></div></header>
      <div className="content">
        {error && <div className="alert error"><X size={17}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
        {notice && <div className="alert success"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={16}/></button></div>}
        {loading ? <div className="loading-panel"><div className="spinner"/><strong>Loading your energy workspace…</strong><span>Connecting to your local analytics API</span></div> : !summary ? <div className="empty-panel"><h2>Unable to load dashboard</h2><p>Start the backend server, then retry.</p><button className="primary-button" onClick={refresh}>Retry connection</button></div> : <>
          {page === 'Overview' && <Overview summary={summary} recentData={recentData} metrics={metrics} onForecast={runForecast} busy={busy} />}
          {page === 'Consumption Analytics' && <Analytics chartData={chartData} weekdayData={weekdayData} records={records} />}
          {page === 'Prediction Studio' && <Prediction forecast={forecast} horizon={horizon} setHorizon={setHorizon} runForecast={runForecast} busy={busy} downloadForecast={downloadForecast} metrics={metrics} combinedForecast={combinedForecast} />}
          {page === 'Cost Optimizer' && <CostOptimizer summary={summary} tariff={tariff} tariffInput={tariffInput} setTariffInput={setTariffInput} saveTariff={saveTariff} records={records} />}
          {page === 'Data Management' && <DataManagement records={records} uploadCsv={uploadCsv} resetData={resetData} busy={busy} />}
          {page === 'Model Insights' && <ModelInsights metrics={metrics} />}
          {page === 'Settings' && <CostOptimizer summary={summary} tariff={tariff} tariffInput={tariffInput} setTariffInput={setTariffInput} saveTariff={saveTariff} records={records} settingsMode />}
        </>}
        <footer className="footer"><span>© 2026 EnergyPulse Analytics</span><span><i/> Local data workspace</span><span>Built for smarter energy decisions</span></footer>
      </div>
    </main>
  </div>
}

function Overview({ summary, recentData, metrics, onForecast, busy }) {
  const change = summary.change_percent
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> ENERGY OVERVIEW</div><h1>Your energy, <span>in focus.</span></h1><p>Understand consumption patterns and make more informed energy decisions.</p></div><div className="welcome-actions"><button className="secondary-button" onClick={() => window.open(`${API}/api/data/sample`, '_blank')}><Download size={16}/> Sample data</button><button className="primary-button" onClick={onForecast} disabled={busy}><Activity size={16}/>{busy ? 'Generating…' : 'Generate forecast'}</button></div></div>
    <div className="data-note"><span className="note-dot"/> <strong>Demo workspace</strong><span>Bundled readings are synthetic. Upload your own CSV from Data Management to analyse your data.</span></div>
    <div className="metrics-grid">
      <MetricCard icon={Zap} label="Total consumption" value={number(summary.total_kwh)} unit=" kWh" foot={`${summary.record_count} recorded readings`} tone="green"/>
      <MetricCard icon={Gauge} label="Average per reading" value={number(summary.average_kwh)} unit=" kWh" foot="Across selected dataset" tone="blue"/>
      <MetricCard icon={TrendingUp} label="Peak reading" value={number(summary.peak_kwh)} unit=" kWh" foot={summary.peak_date} tone="orange"/>
      <MetricCard icon={Bolt} label="Estimated energy cost" value={currency(summary.estimated_cost)} unit="" foot={`At ₹${number(summary.tariff_per_kwh)} per kWh`} tone="purple"/>
    </div>
    <div className="section-grid main-charts">
      <section className="panel chart-panel"><div className="panel-heading"><div><h3>Consumption overview</h3><p>Daily energy use across the most recent 30 readings</p></div><span className="chart-legend"><i/> Consumption</span></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={recentData}><defs><linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20b887" stopOpacity={0.2}/><stop offset="95%" stopColor="#20b887" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf2"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fontSize:11, fill:'#8a95a5'}} minTickGap={25}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11, fill:'#8a95a5'}} width={42}/><Tooltip contentStyle={{border:'1px solid #e6ebf0',borderRadius:12,fontSize:12}} formatter={v => [`${number(v)} kWh`, 'Consumption']}/><Area type="monotone" dataKey="usage" stroke="#16a879" strokeWidth={2.5} fill="url(#usageFill)" activeDot={{r:5}}/></AreaChart></ResponsiveContainer></div>
        <div className="chart-foot"><span><i/> Historical consumption</span><span>Unit: kWh</span></div>
      </section>
      <section className="panel insight-panel"><div className="panel-heading"><div><h3>Energy insights</h3><p>Quick signals from your dataset</p></div><div className="insight-symbol"><Lightbulb size={18}/></div></div>
        <div className="insight-item"><div className="insight-icon mint"><Activity size={17}/></div><div><strong>Peak reading identified</strong><p>Your highest recorded reading is {number(summary.peak_kwh)} kWh on {summary.peak_date}. Review what was running during this period.</p></div></div>
        <div className="insight-item"><div className="insight-icon blue"><CalendarDays size={17}/></div><div><strong>Track the trend</strong><p>{change === null ? 'More historical data is needed to compare periods.' : `Recent average usage is ${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'higher' : 'lower'} than the preceding comparison period.`}</p></div></div>
        <div className="insight-item"><div className="insight-icon amber"><Leaf size={17}/></div><div><strong>Explore cost opportunities</strong><p>Use the Cost Optimizer to test tariff assumptions and estimate the effect of lower consumption.</p></div></div>
        <div className="insight-disclaimer">Insights describe patterns in available data; they do not establish causes.</div>
      </section>
    </div>
    <section className="panel model-strip"><div className="model-strip-icon"><Activity size={20}/></div><div className="model-strip-copy"><strong>Machine learning workspace</strong><span>{metrics?.ready ? `Evaluation ready · ${metrics.models.length} models compared · selected: ${metrics.selected_model}` : (metrics?.message || 'Load enough historical data to evaluate models.')}</span></div><div className="model-strip-status"><span className={metrics?.ready ? 'status-pill good' : 'status-pill'}>{metrics?.ready ? 'Ready to forecast' : 'Needs more data'}</span></div></section>
  </>
}

function Analytics({ chartData, weekdayData, records }) {
  const [range, setRange] = useState('30')
  const shown = range === 'all' ? chartData : chartData.slice(-Number(range))
  return <>
    <SectionTitle eyebrow="DATA EXPLORATION" title="Consumption analytics" subtitle="Explore the shape and rhythm of your energy usage." right={<select className="select-control" value={range} onChange={e => setRange(e.target.value)}><option value="7">Last 7 readings</option><option value="30">Last 30 readings</option><option value="90">Last 90 readings</option><option value="all">All readings</option></select>}/>
    <div className="metrics-grid compact"><MetricCard icon={BarChart3} label="Visible readings" value={shown.length} foot="Based on selected view"/><MetricCard icon={Zap} label="Visible total" value={number(shown.reduce((a,b)=>a+b.usage,0))} unit=" kWh" foot="Sum of displayed values" tone="blue"/><MetricCard icon={Gauge} label="Visible average" value={number(shown.length ? shown.reduce((a,b)=>a+b.usage,0)/shown.length : 0)} unit=" kWh" foot="Per reading" tone="orange"/></div>
    <section className="panel chart-panel large-panel"><div className="panel-heading"><div><h3>Consumption trend</h3><p>Observed energy consumption over time</p></div><span className="chart-legend"><i/> Actual usage</span></div><div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={shown}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf2"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8a95a5'}} minTickGap={30}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8a95a5'}}/><Tooltip formatter={v=>[`${number(v)} kWh`,'Usage']}/><Line type="monotone" dataKey="usage" stroke="#16a879" strokeWidth={2.5} dot={false} activeDot={{r:4}}/></LineChart></ResponsiveContainer></div></section>
    <section className="panel chart-panel"><div className="panel-heading"><div><h3>Average usage by weekday</h3><p>Calculated from the dates in your dataset</p></div></div><div className="chart-wrap medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={weekdayData}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf2"/><XAxis dataKey="day" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={v=>[`${number(v)} kWh`,'Average']}/><Bar dataKey="average" fill="#36b58a" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></section>
    <section className="panel table-panel"><div className="panel-heading"><div><h3>Recent readings</h3><p>Most recent 10 records</p></div><span className="record-count">{records.length} total records</span></div><div className="table-scroll"><table><thead><tr><th>Date / time</th><th>Consumption</th><th>Record status</th></tr></thead><tbody>{records.slice(-10).reverse().map((r,i)=><tr key={r.timestamp}><td>{new Date(r.timestamp).toLocaleString()}</td><td><strong>{number(r.energy_consumption_kwh)} kWh</strong></td><td><span className="status-pill good">Validated</span></td></tr>)}</tbody></table></div></section>
  </>
}

function Prediction({ forecast, horizon, setHorizon, runForecast, busy, downloadForecast, metrics, combinedForecast }) {
  return <>
    <SectionTitle eyebrow="MACHINE LEARNING" title="Prediction studio" subtitle="Generate a future consumption estimate from historical readings."/>
    <section className="panel forecast-controls"><div className="forecast-control-copy"><div className="panel-kicker">FORECAST CONFIGURATION</div><h3>Plan your next energy cycle</h3><p>Choose a horizon and generate a model-based estimate. Daily readings are aggregated before forecasting.</p></div><div className="forecast-control-actions"><label>Forecast horizon<select className="select-control" value={horizon} onChange={e=>setHorizon(Number(e.target.value))}><option value={7}>Next 7 days</option><option value={14}>Next 14 days</option><option value={30}>Next 30 days</option><option value={60}>Next 60 days</option><option value={90}>Next 90 days</option></select></label><button className="primary-button" onClick={runForecast} disabled={busy}><Activity size={16}/>{busy?'Working…':'Generate forecast'}</button></div></section>
    {forecast ? <>
      <div className="forecast-result-banner"><div className="result-check"><CheckCircle2 size={20}/></div><div><strong>Forecast generated</strong><span>Selected model: {forecast.selected_model}. Treat these values as estimates, not guarantees.</span></div><button className="secondary-button" onClick={downloadForecast}><Download size={16}/> Export CSV</button></div>
      <div className="metrics-grid compact"><MetricCard icon={Activity} label="Forecast horizon" value={forecast.forecast.length} unit=" days" foot="Future daily estimates"/><MetricCard icon={Gauge} label="Average predicted" value={number(forecast.forecast.reduce((a,b)=>a+b.predicted_kwh,0)/forecast.forecast.length)} unit=" kWh" foot="Per forecast day" tone="blue"/><MetricCard icon={Bolt} label="Forecast total" value={number(forecast.forecast.reduce((a,b)=>a+b.predicted_kwh,0))} unit=" kWh" foot="Across selected horizon" tone="orange"/></div>
      <section className="panel chart-panel large-panel"><div className="panel-heading"><div><h3>Historical context and future estimate</h3><p>Observed readings followed by forecasted values</p></div><div className="multi-legend"><span><i className="legend-actual"/> Actual</span><span><i className="legend-predicted"/> Predicted</span></div></div><div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={combinedForecast}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf2"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8a95a5'}} minTickGap={25}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8a95a5'}}/><Tooltip formatter={v=>v==null?['—','']: [`${number(v)} kWh`]}/><Line type="monotone" dataKey="actual" name="Actual" stroke="#16a879" strokeWidth={2.5} dot={false} connectNulls={false}/><Line type="monotone" dataKey="predicted" name="Predicted" stroke="#7c6ce5" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div></section>
      <section className="panel table-panel"><div className="panel-heading"><div><h3>Forecast values</h3><p>Daily predicted consumption</p></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Predicted energy</th><th>Estimated cost</th></tr></thead><tbody>{forecast.forecast.map(r=><tr key={r.timestamp}><td>{r.timestamp}</td><td><strong>{number(r.predicted_kwh)} kWh</strong></td><td>{currency(r.predicted_kwh * 8)}</td></tr>)}</tbody></table></div></section>
    </> : <div className="empty-panel"><div className="empty-icon"><Activity size={24}/></div><h3>Your forecast will appear here</h3><p>Generate a forecast to compare historical observations with future estimated consumption.</p><button className="primary-button" onClick={runForecast} disabled={busy}>{busy?'Generating…':'Generate forecast'}</button><span className="small-muted">{metrics?.ready ? `Model evaluation is ready. Selected model: ${metrics.selected_model}.` : (metrics?.message || 'Load sufficient historical readings to get started.')}</span></div>}
    {forecast && <div className="notice-box"><CircleHelp size={18}/><div><strong>How to interpret this forecast</strong><p>Model selection is based on a chronological holdout test. Future results can differ due to weather, occupancy, equipment, operational changes, and other factors not present in the data.</p></div></div>}
  </>
}

function CostOptimizer({ summary, tariff, tariffInput, setTariffInput, saveTariff, records, settingsMode=false }) {
  const [reduction, setReduction] = useState(10)
  const cost = summary.total_kwh * tariff
  const saved = cost * reduction / 100
  const daily = summary.average_kwh * tariff
  return <>
    <SectionTitle eyebrow={settingsMode?'WORKSPACE SETTINGS':'EFFICIENCY & COST'} title={settingsMode?'Settings':'Cost optimizer'} subtitle={settingsMode?'Configure the assumptions used in your energy cost estimates.':'Explore how changes in energy use may affect estimated costs.'}/>
    <div className="cost-grid">
      <section className="panel tariff-panel"><div className="panel-heading"><div><h3>Electricity tariff</h3><p>Configure the rate used for cost estimates</p></div><div className="tariff-icon"><Bolt size={19}/></div></div><form onSubmit={saveTariff}><label className="form-label">Tariff per kWh (₹)<input type="number" min="0.01" step="0.01" value={tariffInput} onChange={e=>setTariffInput(e.target.value)} required/></label><button className="primary-button" type="submit">Save tariff</button></form><div className="formula-note">Estimated energy cost = total kWh × tariff per kWh. Fixed fees, taxes, and slab pricing are not included.</div></section>
      <section className="panel cost-summary"><div className="cost-summary-label">ESTIMATED COST · DATASET PERIOD</div><div className="cost-big">{currency(cost)}</div><div className="cost-sub">At ₹{number(tariff)} per kWh</div><div className="cost-divider"/><div className="cost-line"><span>Average estimated daily cost</span><strong>{currency(daily)}</strong></div><div className="cost-line"><span>Total energy consumption</span><strong>{number(summary.total_kwh)} kWh</strong></div></section>
    </div>
    <section className="panel savings-panel"><div className="panel-heading"><div><h3>Consumption reduction simulator</h3><p>Model a hypothetical reduction; this is not a guaranteed saving.</p></div><div className="savings-icon"><Leaf size={20}/></div></div><div className="slider-label"><span>Target reduction</span><strong>{reduction}%</strong></div><input className="range-slider" type="range" min="0" max="30" step="1" value={reduction} onChange={e=>setReduction(Number(e.target.value))}/><div className="range-ticks"><span>0%</span><span>15%</span><span>30%</span></div><div className="savings-result"><div><span>Potential cost reduction</span><strong>{currency(saved)}</strong></div><div><span>Illustrative cost after reduction</span><strong>{currency(cost-saved)}</strong></div><div><span>Illustrative energy after reduction</span><strong>{number(summary.total_kwh*(1-reduction/100))} kWh</strong></div></div></section>
    <div className="notice-box"><Lightbulb size={18}/><div><strong>Actionable next step</strong><p>Review high-usage days in Consumption Analytics. Validate possible causes before changing equipment schedules or operating practices.</p></div></div>
  </>
}

function DataManagement({ records, uploadCsv, resetData, busy }) {
  return <>
    <SectionTitle eyebrow="DATA WORKSPACE" title="Data management" subtitle="Import your own energy readings, review the active dataset, or restore the demo data."/>
    <div className="data-card-grid"><section className="panel upload-panel"><div className="upload-graphic"><Upload size={25}/></div><h3>Upload consumption data</h3><p>Choose a CSV file with timestamp and energy_consumption_kwh columns. Uploading replaces the current dataset.</p><label className="upload-drop"><input type="file" accept=".csv,text/csv" onChange={uploadCsv} disabled={busy}/><CloudUpload size={22}/><strong>{busy?'Processing…':'Choose CSV file'}</strong><span>CSV only · Maximum 10 MB</span></label><div className="schema-block"><strong>Required format</strong><code>timestamp,energy_consumption_kwh</code><code>2026-01-01,24.5</code><code>2026-01-02,26.2</code></div><a className="text-link" href={`${API}/api/data/sample`} download>Download sample CSV <Download size={14}/></a></section>
      <section className="panel dataset-panel"><div className="panel-heading"><div><h3>Active dataset</h3><p>Current records stored in SQLite</p></div><div className="dataset-icon"><BarChart3 size={20}/></div></div><div className="dataset-stat"><span>Valid readings</span><strong>{records.length.toLocaleString('en-IN')}</strong></div><div className="dataset-stat"><span>First timestamp</span><strong>{records.length?records[0].timestamp.slice(0,10):'—'}</strong></div><div className="dataset-stat"><span>Last timestamp</span><strong>{records.length?records[records.length-1].timestamp.slice(0,10):'—'}</strong></div><div className="dataset-warning"><CircleHelp size={16}/><span>Bundled data is synthetic. Check source, units, missing records, and sampling frequency before interpreting results.</span></div><button className="secondary-button full-button" onClick={resetData} disabled={busy}><RefreshCw size={15}/> Restore demo dataset</button></section></div>
    <section className="panel data-quality"><div className="panel-heading"><div><h3>Data preparation</h3><p>Checks applied during CSV import</p></div></div><div className="quality-grid"><div><CheckCircle2 size={17}/><span>Parse dates and numeric values</span></div><div><CheckCircle2 size={17}/><span>Remove invalid rows and report valid count</span></div><div><CheckCircle2 size={17}/><span>Sort records chronologically</span></div><div><CheckCircle2 size={17}/><span>Deduplicate identical timestamps</span></div><div><CheckCircle2 size={17}/><span>Reject negative consumption</span></div><div><CheckCircle2 size={17}/><span>Limit file size and row count</span></div></div><p className="small-muted">Invalid rows are excluded during normalization; inspect your source CSV if the accepted row count is lower than expected.</p></section>
  </>
}

function ModelInsights({ metrics }) {
  return <>
    <SectionTitle eyebrow="MODEL PERFORMANCE" title="Model insights" subtitle="Review chronological holdout performance before relying on forecasts."/>
    {!metrics?.ready ? <div className="empty-panel"><div className="empty-icon"><Activity size={24}/></div><h3>Model evaluation is not ready</h3><p>{metrics?.message || 'Connect to the backend and load enough historical data.'}</p></div> : <>
      <section className="panel selected-model"><div className="selected-model-icon"><CheckCircle2 size={23}/></div><div><div className="panel-kicker">SELECTED BY LOWEST HOLDOUT MAE</div><h3>{metrics.selected_model}</h3><p>{metrics.message}</p></div><span className="status-pill good">Evaluated</span></section>
      <div className="metrics-grid compact"><MetricCard icon={BarChart3} label="Training rows" value={metrics.train_rows} foot="Chronological training segment"/><MetricCard icon={Activity} label="Test rows" value={metrics.test_rows} foot="Later observations held out" tone="blue"/><MetricCard icon={Gauge} label="Usable rows" value={metrics.usable_rows} foot="After lag-feature preparation" tone="orange"/></div>
      <section className="panel table-panel"><div className="panel-heading"><div><h3>Model comparison</h3><p>Lower MAE and RMSE generally indicate smaller prediction errors on this holdout.</p></div></div><div className="table-scroll"><table><thead><tr><th>Model</th><th>MAE (kWh)</th><th>RMSE (kWh)</th><th>Selection</th></tr></thead><tbody>{metrics.models.map(m=><tr key={m.model}><td><strong>{m.model}</strong></td><td>{number(m.mae)}</td><td>{number(m.rmse)}</td><td>{m.model===metrics.selected_model?<span className="status-pill good">Selected</span>:<span className="status-pill">Compared</span>}</td></tr>)}</tbody></table></div></section>
      <div className="notice-box"><CircleHelp size={18}/><div><strong>Important model limitations</strong><p>Evaluation uses a chronological holdout, but a single split can be unstable. Lag features use past consumption; external factors such as weather and occupancy are not included. The model comparison is educational and does not guarantee future performance.</p></div></div>
    </>}
  </>
}
