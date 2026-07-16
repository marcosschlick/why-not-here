# TCC 01 Defense

This project contains the code used to generate the map and pathfinding images presented during the TCC 01 defense.

## Project structure

- `src/main.py`: builds the map, calculates the A* route, and generates the images.
- `src/config.py`: defines the map layout, positions, and visual settings.
- `src/astar.py`: implements the A* pathfinding algorithm.
- `src/map_builder.py`, `src/hill.py`, `src/lake.py`, and `src/obstacle.py`: construct the terrain and obstacles.
- `src/visualizer.py`: renders the map and route images.
- `src/generate_textures.py` and `textures/`: generate and store the terrain textures.

## Usage

```bash
python src/generate_textures.py
python src/main.py
```

The five resulting PNG files are written to `generated_images/`.
