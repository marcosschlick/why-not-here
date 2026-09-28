import math
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from src import config
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp
from src.pipeline.utils import (
    create_alternative_path,
    get_project_path,
    prepare_endpoints,
)
from src.planning import plan_path

from .artifacts import collect_artifacts
from .config_manager import get_all_configurations, update_configurations
from .runner import runner
from .schemas import GenerateMapRequest, RunRequest, SolveISPRequest

router = APIRouter(prefix="/api")


def sanitize_floats(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_floats(item) for item in obj]
    return obj


@router.get("/config")
def read_config() -> dict[str, Any]:
    return get_all_configurations()


@router.post("/config")
def modify_config(payload: dict[str, Any]) -> dict[str, Any]:
    updated_items = update_configurations(payload)
    return {"status": "success", "updated": updated_items}


@router.post("/map/generate")
def generate_map_endpoint(payload: GenerateMapRequest) -> dict[str, Any]:
    updates: dict[str, Any] = {
        "MAP_H": payload.MAP_H,
        "MAP_W": payload.MAP_W,
        "CONNECTIVITY": payload.CONNECTIVITY,
        "DEFAULT_REDUCTION_METHOD": payload.DEFAULT_REDUCTION_METHOD,
        "USE_INCREMENTAL_SOLVER": payload.USE_INCREMENTAL_SOLVER,
        "OUTPUT_DIR": payload.OUTPUT_DIR,
    }
    if payload.MAP_DEFAULT_SEED is not None:
        updates["MAP_DEFAULT_SEED"] = payload.MAP_DEFAULT_SEED
    if payload.extra_config:
        updates.update(payload.extra_config)

    update_configurations(updates)

    try:
        grid = generate_map(verbose=False)
        start, goal = prepare_endpoints(grid)
        auto_path = create_alternative_path(grid, start, goal)
        optimal_path, optimal_cost, _ = plan_path(grid, start, goal)

        map_image_in_out = get_project_path(config.OUTPUT_DIR) / "map" / "map.png"
        if map_image_in_out.exists():
            dir_query = (
                f"?dir={config.OUTPUT_DIR}" if config.OUTPUT_DIR != "output" else ""
            )
            map_image_url = f"/output/map/map.png{dir_query}"
        else:
            map_img_path = Path(config.DEFAULT_MAP_IMG)
            map_image_url = f"/maps/{map_img_path.name}"

        safe_optimal_cost = (
            round(optimal_cost, 4)
            if optimal_cost is not None
            and not math.isinf(optimal_cost)
            and not math.isnan(optimal_cost)
            else None
        )

        response_data = {
            "status": "success",
            "h": grid.h,
            "w": grid.w,
            "connectivity": grid.connectivity,
            "start": list(start),
            "goal": list(goal),
            "elevation": grid.elevation,
            "terrain": grid.terrain,
            "obstacle": grid.obstacle,
            "auto_path": auto_path,
            "optimal_path": optimal_path if optimal_path else [],
            "optimal_cost": safe_optimal_cost,
            "map_image_url": map_image_url,
            "config": get_all_configurations(),
        }
        return sanitize_floats(response_data)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate map: {exc!s}"
        ) from exc


@router.post("/isp/solve")
def solve_isp_endpoint(payload: SolveISPRequest) -> dict[str, Any]:
    if runner.is_running():
        raise HTTPException(
            status_code=409, detail="Pipeline execution already in progress"
        )

    if payload.config:
        update_configurations(payload.config)

    p_user = None
    if payload.user_path:
        p_user = [tuple(p) for p in payload.user_path]

    try:
        result = run_isp(verbose=False, user_path=p_user)
        if not result:
            raise HTTPException(
                status_code=500,
                detail="ISP solver failed to produce a valid path or solution.",
            )

        mod_counts = None
        if result.modifications:
            mod_counts = {
                "terrain": len(result.modifications.terrain_nodes),
                "obstacle": len(result.modifications.obstacle_nodes),
                "slope": len(result.modifications.slope_edges),
            }

        orig_cost = (
            round(result.original_optimal_cost, 4)
            if result.original_optimal_cost is not None
            and not math.isinf(result.original_optimal_cost)
            and not math.isnan(result.original_optimal_cost)
            else None
        )
        final_cost = (
            round(result.final_alternative_cost, 4)
            if result.final_alternative_cost is not None
            and not math.isinf(result.final_alternative_cost)
            and not math.isnan(result.final_alternative_cost)
            else None
        )
        runtime = (
            round(result.runtime_sec, 3)
            if result.runtime_sec is not None
            and not math.isinf(result.runtime_sec)
            and not math.isnan(result.runtime_sec)
            else 0.0
        )

        last_result = {
            "success": result.success,
            "solver_status": result.solver_status,
            "runtime_sec": runtime,
            "iterations": result.iterations,
            "original_optimal_cost": orig_cost,
            "final_alternative_cost": final_cost,
            "explanation_text": result.explanation_text,
            "cost_baseline_text": result.cost_baseline_text,
            "modifications": mod_counts,
        }

        artifacts = collect_artifacts(config.OUTPUT_DIR)

        sanitized_result = sanitize_floats(last_result)

        with runner.lock:
            runner.state["last_result"] = sanitized_result
            runner.state["artifacts"] = artifacts
            runner.state["status"] = "completed"

        return {
            "status": "success",
            "result": sanitized_result,
            "artifacts": artifacts,
        }
    except HTTPException:
        raise
    except Exception as exc:
        with runner.lock:
            runner.state["error"] = str(exc)
            runner.state["status"] = "failed"
        raise HTTPException(
            status_code=500, detail=f"Error executing ISP solver: {exc!s}"
        ) from exc


@router.post("/run")
def execute_pipeline(payload: RunRequest) -> dict[str, Any]:
    if runner.is_running():
        raise HTTPException(
            status_code=409, detail="Pipeline execution already in progress"
        )
    runner.start(payload.runs)
    return {"status": "started", "runs": payload.runs}


@router.get("/status")
def fetch_status() -> dict[str, Any]:
    return runner.get_status()


@router.get("/fs/directories")
def list_directories(path: str = "") -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    if path and path.strip():
        target_path = Path(path).resolve()
    else:
        target_path = project_root

    if not target_path.exists() or not target_path.is_dir():
        target_path = project_root

    subdirs = []
    try:
        for entry in sorted(target_path.iterdir(), key=lambda p: p.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                subdirs.append(entry.name)
    except PermissionError:
        subdirs = []

    try:
        relative_to_root = str(target_path.relative_to(project_root))
    except ValueError:
        relative_to_root = str(target_path)

    parent_path = (
        str(target_path.parent)
        if target_path != target_path.parent
        else str(target_path)
    )

    return {
        "current": str(target_path),
        "parent": parent_path,
        "directories": subdirs,
        "relative_to_root": relative_to_root if relative_to_root != "." else "",
        "project_root": str(project_root),
    }


@router.post("/fs/create-dir")
def create_directory(payload: dict[str, str]) -> dict[str, Any]:
    name = payload.get("name", "").strip()
    parent = payload.get("parent", "").strip()
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid directory name")
    project_root = Path(__file__).resolve().parents[2]
    parent_path = Path(parent).resolve() if parent else project_root
    new_dir = parent_path / name
    new_dir.mkdir(parents=True, exist_ok=True)
    return {"status": "success", "path": str(new_dir)}


@router.get("/fs/check-output-dir")
def check_output_dir(path: str = "output") -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    clean_path = path.strip() if path else "output"
    target_path = Path(clean_path)
    if not target_path.is_absolute():
        target_path = (project_root / clean_path).resolve()
    else:
        target_path = target_path.resolve()

    if not target_path.exists() or not target_path.is_dir():
        return {
            "exists": False,
            "file_count": 0,
            "has_artifacts": False,
            "files": [],
        }

    artifact_filenames = {
        "1_optimal_path.png",
        "2_user_path.png",
        "3_both_paths.png",
        "4_isp_modifications.png",
        "5_isp_with_user_path.png",
        "map.png",
        "map.json",
        "log.txt",
    }

    files = [
        f
        for f in target_path.rglob("*")
        if f.is_file()
        and not any(part.startswith(".") for part in f.relative_to(target_path).parts)
    ]
    has_artifacts = any(f.name in artifact_filenames for f in files)

    return {
        "exists": True,
        "file_count": len(files),
        "has_artifacts": has_artifacts,
        "files": [str(f.relative_to(target_path)) for f in files[:10]],
    }


@router.post("/fs/clean-output-dir")
def clean_output_dir(payload: dict[str, str]) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    raw_path = payload.get("path", "output").strip()
    target_path = Path(raw_path)
    if not target_path.is_absolute():
        target_path = (project_root / raw_path).resolve()
    else:
        target_path = target_path.resolve()

    if (
        target_path == Path("/")
        or target_path == Path.home()
        or target_path == project_root
    ):
        raise HTTPException(status_code=400, detail="Cannot clean protected directory")

    if not target_path.exists() or not target_path.is_dir():
        target_path.mkdir(parents=True, exist_ok=True)
        return {"status": "success", "deleted_count": 0}

    deleted_count = 0
    for item in list(target_path.iterdir()):
        if item.name.startswith("."):
            continue
        if item.is_file():
            try:
                item.unlink()
                deleted_count += 1
            except OSError:
                pass
        elif item.is_dir():
            for sub in item.rglob("*"):
                if sub.is_file():
                    deleted_count += 1
            shutil.rmtree(item, ignore_errors=True)

    return {"status": "success", "deleted_count": deleted_count}


@router.post("/browse-directory")
def browse_directory() -> dict[str, str]:
    system = platform.system()
    selected_path = ""
    env = os.environ.copy()
    try:
        if system == "Linux":
            if shutil.which("zenity"):
                res = subprocess.run(
                    [
                        "zenity",
                        "--file-selection",
                        "--directory",
                        "--title=Select Output Directory",
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                if res.returncode == 0:
                    selected_path = res.stdout.strip()
            elif shutil.which("kdialog"):
                res = subprocess.run(
                    ["kdialog", "--getexistingdirectory", "."],
                    check=False,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                if res.returncode == 0:
                    selected_path = res.stdout.strip()
        elif system == "Darwin":
            cmd = "osascript -e 'POSIX path of (choose folder with prompt \"Select Output Directory\")'"
            res = subprocess.run(
                cmd, check=False, shell=True, capture_output=True, text=True, env=env
            )
            if res.returncode == 0:
                selected_path = res.stdout.strip()
        elif system == "Windows":
            cmd = 'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"'
            res = subprocess.run(
                cmd, check=False, shell=True, capture_output=True, text=True, env=env
            )
            if res.returncode == 0:
                selected_path = res.stdout.strip()

        if not selected_path:
            try:
                py_code = (
                    "import sys; "
                    "from PyQt6.QtWidgets import QApplication, QFileDialog; "
                    "app = QApplication(sys.argv); "
                    "p = QFileDialog.getExistingDirectory(None, 'Select Output Directory'); "
                    "print(p or '', end='')"
                )
                res = subprocess.run(
                    [sys.executable, "-c", py_code],
                    check=False,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                if res.returncode == 0:
                    selected_path = res.stdout.strip()
            except (subprocess.SubprocessError, OSError):
                selected_path = ""

        if not selected_path:
            try:
                py_code = (
                    "import tkinter as tk, tkinter.filedialog as fd; "
                    "r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True); "
                    "p = fd.askdirectory(title='Select Output Directory'); "
                    "r.destroy(); print(p or '', end='')"
                )
                res = subprocess.run(
                    [sys.executable, "-c", py_code],
                    check=False,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                if res.returncode == 0:
                    selected_path = res.stdout.strip()
            except (subprocess.SubprocessError, OSError):
                selected_path = ""
    except (subprocess.SubprocessError, OSError):
        selected_path = ""

    return {"path": selected_path}
