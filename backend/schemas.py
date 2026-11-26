"""Pydantic v2 schemas matching the frontend TypeScript interfaces in types/cattle.ts."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

RiskLevel = Literal[
    "Healthy",
    "Mild Risk",
    "Moderate Lame",
    "Severe Lame",
    "Critically Lame",
]

PassageStatus = Literal["Processing", "Analyzed", "Flagged"]

LocomotionScore = Literal[1, 2, 3, 4, 5]


class VelocitySample(BaseModel):
    """One sampled stride velocity (m/s) at a 1-based video frame index."""

    frame: int = Field(..., ge=1)
    v: float = Field(..., ge=0.0)
    purged: bool


class BiomechanicalMetrics(BaseModel):
    """Pose-derived measurements explaining a locomotion score."""

    triJointFlexionAngle: float = Field(..., ge=0.0, le=180.0)
    spineCurvatureRatio: float = Field(..., ge=0.5, le=3.0)
    asymmetryIndex: float = Field(..., ge=0.0, le=100.0)
    limbPhaseShift: float = Field(..., ge=0.0, le=5.0)
    velocityLog: list[VelocitySample]


class CattlePassage(BaseModel):
    """Single cow walk-through crossing the virtual trigger line."""

    id: str
    tagId: str
    entryOrder: int = Field(..., ge=1)
    passageTime: str
    locomotionScore: LocomotionScore
    riskLevel: RiskLevel
    videoUri: str
    status: PassageStatus
    metrics: BiomechanicalMetrics
    detectionConfidence: float = Field(..., ge=0.0, le=1.0)
    clipDurationSec: float = Field(..., gt=0.0)
    analysisNote: Optional[str] = None


def risk_from_score(score: LocomotionScore) -> RiskLevel:
    """Map Sprecher locomotion score (1–5) to a RiskLevel label."""
    mapping: dict[LocomotionScore, RiskLevel] = {
        1: "Healthy",
        2: "Mild Risk",
        3: "Moderate Lame",
        4: "Severe Lame",
        5: "Critically Lame",
    }
    return mapping[score]


def status_from_score(score: LocomotionScore) -> PassageStatus:
    """Flag passages with score >= 4 for veterinary review."""
    return "Flagged" if score >= 4 else "Analyzed"
