"""Putting half-hourly outturn on the hourly forecast grid.

WINDFOR is hourly; FUELHH is half-hourly average MW. Each hour's actual is the
mean of its two settlement periods (``HH:00`` and ``HH:30``), which equals the
MWh delivered in that hour and matches the hourly day-ahead products the desk
buys. An hour with either half missing is left as a gap rather than guessed.
"""

from collections.abc import Iterable
from datetime import datetime

from gale.domain.models import ActualRow
from gale.domain.periods import HALF_HOUR


def hourly_actuals(rows: Iterable[ActualRow]) -> dict[datetime, float]:
    by_start = {row.start_time: row.generation_mw for row in rows}
    hourly: dict[datetime, float] = {}
    for start, first_half in by_start.items():
        if start.minute != 0 or start.second != 0:
            continue
        second_half = by_start.get(start + HALF_HOUR)
        if second_half is not None:
            hourly[start] = (first_half + second_half) / 2
    return hourly
