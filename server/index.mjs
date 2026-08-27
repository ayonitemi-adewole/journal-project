import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'

const port = Number(process.env.API_PORT || 3001)
const host = process.env.API_HOST || '127.0.0.1'
const apiKey = process.env.TRADELOG_API_KEY || ''
const corsOrigin = process.env.API_CORS_ORIGIN || '*'
const databasePath = join(dirname(fileURLToPath(import.meta.url)), 'journal.db')
mkdirSync(dirname(databasePath), { recursive: true })
const database = new DatabaseSync(databasePath)

database.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    ticket TEXT NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('Buy', 'Sell')),
    volume REAL NOT NULL,
    entry REAL NOT NULL,
    exit REAL NOT NULL,
    stop_loss REAL,
    take_profit REAL,
    open_time TEXT NOT NULL,
    close_time TEXT NOT NULL,
    profit REAL NOT NULL,
    commission REAL NOT NULL DEFAULT 0,
    swap REAL NOT NULL DEFAULT 0,
    fees REAL NOT NULL DEFAULT 0,
    magic_number INTEGER,
    comment TEXT,
    strategy TEXT,
    setup TEXT,
    market_bias TEXT,
    entry_reason TEXT,
    exit_reason TEXT,
    went_well TEXT,
    went_wrong TEXT,
    lesson TEXT,
    emotion TEXT,
    screenshot_path TEXT
  ) STRICT;
`)

const importTrade = database.prepare(`INSERT INTO trades (id, ticket, symbol, direction, volume, entry, exit, stop_loss, take_profit, open_time, close_time, profit, commission, swap, fees, magic_number, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ticket = excluded.ticket, symbol = excluded.symbol, direction = excluded.direction, volume = excluded.volume, entry = excluded.entry, exit = excluded.exit, stop_loss = excluded.stop_loss, take_profit = excluded.take_profit, open_time = excluded.open_time, close_time = excluded.close_time, profit = excluded.profit, commission = excluded.commission, swap = excluded.swap, fees = excluded.fees, magic_number = excluded.magic_number, comment = excluded.comment`)
const send = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Headers': 'Content-Type, X-TradeLog-Key', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' })
  response.end(JSON.stringify(payload))
}
const parseBody = async (request) => {
  let body = ''
  for await (const chunk of request) body += chunk
  return body ? JSON.parse(body) : {}
}
const runConnector = (credentials) => new Promise((resolve, reject) => {
  const connector = spawn(process.platform === 'win32' ? 'python' : 'python3', ['connector/mt5_connector.py'], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, MT5_LOGIN: credentials.login, MT5_PASSWORD: credentials.password, MT5_SERVER: credentials.server, MT5_TERMINAL_PATH: credentials.terminalPath || '' },
  })
  let output = ''
  let errorOutput = ''
  connector.stdout.on('data', (chunk) => { output += chunk })
  connector.stderr.on('data', (chunk) => { errorOutput += chunk })
  connector.on('error', reject)
  connector.on('close', (code) => {
    if (code !== 0) return reject(new Error(errorOutput.trim() || `MT5 connector exited with code ${code}`))
    try { resolve(JSON.parse(output)) } catch { reject(new Error('MT5 connector returned an invalid response')) }
  })
})

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {})
  if (apiKey && request.headers['x-tradelog-key'] !== apiKey) return send(response, 401, { error: 'Unauthorized' })
  const url = new URL(request.url, `http://${request.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { status: 'ok', database: 'sqlite', mt5: 'not_connected' })
    if (request.method === 'GET' && url.pathname === '/api/trades') {
      const rows = database.prepare('SELECT * FROM trades ORDER BY close_time DESC').all()
      return send(response, 200, { trades: rows, total: rows.length })
    }
    if (request.method === 'GET' && parts[0] === 'api' && parts[1] === 'trades' && parts[2]) {
      const trade = database.prepare('SELECT * FROM trades WHERE id = ?').get(parts[2])
      return trade ? send(response, 200, trade) : send(response, 404, { error: 'Trade not found' })
    }
    if (request.method === 'POST' && parts[0] === 'api' && parts[1] === 'trades' && parts[2] && parts[3] === 'journal') {
      const body = await parseBody(request)
      const fields = ['strategy', 'setup', 'market_bias', 'entry_reason', 'exit_reason', 'went_well', 'went_wrong', 'lesson', 'emotion', 'screenshot_path']
      const updates = fields.filter((field) => Object.hasOwn(body, field))
      if (!updates.length) return send(response, 400, { error: 'No journal fields supplied' })
      const values = updates.map((field) => body[field])
      database.prepare(`UPDATE trades SET ${updates.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`).run(...values, parts[2])
      return send(response, 200, database.prepare('SELECT * FROM trades WHERE id = ?').get(parts[2]))
    }
    if (request.method === 'POST' && url.pathname === '/api/import') {
      const body = await parseBody(request)
      if (!Array.isArray(body.trades)) return send(response, 400, { error: 'Expected a trades array' })
      const existing = new Set(database.prepare('SELECT id FROM trades').all().map((trade) => trade.id))
      database.exec('BEGIN')
      try {
        body.trades.forEach((trade) => importTrade.run(trade.id, trade.ticket, trade.symbol, trade.direction, trade.volume, trade.entry, trade.exit, trade.stop_loss ?? null, trade.take_profit ?? null, trade.open_time, trade.close_time, trade.profit, trade.commission ?? 0, trade.swap ?? 0, trade.fees ?? 0, trade.magic_number ?? null, trade.comment ?? null))
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      const newTrades = body.trades.filter((trade) => !existing.has(trade.id)).length
      return send(response, 200, { status: 'ok', imported: body.trades.length, newTrades, duplicates: body.trades.length - newTrades })
    }
    if (request.method === 'POST' && url.pathname === '/api/sync') {
      const body = await parseBody(request)
      if (!body.login || !body.password || !body.server) return send(response, 400, { error: 'Account ID, investor password, and broker server are required' })
      const result = await runConnector(body)
      return send(response, 200, result)
    }
    return send(response, 404, { error: 'Route not found' })
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message : 'Unexpected server error' })
  }
})

server.listen(port, host, () => console.log(`Trade journal API listening on http://${host}:${port}`))
