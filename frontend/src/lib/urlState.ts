export interface ViewState {
  date: string | null
  gate: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-2]):[0-5]\d$/

/** Read ?date=YYYY-MM-DD&gate=HH:MM so a view can be shared as a link. */
export function readViewState(search: string): ViewState {
  const params = new URLSearchParams(search)
  const date = params.get('date')
  const gate = params.get('gate')
  return {
    date: date !== null && DATE.test(date) ? date : null,
    gate: gate !== null && TIME.test(gate) ? gate : null,
  }
}

export function writeViewState(state: { date: string; gate: string }): string {
  return `?${new URLSearchParams({ date: state.date, gate: state.gate }).toString()}`
}
