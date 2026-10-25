"""Market calendar: delivery days, decision instants and hourly grids.

A GB day-ahead *delivery day* D follows the exchanges' contract day, not the
settlement day: both the EPEX SPOT GB 60-min auction ("Hour 23-00 ... until
Hour 22-23", base block "23:00 to 23:00") and the Nord Pool N2EX GB auction
("the following day starting from 23:00 UK time") deliver from 23:00 UK time
on D-1 to 23:00 UK time on D. This is the EFA day used across GB power.

Every conversion between UK local time and UTC goes through ``zoneinfo``, so
clock-change days come out as 23- or 25-hour days without special cases.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
HOUR = timedelta(hours=1)
HALF_HOUR = timedelta(minutes=30)
DELIVERY_DAY_OPENS = time(23, 0)


@dataclass(frozen=True, slots=True)
class Window:
    """Half-open UTC interval ``[start, end)``."""

    start: datetime
    end: datetime

    def __contains__(self, instant: object) -> bool:
        return isinstance(instant, datetime) and self.start <= instant < self.end

    def hours(self) -> Iterator[datetime]:
        cursor = self.start
        while cursor < self.end:
            yield cursor
            cursor += HOUR


def local_instant(day: date, local_time: time) -> datetime:
    """UTC instant of a UK wall-clock time."""
    return datetime.combine(day, local_time, LONDON).astimezone(UTC)


def delivery_window(day: date) -> Window:
    """Delivery day ``day``: 23:00 UK on the previous day to 23:00 UK on ``day``."""
    return Window(
        local_instant(day - timedelta(days=1), DELIVERY_DAY_OPENS),
        local_instant(day, DELIVERY_DAY_OPENS),
    )


def decision_instant(delivery_day: date, local_time: time) -> datetime:
    """UTC instant of a decision taken at UK ``local_time`` on the day before delivery."""
    return local_instant(delivery_day - timedelta(days=1), local_time)


def to_local(instant: datetime) -> datetime:
    return instant.astimezone(LONDON)


def days_between(first: date, last: date) -> list[date]:
    """Inclusive list of calendar days."""
    return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]
