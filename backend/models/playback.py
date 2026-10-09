"""Additive M3 playback controls; all physical progress remains in M2 SDK."""
from pydantic import Field, field_validator

from backend.models.http import AcceptPlanRequest, ReplayControlRequest


class PlaybackSpeedRequest(ReplayControlRequest):
    speed: int = Field(strict=True, description="Discrete playback cadence multiplier: 1, 2, 4 or 8.", json_schema_extra={"enum": [1, 2, 4, 8]})

    @field_validator("speed")
    @classmethod
    def allowed_speed(cls, value):
        if value not in (1, 2, 4, 8):
            raise ValueError("Playback speed must be 1, 2, 4 or 8")
        return value


class StartPlaybackRequest(AcceptPlanRequest):
    speed: int = Field(default=1, strict=True, description="Discrete playback cadence multiplier: 1, 2, 4 or 8.", json_schema_extra={"enum": [1, 2, 4, 8]})
    _allowed_speed = field_validator("speed")(PlaybackSpeedRequest.allowed_speed.__func__)
