"""Re-derive Gale's headline numbers straight from raw Elexon data and compare with a running API.

Independent of the backend code on purpose: stdlib only, brute force, no shared helpers.
January 2026 is GMT, so UK local time equals UTC throughout.

    python3 scripts/crosscheck.py                      # against http://localhost:8000
    python3 scripts/crosscheck.py https://<your-app>   # against a deployment
"""

import json
import statistics
import sys
import urllib.request
from datetime import UTC, datetime, timedelta

ELEXON = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")


def get(url: str) -> object:
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response)


def ts(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


forecasts = get(
    f"{ELEXON}/WINDFOR/stream?publishDateTimeFrom=2025-12-31T00:00:00Z&publishDateTimeTo=2026-01-31T23:00:00Z"
)
actuals = get(f"{ELEXON}/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-02-01&fuelType=WIND")
half_hours = {ts(r["startTime"]): r["generation"] for r in actuals}
runs: dict[datetime, dict[datetime, float]] = {}
for r in forecasts:
    runs.setdefault(ts(r["publishTime"]), {})[ts(r["startTime"])] = r["generation"]


def latest_run(decision: datetime) -> datetime:
    return max(t for t in runs if t <= decision)


def hourly_actual(hour: datetime) -> float:
    return (half_hours[hour] + half_hours[hour + timedelta(minutes=30)]) / 2


def delivery_hours(day: datetime) -> list[datetime]:
    return [day - timedelta(hours=1) + timedelta(hours=k) for k in range(24)]  # 23:00 D-1 .. 22:00 D


failures = 0


def check(label: str, raw: object, served: object) -> None:
    global failures
    # The API rounds MW to 0.1 and GWh to 0.001, so floats match within half a step.
    ok = abs(raw - float(str(served))) < 0.06 if isinstance(raw, float) else raw == served
    failures += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {label}: raw={raw}  api={served}")


for gate, (hh, mm) in {"09:20": (9, 20), "09:50": (9, 50)}.items():
    day = datetime(2026, 1, 15, tzinfo=UTC)
    run = latest_run(day - timedelta(days=1) + timedelta(hours=hh, minutes=mm))
    served = get(f"{API}/api/v1/decision?delivery_date=2026-01-15&decision_time={gate}")
    check(f"15 Jan run on the desk at {gate}", run, ts(served["provenance"]["publish_time"]))

hour = datetime(2026, 1, 15, 11, tzinfo=UTC)
point = next(
    x
    for x in get(f"{API}/api/v1/decision?delivery_date=2026-01-15&decision_time=09:20")["points"]
    if ts(x["start_time"]) == hour
)
run = latest_run(datetime(2026, 1, 14, 9, 20, tzinfo=UTC))
check("15 Jan 11:00 forecast MW", float(runs[run][hour]), point["forecast_mw"])
check("15 Jan 11:00 actual MW (mean of 11:00 and 11:30)", hourly_actual(hour), point["actual_mw"])
check("15 Jan 11:00 error MW", runs[run][hour] - hourly_actual(hour), point["error_mw"])

served = get(f"{API}/api/v1/decision?delivery_date=2026-01-16&decision_time=13:00")
check("irregular 12:25 run picked at 13:00", latest_run(datetime(2026, 1, 15, 13, tzinfo=UTC)), ts(served["provenance"]["publish_time"]))

for gate, (hh, mm) in {"09:20": (9, 20), "09:50": (9, 50)}.items():
    errors = []
    for i in range(31):
        day = datetime(2026, 1, 2, tzinfo=UTC) + timedelta(days=i)
        run = latest_run(day - timedelta(days=1) + timedelta(hours=hh, minutes=mm))
        errors += [runs[run][h] - hourly_actual(h) for h in delivery_hours(day)]
    report = get(f"{API}/api/v1/accuracy?decision_time={gate}")
    metrics = report["metrics"]
    buffer90 = next(b for b in report["buffer"] if b["confidence"] == 0.9)
    p90 = statistics.quantiles(errors, n=10, method="inclusive")[8]
    check(f"{gate} hours scored", len(errors), metrics["n"])
    check(f"{gate} MAE MW", statistics.fmean(abs(e) for e in errors), metrics["mae_mw"])
    check(f"{gate} bias MW", statistics.fmean(errors), metrics["bias_mw"])
    check(f"{gate} RMSE MW", statistics.fmean(e * e for e in errors) ** 0.5, metrics["rmse_mw"])
    check(f"{gate} 90% buffer MW", p90, buffer90["buffer_mw"])
    check(f"{gate} 90% buffer breaches", sum(e > p90 for e in errors), buffer90["breaches"])

day = datetime(2026, 1, 28, tzinfo=UTC)
run = latest_run(datetime(2026, 1, 27, 9, 20, tzinfo=UTC))
row = next(r for r in get(f"{API}/api/v1/accuracy?decision_time=09:20")["by_day"] if r["delivery_date"] == "2026-01-28")
check("28 Jan forecast GWh", sum(runs[run][h] for h in delivery_hours(day)) / 1000, row["forecast_gwh"])
check("28 Jan actual GWh", sum(hourly_actual(h) for h in delivery_hours(day)) / 1000, row["actual_gwh"])

print("all checks passed" if failures == 0 else f"{failures} check(s) failed")
sys.exit(1 if failures else 0)
