from datetime import UTC, date, datetime, time

from gale.domain.periods import Window, days_between, decision_instant, delivery_window, to_local
from gale.domain.scope import Scope
from tests.helpers import at


def test_delivery_day_runs_2300_to_2300_uk_in_winter() -> None:
    window = delivery_window(date(2026, 1, 15))
    assert window.start == at("2026-01-14 23:00")
    assert window.end == at("2026-01-15 23:00")
    assert len(list(window.hours())) == 24


def test_delivery_day_follows_bst_in_summer() -> None:
    window = delivery_window(date(2026, 7, 15))
    assert window.start == at("2026-07-14 22:00")
    assert window.end == at("2026-07-15 22:00")


def test_clock_change_days_have_23_and_25_hours() -> None:
    assert len(list(delivery_window(date(2026, 3, 29)).hours())) == 23
    assert len(list(delivery_window(date(2026, 10, 25)).hours())) == 25


def test_decision_instant_is_uk_time_on_previous_day() -> None:
    assert decision_instant(date(2026, 1, 15), time(9, 20)) == at("2026-01-14 09:20")
    assert decision_instant(date(2026, 7, 15), time(9, 20)) == at("2026-07-14 08:20")


def test_window_membership_is_half_open() -> None:
    window = Window(at("2026-01-01 00:00"), at("2026-01-01 01:00"))
    assert at("2026-01-01 00:00") in window
    assert at("2026-01-01 01:00") not in window
    assert "not a datetime" not in window


def test_to_local_and_days_between() -> None:
    assert to_local(datetime(2026, 7, 1, 12, tzinfo=UTC)).hour == 13
    assert days_between(date(2026, 1, 30), date(2026, 2, 1)) == [
        date(2026, 1, 30),
        date(2026, 1, 31),
        date(2026, 2, 1),
    ]


def test_january_scope_maps_decisions_to_fetch_windows() -> None:
    scope = Scope(date(2026, 1, 1), date(2026, 1, 31))
    assert scope.delivery_dates[0] == date(2026, 1, 2)
    assert scope.delivery_dates[-1] == date(2026, 2, 1)
    assert len(scope.delivery_dates) == 31
    # Earliest decision 00:00 on 1 Jan, minus 24 h of vintages; latest just before 23:00 on 31 Jan.
    assert scope.publish_window == (at("2025-12-31 00:00"), at("2026-01-31 23:00"))
    # Delivery day 2 Jan opens 23:00 on 1 Jan, so settlement date 1 Jan is needed.
    assert scope.settlement_dates == (date(2026, 1, 1), date(2026, 2, 1))
