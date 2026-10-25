"""GB day-ahead auction gate closures the desk can decide against."""

from dataclasses import dataclass
from datetime import time


@dataclass(frozen=True, slots=True)
class DecisionPreset:
    id: str
    exchange: str
    auction: str
    local_time: time
    source_url: str


DECISION_PRESETS: tuple[DecisionPreset, ...] = (
    DecisionPreset(
        id="epex",
        exchange="EPEX SPOT",
        auction="GB Day-Ahead 60-min auction",
        local_time=time(9, 20),
        source_url="https://www.epexspot.com/en/tradingproducts",
    ),
    DecisionPreset(
        id="n2ex",
        exchange="Nord Pool",
        auction="N2EX GB Day-Ahead auction",
        local_time=time(9, 50),
        source_url="https://www.nordpoolgroup.com/en/trading/Day-ahead-trading/",
    ),
)
