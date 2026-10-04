from urllib.parse import quote

from src import config
from src.pipeline.utils import get_project_path


def collect_artifacts(target_dir: str | None = None) -> list[str]:
    artifacts = []
    try:
        resolved_dir = config.OUTPUT_DIR if target_dir is None else target_dir
        output_directory = get_project_path(resolved_dir)
        dir_query = f"?dir={quote(str(output_directory), safe='')}"
        map_image_in_out = output_directory / "map" / "map.png"
        if map_image_in_out.exists() and map_image_in_out.is_file():
            artifacts.append(f"/output/map/map.png{dir_query}")

        artifact_filenames = [
            "1_optimal_path.png",
            "2_user_path.png",
            "3_both_paths.png",
            "4_isp_modifications.png",
            "5_isp_with_user_path.png",
        ]
        results_dir = output_directory / "results"
        for filename in artifact_filenames:
            res_target = results_dir / filename
            if res_target.exists() and res_target.is_file():
                artifacts.append(f"/output/results/{filename}{dir_query}")
    except OSError:
        return artifacts

    return artifacts
