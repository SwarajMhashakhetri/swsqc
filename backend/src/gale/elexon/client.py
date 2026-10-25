"""Async client for the two Elexon BMRS streams Gale needs.

Ranges are split into chunks fetched concurrently, every request is retried
with exponential backoff on transient failures, and every payload is
validated. Because Elexon silently ignores query parameters it does not
recognise (and then returns *today's* data), each response is also checked
against the window that was asked for.
"""

import asyncio
import logging
import time as clock
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from pydantic import ValidationError

from gale.concurrency import gather
from gale.domain.models import ActualRow, ForecastRow
from gale.elexon.schemas import FUELHH_PAYLOAD, WINDFOR_PAYLOAD

logger = logging.getLogger(__name__)

WIND_FUEL_TYPE = "WIND"
RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
MAX_CONCURRENT_REQUESTS = 4
MAX_RETRY_DELAY_S = 10.0


class ElexonError(RuntimeError):
    """Elexon could not be reached or returned something unusable."""


class ElexonClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        retries: int = 3,
        backoff_s: float = 0.5,
        chunk_days: int = 7,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._http = http
        self._retries = retries
        self._backoff_s = backoff_s
        self._chunk = timedelta(days=chunk_days)
        self._sleep = sleep
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    async def wind_forecasts(
        self, published_from: datetime, published_to: datetime
    ) -> list[ForecastRow]:
        """WINDFOR rows whose ``publishTime`` lies in ``[published_from, published_to]``."""
        windows = _split(published_from, published_to, self._chunk)
        chunks = await gather(self._forecast_chunk(start, end) for start, end in windows)
        return [row for chunk in chunks for row in chunk]

    async def wind_actuals(self, first_day: date, last_day: date) -> list[ActualRow]:
        """FUELHH wind rows for settlement dates ``first_day`` to ``last_day`` inclusive."""
        days = (last_day - first_day).days + 1
        step = self._chunk.days
        windows = [
            (
                first_day + timedelta(days=offset),
                min(first_day + timedelta(days=offset + step - 1), last_day),
            )
            for offset in range(0, days, step)
        ]
        chunks = await gather(self._actual_chunk(start, end) for start, end in windows)
        return [row for chunk in chunks for row in chunk]

    async def _forecast_chunk(self, start: datetime, end: datetime) -> list[ForecastRow]:
        payload = await self._get(
            "/datasets/WINDFOR/stream",
            {"publishDateTimeFrom": _iso(start), "publishDateTimeTo": _iso(end)},
        )
        try:
            records = WINDFOR_PAYLOAD.validate_python(payload)
        except ValidationError as exc:
            raise ElexonError(f"WINDFOR payload invalid ({exc.error_count()} errors)") from exc
        rows = []
        for record in records:
            if not start <= record.publish_time <= end:
                raise ElexonError("WINDFOR returned rows outside the requested publish window")
            rows.append(
                ForecastRow(
                    publish_time=record.publish_time.astimezone(UTC),
                    start_time=record.start_time.astimezone(UTC),
                    generation_mw=record.generation,
                )
            )
        return rows

    async def _actual_chunk(self, first_day: date, last_day: date) -> list[ActualRow]:
        payload = await self._get(
            "/datasets/FUELHH/stream",
            {
                "settlementDateFrom": first_day.isoformat(),
                "settlementDateTo": last_day.isoformat(),
                "fuelType": WIND_FUEL_TYPE,
            },
        )
        try:
            records = FUELHH_PAYLOAD.validate_python(payload)
        except ValidationError as exc:
            raise ElexonError(f"FUELHH payload invalid ({exc.error_count()} errors)") from exc
        rows = []
        for record in records:
            if not first_day <= record.settlement_date <= last_day:
                raise ElexonError("FUELHH returned rows outside the requested settlement dates")
            if record.fuel_type != WIND_FUEL_TYPE:
                continue
            rows.append(
                ActualRow(
                    start_time=record.start_time.astimezone(UTC),
                    publish_time=record.publish_time.astimezone(UTC),
                    generation_mw=record.generation,
                )
            )
        return rows

    async def _get(self, path: str, params: dict[str, str]) -> Any:
        attempt = 0
        while True:
            started = clock.perf_counter()
            try:
                async with self._semaphore:
                    response = await self._http.get(path, params=params)
            except httpx.TransportError as exc:
                failure = type(exc).__name__
                retry_after = None
            else:
                elapsed_ms = round((clock.perf_counter() - started) * 1000)
                if response.is_success:
                    logger.info(
                        "elexon request ok",
                        extra={
                            "path": path,
                            "params": params,
                            "ms": elapsed_ms,
                            "attempt": attempt,
                        },
                    )
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise ElexonError(f"{path} returned a non-JSON body") from exc
                if response.status_code not in RETRYABLE_STATUS:
                    raise ElexonError(f"{path} returned HTTP {response.status_code}")
                failure = f"HTTP {response.status_code}"
                retry_after = _retry_after(response)

            if attempt >= self._retries:
                raise ElexonError(f"{path} failed after {attempt + 1} attempts ({failure})")
            delay = min(
                retry_after if retry_after is not None else self._backoff_s * 2**attempt,
                MAX_RETRY_DELAY_S,
            )
            logger.warning(
                "elexon request retrying",
                extra={"path": path, "failure": failure, "attempt": attempt, "delay_s": delay},
            )
            await self._sleep(delay)
            attempt += 1


def _split(start: datetime, end: datetime, chunk: timedelta) -> Sequence[tuple[datetime, datetime]]:
    """Inclusive sub-windows covering ``[start, end]``; neighbours share a boundary instant.

    Elexon treats both bounds as inclusive, so a publish exactly on a boundary
    can come back twice; the repository's de-duplication absorbs that.
    """
    if end < start:
        raise ValueError("window end precedes start")
    windows = []
    cursor = start
    while True:
        upper = min(cursor + chunk, end)
        windows.append((cursor, upper))
        if upper >= end:
            return windows
        cursor = upper


def _iso(instant: datetime) -> str:
    return instant.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return max(float(value), 0.0)
    except ValueError:
        return None
