import numpy as np

from .noise import perlin_noise_2d


def generate_elevation_field(
    height: int,
    width: int,
    seed: int,
    frequency: float,
    octaves: int,
    scale: float,
    persistence: float = 0.5,
) -> tuple[np.ndarray, np.ndarray]:
    normalized = perlin_noise_2d(
        h=height,
        w=width,
        freq=frequency,
        seed=seed,
        octaves=octaves,
        persistence=persistence,
    )
    return normalized, normalized * scale
