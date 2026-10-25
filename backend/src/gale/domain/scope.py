"""What "data relevant to January 2026 decisions" means, as concrete fetch windows."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from gale.domain.periods import (
    DELIVERY_DAY_OPENS,
    HALF_HOUR,
    days_between,
    decision_instant,
    delivery_window,
    to_local,
)

VINTAGE_LOOKBACK = timedelta(hours=24)


@dataclass(frozen=True, slots=True)
class Scope:
    """Decisions taken on ``first_decision_date`` .. ``last_decision_date`` (UK dates)."""

    first_decision_date: date
    last_decision_date: date

    @property
    def delivery_dates(self) -> list[date]:
        """Each decision on D-1 buys delivery day D."""
        one_day = timedelta(days=1)
        return days_between(self.first_decision_date + one_day, self.last_decision_date + one_day)

    @property
    def publish_window(self) -> tuple[datetime, datetime]:
        """Forecasts that could be on the desk at any decision, plus 24 h of earlier vintages.

        The earliest decision is 00:00 UK on the first decision date; the latest
        is just before the first delivery hour opens at 23:00 UK on D-1.
        """
        days = self.delivery_dates
        earliest = decision_instant(days[0], time(0, 0)) - VINTAGE_LOOKBACK
        latest = decision_instant(days[-1], DELIVERY_DAY_OPENS)
        return earliest, latest

    @property
    def settlement_dates(self) -> tuple[date, date]:
        """UK settlement dates whose half-hours overlap the delivery days in scope."""
        days = self.delivery_dates
        first = to_local(delivery_window(days[0]).start).date()
        last = to_local(delivery_window(days[-1]).end - HALF_HOUR).date()
        return first, last
