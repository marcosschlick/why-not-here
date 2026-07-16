import config
from astar import astar
from map_builder import build_map
from visualizer import generate_images


def main():
    print("Building map (manual configuration)...")
    grid = build_map()
    print("Map built.")
    print(f"Calculating A* route with {config.ASTAR_HEURISTIC} heuristic...")
    route = astar(grid, config.START, config.GOAL, config.ASTAR_HEURISTIC)
    print("Route found.")
    print("Generating images...")
    generate_images(grid, config.START, config.GOAL, route)


if __name__ == "__main__":
    main()
