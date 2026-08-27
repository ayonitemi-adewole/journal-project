"""Read-only MetaTrader 5 importer for TradeLog.

This script never sends orders. It reads closed deals, reconstructs positions,
and upserts them into the local journal API.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import os
from urllib.request import Request, urlopen

ENV_FILE = Path(__file__).with_name(".env")
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

API_URL = os.getenv("TRADELOG_API_URL", "http://localhost:3001/api/import")
TRADELOG_API_KEY = os.getenv("TRADELOG_API_KEY", "")
MT5_LOGIN = os.getenv("MT5_LOGIN")
MT5_PASSWORD = os.getenv("MT5_PASSWORD")
MT5_SERVER = os.getenv("MT5_SERVER")
MT5_TERMINAL_PATH = os.getenv("MT5_TERMINAL_PATH")


def iso_time(timestamp: int | float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def weighted_price(deals: list[Any], volume_key: str) -> float:
    total_volume = sum(float(getattr(deal, volume_key, 0)) for deal in deals)
    if total_volume == 0:
        return 0.0
    return sum(float(deal.price) * float(getattr(deal, volume_key, 0)) for deal in deals) / total_volume


def reconstruct_positions(mt5: Any, deals: Any) -> list[dict[str, Any]]:
    grouped: dict[int, list[Any]] = defaultdict(list)
    for deal in deals or []:
        position_id = int(getattr(deal, "position_id", 0))
        if position_id:
            grouped[position_id].append(deal)

    reconstructed = []
    for position_id, position_deals in grouped.items():
        entries = [deal for deal in position_deals if deal.entry == mt5.DEAL_ENTRY_IN]
        exits = [deal for deal in position_deals if deal.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY)]
        if not entries or not exits:
            continue

        first_entry = min(entries, key=lambda deal: deal.time)
        last_exit = max(exits, key=lambda deal: deal.time)
        volume = sum(float(deal.volume) for deal in entries)
        profit = sum(float(getattr(deal, "profit", 0)) for deal in position_deals)
        commission = sum(float(getattr(deal, "commission", 0)) for deal in position_deals)
        swap = sum(float(getattr(deal, "swap", 0)) for deal in position_deals)
        fees = sum(float(getattr(deal, "fee", 0)) for deal in position_deals)
        direction = "Buy" if first_entry.type == mt5.DEAL_TYPE_BUY else "Sell"

        reconstructed.append({
            "id": f"MT5-{position_id}",
            "ticket": str(position_id),
            "symbol": first_entry.symbol,
            "direction": direction,
            "volume": round(volume, 8),
            "entry": weighted_price(entries, "volume"),
            "exit": weighted_price(exits, "volume"),
            "stop_loss": float(first_entry.sl) if getattr(first_entry, "sl", 0) else None,
            "take_profit": float(first_entry.tp) if getattr(first_entry, "tp", 0) else None,
            "open_time": iso_time(first_entry.time),
            "close_time": iso_time(last_exit.time),
            "profit": round(profit, 2),
            "commission": round(commission, 2),
            "swap": round(swap, 2),
            "fees": round(fees, 2),
            "magic_number": int(getattr(first_entry, "magic", 0)),
            "comment": getattr(first_entry, "comment", ""),
        })
    return reconstructed


def post_import(trades: list[dict[str, Any]]) -> dict[str, Any]:
    payload = json.dumps({"trades": trades}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if TRADELOG_API_KEY:
        headers["X-TradeLog-Key"] = TRADELOG_API_KEY
    request = Request(API_URL, data=payload, headers=headers, method="POST")
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def main() -> None:
    try:
        import MetaTrader5 as mt5
    except ImportError as error:
        raise SystemExit("MetaTrader5 is not installed. Run: python -m pip install -r connector/requirements.txt") from error

    if not MT5_LOGIN or not MT5_PASSWORD or not MT5_SERVER:
        raise SystemExit("Set MT5_LOGIN, MT5_PASSWORD, and MT5_SERVER before starting the connector.")

    initialize_args = {
        "login": int(MT5_LOGIN),
        "password": MT5_PASSWORD,
        "server": MT5_SERVER,
    }
    if MT5_TERMINAL_PATH:
        initialize_args["path"] = MT5_TERMINAL_PATH

    if not mt5.initialize(**initialize_args):
        error = mt5.last_error()
        raise SystemExit(f"Could not connect to MetaTrader 5: {error}. Check the account ID, investor password, server, and terminal path.")

    try:
        start = datetime(2000, 1, 1, tzinfo=timezone.utc)
        end = datetime.now(timezone.utc)
        deals = mt5.history_deals_get(start, end)
        if deals is None:
            raise SystemExit(f"MT5 history request failed: {mt5.last_error()}")
        trades = reconstruct_positions(mt5, deals)
        result = post_import(trades)
        print(json.dumps({"mt5_connected": True, **result}, indent=2))
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
