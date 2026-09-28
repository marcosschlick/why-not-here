import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
ROOT_DIR = SRC_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.pipeline.benchmark import run_benchmark
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp


def main():
    if len(sys.argv) > 1:
        choice = sys.argv[1].strip()
    else:
        print("Select run mode:")
        print(" [1] Generate map")
        print(" [2] Run A* and ISP on existing map")
        print(" [3] Run benchmark suite")
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
        run_benchmark()
    elif choice in ("0", "q", "exit"):
        return
    else:
        print(f"Invalid option: '{choice}'. Use 1, 2, or 3.")


if __name__ == "__main__":
    main()
