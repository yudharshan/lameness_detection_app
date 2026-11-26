"""YOLOv8-Pose + ByteTrack cattle corridor tracking and biomechanics pipeline."""

from datetime import datetime, timezone
import math
from pathlib import Path
from typing import TypedDict

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from biomechanics import analyze_keypoint_sequence
from schemas import CattlePassage, risk_from_score, status_from_score

BASE_DIR = Path(__file__).resolve().parent
CUSTOM_WEIGHTS_PATH = BASE_DIR / "weights" / "cattle_pose_best.pt"
FALLBACK_WEIGHTS_NAME = "yolov8s-pose.pt"

ROI_LEFT_FRACTION = 0.15
ROI_RIGHT_FRACTION = 0.85
MIN_TRACK_FRAMES = 8
NUM_KEYPOINTS = 12

_MODEL_CACHE: dict[str, YOLO] = {}


class _TrackBuffer(TypedDict):
    first_frame: int
    keypoints: list[np.ndarray]
    confidences: list[float]


def _get_device() -> int | str:
    """Return CUDA device 0 when available, otherwise CPU."""
    return 0 if torch.cuda.is_available() else "cpu"


def _load_pose_model() -> YOLO:
    """Load fine-tuned cattle pose weights or fall back to yolov8s-pose.pt."""
    weights_source = (
        str(CUSTOM_WEIGHTS_PATH)
        if CUSTOM_WEIGHTS_PATH.exists()
        else FALLBACK_WEIGHTS_NAME
    )
    model = _MODEL_CACHE.get(weights_source)
    if model is None:
        model = YOLO(weights_source)
        _MODEL_CACHE[weights_source] = model
    else:
        # Reset predictor/tracker state between independent video analyses.
        model.predictor = None
    return model


def _read_video_metadata(video_path: str) -> tuple[float, float]:
    """Read video FPS (default 30.0) and frame width using OpenCV."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    try:
        raw_fps = cap.get(cv2.CAP_PROP_FPS)
        fps = (
            float(raw_fps)
            if raw_fps and math.isfinite(raw_fps) and raw_fps > 0.0
            else 30.0
        )
        raw_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        width = (
            float(raw_width)
            if raw_width and math.isfinite(raw_width) and raw_width > 0.0
            else 0.0
        )
    finally:
        cap.release()

    return fps, width


def _normalize_keypoints(kpts: np.ndarray) -> np.ndarray:
    """Slice or zero-pad a per-detection keypoint array to shape (12, 3)."""
    arr = np.asarray(kpts, dtype=np.float64)
    if arr.ndim != 2:
        return np.zeros((NUM_KEYPOINTS, 3), dtype=np.float64)

    if arr.shape[1] == 2:
        confs = np.ones((arr.shape[0], 1), dtype=np.float64)
        arr = np.concatenate([arr, confs], axis=1)
    elif arr.shape[1] > 3:
        arr = arr[:, :3]

    if arr.shape[0] >= NUM_KEYPOINTS:
        return arr[:NUM_KEYPOINTS, :]

    padded = np.zeros((NUM_KEYPOINTS, 3), dtype=np.float64)
    padded[: arr.shape[0], :] = arr
    return padded


def process_cattle_video(
    video_path: str,
    start_entry_order: int = 1,
) -> list[CattlePassage]:
    """Track cows crossing the corridor ROI and score each passage's gait."""
    fps, frame_width = _read_video_metadata(video_path)
    device = _get_device()
    model = _load_pose_model()

    results = model.track(
        source=video_path,
        persist=True,
        tracker="bytetrack.yaml",
        imgsz=640,
        conf=0.25,
        verbose=False,
        stream=True,
        device=device,
    )

    tracks: dict[int, _TrackBuffer] = {}

    for frame_idx, result in enumerate(results):
        if frame_width <= 0.0 and getattr(result, "orig_shape", None):
            frame_width = float(result.orig_shape[1])

        boxes = result.boxes
        keypoints = result.keypoints
        if (
            boxes is None
            or boxes.id is None
            or keypoints is None
            or keypoints.data is None
            or frame_width <= 0.0
        ):
            continue

        roi_left = ROI_LEFT_FRACTION * frame_width
        roi_right = ROI_RIGHT_FRACTION * frame_width

        track_ids = boxes.id.int().cpu().tolist()
        xyxy = boxes.xyxy.cpu().numpy()
        confs = (
            boxes.conf.cpu().numpy()
            if boxes.conf is not None
            else np.ones(len(track_ids), dtype=np.float64)
        )
        kpts_data = keypoints.data.cpu().numpy()

        for det_idx, track_id in enumerate(track_ids):
            center_x = 0.5 * (float(xyxy[det_idx, 0]) + float(xyxy[det_idx, 2]))
            if not (roi_left <= center_x <= roi_right):
                continue

            normalized_kpts = _normalize_keypoints(kpts_data[det_idx])
            det_conf = float(confs[det_idx])

            if track_id not in tracks:
                tracks[track_id] = {
                    "first_frame": frame_idx,
                    "keypoints": [normalized_kpts],
                    "confidences": [det_conf],
                }
            else:
                tracks[track_id]["keypoints"].append(normalized_kpts)
                tracks[track_id]["confidences"].append(det_conf)

    valid_tracks = [
        (track_id, buffer)
        for track_id, buffer in tracks.items()
        if len(buffer["keypoints"]) >= MIN_TRACK_FRAMES
    ]
    valid_tracks.sort(key=lambda item: (item[1]["first_frame"], item[0]))

    if not valid_tracks:
        raise ValueError("No cattle detected walking through the corridor ROI.")

    base_entry_order = max(1, start_entry_order)
    now = datetime.now(timezone.utc)
    video_uri = f"uploads/{Path(video_path).name}"
    passages: list[CattlePassage] = []

    for offset, (_, buffer) in enumerate(valid_tracks):
        entry_order = base_entry_order + offset
        tag_id = f"C{entry_order}"
        kpt_sequence = np.stack(buffer["keypoints"], axis=0)
        bio_result = analyze_keypoint_sequence(kpt_sequence, fps=fps)

        score = bio_result.locomotion_score
        mean_conf = round(
            float(np.clip(np.mean(buffer["confidences"]), 0.0, 1.0)),
            2,
        )
        clip_duration_sec = round(
            max(float(kpt_sequence.shape[0]) / fps, 0.01),
            2,
        )

        passages.append(
            CattlePassage(
                id=f"psg-{int(now.timestamp() * 1000)}-{entry_order}",
                tagId=tag_id,
                entryOrder=entry_order,
                passageTime=now.isoformat(),
                locomotionScore=score,
                riskLevel=risk_from_score(score),
                videoUri=video_uri,
                status=status_from_score(score),
                metrics=bio_result.metrics,
                detectionConfidence=mean_conf,
                clipDurationSec=clip_duration_sec,
                analysisNote=bio_result.analysis_note,
            )
        )

    return passages
