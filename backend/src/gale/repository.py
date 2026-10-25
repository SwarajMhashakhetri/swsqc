"""Loads the January dataset once per process and shares it between requests.

The data is historical and immutable, so a process-wide in-memory cache is the
whole storage story: no database, no Redis. Cold requests that arrive together
share one in-flight load (single-flight), so N concurrent requests cause one
set of Elexon calls, and a failed load is not cached so the next request
retries.
"""

import asyncio
import logging
import time as clock
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

import httpx

from gale.concurrency import first_leaf
from gale.config import Settings
from gale.domain.analysis import Analytics
from gale.domain.cleaning import dedupe_actuals, dedupe_forecasts
from gale.domain.scope import Scope
from gale.elexon.client import ElexonClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Dataset:
    analytics: Analytics
    scope: Scope
    loaded_at: datetime


class WindRepository(Protocol):
    async def dataset(self) -> Dataset: ...


class ElexonRepository:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._scope = Scope(settings.first_decision_date, settings.last_decision_date)
        self._dataset: Dataset | None = None
        self._loading: asyncio.Task[Dataset] | None = None

    async def dataset(self) -> Dataset:
        if self._dataset is not None:
            return self._dataset
        # Check-and-set below has no await in between, so it is atomic on the event loop.
        loading = self._loading
        if (
            loading is None
            or loading.done()
            or loading.get_loop() is not asyncio.get_running_loop()
        ):
            loading = asyncio.ensure_future(self._load())
            self._loading = loading
        try:
            # Shield: one caller disconnecting must not cancel the load others are waiting on.
            self._dataset = await asyncio.shield(loading)
        finally:
            if loading.done() and self._loading is loading:
                self._loading = None
        return self._dataset

    async def _load(self) -> Dataset:
        started = clock.perf_counter()
        settings = self._settings
        published_from, published_to = self._scope.publish_window
        first_day, last_day = self._scope.settlement_dates
        async with httpx.AsyncClient(
            base_url=str(settings.elexon_base_url).rstrip("/"),
            timeout=settings.http_timeout_s,
            headers={"Accept": "application/json", "User-Agent": "gale/1.0"},
            transport=self._transport,
        ) as http:
            client = ElexonClient(
                http,
                retries=settings.http_retries,
                backoff_s=settings.http_backoff_s,
                chunk_days=settings.fetch_chunk_days,
            )
            try:
                async with asyncio.TaskGroup() as group:
                    forecasts_task = group.create_task(
                        client.wind_forecasts(published_from, published_to)
                    )
                    actuals_task = group.create_task(client.wind_actuals(first_day, last_day))
            except ExceptionGroup as failures:
                raise first_leaf(failures) from None
        raw_forecasts, raw_actuals = forecasts_task.result(), actuals_task.result()
        forecasts = dedupe_forecasts(raw_forecasts)
        actuals = dedupe_actuals(raw_actuals)
        logger.info(
            "dataset loaded",
            extra={
                "forecast_rows": len(forecasts),
                "forecast_duplicates": len(raw_forecasts) - len(forecasts),
                "actual_rows": len(actuals),
                "actual_duplicates": len(raw_actuals) - len(actuals),
                "ms": round((clock.perf_counter() - started) * 1000),
            },
        )
        analytics = Analytics(forecasts, actuals, self._scope.delivery_dates)
        return Dataset(analytics=analytics, scope=self._scope, loaded_at=datetime.now(UTC))
