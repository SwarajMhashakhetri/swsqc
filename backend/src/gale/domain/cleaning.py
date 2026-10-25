"""Deterministic de-duplication of raw rows.

Neither dataset showed duplicates for January 2026, but both are revisable at
source and the client fetches in overlapping chunks, so the rules are explicit.
"""

from collections.abc import Iterable
from datetime import datetime

from gale.domain.models import ActualRow, ForecastRow


def dedupe_forecasts(rows: Iterable[ForecastRow]) -> list[ForecastRow]:
    """One row per ``(publishTime, startTime)``; on conflict the row seen last wins.

    Rows arrive in chronological chunk order, so "last" means "most recently
    fetched", which is the only tie-breaker a publish/start pair leaves us.
    """
    unique: dict[tuple[datetime, datetime], ForecastRow] = {}
    for row in rows:
        unique[(row.publish_time, row.start_time)] = row
    return sorted(unique.values(), key=lambda r: (r.publish_time, r.start_time))


def dedupe_actuals(rows: Iterable[ActualRow]) -> list[ActualRow]:
    """One row per settlement period ``startTime``: the latest ``publishTime`` wins (a revision)."""
    latest: dict[datetime, ActualRow] = {}
    for row in rows:
        current = latest.get(row.start_time)
        if current is None or row.publish_time >= current.publish_time:
            latest[row.start_time] = row
    return sorted(latest.values(), key=lambda r: r.start_time)
