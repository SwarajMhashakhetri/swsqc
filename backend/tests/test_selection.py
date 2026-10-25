from gale.domain.models import ForecastRow
from gale.domain.selection import ForecastIndex
from tests.helpers import at, forecast_run


def index() -> ForecastIndex:
    # Each publish starts at 21:00 the previous day, like real WINDFOR runs, so the
    # early hours of each run are hindcasts.
    return ForecastIndex(
        forecast_run("2026-01-14 07:30", "2026-01-13 21:00", [100.0] * 60)
        + forecast_run("2026-01-14 09:30", "2026-01-13 21:00", [200.0] * 60)
        # An irregular publish (12:25 instead of 11:30), as happened on 15 January.
        + forecast_run("2026-01-14 12:25", "2026-01-13 21:00", [300.0] * 60)
    )


def test_latest_publish_before_decision_wins() -> None:
    point = index().latest(at("2026-01-15 10:00"), as_of=at("2026-01-14 09:20"))
    assert point is not None
    assert point.publish_time == at("2026-01-14 07:30")
    assert point.generation_mw == 100.0


def test_decision_exactly_at_publish_time_sees_that_publish() -> None:
    point = index().latest(at("2026-01-15 10:00"), as_of=at("2026-01-14 09:30"))
    assert point is not None
    assert point.publish_time == at("2026-01-14 09:30")


def test_one_second_before_publish_does_not_see_it() -> None:
    point = index().latest(at("2026-01-15 10:00"), as_of=at("2026-01-14 09:29:59"))
    assert point is not None
    assert point.publish_time == at("2026-01-14 07:30")


def test_irregular_publish_time_is_picked_up_without_a_schedule() -> None:
    point = index().latest(at("2026-01-15 10:00"), as_of=at("2026-01-14 13:00"))
    assert point is not None
    assert point.publish_time == at("2026-01-14 12:25")


def test_hindcast_rows_are_never_selected() -> None:
    # 08:00 on the 14th had already begun before the 09:30 publish: that row is a hindcast.
    rows = index()
    point = rows.latest(at("2026-01-14 08:00"), as_of=at("2026-01-14 23:00"))
    assert point is not None
    assert point.publish_time == at("2026-01-14 07:30")
    assert rows.from_publish(at("2026-01-14 08:00"), at("2026-01-14 09:30")) is None


def test_hour_starting_exactly_at_publish_counts_as_forecast() -> None:
    row = ForecastRow(at("2026-01-14 09:00"), at("2026-01-14 09:00"), 5.0)
    assert row.is_forecast
    point = ForecastIndex([row]).latest(at("2026-01-14 09:00"), as_of=at("2026-01-14 09:00"))
    assert point is not None
    assert point.lead.total_seconds() == 0


def test_nothing_published_yet_returns_none() -> None:
    assert index().latest(at("2026-01-15 10:00"), as_of=at("2026-01-14 07:00")) is None


def test_hour_never_forecast_returns_none() -> None:
    assert index().latest(at("2026-02-20 10:00"), as_of=at("2026-01-14 13:00")) is None


def test_publish_queries() -> None:
    rows = index()
    assert rows.publish_times == [
        at("2026-01-14 07:30"),
        at("2026-01-14 09:30"),
        at("2026-01-14 12:25"),
    ]
    assert rows.latest_publish(at("2026-01-14 09:30")) == at("2026-01-14 09:30")
    assert rows.latest_publish(at("2026-01-14 07:00")) is None
    assert rows.publishes_between(at("2026-01-14 07:30"), at("2026-01-14 12:25")) == [
        at("2026-01-14 09:30"),
        at("2026-01-14 12:25"),
    ]
    assert rows.from_publish(at("2026-01-15 10:00"), at("2026-01-14 08:00")) is None
