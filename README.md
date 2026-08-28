# TradeLog

Personal MT5 trading journal dashboard.

## Development

Run the frontend with `npm run dev` and the local SQLite API with `npm run api`.
The API creates `server/journal.db` on first start and exposes:

- `GET /api/health`
- `GET /api/trades`
- `GET /api/trades/:id`
- `POST /api/trades/:id/journal`
- `POST /api/sync`
- `POST /api/import`

The API is read-only with respect to MT5. It stores imported trades and journal metadata, but has no order placement or modification capability.

Trades are scoped by MT5 account ID and broker server, so accounts cannot merge trades even when MT5 position IDs overlap. Rows created before account scoping are retained as `legacy` data and are not automatically assigned to a new account.

## Remote deployment

The browser can use a hosted API by creating a root `.env` file with `VITE_API_URL=https://your-api-domain.example`. For a private deployment, set the same random value in `VITE_API_KEY` and `TRADELOG_API_KEY`, set `API_CORS_ORIGIN` to the frontend origin, and run the API with `API_HOST=0.0.0.0`. Put HTTPS in front of the API with a reverse proxy such as Caddy or nginx. The Windows VPS running the API must have MT5 installed; your personal computer does not.

## MT5 import

Install Python and the connector dependency with `python -m pip install -r connector/requirements.txt`. The MT5 desktop terminal must be installed, but you do not need to open or log into it manually. Copy `connector/.env.example` to `connector/.env` and set your account ID (`MT5_LOGIN`), investor password (`MT5_PASSWORD`), broker server (`MT5_SERVER`), and, if needed, the path to `terminal64.exe` (`MT5_TERMINAL_PATH`). Set those values in the shell environment, then start the API and run `python connector/mt5_connector.py`; the connector will initialize the installed terminal with those credentials.

PowerShell example (the password remains only in the current shell session):

```powershell
$env:MT5_LOGIN = "12345678"
$env:MT5_PASSWORD = "your-investor-password"
$env:MT5_SERVER = "YourBroker-Demo"
$env:MT5_TERMINAL_PATH = "C:\Program Files\MetaTrader 5\terminal64.exe"
python connector/mt5_connector.py
```

Use the investor password, not the master trading password. Investor access is read-only, which matches this journal's design. The broker server name is required by MT5 even though the account ID and password identify the account.

The connector reads closed MT5 deals only. Deals sharing a `position_id` are reconstructed into one trade with weighted entry and exit prices, combined volume, profit, commission, swap, fees, and duration. Re-running the importer is safe because position IDs are used as stable trade IDs and the API upserts them.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
