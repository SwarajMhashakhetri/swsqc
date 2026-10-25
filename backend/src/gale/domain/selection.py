"""Which forecast was on the desk at a given instant.

The rule is deliberately schedule-agnostic: for a target hour, take the most
recent WINDFOR publish whose ``publishTime`` is at or before the decision
instant *and* at or before the start of that hour. The second condition drops
hindcast rows (hours that had already begun when the publish went out), which
are not forecasts and must never be scored as such.
"""

from bisect import bisect_right
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime

from gale.domain.models import ForecastPoint, ForecastRow


class ForecastIndex:
    """Forecast rows indexed by target hour, each with publish times in ascending order."""

    def __init__(self, rows: Iterable[ForecastRow]) -> None:
        grouped: defaultdict[datetime, list[ForecastRow]] = defaultdict(list)
        publish_times: set[datetime] = set()
        for row in rows:
            if row.is_forecast:
                grouped[row.start_time].append(row)
                publish_times.add(row.publish_time)
        self._by_start: dict[datetime, tuple[list[datetime], list[ForecastRow]]] = {}
        for start, group in grouped.items():
            group.sort(key=lambda r: r.publish_time)
            self._by_start[start] = ([r.publish_time for r in group], group)
        self._publish_times = sorted(publish_times)

    @property
    def publish_times(self) -> list[datetime]:
        return list(self._publish_times)

    def latest(self, start_time: datetime, as_of: datetime) -> ForecastPoint | None:
        """Most recent forecast for ``start_time`` that was public at ``as_of``."""
        entry = self._by_start.get(start_time)
        if entry is None:
            return None
        times, rows = entry
        position = bisect_right(times, min(as_of, start_time)) - 1
        if position < 0:
            return None
        row = rows[position]
        return ForecastPoint(row.start_time, row.publish_time, row.generation_mw)

    def from_publish(self, start_time: datetime, publish_time: datetime) -> ForecastPoint | None:
        """The value a specific publish gave for ``start_time``, if it forecast that hour."""
        entry = self._by_start.get(start_time)
        if entry is None:
            return None
        times, rows = entry
        position = bisect_right(times, publish_time) - 1
        if position < 0 or times[position] != publish_time:
            return None
        row = rows[position]
        return ForecastPoint(row.start_time, row.publish_time, row.generation_mw)

    def latest_publish(self, as_of: datetime) -> datetime | None:
        """The most recent publish time at or before ``as_of``."""
        position = bisect_right(self._publish_times, as_of) - 1
        return self._publish_times[position] if position >= 0 else None

    def publishes_between(self, after: datetime, until: datetime) -> list[datetime]:
        """Publish times in the half-open interval ``(after, until]``."""
        lo = bisect_right(self._publish_times, after)
        hi = bisect_right(self._publish_times, until)
        return self._publish_times[lo:hi]

    def rows(self) -> Iterable[ForecastRow]:
        for _, group in self._by_start.values():
            yield from group
