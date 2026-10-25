"""Wire format of the Elexon Insights ``/datasets/*/stream`` endpoints we rely on.

Only the fields Gale uses are declared; anything else Elexon adds is ignored.
Timestamps must carry an offset so they can never be misread as local time.
"""

from datetime import date

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, TypeAdapter


class _Record(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class WindforRecord(_Record):
    publish_time: AwareDatetime = Field(alias="publishTime")
    start_time: AwareDatetime = Field(alias="startTime")
    generation: float


class FuelhhRecord(_Record):
    publish_time: AwareDatetime = Field(alias="publishTime")
    start_time: AwareDatetime = Field(alias="startTime")
    settlement_date: date = Field(alias="settlementDate")
    settlement_period: int = Field(alias="settlementPeriod", ge=1, le=50)
    fuel_type: str = Field(alias="fuelType")
    generation: float


WINDFOR_PAYLOAD = TypeAdapter(list[WindforRecord])
FUELHH_PAYLOAD = TypeAdapter(list[FuelhhRecord])
