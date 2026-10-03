import numpy as np

from .noise import perlin_noise_2d


def generate_elevation_field(
    height: int,
    width: int,
    seed: int,
    frequency: float,
    octaves: int,
    scale: float,
) -> tuple[np.ndarray, np.ndarray]:
    normalized = perlin_noise_2d(
        h=height,
        w=width,
        freq=frequency,
        seed=seed,
        octaves=octaves,
    )
    return normalized, normalized * scale
