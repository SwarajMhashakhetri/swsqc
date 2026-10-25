# Gale: five-minute client pitch

**Audience:** the GB day-ahead power desk.
**Goal:** show that Gale answers the desk's two questions with real numbers, and leave them with a rule they can use tomorrow.
**Setup:** open the app on **EPEX 09:20**, delivery day **Thu 15 Jan**. Every figure below comes from the app, with January 2026 decisions scored against Elexon outturn.

---

### 0:00 to 0:30: Hook

> "On the 27th of January, at 09:20, the wind forecast on your desk for the next day said **271 GWh**. **143 GWh** turned up. That is a 128 GWh gap you had to buy back at short notice. Gale exists so that number is never a surprise."

*Screen: hero. Point at the January ribbon: every orange stretch is an hour the forecast promised more wind than arrived. Click 28 Jan on it to open that day, then come back to the three figures: 2.0 GW, +1.7 GW, 4.1 GW.*

### 0:30 to 1:15: What Gale does

> "You make one decision a day, before the auction closes. Gale answers the two questions behind it.
> **One:** what was the latest wind forecast at the moment you decided? Not the one published afterwards, and not a backfilled one.
> **Two:** how wrong does that forecast run, in MW you can plan with?"

> "It uses only Elexon's own data: the national wind forecast and the metered wind outturn. It treats the delivery day the way your auction does, 23:00 to 23:00 UK time."

### 1:15 to 2:15: Section 01, what the desk saw

*Screen: Forecast section, Thu 15 Jan.*

- The provenance line reads: **Run 07:30 · 1h 50m before gate 09:20 · 15.5–38.5h ahead**. That is exactly what was on the screen at gate closure.
- The blue line is the forecast. The shaded band is where reality landed 80% of the time in January for forecasts this far ahead.
  > "The band sits mostly *below* the line. That is your first insight: this forecast leans high."
- The faint grey lines are the runs from the previous 24 hours, so you can see whether the view was stable or swinging.
- KPIs: **285.6 GWh forecast, 80% range 198–287 GWh**. Turn on hindsight: **260.5 GWh** arrived, so the forecast was 25 GWh (9.6%) high, a fairly normal day.
- *Switch the gate to N2EX 09:50:* the run changes to **09:30**.
  > "Your Nord Pool colleagues literally see a different forecast."

### 2:15 to 3:45: Section 02, how far to trust it

*Screen: Accuracy section.*

- **Typical miss: 2.0 GW per hour (MAE 2,035 MW), 18% of average wind output.**
- **Bias: +1.75 GW.** The forecast was too high on **27 of 31 days**.
  > "The bias barely shrinks as you get closer to delivery: it is still +1.5 GW one hour ahead. That makes it structural, not bad luck. The likeliest cause is curtailment: the forecast describes the wind that is available, while the meters record what was allowed to generate. Either way, it is predictable, and predictable means it can be priced."
- **The decision rule (the slider):**
  > "Plan **4.1 GW below the forecast** and wind covered your plan in **90%** of January hours. It fell short in 75 of 744 hours, 83 GWh in total beyond the buffer."
  > "Is that just fitted to January? We tested it honestly: each day's buffer was set *without* that day. It still held in **88.6%** of hours (11.4% breached, against a 10% target)."
  - Move the slider: **80% → 3.1 GW**, **95% → 5.3 GW**.
    > "Your risk appetite picks the number, and Gale tells you the MW."
- **Bad days:** 28 Jan (−128 GWh), then 11–12 Jan (−112 and −121 GWh).
  > "These are the days the buffer exists for."

### 3:45 to 4:30: Section 03, 09:20 or 09:50?

*Screen: Timing section.*

- Thirty minutes buys a run that is **two hours fresher** (09:30 instead of 07:30). In January that improved MAE by just **27 MW (1.3%)**.
  > "Real, but small next to a 1.7 GW bias. Choose your auction on price and liquidity, not on forecast freshness."
- The step chart shows something more useful: the **11:30 run is 7% more accurate** (MAE 1,895 MW).
  > "It lands after both gates, so it is your best input for intraday rebalancing."

### 4:30 to 5:00: Close

1. **Plan below the forecast by default.** The median shortfall is 1.6 GW; that is what it costs to break even.
2. **Size the cover to your risk.** The slider turns a confidence level into MW, and it has been tested out of sample.
3. **Rebalance intraday on the 11:30 run.**

> "Everything you saw comes straight from Elexon and can be reproduced. A script in the repository rebuilds these numbers from the raw feed. The next step is to run Gale on a rolling window, so the band and the buffer update every day."

---

#### Numbers card (EPEX 09:20 unless stated)

| | Value |
|---|---|
| Delivery days · hours scored | 31 · 744 |
| MAE / RMSE | 2,035 MW / 2,498 MW |
| Mean bias (forecast − actual) | +1,749 MW; 27 of 31 days over-forecast |
| Normalised MAE | 18.0% of mean outturn (11,297 MW) |
| P50 / P90 absolute error | 1,668 MW / 4,096 MW |
| Buffer 80% / 90% / 95% | 3,092 / 4,096 / 5,265 MW |
| 90% buffer breaches: in-sample / leave-one-day-out | 75 h (10.1%) / 85 h (11.4%) |
| N2EX 09:50 MAE | 2,008 MW (−27 MW, −1.3%) |
| MAE by run held: 04:30 / 07:30 / 09:30 / 11:30 / 22:30 | 2,009 / 2,035 / 2,008 / 1,895 / 1,830 MW |
| MAE by lead time: 0–1 h / 24 h / 48 h | 1,709 / 1,977 / 2,385 MW |
| Worst day | 28 Jan: 270.8 GWh forecast, 142.5 GWh delivered |
