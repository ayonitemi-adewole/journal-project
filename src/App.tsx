import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  ListFilter,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

type Direction = 'Buy' | 'Sell'
type Period = 'Today' | 'This week' | 'This month' | 'This year' | 'All time' | 'Custom'

type Trade = {
  id: string
  date: string
  symbol: string
  direction: Direction
  entry: number
  exit: number
  volume: number
  profit: number
  r: number
  duration: string
  strategy: string
  session: string
  note: string
}

const navItems = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'Trades', icon: ListFilter },
  { label: 'Analytics', icon: BarChart3 }, { label: 'Journal', icon: BookOpen }, { label: 'Settings', icon: Settings },
]

const money = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString()}`
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')
const API_HEADERS: Record<string, string> = import.meta.env.VITE_API_KEY ? { 'X-TradeLog-Key': import.meta.env.VITE_API_KEY } : {}
const emptyTrades: Trade[] = []
const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase()
const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`

const apiTrade = (trade: Record<string, unknown>): Trade => {
  const openTime = new Date(String(trade.open_time))
  const closeTime = new Date(String(trade.close_time))
  const durationMinutes = Math.max(0, Math.round((closeTime.getTime() - openTime.getTime()) / 60000))
  return {
    id: String(trade.id), date: String(trade.close_time).slice(0, 10), symbol: String(trade.symbol),
    direction: trade.direction === 'Sell' ? 'Sell' : 'Buy', entry: Number(trade.entry), exit: Number(trade.exit),
    volume: Number(trade.volume), profit: Number(trade.profit), r: Number(trade.r ?? 0),
    duration: `${Math.floor(durationMinutes / 60)}h ${String(durationMinutes % 60).padStart(2, '0')}m`,
    strategy: String(trade.strategy || 'Unassigned'), session: String(trade.session || ''), note: String(trade.comment || ''),
  }
}

function App() {
  const [period, setPeriod] = useState<Period>('This month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(new Date().toISOString().slice(0, 7))
  const [symbol, setSymbol] = useState('All symbols')
  const [direction, setDirection] = useState('All directions')
  const [activeNav, setActiveNav] = useState('Overview')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [syncSummary, setSyncSummary] = useState('Not synced yet')
  const [showConnection, setShowConnection] = useState(false)
  const [mt5Login, setMt5Login] = useState('')
  const [mt5Password, setMt5Password] = useState('')
  const [mt5Server, setMt5Server] = useState('')
  const [mt5TerminalPath, setMt5TerminalPath] = useState('')
  const [syncError, setSyncError] = useState('')
  const [journalTrades, setJournalTrades] = useState<Trade[]>(emptyTrades)

  const loadTrades = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trades`, { headers: API_HEADERS })
      if (!response.ok) throw new Error('Trade API unavailable')
      const payload = await response.json() as { trades?: Record<string, unknown>[] }
      setJournalTrades(payload.trades?.map(apiTrade) || [])
    } catch {
      // Keep the dashboard usable while the local API is stopped.
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTrades() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    let start: Date | null = null
    if (period === 'Today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'This week') { start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0) }
    if (period === 'This month') start = new Date(now.getFullYear(), now.getMonth(), 1)
    if (period === 'This year') start = new Date(now.getFullYear(), 0, 1)
    if (period === 'Custom' && customStart) start = new Date(`${customStart}T00:00:00`)
    if (period === 'Custom' && customEnd) end.setTime(new Date(`${customEnd}T23:59:59`).getTime())
    return { start, end }
  }, [period, customStart, customEnd])
  const visibleTrades = useMemo(() => journalTrades.filter((trade) => {
    const tradeDate = new Date(`${trade.date}T12:00:00`)
    return (symbol === 'All symbols' || trade.symbol === symbol) &&
      (direction === 'All directions' || trade.direction === direction) &&
      (!dateRange.start || tradeDate >= dateRange.start) && tradeDate <= dateRange.end
  }), [journalTrades, symbol, direction, dateRange])
  const netProfit = visibleTrades.reduce((total, trade) => total + trade.profit, 0)
  const wins = visibleTrades.filter((trade) => trade.profit > 0)
  const losses = visibleTrades.filter((trade) => trade.profit < 0)
  const grossProfit = wins.reduce((total, trade) => total + trade.profit, 0)
  const grossLoss = Math.abs(losses.reduce((total, trade) => total + trade.profit, 0))
  const profitFactor = grossLoss ? (grossProfit / grossLoss).toFixed(2) : '--'
  const averageR = visibleTrades.length ? (visibleTrades.reduce((total, trade) => total + trade.r, 0) / visibleTrades.length).toFixed(2) : '--'
  const chartData = [...visibleTrades].sort((left, right) => left.date.localeCompare(right.date)).reduce<{ day: string; pnl: number }[]>((points, trade) => {
    const previous = points.at(-1)?.pnl || 0
    points.push({ day: trade.date.slice(5).replace('-', '/'), pnl: previous + trade.profit })
    return points
  }, [])
  const grouped = (key: 'strategy' | 'symbol' | 'session' | 'direction') => Object.values(visibleTrades.reduce<Record<string, { label: string; trades: number; wins: number; profit: number; r: number }>>((groups, trade) => {
    const group = groups[trade[key]] || { label: trade[key], trades: 0, wins: 0, profit: 0, r: 0 }
    group.trades += 1
    group.wins += trade.profit > 0 ? 1 : 0
    group.profit += trade.profit
    group.r += trade.r
    groups[trade[key]] = group
    return groups
  }, {}))
  const strategyStats = grouped('strategy').sort((left, right) => right.profit - left.profit)
  const sessionStats = grouped('session').sort((left, right) => right.profit - left.profit)
  const symbolStats = Object.entries(visibleTrades.reduce<Record<string, { trades: number; wins: number; profit: number }>>((groups, trade) => {
    const group = groups[trade.symbol] || { trades: 0, wins: 0, profit: 0 }
    group.trades += 1
    group.wins += trade.profit > 0 ? 1 : 0
    group.profit += trade.profit
    groups[trade.symbol] = group
    return groups
  }, {})).sort((left, right) => right[1].profit - left[1].profit)
  const bestSymbol = symbolStats[0]
  let currentStreak = 0
  for (const trade of visibleTrades) { if (trade.profit > 0) currentStreak += 1; else break }
  const calendarDate = new Date(`${calendarMonth}-01T12:00:00`)
  const calendarTrades = journalTrades.filter((trade) =>
    (symbol === 'All symbols' || trade.symbol === symbol) &&
    (direction === 'All directions' || trade.direction === direction) &&
    trade.date.startsWith(calendarMonth),
  )
  const calendarDailyStats = Object.values(calendarTrades.reduce<Record<string, { date: string; profit: number; trades: number; wins: number }>>((groups, trade) => {
    const group = groups[trade.date] || { date: trade.date, profit: 0, trades: 0, wins: 0 }
    group.profit += trade.profit; group.trades += 1; group.wins += trade.profit > 0 ? 1 : 0; groups[trade.date] = group
    return groups
  }, {}))
  const calendarDays = Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }, (_, index) => {
    const day = `${calendarMonth}-${String(index + 1).padStart(2, '0')}`
    return { day, stats: calendarDailyStats.find((item) => item.date === day) }
  })
  const calendarOffset = (calendarDate.getDay() + 6) % 7
  const calendarWeeks = Array.from({ length: Math.ceil((calendarOffset + calendarDays.length) / 7) }, (_, weekIndex) => {
    const days = Array.from({ length: 7 }, (_, dayIndex) => calendarDays[weekIndex * 7 + dayIndex - calendarOffset]).map((day) => day || null)
    const stats = days.flatMap((day) => day?.stats ? [day.stats] : [])
    return { days, profit: stats.reduce((total, item) => total + item.profit, 0), trades: stats.reduce((total, item) => total + item.trades, 0) }
  })
  const calendarMonthProfit = calendarTrades.reduce((total, trade) => total + trade.profit, 0)
  const symbols = [...new Set(journalTrades.map((trade) => trade.symbol))].sort()

  const syncMt5 = async () => {
    if (!mt5Login || !mt5Password || !mt5Server) {
      setShowConnection(true)
      return
    }
    setSyncing(true)
    setSyncError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...API_HEADERS },
        body: JSON.stringify({ login: mt5Login, password: mt5Password, server: mt5Server, terminalPath: mt5TerminalPath }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'MT5 sync failed')
      await loadTrades()
      setSynced(true)
      setSyncSummary(`${(result as { newTrades?: number }).newTrades ?? 0} new trades imported`)
      setShowConnection(false)
    } catch (error) {
      setSynced(false)
      setSyncError(error instanceof Error ? error.message : 'MT5 sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={17} /></span><span>edg<span className="brand-accent">log</span></span></div>
        <div className="account-switcher"><span className="account-dot" /><span><small>ACCOUNT</small><strong>MT5 account</strong></span><ChevronDown size={15} /></div>
        <nav>{navItems.map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(label)}><Icon size={18} /><span>{label}</span>{label === 'Trades' && <span className="nav-count">{journalTrades.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sync-card"><div className="sync-title"><span className="live-dot" /> MT5 connection</div><p>{syncSummary}</p><button onClick={syncMt5} disabled={syncing}><RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync now'}</button></div><div className="profile"><div className="avatar">TL</div><div><strong>Personal journal</strong><span>Read-only workspace</span></div><MoreHorizontal size={18} /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="mobile-menu"><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" title="Help"><CircleHelp size={18} /></button><button className="icon-button" title="Settings"><Settings size={18} /></button><button className="sync-button" onClick={syncMt5}><RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing MT5...' : 'Sync MT5'}</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><p className="eyebrow">{todayLabel}</p><h1>Your trading overview <span>✦</span></h1><p className="subtitle">Performance from your imported MT5 positions.</p></div><div className="sync-status">{synced ? <><span className="live-dot" /> {syncSummary}</> : <><Clock3 size={15} /> Not synced yet</>}</div></section>

          <section className="filter-row"><div className="period-tabs">{(['Today', 'This week', 'This month', 'This year', 'All time', 'Custom'] as Period[]).map((item) => <button key={item} className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)}>{item}</button>)}</div><div className="filter-controls"><label><SlidersHorizontal size={14} /><select value={symbol} onChange={(event) => setSymbol(event.target.value)}><option>All symbols</option>{symbols.map((item) => <option key={item}>{item}</option>)}</select></label><label><select value={direction} onChange={(event) => setDirection(event.target.value)}><option>All directions</option><option>Buy</option><option>Sell</option></select></label><button className="filter-icon" title="More filters"><ListFilter size={16} /></button></div></section>
          {period === 'Custom' && <div className="custom-dates"><label>From<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>To<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}

          <section className="metric-grid"><Metric label="Net profit" value={visibleTrades.length ? money(netProfit) : '--'} change={visibleTrades.length ? `${visibleTrades.length} imported` : 'No trades yet'} trend={visibleTrades.length ? 'up' : 'neutral'} icon={<TrendingUp />} /><Metric label="Win rate" value={visibleTrades.length ? `${((wins.length / visibleTrades.length) * 100).toFixed(1)}%` : '--'} change={visibleTrades.length ? `${wins.length} winners` : 'No trades yet'} trend={visibleTrades.length ? 'up' : 'neutral'} icon={<Target />} /><Metric label="Profit factor" value={profitFactor} change={grossLoss ? `${money(grossProfit)} gross profit` : 'Not available'} trend={grossLoss ? 'up' : 'neutral'} icon={<BarChart3 />} /><Metric label="Max drawdown" value="--" change="Requires account balance" trend="neutral" icon={<ArrowDownRight />} /><Metric label="Average R" value={averageR === '--' ? '--' : `${averageR}R`} change={visibleTrades.length ? `${visibleTrades.length} measured` : 'No risk data'} trend={visibleTrades.length ? 'up' : 'neutral'} icon={<Trophy />} /><Metric label="Total trades" value={String(visibleTrades.length)} change="Imported positions" trend={visibleTrades.length ? 'up' : 'neutral'} icon={<Activity />} /></section>

          <section className="chart-panel panel"><div className="panel-heading"><div><h2>Cumulative P&L</h2><p>Imported closed positions across {period.toLowerCase()}</p></div></div><div className="chart-legend"><span><i className="legend-line teal" />Cumulative P&L</span><span className="chart-value">{visibleTrades.length ? money(netProfit) : '--'}</span></div><div className="chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}><defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36d6c5" stopOpacity={0.25} /><stop offset="100%" stopColor="#36d6c5" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#26383e" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#71848a', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#71848a', fontSize: 11 }} tickFormatter={(value) => `$${value}`} /><Tooltip contentStyle={{ background: '#172126', border: '1px solid #30434a', borderRadius: 8, color: '#e8f1ef' }} formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, 'Cumulative P&L']} /><Area type="monotone" dataKey="pnl" stroke="#36d6c5" strokeWidth={2.5} fill="url(#equityFill)" /></AreaChart></ResponsiveContainer> : <div className="empty-chart">No imported trades to chart</div>}</div></section>

          <section className="panel calendar-panel"><div className="panel-heading"><div><h2>Daily performance</h2><p>Daily P&L, trade count, and win rate</p></div><div className="calendar-controls"><strong className={calendarMonthProfit >= 0 ? 'positive' : 'negative'}>{money(calendarMonthProfit)} month</strong><button type="button" className="icon-button" aria-label="Previous month" onClick={() => setCalendarMonth(monthKey(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}>&lsaquo;</button><strong>{calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong><button type="button" className="icon-button" aria-label="Next month" onClick={() => setCalendarMonth(monthKey(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}>&rsaquo;</button></div></div><div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarWeeks.map((week, weekIndex) => <div className="calendar-week-row" key={`week-${weekIndex}`}>{week.days.map((item, dayIndex) => item ? <button key={item.day} className={`calendar-day ${item.stats ? (item.stats.profit >= 0 ? 'profit-day' : 'loss-day') : ''}`} onClick={() => { if (item.stats) { setPeriod('Custom'); setCustomStart(item.day); setCustomEnd(item.day) } }}><strong>{Number(item.day.slice(-2))}</strong>{item.stats ? <><b>{money(item.stats.profit)}</b><small>{item.stats.trades} trade{item.stats.trades === 1 ? '' : 's'} · {((item.stats.wins / item.stats.trades) * 100).toFixed(0)}%</small></> : <small>No trades</small>}</button> : <span className="calendar-empty" key={`empty-${weekIndex}-${dayIndex}`} />)}<div className="calendar-week-total"><span>Week {weekIndex + 1}</span><strong className={week.profit >= 0 ? 'positive' : 'negative'}>{money(week.profit)}</strong><small>{week.trades} trade{week.trades === 1 ? '' : 's'}</small></div></div>)}</div></section>

          <div className="two-column"><section className="panel recent-trades"><div className="panel-heading"><div><h2>Recent trades</h2><p>Your latest imported activity</p></div><button className="text-button" onClick={() => setActiveNav('Trades')}>View all <ChevronRight size={14} /></button></div><div className="trade-list">{visibleTrades.length ? visibleTrades.slice(0, 5).map((trade) => <button className="trade-row" key={trade.id} onClick={() => setSelectedTrade(trade)}><div className={`direction-icon ${trade.direction.toLowerCase()}`}>{trade.direction === 'Buy' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</div><div className="trade-name"><strong>{trade.symbol}</strong><span>{trade.strategy} · {trade.date.slice(5).replace('-', '/')}</span></div><div className="trade-side"><strong className={trade.profit > 0 ? 'positive' : 'negative'}>{money(trade.profit)}</strong><span>{trade.r > 0 ? '+' : ''}{trade.r}R</span></div></button>) : <div className="empty-state">No imported trades match these filters.</div>}</div></section><section className="panel strategy-panel"><div className="panel-heading"><div><h2>Strategy performance</h2><p>Calculated from imported trades</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="strategy-list">{strategyStats.length ? strategyStats.slice(0, 4).map((stats) => <div className="strategy-item" key={stats.label}><div className="strategy-label"><strong>{stats.label}</strong><span>{stats.trades} trades</span></div><div className="progress"><i style={{ width: `${(stats.wins / stats.trades) * 100}%` }} /></div><div className="strategy-stats"><span>{((stats.wins / stats.trades) * 100).toFixed(0)}%</span><strong className={stats.profit > 0 ? 'positive' : 'negative'}>{money(stats.profit)}</strong></div></div>) : <div className="empty-state">No strategy data available.</div>}</div></section></div>

          <section className="bottom-grid"><div className="mini-panel"><div className="mini-heading"><span>Best symbol</span><button className="icon-button"><MoreHorizontal size={17} /></button></div><strong className="big-stat">{bestSymbol?.[0] || '--'}</strong><div className="mini-meta">{bestSymbol ? <><span><b className="positive">{money(bestSymbol[1].profit)}</b> P&L</span><span>{((bestSymbol[1].wins / bestSymbol[1].trades) * 100).toFixed(0)}% win rate</span></> : <span>Import trades to calculate</span>}</div></div><div className="mini-panel"><div className="mini-heading"><span>Current streak</span><Trophy size={17} className="gold" /></div><strong className="big-stat">{currentStreak} <small>{currentStreak === 1 ? 'win' : 'wins'}</small></strong><div className="streak-dots">{Array.from({ length: Math.min(currentStreak, 5) }, (_, index) => <i key={index} />)}{!currentStreak && <span>No winning streak yet</span>}</div></div><div className="mini-panel"><div className="mini-heading"><span>Trading sessions</span><CalendarDays size={17} /></div>{sessionStats.length ? sessionStats.slice(0, 3).map((stats) => <div className="session-row" key={stats.label}><span>{stats.label}</span><b>{((stats.wins / stats.trades) * 100).toFixed(0)}%</b><strong className={stats.profit > 0 ? 'positive' : 'negative'}>{money(stats.profit)}</strong></div>) : <div className="empty-state">No session data available.</div>}</div></section>
          <footer><span><span className="live-dot" /> Live API data · read-only MT5 connection</span><span>No trades can be placed</span></footer>
        </div>
      </main>
      {selectedTrade && <div className="drawer-backdrop" onClick={() => setSelectedTrade(null)}><aside className="trade-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">TRADE {selectedTrade.id}</span><h2>{selectedTrade.symbol} <span className={`direction-badge ${selectedTrade.direction.toLowerCase()}`}>{selectedTrade.direction}</span></h2></div><button className="icon-button" onClick={() => setSelectedTrade(null)}><X size={19} /></button></div><div className="drawer-profit"><span>Net result</span><strong className={selectedTrade.profit > 0 ? 'positive' : 'negative'}>{money(selectedTrade.profit)}</strong><b>{selectedTrade.r > 0 ? '+' : ''}{selectedTrade.r}R</b></div><div className="detail-grid"><span>Entry<strong>{selectedTrade.entry}</strong></span><span>Exit<strong>{selectedTrade.exit}</strong></span><span>Lot size<strong>{selectedTrade.volume.toFixed(2)}</strong></span><span>Duration<strong>{selectedTrade.duration}</strong></span></div><div className="journal-form"><div className="panel-heading"><div><h2>Trade journal</h2><p>Capture the thinking behind the trade.</p></div><button className="text-button">Save</button></div><label>Setup<input defaultValue={selectedTrade.strategy} /></label><label>Market bias<textarea placeholder="What was the broader bias?" /></label><label>What went well?<textarea defaultValue={selectedTrade.note} /></label><label>Lesson learned<textarea placeholder="What will you carry forward?" /></label></div></aside></div>}
      {showConnection && <div className="drawer-backdrop" onClick={() => setShowConnection(false)}><aside className="trade-drawer connection-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">MT5 CONNECTION</span><h2>Connect account</h2></div><button className="icon-button" onClick={() => setShowConnection(false)}><X size={19} /></button></div><p className="connection-copy">Credentials are used for this sync only and are never saved to the journal.</p><form onSubmit={(event) => { event.preventDefault(); void syncMt5() }}><label>Account ID<input inputMode="numeric" value={mt5Login} onChange={(event) => setMt5Login(event.target.value)} placeholder="12345678" required /></label><label>Investor password<input type="password" value={mt5Password} onChange={(event) => setMt5Password(event.target.value)} placeholder="Investor password" required /></label><label>Broker server<input value={mt5Server} onChange={(event) => setMt5Server(event.target.value)} placeholder="Broker-MT5Real" required /></label><label>MT5 terminal path <span className="optional">optional</span><input value={mt5TerminalPath} onChange={(event) => setMt5TerminalPath(event.target.value)} placeholder="C:\\Program Files\\MetaTrader 5\\terminal64.exe" /></label>{syncError && <p className="sync-error">{syncError}</p>}<button className="sync-button connection-submit" type="submit" disabled={syncing}><RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Connecting...' : 'Connect and sync'}</button></form></aside></div>}
    </div>
  )
}

function Metric({ label, value, change, trend, icon }: { label: string; value: string; change: string; trend: 'up' | 'neutral'; icon: React.ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><div className={`metric-change ${trend}`}><ArrowUpRight size={13} /> {change}</div></div>
}

export default App
