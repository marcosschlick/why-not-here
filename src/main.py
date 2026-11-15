import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
ROOT_DIR = SRC_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.pipeline.batch import execute_batch
from src.pipeline.experiment_config import execute_experiment, load_experiment_file
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp


def run_configuration(path: str) -> bool:
    if Path(path).expanduser().is_dir():
        return execute_batch(path)
    execute_experiment(load_experiment_file(path), verbose=True)
    return True


def main():
    if len(sys.argv) > 1:
        arg1 = sys.argv[1].strip()
        if arg1 == "run" and len(sys.argv) > 2:
            config_path = sys.argv[2].strip()
            return 0 if run_configuration(config_path) else 1
        if arg1.endswith(".json") or Path(arg1).expanduser().exists():
            return 0 if run_configuration(arg1) else 1
        choice = arg1
    else:
        print("Select run mode:")
        print(" [1] Generate map")
        print(" [2] Run A* and ISP on existing map")
        print(" [3] Run experiment from configuration file")
        print(" [0] Exit")
        try:
            choice = input("Choice (1-3): ").strip()
        except (KeyboardInterrupt, EOFError):
            return

    if choice == "1":
        generate_map()
    elif choice == "2":
        run_isp()
    elif choice == "3":
        try:
            filepath = input("Configuration file or batch directory path: ").strip()
        except (KeyboardInterrupt, EOFError):
            return
        if not filepath:
            print("Error: Configuration file path cannot be empty.")
            return
        try:
            return 0 if run_configuration(filepath) else 1
        except (OSError, RuntimeError, TypeError, ValueError, KeyError) as exc:
            print(f"Error executing experiment: {exc}")
    elif choice in ("0", "q", "exit"):
        return
    else:
        print(f"Invalid option: '{choice}'. Use 1, 2, or 3.")


if __name__ == "__main__":
    sys.exit(main())
