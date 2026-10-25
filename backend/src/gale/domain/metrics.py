"""Error statistics. Sign convention throughout: ``error = forecast - actual``.

A positive error is an over-forecast: less wind arrived than was bought
against, so the desk is short and must buy back at short notice.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import fmean


def quantile(sorted_values: Sequence[float], q: float) -> float:
    """Linear-interpolation quantile (Hyndman-Fan type 7; Excel ``PERCENTILE.INC``).

    ``sorted_values`` must already be sorted ascending.
    """
    if not sorted_values:
        raise ValueError("quantile of an empty sample")
    if not 0.0 <= q <= 1.0:
        raise ValueError("q must be within [0, 1]")
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = position - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * weight


@dataclass(frozen=True, slots=True)
class ErrorSummary:
    n: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    mean_actual_mw: float
    mean_forecast_mw: float
    nmae_pct: float
    p50_abs_error_mw: float
    p90_abs_error_mw: float


def summarize(forecasts: Sequence[float], actuals: Sequence[float]) -> ErrorSummary | None:
    """Headline accuracy metrics for paired forecast/actual values, or ``None`` if empty."""
    if len(forecasts) != len(actuals):
        raise ValueError("forecasts and actuals must be paired")
    if not forecasts:
        return None
    errors = [f - a for f, a in zip(forecasts, actuals, strict=True)]
    absolute = sorted(abs(e) for e in errors)
    mae = fmean(absolute)
    mean_actual = fmean(actuals)
    return ErrorSummary(
        n=len(errors),
        mae_mw=mae,
        rmse_mw=math.sqrt(fmean(e * e for e in errors)),
        bias_mw=fmean(errors),
        mean_actual_mw=mean_actual,
        mean_forecast_mw=fmean(forecasts),
        nmae_pct=100 * mae / mean_actual if mean_actual else math.nan,
        p50_abs_error_mw=quantile(absolute, 0.5),
        p90_abs_error_mw=quantile(absolute, 0.9),
    )


@dataclass(frozen=True, slots=True)
class Bin:
    lower: float
    upper: float
    count: int


def histogram(values: Sequence[float], width: float) -> list[Bin]:
    """Fixed-width bins aligned to multiples of ``width``; each bin is ``[lower, upper)``."""
    if width <= 0:
        raise ValueError("bin width must be positive")
    if not values:
        return []
    first = math.floor(min(values) / width)
    last = math.floor(max(values) / width)
    counts = [0] * (last - first + 1)
    for value in values:
        counts[math.floor(value / width) - first] += 1
    return [
        Bin((first + i) * width, (first + i + 1) * width, count) for i, count in enumerate(counts)
    ]
