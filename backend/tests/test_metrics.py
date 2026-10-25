import math
import statistics

import pytest

from gale.domain.metrics import histogram, quantile, summarize


def test_quantile_matches_statistics_inclusive_method() -> None:
    values = sorted([3.0, -1.0, 7.5, 2.0, 10.0, 4.0, -6.0])
    deciles = statistics.quantiles(values, n=10, method="inclusive")
    for i, expected in enumerate(deciles, start=1):
        assert quantile(values, i / 10) == pytest.approx(expected)


def test_quantile_endpoints_and_interpolation() -> None:
    values = [10.0, 20.0, 30.0, 40.0]
    assert quantile(values, 0.0) == 10.0
    assert quantile(values, 1.0) == 40.0
    assert quantile(values, 0.5) == 25.0
    assert quantile([42.0], 0.9) == 42.0


def test_quantile_rejects_bad_input() -> None:
    with pytest.raises(ValueError, match="empty"):
        quantile([], 0.5)
    with pytest.raises(ValueError, match="within"):
        quantile([1.0], 1.5)


def test_summary_against_hand_computed_values() -> None:
    forecasts = [110.0, 90.0, 130.0, 100.0]
    actuals = [100.0, 100.0, 100.0, 100.0]
    # errors: +10, -10, +30, 0 -> |e| = 10, 10, 30, 0
    summary = summarize(forecasts, actuals)
    assert summary is not None
    assert summary.n == 4
    assert summary.mae_mw == pytest.approx(12.5)
    assert summary.rmse_mw == pytest.approx(math.sqrt((100 + 100 + 900 + 0) / 4))
    assert summary.bias_mw == pytest.approx(7.5)
    assert summary.nmae_pct == pytest.approx(12.5)
    assert summary.mean_forecast_mw == pytest.approx(107.5)
    # sorted |e| = 0, 10, 10, 30: P50 = 10, P90 = 10 + 0.7 * 20 = 24
    assert summary.p50_abs_error_mw == pytest.approx(10.0)
    assert summary.p90_abs_error_mw == pytest.approx(24.0)


def test_summary_of_nothing_is_none_and_pairs_must_match() -> None:
    assert summarize([], []) is None
    with pytest.raises(ValueError, match="paired"):
        summarize([1.0], [])


def test_histogram_bins_are_aligned_and_half_open() -> None:
    bins = histogram([-600.0, -500.0, -1.0, 0.0, 499.9, 500.0], 500.0)
    assert [(b.lower, b.upper, b.count) for b in bins] == [
        (-1000.0, -500.0, 1),
        (-500.0, 0.0, 2),
        (0.0, 500.0, 2),
        (500.0, 1000.0, 1),
    ]
    assert histogram([], 500.0) == []
    with pytest.raises(ValueError, match="positive"):
        histogram([1.0], 0)
