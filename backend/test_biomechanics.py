"""Standalone self-test for backend/biomechanics.py."""

import numpy as np

from biomechanics import KEYPOINT_INDEX, analyze_keypoint_sequence


def _synthesize_cow_sequence(
    num_frames: int = 45,
    *,
    pause_range: tuple[int, int] | None = None,
    arch_px: float = 1.0,
    left_hoof_scale: float = 1.0,
    left_stance_bias: float = 0.0,
    hock_offset_x: float = 20.0,
) -> np.ndarray:
    """Synthesize a (T, 12, 3) bovine keypoint sequence in image coords (y down)."""
    kpts = np.zeros((num_frames, 12, 3), dtype=np.float64)
    kpts[:, :, 2] = 0.96

    spine_len = 145.0  # 145 px ≈ 1.45 m -> 1 px = 0.01 m
    x_pos = 120.0
    step_px = 4.0  # 4 px/frame @ 30 fps -> 1.20 m/s

    for t in range(num_frames):
        in_pause = pause_range is not None and pause_range[0] <= t < pause_range[1]
        if t > 0 and not in_pause:
            x_pos += step_px

        phase = (t / 15.0) * 2.0 * np.pi

        # Spine: withers (right/front), mid_lumbar, sacrum (left/rear)
        withers_x, withers_y = x_pos + spine_len, 100.0
        sacrum_x, sacrum_y = x_pos, 100.0
        mid_x, mid_y = x_pos + spine_len * 0.5, 100.0 - arch_px

        kpts[t, KEYPOINT_INDEX["withers"], :2] = [withers_x, withers_y]
        kpts[t, KEYPOINT_INDEX["mid_lumbar"], :2] = [mid_x, mid_y]
        kpts[t, KEYPOINT_INDEX["sacrum"], :2] = [sacrum_x, sacrum_y]

        # Hip & forelimb anchors
        hip_x, hip_y = sacrum_x + 5.0, sacrum_y + 20.0
        kpts[t, KEYPOINT_INDEX["hip"], :2] = [hip_x, hip_y]
        kpts[t, KEYPOINT_INDEX["shoulder"], :2] = [withers_x - 8.0, withers_y + 25.0]
        kpts[t, KEYPOINT_INDEX["elbow_stifle"], :2] = [withers_x - 14.0, withers_y + 52.0]

        # Hooves: ground at y = 240.0; lift reduces y.
        ground_y = 240.0
        raw_left = np.sin(phase) - left_stance_bias
        raw_right = np.sin(phase + np.pi)
        left_lift = max(0.0, raw_left) * 22.0 * left_hoof_scale
        right_lift = max(0.0, raw_right) * 22.0

        kpts[t, KEYPOINT_INDEX["left_hoof"], :2] = [hip_x - 4.0, ground_y - left_lift]
        kpts[t, KEYPOINT_INDEX["right_hoof"], :2] = [hip_x + 4.0, ground_y - right_lift]

        # Hocks and fetlocks (hock bends forward in swing to modulate tri-joint angle)
        left_swing = left_lift / 22.0
        right_swing = right_lift / 22.0

        kpts[t, KEYPOINT_INDEX["left_hock"], :2] = [
            hip_x - hock_offset_x * (0.4 + 0.6 * left_swing),
            hip_y + 52.0 - left_lift * 0.4,
        ]
        kpts[t, KEYPOINT_INDEX["right_hock"], :2] = [
            hip_x - hock_offset_x * (0.4 + 0.6 * right_swing),
            hip_y + 52.0 - right_lift * 0.4,
        ]

        kpts[t, KEYPOINT_INDEX["left_fetlock"], :2] = [
            hip_x - 2.0,
            ground_y - 20.0 - left_lift * 0.8,
        ]
        kpts[t, KEYPOINT_INDEX["right_fetlock"], :2] = [
            hip_x + 2.0,
            ground_y - 20.0 - right_lift * 0.8,
        ]

    return kpts


def main() -> None:
    # 1. Healthy cow with a mid-clip pause (frames 18–25) and a 2-frame occlusion
    healthy_kpts = _synthesize_cow_sequence(
        num_frames=45,
        pause_range=(18, 26),
        arch_px=0.5,
        left_hoof_scale=1.0,
        hock_offset_x=12.0,
    )
    healthy_kpts[10:12, KEYPOINT_INDEX["left_hock"], 2] = 0.05  # short occlusion

    healthy_res = analyze_keypoint_sequence(healthy_kpts, fps=30.0)
    purged_count = sum(1 for s in healthy_res.metrics.velocityLog if s.purged)
    print(
        f"[HEALTHY] score={healthy_res.locomotion_score}, "
        f"purged={purged_count}/{len(healthy_res.metrics.velocityLog)}, "
        f"flex={healthy_res.metrics.triJointFlexionAngle}°, "
        f"R_arch={healthy_res.metrics.spineCurvatureRatio}, "
        f"asym={healthy_res.metrics.asymmetryIndex}%, "
        f"phase={healthy_res.metrics.limbPhaseShift}× | {healthy_res.analysis_note}"
    )

    assert healthy_res.locomotion_score == 1, f"Expected score 1, got {healthy_res.locomotion_score}"
    assert purged_count >= 5, f"Expected pause frames to be purged, got {purged_count}"

    # 2. Lame cow with elevated dorsal arch, stiff flexion, and reduced left-hind lift
    lame_kpts = _synthesize_cow_sequence(
        num_frames=45,
        pause_range=None,
        arch_px=11.5,
        left_hoof_scale=0.55,
        left_stance_bias=0.35,
        hock_offset_x=34.0,
    )
    lame_res = analyze_keypoint_sequence(lame_kpts, fps=30.0)
    print(
        f"[LAME]    score={lame_res.locomotion_score}, "
        f"flex={lame_res.metrics.triJointFlexionAngle}°, "
        f"R_arch={lame_res.metrics.spineCurvatureRatio}, "
        f"asym={lame_res.metrics.asymmetryIndex}%, "
        f"phase={lame_res.metrics.limbPhaseShift}× | {lame_res.analysis_note}"
    )

    assert 3 <= lame_res.locomotion_score <= 5, f"Expected score 3–5, got {lame_res.locomotion_score}"
    assert "left hind" in lame_res.analysis_note.lower(), (
        f"Expected 'left hind' in note, got {lame_res.analysis_note!r}"
    )
    print("All biomechanics assertions passed!")


if __name__ == "__main__":
    main()
