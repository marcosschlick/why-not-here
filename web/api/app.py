import sys
from contextlib import asynccontextmanager
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
from web.api.database import initialize_database
from web.api.exports import router as exports_router
from web.api.participation import router as participation_router
from web.api.questionnaires import router as questionnaires_router
from web.api.routes import router
from web.api.scenarios import router as scenarios_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Trajectory Planning & ISP API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(questionnaires_router)
app.include_router(scenarios_router)
app.include_router(participation_router)
app.include_router(exports_router)

from fastapi import HTTPException
from fastapi.responses import FileResponse

from src import config


@app.get("/output/{filename:path}")
def get_output_artifact(filename: str, dir: str | None = None):
    output_directory = get_project_path(config.OUTPUT_DIR if dir is None else dir)
    artifact_path = output_directory / filename
    if artifact_path.exists() and artifact_path.is_file():
        return FileResponse(str(artifact_path))

    raise HTTPException(status_code=404, detail="Artifact not found")


frontend_dist = ROOT_DIR / "web" / "frontend" / "dist"
if frontend_dist.exists():
    app.mount(
        "/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend"
    )
