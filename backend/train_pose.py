"""YOLOv8 Pose training script for the 12-keypoint bovine lameness model."""

import argparse
import os
from pathlib import Path
import shutil
import tempfile

# Keep Ultralytics settings inside backend/ so it doesn't touch AppData/Roaming.
os.environ.setdefault(
    "YOLO_CONFIG_DIR",
    str(Path(__file__).resolve().parent / ".ultralytics"),
)

import cv2
import numpy as np
from ultralytics import YOLO
import yaml

from biomechanics import KEYPOINT_NAMES

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_YAML = BACKEND_DIR / "dataset" / "data.yaml"
WEIGHTS_OUT = BACKEND_DIR / "weights" / "cattle_pose_best.pt"

# Symmetric flip indices for horizontal augmentation:
# spine/forelimb midline keypoints (0..5) map to themselves;
# left/right hindlimb pairs (6<->7, 8<->9, 10<->11) swap.
FLIP_IDX: list[int] = [0, 1, 2, 3, 4, 5, 7, 6, 9, 8, 11, 10]
KPT_SHAPE: list[int] = [12, 3]
CLASS_NAMES: dict[int, str] = {0: "cow"}


def patch_data_yaml(yaml_path: Path) -> dict:
    """Enforce kpt_shape, flip_idx, and class names in a YOLOv8 Pose data.yaml."""
    if not yaml_path.exists():
        raise FileNotFoundError(f"Dataset config not found: {yaml_path}")

    with yaml_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    data["kpt_shape"] = KPT_SHAPE
    data["flip_idx"] = FLIP_IDX
    data["names"] = CLASS_NAMES
    data["nc"] = 1

    # Ensure Ultralytics resolves train/val paths relative to this data.yaml.
    if "path" not in data:
        data["path"] = str(yaml_path.resolve().parent)

    with yaml_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False)

    return data


def _create_synthetic_pose_dataset(root: Path, imgsz: int) -> Path:
    """Create a 4-image synthetic 12-keypoint dataset for GPU smoke testing."""
    for split in ("train", "val"):
        (root / split / "images").mkdir(parents=True, exist_ok=True)
        (root / split / "labels").mkdir(parents=True, exist_ok=True)

    # Normalized 12 keypoints inside a synthetic cow bounding box.
    base_kpts = [
        (0.62, 0.36),  # 0: withers
        (0.50, 0.35),  # 1: mid_lumbar
        (0.38, 0.36),  # 2: sacrum
        (0.39, 0.43),  # 3: hip
        (0.60, 0.45),  # 4: shoulder
        (0.58, 0.56),  # 5: elbow_stifle
        (0.37, 0.58),  # 6: left_hock
        (0.41, 0.58),  # 7: right_hock
        (0.38, 0.68),  # 8: left_fetlock
        (0.42, 0.68),  # 9: right_fetlock
        (0.38, 0.76),  # 10: left_hoof
        (0.42, 0.76),  # 11: right_hoof
    ]

    for split in ("train", "val"):
        count = 4 if split == "train" else 2
        for idx in range(count):
            img = np.full((imgsz, imgsz, 3), 24, dtype=np.uint8)
            x1 = int(0.30 * imgsz)
            y1 = int(0.30 * imgsz)
            x2 = int(0.70 * imgsz)
            y2 = int(0.80 * imgsz)
            cv2.rectangle(img, (x1, y1), (x2, y2), (40, 140, 90), -1)

            kpt_tokens: list[str] = []
            for kx, ky in base_kpts:
                px = int(kx * imgsz)
                py = int(ky * imgsz)
                cv2.circle(img, (px, py), 4, (0, 220, 255), -1)
                kpt_tokens.extend([f"{kx:.6f}", f"{ky:.6f}", "2"])

            img_path = root / split / "images" / f"cow_{idx}.jpg"
            lbl_path = root / split / "labels" / f"cow_{idx}.txt"
            cv2.imwrite(str(img_path), img)
            label_line = "0 0.500000 0.550000 0.400000 0.500000 " + " ".join(kpt_tokens)
            lbl_path.write_text(label_line + "\n", encoding="utf-8")

    data_yaml = root / "data.yaml"
    with data_yaml.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            {
                "path": str(root.resolve()),
                "train": "train/images",
                "val": "val/images",
                "names": {0: "cow"},
            },
            handle,
            sort_keys=False,
        )
    return data_yaml


def run_smoke_test(model_name: str, imgsz: int) -> None:
    """Verify 1-epoch GPU training end-to-end on a temporary synthetic dataset."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="herdsight_smoke_"))
    try:
        data_yaml = _create_synthetic_pose_dataset(tmp_dir / "dataset", imgsz=imgsz)
        patch_data_yaml(data_yaml)

        model = YOLO(model_name)
        model.train(
            data=str(data_yaml),
            epochs=1,
            batch=2,
            imgsz=imgsz,
            device=0,
            workers=0,
            project=str(tmp_dir / "runs"),
            name="smoke",
            exist_ok=True,
            verbose=True,
        )
        print("Smoke test completed successfully on GPU device=0.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def train_model(
    data_yaml: Path,
    model_name: str,
    epochs: int,
    batch: int,
    imgsz: int,
) -> None:
    """Patch data.yaml, train YOLOv8 Pose, and export best.pt to backend/weights/."""
    patch_data_yaml(data_yaml)
    print(f"Patched {data_yaml} with {len(KEYPOINT_NAMES)}-keypoint schema: {KEYPOINT_NAMES}")

    model = YOLO(model_name)
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        batch=batch,
        imgsz=imgsz,
        device=0,
        project=str(BACKEND_DIR / "runs"),
        name="cattle_pose",
        exist_ok=True,
    )

    best_src = Path(results.save_dir) / "weights" / "best.pt"
    if not best_src.exists():
        raise FileNotFoundError(f"Expected trained weights not found at {best_src}")

    WEIGHTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_src, WEIGHTS_OUT)
    print(f"Copied best weights to {WEIGHTS_OUT}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train YOLOv8 Pose on the 12-keypoint bovine lameness dataset."
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA_YAML,
        help="Path to Roboflow YOLOv8 Pose data.yaml",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8s-pose.pt",
        help="Pretrained YOLOv8 Pose checkpoint",
    )
    parser.add_argument("--epochs", type=int, default=120, help="Training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size")
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run a 1-epoch GPU verification on a temporary 4-image synthetic dataset",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.smoke_test:
        run_smoke_test(model_name=args.model, imgsz=args.imgsz)
    else:
        train_model(
            data_yaml=args.data,
            model_name=args.model,
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
        )


if __name__ == "__main__":
    main()
