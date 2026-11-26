"""Remap any Roboflow Universe YOLO pose dataset to 12 bovine keypoints."""

from pathlib import Path

import yaml

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
LABEL_DIRS = (
    DATASET_DIR / "train" / "labels",
    DATASET_DIR / "valid" / "labels",
)
DATA_YAML_PATH = DATASET_DIR / "data.yaml"

TARGET_KEYPOINTS = 12
TARGET_KEYPOINT_VALUES = TARGET_KEYPOINTS * 3  # 36
TARGET_ROW_VALUES = 1 + 4 + TARGET_KEYPOINT_VALUES  # 41
FLIP_IDX = [0, 1, 2, 3, 4, 5, 7, 6, 9, 8, 11, 10]


def remap_label_row(line: str) -> str | None:
    """Slice or zero-pad a YOLO pose label row to 1 + 4 + 12*3 = 41 values."""
    stripped = line.strip()
    if not stripped:
        return None

    tokens = stripped.split()
    if len(tokens) < 5:
        return None

    class_id = "0"
    bbox = tokens[1:5]
    kpts = tokens[5:]

    if len(kpts) >= TARGET_KEYPOINT_VALUES:
        kpts = kpts[:TARGET_KEYPOINT_VALUES]
    else:
        kpts = kpts + ["0.0"] * (TARGET_KEYPOINT_VALUES - len(kpts))

    row = [class_id, *bbox, *kpts]
    return " ".join(row[:TARGET_ROW_VALUES])


def remap_labels_dir(labels_dir: Path) -> tuple[int, int]:
    """Remap all .txt label files in a directory; return (files_updated, rows_updated)."""
    if not labels_dir.exists():
        return 0, 0

    files_updated = 0
    rows_updated = 0

    for label_file in sorted(labels_dir.glob("*.txt")):
        raw_lines = label_file.read_text(encoding="utf-8").splitlines()
        remapped_lines: list[str] = []
        for raw_line in raw_lines:
            remapped = remap_label_row(raw_line)
            if remapped is not None:
                remapped_lines.append(remapped)
                rows_updated += 1

        content = "\n".join(remapped_lines) + ("\n" if remapped_lines else "")
        label_file.write_text(content, encoding="utf-8")
        files_updated += 1

    return files_updated, rows_updated


def rewrite_data_yaml(data_yaml_path: Path = DATA_YAML_PATH) -> None:
    """Rewrite data.yaml with 12-keypoint shape, flip indices, and single 'cow' class."""
    data_yaml_path.parent.mkdir(parents=True, exist_ok=True)

    existing: dict = {}
    if data_yaml_path.exists():
        loaded = yaml.safe_load(data_yaml_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            existing = loaded

    existing.setdefault("path", ".")
    existing.setdefault("train", "train/images")
    existing.setdefault("val", "valid/images")
    existing["nc"] = 1
    existing["kpt_shape"] = [TARGET_KEYPOINTS, 3]
    existing["flip_idx"] = list(FLIP_IDX)
    existing["names"] = {0: "cow"}

    data_yaml_path.write_text(
        yaml.safe_dump(existing, sort_keys=False, default_flow_style=None),
        encoding="utf-8",
    )


def main() -> None:
    """Scan train/valid label folders, remap rows to 41 values, and rewrite data.yaml."""
    total_files = 0
    total_rows = 0
    for labels_dir in LABEL_DIRS:
        files_updated, rows_updated = remap_labels_dir(labels_dir)
        total_files += files_updated
        total_rows += rows_updated
        print(f"{labels_dir}: {files_updated} files, {rows_updated} rows remapped")

    rewrite_data_yaml(DATA_YAML_PATH)
    print(f"Updated {DATA_YAML_PATH} (total: {total_files} files, {total_rows} rows)")


if __name__ == "__main__":
    main()
