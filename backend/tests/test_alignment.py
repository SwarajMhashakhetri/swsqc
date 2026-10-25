from gale.domain.alignment import hourly_actuals
from tests.helpers import at, half_hours


def test_hourly_actual_is_mean_of_both_settlement_periods() -> None:
    hourly = hourly_actuals(half_hours("2026-01-15 10:00", [1000.0, 2000.0, 3000.0, 3500.0]))
    assert hourly == {at("2026-01-15 10:00"): 1500.0, at("2026-01-15 11:00"): 3250.0}


def test_hour_with_a_missing_half_is_a_gap_not_a_guess() -> None:
    rows = half_hours("2026-01-15 10:00", [1000.0, 2000.0, 3000.0, 3500.0])
    del rows[3]  # 11:30 missing
    assert hourly_actuals(rows) == {at("2026-01-15 10:00"): 1500.0}


def test_leading_half_hour_alone_does_not_form_an_hour() -> None:
    assert hourly_actuals(half_hours("2026-01-15 10:30", [1000.0, 2000.0])) == {}
