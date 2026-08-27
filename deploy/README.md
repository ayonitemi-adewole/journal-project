# TradeLog VPS deployment

This setup runs the frontend, Node API, SQLite database, and MT5 connector on one Windows VPS. Caddy provides HTTPS and serves the frontend. Node listens only on localhost, so port 3001 is not public.

## 1. Buy and prepare a VPS

Use a Windows Server VPS that stays powered on. The VPS must be able to run the MT5 desktop terminal. Connect to it using Windows Remote Desktop and install:

- Node.js LTS from https://nodejs.org/
- Python 3 from https://www.python.org/downloads/windows/
- MetaTrader 5 from your broker or https://www.metatrader5.com/
- Caddy from https://caddyserver.com/download
- NSSM from https://nssm.cc/download

During Python installation, enable **Add Python to PATH**. In the VPS provider's DNS panel, create an `A` record such as `tradelog.example.com` pointing to the VPS public IP.

## 2. Copy and build the project

Copy the entire project to `C:\TradeLog` on the VPS. PowerShell commands on the VPS:

```powershell
Set-Location C:\TradeLog
npm ci
python -m pip install -r connector\requirements.txt
npm run build
```

Confirm that `C:\TradeLog\dist\index.html` exists. Keep `server\journal.db` backed up; it contains the journal data and is intentionally ignored by git.

## 3. Install and test MT5

Install MT5 on the VPS and make sure the broker server is available. The app's sync form sends the account ID, investor password, broker server, and optional terminal path to the API. The MT5 terminal and Python package must be installed on the VPS, but you do not need to run the connector manually.

Use an investor/read-only password. Do not put broker credentials in git or in this README.

## 4. Create the API service

Open an **Administrator PowerShell** window. Replace the API key with a long random value and replace the Python path if necessary.

```powershell
$nssm = "C:\Tools\nssm\win64\nssm.exe"
& $nssm install TradeLogApi "C:\Program Files\nodejs\node.exe" "C:\TradeLog\server\index.mjs"
& $nssm set TradeLogApi AppDirectory "C:\TradeLog"
& $nssm set TradeLogApi AppEnvironmentExtra API_HOST=127.0.0.1 API_PORT=3001 TRADELOG_API_KEY=REPLACE_WITH_A_LONG_RANDOM_SECRET API_CORS_ORIGIN=https://tradelog.example.com
& $nssm set TradeLogApi Start SERVICE_AUTO_START
& $nssm start TradeLogApi
```

Check the API locally on the VPS:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/health -Headers @{ 'X-TradeLog-Key' = 'REPLACE_WITH_A_LONG_RANDOM_SECRET' }
```

The response should contain `"status":"ok"`.

## 5. Configure Caddy and HTTPS

Copy `deploy\Caddyfile` to `C:\Caddy\Caddyfile`, then replace `tradelog.example.com` with your real domain. Ensure the `root` path matches the project location.

In Administrator PowerShell:

```powershell
New-Item -ItemType Directory -Force C:\Caddy | Out-Null
caddy validate --config C:\Caddy\Caddyfile
caddy run --config C:\Caddy\Caddyfile
```

While that command is running, visit `https://tradelog.example.com`. Once it works, stop it with Ctrl+C and install Caddy as a service:

```powershell
caddy service install --config C:\Caddy\Caddyfile
Start-Service caddy
```

Caddy automatically requests and renews the HTTPS certificate. Your DNS record must already point to the VPS, and inbound TCP ports 80 and 443 must be allowed.

## 6. Configure the Windows firewall

Allow only web traffic from the internet. Do not open port 3001 publicly.

```powershell
New-NetFirewallRule -DisplayName "TradeLog HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "TradeLog HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

## 7. Open the deployed application

Go to `https://tradelog.example.com`. Because the frontend and API share the same origin, no root `.env` file or `VITE_API_URL` value is needed for this setup. The frontend sends `X-TradeLog-Key` only when `VITE_API_KEY` was present at build time, so set it before building if the API key is enabled:

```powershell
$env:VITE_API_KEY = "REPLACE_WITH_A_LONG_RANDOM_SECRET"
npm run build
Restart-Service caddy
```

The API key must match the `TRADELOG_API_KEY` service value exactly.

## 8. Backups and updates

Back up `C:\TradeLog\server\journal.db` regularly. To deploy an update:

```powershell
Set-Location C:\TradeLog
# Copy the updated project files here first; preserve server\journal.db.
npm ci
npm run build
Restart-Service TradeLogApi
Restart-Service caddy
```

If the frontend is unavailable, inspect `C:\Caddy\Caddyfile`. If the API is unavailable, run `Get-Service TradeLogApi` and inspect the service's configured stdout/stderr paths with NSSM.
