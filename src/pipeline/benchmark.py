from src import config

from .run_isp import run_isp


def run_benchmark() -> None:
    print("Starting benchmark suite...")

    config.USE_INCREMENTAL_SOLVER = False
    config.DEFAULT_REDUCTION_METHOD = "NONE"
    config.OUTPUT_DIR = "results/monolithic_none"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = False
    config.DEFAULT_REDUCTION_METHOD = "BBOX"
    config.OUTPUT_DIR = "results/monolithic_bbox"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = False
    config.DEFAULT_REDUCTION_METHOD = "FLOODFILL"
    config.OUTPUT_DIR = "results/monolithic_floodfill"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = False
    config.DEFAULT_REDUCTION_METHOD = "SPARSIFIED"
    config.OUTPUT_DIR = "results/monolithic_sparsified"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = False
    config.DEFAULT_REDUCTION_METHOD = "PATH_ONLY"
    config.OUTPUT_DIR = "results/monolithic_path_only"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = True
    config.DEFAULT_REDUCTION_METHOD = "NONE"
    config.OUTPUT_DIR = "results/incremental_none"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = True
    config.DEFAULT_REDUCTION_METHOD = "BBOX"
    config.OUTPUT_DIR = "results/incremental_bbox"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = True
    config.DEFAULT_REDUCTION_METHOD = "FLOODFILL"
    config.OUTPUT_DIR = "results/incremental_floodfill"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = True
    config.DEFAULT_REDUCTION_METHOD = "SPARSIFIED"
    config.OUTPUT_DIR = "results/incremental_sparsified"
    run_isp()

    config.USE_INCREMENTAL_SOLVER = True
    config.DEFAULT_REDUCTION_METHOD = "PATH_ONLY"
    config.OUTPUT_DIR = "results/incremental_path_only"
    run_isp()

    print("Benchmark suite completed.")
