/** Mirrors the backend's /api/v1 response models (backend/src/gale/api/schemas.py). */

export interface Metrics {
  n: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  nmae_pct: number
  mean_actual_mw: number
  mean_forecast_mw: number
  p50_abs_error_mw: number
  p90_abs_error_mw: number
}

export interface DecisionPreset {
  id: string
  exchange: string
  auction: string
  decision_time: string
  source_url: string
}

export interface Meta {
  source: string
  first_decision_date: string
  last_decision_date: string
  first_delivery_date: string
  last_delivery_date: string
  delivery_day: string
  publish_window_start: string
  publish_window_end: string
  loaded_at: string
  presets: DecisionPreset[]
  coverage: {
    forecast_rows: number
    hindcast_rows_excluded: number
    publishes: number
    publish_times_of_day: { time: string; count: number }[]
    actual_periods: number
    expected_periods: number
    missing_periods: string[]
    hours_without_actual: number
  }
}

export interface HourPoint {
  start_time: string
  forecast_mw: number | null
  publish_time: string | null
  lead_hours: number | null
  band_low_mw: number | null
  band_high_mw: number | null
  actual_mw: number | null
  error_mw: number | null
}

export interface Vintage {
  publish_time: string
  points: { start_time: string; forecast_mw: number }[]
}

export interface Extreme {
  start_time: string
  mw: number
}

export interface Decision {
  delivery_date: string
  decision_time: string
  decision_at: string
  window_start: string
  window_end: string
  provenance: {
    publish_time: string | null
    publishes_used: string[]
    minutes_before_decision: number | null
    lead_hours_min: number | null
    lead_hours_max: number | null
    hours_forecast: number
    hours_total: number
  }
  kpis: {
    forecast_gwh: number | null
    forecast_p10_gwh: number | null
    forecast_p90_gwh: number | null
    peak: Extreme | null
    trough: Extreme | null
    actual_gwh: number | null
    energy_error_gwh: number | null
  }
  metrics: Metrics | null
  points: HourPoint[]
  vintages: Vintage[]
}

export interface SeriesDay {
  delivery_date: string
  /** First delivery hour; value i covers the hour i hours later. */
  start_time: string
  forecast_mw: (number | null)[]
  actual_mw: (number | null)[]
}

export interface Series {
  decision_time: string
  days: SeriesDay[]
}

export interface DayRow {
  delivery_date: string
  publish_times: string[]
  forecast_gwh: number
  actual_gwh: number
  metrics: Metrics | null
}

export interface BufferRow {
  confidence: number
  buffer_mw: number
  breaches: number
  breach_share: number
  shortfall_mwh: number
  out_of_sample_breaches: number
  out_of_sample_breach_share: number
}

export interface Accuracy {
  decision_time: string
  hours_expected: number
  metrics: Metrics | null
  by_day: DayRow[]
  by_hour: { hour: number; metrics: Metrics | null }[]
  distribution: {
    bin_width_mw: number
    bins: { lower_mw: number; upper_mw: number; count: number }[]
    p10_mw: number | null
    p50_mw: number | null
    p90_mw: number | null
  }
  buffer: BufferRow[]
}

export interface HorizonRow {
  lead_hour: number
  n: number
  mae_mw: number
  bias_mw: number
  p10_error_mw: number
  p90_error_mw: number
}

export interface Horizon {
  rows: HorizonRow[]
}

export interface TimingRow {
  decision_time: string
  median_forecast_age_minutes: number | null
  metrics: Metrics | null
}

export interface Timing {
  step_minutes: number
  rows: TimingRow[]
}
