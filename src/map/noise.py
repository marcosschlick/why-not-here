import numpy as np


def _quintic_fade(t: np.ndarray) -> np.ndarray:
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def perlin_noise_2d(
    h: int,
    w: int,
    freq: float = 0.05,
    seed: int = 42,
    octaves: int = 3,
    persistence: float = 0.5,
    lacunarity: float = 2.0,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    angles = np.linspace(0, 2 * np.pi, 8, endpoint=False)
    gradients = np.stack([np.cos(angles), np.sin(angles)], axis=1)

    y_coords, x_coords = np.indices((h, w), dtype=np.float64)

    total_noise = np.zeros((h, w), dtype=np.float64)
    amplitude = 1.0
    current_freq = freq

    for _ in range(octaves):
        fx = x_coords * current_freq
        fy = y_coords * current_freq

        x0 = np.floor(fx).astype(np.int64)
        x1 = x0 + 1
        y0 = np.floor(fy).astype(np.int64)
        y1 = y0 + 1

        dx = fx - x0
        dy = fy - y0

        grid_w = max(int(np.max(x1)) + 2, 8)
        grid_h = max(int(np.max(y1)) + 2, 8)
        perm = rng.integers(0, 8, size=(grid_h, grid_w))

        g00 = gradients[perm[y0 % grid_h, x0 % grid_w]]
        g10 = gradients[perm[y0 % grid_h, x1 % grid_w]]
        g01 = gradients[perm[y1 % grid_h, x0 % grid_w]]
        g11 = gradients[perm[y1 % grid_h, x1 % grid_w]]

        n00 = g00[:, :, 0] * dx + g00[:, :, 1] * dy
        n10 = g10[:, :, 0] * (dx - 1.0) + g10[:, :, 1] * dy
        n01 = g01[:, :, 0] * dx + g01[:, :, 1] * (dy - 1.0)
        n11 = g11[:, :, 0] * (dx - 1.0) + g11[:, :, 1] * (dy - 1.0)

        u = _quintic_fade(dx)
        v = _quintic_fade(dy)

        nx0 = n00 + u * (n10 - n00)
        nx1 = n01 + u * (n11 - n01)
        layer = nx0 + v * (nx1 - nx0)

        total_noise += amplitude * layer
        amplitude *= persistence
        current_freq *= lacunarity

    min_val = np.min(total_noise)
    max_val = np.max(total_noise)
    if max_val > min_val:
        return (total_noise - min_val) / (max_val - min_val)
    return np.zeros((h, w), dtype=np.float64)
