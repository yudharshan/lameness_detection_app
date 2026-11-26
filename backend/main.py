"""HerdSight FastAPI backend for monocular cattle lameness analysis."""

from pathlib import Path
import shutil
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pipeline import process_cattle_video
from schemas import CattlePassage

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="HerdSight Lameness Detection API",
    version="0.1.0",
)

# Allow all origins so Expo Web and physical devices over local Wi-Fi can connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Simple liveness probe for the Expo frontend."""
    return {"status": "ok"}


@app.post("/analyze-video", response_model=list[CattlePassage])
async def analyze_video(
    file: UploadFile = File(...),
    next_entry_order: int = Form(1),
) -> list[CattlePassage]:
    """Save an uploaded walk-through video and return scored CattlePassage records."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    suffix = Path(file.filename).suffix or ".mp4"
    saved_name = f"{uuid.uuid4().hex}{suffix}"
    destination = UPLOAD_DIR / saved_name

    try:
        with destination.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    saved_path = str(destination)
    try:
        return process_cattle_video(saved_path, next_entry_order)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
