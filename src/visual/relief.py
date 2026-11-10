import numpy as np


def relief_intensity(
    elevation: np.ndarray, cell_size: float, settings: dict[str, float]
) -> np.ndarray:
    elevation = np.asarray(elevation, dtype=np.float64)
    height, width = elevation.shape
    gradient_x = (
        np.gradient(elevation, cell_size, axis=1)
        if width > 1
        else np.zeros_like(elevation)
    )
    gradient_y = (
        np.gradient(elevation, cell_size, axis=0)
        if height > 1
        else np.zeros_like(elevation)
    )
    gradient_x *= settings["vertical_exaggeration"]
    gradient_y *= settings["vertical_exaggeration"]
    azimuth = np.deg2rad(settings["azimuth"])
    altitude = np.deg2rad(settings["altitude"])
    light_x = np.sin(azimuth) * np.cos(altitude)
    light_y = np.cos(azimuth) * np.cos(altitude)
    light_z = np.sin(altitude)
    normal_length = np.sqrt(gradient_x**2 + gradient_y**2 + 1.0)
    illumination = np.clip(
        (-gradient_x * light_x + gradient_y * light_y + light_z) / normal_length,
        0.0,
        1.0,
    )
    return np.clip(0.5 + settings["strength"] * (illumination - light_z), 0.0, 1.0)
