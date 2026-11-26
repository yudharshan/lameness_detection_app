"""Pure-Python Kinematic Velocity Filter and Biomechanical XAI Engine.

Processes a (T, 12, 3) sequence of 2D bovine pose keypoints (x, y, confidence)
in standard image coordinates (x right, y down) and produces:
  - A per-frame horizontal velocity log with pause/slip purging
  - Four explainable biomechanical indicators calibrated to lib/metrics.ts
  - A 1–5 Sprecher locomotion score and clinical analysis note
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy.signal import savgol_filter

from schemas import BiomechanicalMetrics, LocomotionScore, VelocitySample

KEYPOINT_NAMES: tuple[str, ...] = (
    "withers",       # 0: K1
    "mid_lumbar",    # 1: K2
    "sacrum",        # 2: K3
    "hip",           # 3: K4
    "shoulder",      # 4: K5
    "elbow_stifle",  # 5: K6
    "left_hock",     # 6: K7
    "right_hock",    # 7: K8
    "left_fetlock",  # 8: K9
    "right_fetlock", # 9: K10
    "left_hoof",     # 10: K11
    "right_hoof",    # 11: K12
)

KEYPOINT_INDEX: dict[str, int] = {
    name: idx for idx, name in enumerate(KEYPOINT_NAMES)
}

AVERAGE_BOVINE_TRUNK_METERS = 1.45
DEFAULT_CONFIDENCE_THRESHOLD = 0.25
MAX_INTERP_GAP_FRAMES = 3
MAX_PHYSICAL_ACCEL_MPS2 = 6.5

_TRAPEZOID = getattr(np, "trapezoid", None) or getattr(np, "trapz")


@dataclass(frozen=True)
class BiomechanicsResult:
    """Output of the kinematic velocity filter and biomechanical XAI scorer."""

    metrics: BiomechanicalMetrics
    locomotion_score: LocomotionScore
    analysis_note: str
    affected_side: Literal["left", "right"]


def _interpolate_short_gaps(
    coords: np.ndarray,
    confidence: np.ndarray,
    max_gap: int = MAX_INTERP_GAP_FRAMES,
    conf_thresh: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> np.ndarray:
    """Linearly interpolate missing/low-confidence gaps up to `max_gap` frames."""
    num_frames, num_kpts, _ = coords.shape
    filled = coords.astype(np.float64, copy=True)

    for k in range(num_kpts):
        valid = (
            (confidence[:, k] >= conf_thresh)
            & np.isfinite(filled[:, k, 0])
            & np.isfinite(filled[:, k, 1])
        )
        valid_idx = np.flatnonzero(valid)
        if valid_idx.size == 0:
            continue

        # Identify contiguous invalid runs and interpolate only short gaps.
        t = 0
        while t < num_frames:
            if valid[t]:
                t += 1
                continue
            start = t
            while t < num_frames and not valid[t]:
                t += 1
            end = t  # exclusive
            gap_len = end - start

            if gap_len <= max_gap:
                left = start - 1
                right = end
                if left >= 0 and right < num_frames:
                    for dim in range(2):
                        filled[start:end, k, dim] = np.interp(
                            np.arange(start, end),
                            [left, right],
                            [filled[left, k, dim], filled[right, k, dim]],
                        )
                elif left >= 0:
                    filled[start:end, k, :] = filled[left, k, :]
                elif right < num_frames:
                    filled[start:end, k, :] = filled[right, k, :]

    return filled


def _smooth_trajectories(coords: np.ndarray) -> np.ndarray:
    """Apply zero-phase Savitzky-Golay smoothing (polyorder=2, window_length=7)."""
    num_frames = coords.shape[0]
    if num_frames <= 2:
        return coords.copy()

    window = min(7, num_frames)
    if window % 2 == 0:
        window -= 1
    if window < 3:
        return coords.copy()

    polyorder = min(2, window - 1)
    smoothed = coords.copy()
    smoothed[:, :, 0] = savgol_filter(
        coords[:, :, 0], window_length=window, polyorder=polyorder, axis=0
    )
    smoothed[:, :, 1] = savgol_filter(
        coords[:, :, 1], window_length=window, polyorder=polyorder, axis=0
    )
    return smoothed


def _compute_trunk_lengths(coords: np.ndarray) -> np.ndarray:
    """Compute per-frame scale-invariant trunk length L_spine = ||withers - sacrum||_2."""
    withers = coords[:, KEYPOINT_INDEX["withers"], :]
    sacrum = coords[:, KEYPOINT_INDEX["sacrum"], :]
    lengths = np.linalg.norm(withers - sacrum, axis=1)

    valid_lengths = lengths[np.isfinite(lengths) & (lengths > 1e-3)]
    fallback = float(np.median(valid_lengths)) if valid_lengths.size > 0 else 100.0
    return np.where(np.isfinite(lengths) & (lengths > 1e-3), lengths, fallback)


def compute_velocity_filter(
    coords: np.ndarray,
    trunk_lengths: np.ndarray,
    fps: float,
    mean_herd_velocity: float | None = None,
) -> tuple[list[VelocitySample], np.ndarray]:
    """Compute horizontal withers speed (m/s) and purge pauses or physical slips."""
    num_frames = coords.shape[0]
    withers_x = coords[:, KEYPOINT_INDEX["withers"], 0]

    velocities = np.zeros(num_frames, dtype=np.float64)
    if num_frames > 1:
        dx = np.abs(np.diff(withers_x))
        # Normalize displacement by trunk length and scale to realistic m/s.
        step_v = (dx / trunk_lengths[1:]) * AVERAGE_BOVINE_TRUNK_METERS * fps
        velocities[1:] = step_v
        velocities[0] = step_v[0]

    if mean_herd_velocity is not None and mean_herd_velocity > 0.1:
        ref_velocity = float(mean_herd_velocity)
    else:
        positive_v = velocities[velocities > 0.1]
        ref_velocity = (
            float(np.median(positive_v)) if positive_v.size > 0 else 1.20
        )
        ref_velocity = max(ref_velocity, 0.50)

    pause_threshold = 0.25 * ref_velocity
    purged = velocities < pause_threshold

    if num_frames > 1:
        accel = np.zeros(num_frames, dtype=np.float64)
        accel[1:] = np.abs(np.diff(velocities)) * fps
        purged = purged | (accel > MAX_PHYSICAL_ACCEL_MPS2)

    velocity_log = [
        VelocitySample(
            frame=idx + 1,
            v=round(float(velocities[idx]), 2),
            purged=bool(purged[idx]),
        )
        for idx in range(num_frames)
    ]

    retained_mask = ~purged
    if int(np.sum(retained_mask)) < 3:
        retained_mask = np.ones(num_frames, dtype=bool)

    return velocity_log, retained_mask


def _joint_angles_deg(
    upper: np.ndarray,
    middle: np.ndarray,
    lower: np.ndarray,
) -> np.ndarray:
    """Compute interior joint angle (degrees) at `middle` via the law of cosines."""
    ba = upper - middle
    bc = lower - middle
    norm_ba = np.linalg.norm(ba, axis=1)
    norm_bc = np.linalg.norm(bc, axis=1)
    denom = np.maximum(norm_ba * norm_bc, 1e-6)
    cos_theta = np.sum(ba * bc, axis=1) / denom
    cos_theta = np.clip(cos_theta, -1.0, 1.0)
    return np.degrees(np.arccos(cos_theta))


def _compute_tri_joint_flexion(coords: np.ndarray) -> float:
    """Minimum swing-phase hock flexion angle across left/right hind limbs (105–150°)."""
    hip = coords[:, KEYPOINT_INDEX["hip"], :]
    left_angles = _joint_angles_deg(
        hip,
        coords[:, KEYPOINT_INDEX["left_hock"], :],
        coords[:, KEYPOINT_INDEX["left_fetlock"], :],
    )
    right_angles = _joint_angles_deg(
        hip,
        coords[:, KEYPOINT_INDEX["right_hock"], :],
        coords[:, KEYPOINT_INDEX["right_fetlock"], :],
    )
    min_left = float(np.percentile(left_angles, 10))
    min_right = float(np.percentile(right_angles, 10))
    flexion = min(min_left, min_right)
    return round(float(np.clip(flexion, 105.0, 150.0)), 0)


def _compute_spine_curvature_ratio(
    coords: np.ndarray,
    trunk_lengths: np.ndarray,
) -> float:
    """Fit a 2nd-order polynomial to K1–K3 and map dorsal arch to R_arch (0.98–1.78)."""
    w_idx = KEYPOINT_INDEX["withers"]
    m_idx = KEYPOINT_INDEX["mid_lumbar"]
    s_idx = KEYPOINT_INDEX["sacrum"]

    ratios: list[float] = []
    for t in range(coords.shape[0]):
        xs = np.array(
            [coords[t, w_idx, 0], coords[t, m_idx, 0], coords[t, s_idx, 0]],
            dtype=np.float64,
        )
        ys = np.array(
            [coords[t, w_idx, 1], coords[t, m_idx, 1], coords[t, s_idx, 1]],
            dtype=np.float64,
        )
        span = xs[2] - xs[0]
        if abs(span) < 1e-3:
            continue

        # Fit 2nd-order polynomial y(x) through withers, mid_lumbar, sacrum.
        coeffs = np.polyfit(xs, ys, 2)
        y_fit_mid = float(np.polyval(coeffs, xs[1]))
        frac = (xs[1] - xs[0]) / span
        y_chord_mid = float(ys[0] + (ys[2] - ys[0]) * frac)

        # In image coordinates (y down), dorsal arch deflects mid_lumbar upward (smaller y).
        h_arch = max(0.0, y_chord_mid - y_fit_mid)
        ratios.append(h_arch / float(trunk_lengths[t]))

    mean_arch = float(np.median(ratios)) if ratios else 0.0
    r_arch = 1.0 + 6.5 * mean_arch
    return round(float(np.clip(r_arch, 0.98, 1.78)), 2)


def _compute_hoof_metrics(
    coords: np.ndarray,
    trunk_lengths: np.ndarray,
) -> tuple[float, float, Literal["left", "right"]]:
    """Compute hoof AUC asymmetry (0–40%) and stance duty-cycle phase shift (0.90–1.60)."""
    left_y = coords[:, KEYPOINT_INDEX["left_hoof"], 1]
    right_y = coords[:, KEYPOINT_INDEX["right_hoof"], 1]

    y_ground = float(np.percentile(np.concatenate([left_y, right_y]), 95))
    mean_spine = float(np.mean(trunk_lengths))

    clear_left = np.maximum(0.0, y_ground - left_y) / max(mean_spine, 1e-3)
    clear_right = np.maximum(0.0, y_ground - right_y) / max(mean_spine, 1e-3)

    auc_left = float(_TRAPEZOID(clear_left))
    auc_right = float(_TRAPEZOID(clear_right))
    denom = max(auc_left, auc_right, 1e-6)
    asymmetry_pct = (abs(auc_left - auc_right) / denom) * 100.0
    asymmetry_pct = round(float(np.clip(asymmetry_pct, 0.0, 40.0)), 1)

    affected_side: Literal["left", "right"] = (
        "left" if auc_left <= auc_right else "right"
    )

    peak_clearance = max(float(np.max(clear_left)), float(np.max(clear_right)), 1e-4)
    stance_thresh = 0.25 * peak_clearance
    duty_left = float(np.mean(clear_left <= stance_thresh))
    duty_right = float(np.mean(clear_right <= stance_thresh))

    phase_shift = 1.0 + abs(duty_left - duty_right)
    phase_shift = round(float(np.clip(phase_shift, 0.90, 1.60)), 2)

    return asymmetry_pct, phase_shift, affected_side


def score_passage(
    metrics: BiomechanicalMetrics,
    affected_side: Literal["left", "right"] = "left",
) -> tuple[LocomotionScore, str]:
    """Combine the 4 biomechanical features into a 1–5 Sprecher score and note."""
    severity = 0.0

    # 1. Tri-joint flexion (healthy >= 130°, watch 120–129°, flag < 120°)
    if metrics.triJointFlexionAngle < 120.0:
        severity += 2.0
    elif metrics.triJointFlexionAngle < 130.0:
        severity += 1.0

    # 2. Spine curvature ratio R_arch (healthy <= 1.25, watch <= 1.35, flag > 1.35)
    if metrics.spineCurvatureRatio > 1.45:
        severity += 2.5
    elif metrics.spineCurvatureRatio > 1.35:
        severity += 2.0
    elif metrics.spineCurvatureRatio > 1.25:
        severity += 1.0

    # 3. Hoof trajectory AUC asymmetry (healthy <= 8%, watch <= 15%, flag > 15%)
    if metrics.asymmetryIndex > 25.0:
        severity += 3.0
    elif metrics.asymmetryIndex > 15.0:
        severity += 2.0
    elif metrics.asymmetryIndex > 8.0:
        severity += 1.0

    # 4. Limb phase shift (healthy 0.95–1.10×, watch 1.11–1.25×, flag > 1.25×)
    if metrics.limbPhaseShift > 1.35:
        severity += 2.5
    elif metrics.limbPhaseShift > 1.25:
        severity += 2.0
    elif metrics.limbPhaseShift > 1.10 or metrics.limbPhaseShift < 0.88:
        severity += 1.0

    if severity < 1.0:
        score: LocomotionScore = 1
    elif severity < 3.0:
        score = 2
    elif severity < 5.0:
        score = 3
    elif severity < 7.5:
        score = 4
    else:
        score = 5

    limb_label = f"{affected_side} hind limb"
    notes: dict[LocomotionScore, str] = {
        1: "Gait symmetric and consistent with the herd baseline.",
        2: f"Mild gait deviation in {limb_label}; recheck on next pass.",
        3: f"Moderate lameness with reduced {limb_label} clearance and spinal arch.",
        4: f"Severe stance asymmetry on {limb_label}; flagged for veterinary review.",
        5: f"Critical gait deviation on {limb_label}; urgent veterinary review required.",
    }
    return score, notes[score]


def analyze_keypoint_sequence(
    keypoints: np.ndarray,
    fps: float = 30.0,
    mean_herd_velocity: float | None = None,
) -> BiomechanicsResult:
    """Run preprocessing, velocity purging, feature extraction, and Sprecher scoring."""
    arr = np.asarray(keypoints, dtype=np.float64)
    if arr.ndim != 3 or arr.shape[1:] != (12, 3):
        raise ValueError(f"Expected keypoints of shape (T, 12, 3), got {arr.shape}.")
    if arr.shape[0] < 3:
        raise ValueError("Need at least 3 frames to analyze a cattle passage.")

    coords = arr[:, :, :2]
    confidence = arr[:, :, 2]

    interpolated = _interpolate_short_gaps(coords, confidence)
    smoothed = _smooth_trajectories(interpolated)
    trunk_lengths = _compute_trunk_lengths(smoothed)

    velocity_log, retained_mask = compute_velocity_filter(
        smoothed, trunk_lengths, fps=fps, mean_herd_velocity=mean_herd_velocity
    )

    clean_coords = smoothed[retained_mask]
    clean_lengths = trunk_lengths[retained_mask]

    flexion = _compute_tri_joint_flexion(clean_coords)
    curvature = _compute_spine_curvature_ratio(clean_coords, clean_lengths)
    asymmetry, phase_shift, affected_side = _compute_hoof_metrics(
        clean_coords, clean_lengths
    )

    metrics = BiomechanicalMetrics(
        triJointFlexionAngle=flexion,
        spineCurvatureRatio=curvature,
        asymmetryIndex=asymmetry,
        limbPhaseShift=phase_shift,
        velocityLog=velocity_log,
    )
    score, note = score_passage(metrics, affected_side=affected_side)

    return BiomechanicsResult(
        metrics=metrics,
        locomotion_score=score,
        analysis_note=note,
        affected_side=affected_side,
    )
