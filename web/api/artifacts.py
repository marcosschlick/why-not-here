from urllib.parse import quote

from src import config
from src.pipeline.artifact_names import (
    MAP_DIRECTORY_NAME,
    MAP_IMAGE_FILENAME,
    RESULT_IMAGE_FILENAMES,
    RESULTS_DIRECTORY_NAME,
)
from src.pipeline.utils import get_project_path


def collect_artifacts(target_dir: str | None = None) -> list[str]:
    artifacts = []
    try:
        resolved_dir = config.OUTPUT_DIR if target_dir is None else target_dir
        output_directory = get_project_path(resolved_dir)
        dir_query = f"?dir={quote(str(output_directory), safe='')}"
        map_image_in_out = output_directory / MAP_DIRECTORY_NAME / MAP_IMAGE_FILENAME
        if map_image_in_out.exists() and map_image_in_out.is_file():
            artifacts.append(
                f"/output/{MAP_DIRECTORY_NAME}/{MAP_IMAGE_FILENAME}{dir_query}"
            )

        results_dir = output_directory / RESULTS_DIRECTORY_NAME
        for filename in RESULT_IMAGE_FILENAMES:
            res_target = results_dir / filename
            if res_target.exists() and res_target.is_file():
                artifacts.append(f"/output/results/{filename}{dir_query}")
    except OSError:
        return artifacts

    return artifacts
