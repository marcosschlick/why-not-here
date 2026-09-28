import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.pipeline.utils import get_project_path
from web.api.routes import router

app = FastAPI(title="Trajectory Planning & ISP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

maps_dir = get_project_path("maps")
maps_dir.mkdir(parents=True, exist_ok=True)
app.mount("/maps", StaticFiles(directory=str(maps_dir)), name="maps")

from fastapi import HTTPException
from fastapi.responses import FileResponse

from src import config


@app.get("/output/{filename:path}")
def get_output_artifact(filename: str, dir: str | None = None):
    clean_name = Path(filename).name
    candidates = []

    if dir:
        custom_dir = get_project_path(dir)
        candidates.extend(
            [
                custom_dir / filename,
                custom_dir / "results" / clean_name,
                custom_dir / "map" / clean_name,
                custom_dir / clean_name,
            ]
        )

    current_out = get_project_path(config.OUTPUT_DIR)
    candidates.extend(
        [
            current_out / filename,
            current_out / "results" / clean_name,
            current_out / "map" / clean_name,
            current_out / clean_name,
        ]
    )

    default_out = get_project_path("output")
    candidates.extend(
        [
            default_out / filename,
            default_out / "results" / clean_name,
            default_out / "map" / clean_name,
            default_out / clean_name,
        ]
    )

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))

    raise HTTPException(status_code=404, detail="Artifact not found")


frontend_dist = ROOT_DIR / "web" / "frontend" / "dist"
if frontend_dist.exists():
    app.mount(
        "/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend"
    )
