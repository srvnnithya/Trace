from __future__ import annotations

import json
import math
import os
import statistics
import time
from datetime import datetime, time as clock_time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import yfinance as yf


HOST = "127.0.0.1"
PORT = int(os.environ.get("TRACE_YFINANCE_PORT", "8765"))
IST = ZoneInfo("Asia/Kolkata")
CACHE_SECONDS = 300
CACHE: dict[str, tuple[float, dict[str, object]]] = {}
INDEX_SYMBOLS = {
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "NIFTYIT": "^CNXIT",
    "NIFTYAUTO": "^CNXAUTO",
    "NIFTYFMCG": "^CNXFMCG",
}


def yahoo_symbol(symbol: str, exchange: str) -> str:
    if symbol in INDEX_SYMBOLS:
        return INDEX_SYMBOLS[symbol]
    suffix = ".BO" if exchange == "BSE" else ".NS"
    return f"{symbol}{suffix}"


def market_is_open(now: datetime | None = None) -> bool:
    current = now or datetime.now(IST)
    return (
        current.weekday() < 5
        and clock_time(9, 15) <= current.time() <= clock_time(15, 30)
    )


def quote_payload(symbol: str, exchange: str) -> dict[str, object]:
    ticker_symbol = yahoo_symbol(symbol, exchange)
    cached = CACHE.get(ticker_symbol)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    history = yf.Ticker(ticker_symbol).history(
        period="1y", interval="1d", auto_adjust=False, actions=False
    )
    history = history.dropna(subset=["Close"])
    if history.empty:
        raise ValueError(f"No Yahoo Finance data for {symbol}.")

    closes = [float(value) for value in history["Close"].tolist()]
    volumes = [int(value) if not math.isnan(value) else 0 for value in history["Volume"]]
    recent_closes = closes[-21:]
    daily_returns = [
        (current - previous) / previous
        for previous, current in zip(recent_closes, recent_closes[1:])
        if previous
    ]
    price = closes[-1]
    previous_close = closes[-2] if len(closes) > 1 else price
    source_index = history.index[-1]
    source_time = source_index.to_pydatetime()
    if source_time.tzinfo is None:
        source_time = source_time.replace(tzinfo=IST)
    source_time = source_time.astimezone(IST).replace(
        hour=15, minute=30, second=0, microsecond=0
    )

    payload: dict[str, object] = {
        "provider": "Yahoo Finance",
        "symbol": symbol,
        "price": round(price, 4),
        "volume": volumes[-1],
        "day_return": (price - previous_close) / previous_close if previous_close else 0,
        "source_timestamp": source_time.isoformat(),
        "high_52w": max(closes),
        "low_52w": min(closes),
        "average_volume_20d": round(statistics.fmean(volumes[-20:])),
        "normal_daily_volatility": max(
            statistics.pstdev(daily_returns) if len(daily_returns) > 1 else 0,
            0.005,
        ),
        "price_path": [round(value, 4) for value in closes[-10:]],
        "is_market_open": market_is_open(),
    }
    CACHE[ticker_symbol] = (time.time(), payload)
    return payload


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, body: dict[str, object]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "provider": "Yahoo Finance"})
            return
        if parsed.path != "/quote":
            self.send_json(404, {"error": "Unknown route."})
            return
        query = parse_qs(parsed.query)
        symbol = query.get("symbol", [""])[0].strip().upper()
        exchange = query.get("exchange", ["NSE"])[0].strip().upper()
        if not symbol or not symbol.replace("-", "").isalnum():
            self.send_json(400, {"error": "A valid symbol is required."})
            return
        try:
            self.send_json(200, quote_payload(symbol, exchange))
        except Exception as error:
            message = str(error).replace("\n", " ")[:240]
            self.send_json(502, {"error": message or "Yahoo Finance unavailable."})

    def log_message(self, _format: str, *_args: object) -> None:
        return


if __name__ == "__main__":
    print(f"TRACE Yahoo Finance fallback listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
