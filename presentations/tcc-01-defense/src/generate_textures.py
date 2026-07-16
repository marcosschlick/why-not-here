import math
import random

import config
from PIL import Image, ImageDraw

TILE_SIZE = config.TILE_SIZE
TEXTURE_DIR = config.TEXTURE_DIR


def _interpolate_float(start, end, amount):
    return start + (end - start) * amount


def _interpolate_color_channel(start, end, amount):
    return int(start + (end - start) * amount)


def _clamp_color_channel(value):
    return max(0, min(255, int(value)))


def _interpolate_color(start, end, amount):
    amount = max(0.0, min(1.0, amount))
    return tuple(
        _interpolate_color_channel(start[index], end[index], amount)
        for index in range(3)
    )


def _put_pixel(image, x, y, color):
    if 0 <= x < TILE_SIZE and 0 <= y < TILE_SIZE:
        image.putpixel((x, y), color + (255,))


def _raw_noise(x, y, seed):
    def fade(amount):
        return amount * amount * amount * (
            amount * (amount * 6 - 15) + 10
        )

    def gradient(grid_x, grid_y):
        random_generator = random.Random(
            seed
            ^ (int(grid_x) * 1664525 + int(grid_y) * 1013904223)
            & 0xFFFFFFFF
        )
        angle = random_generator.uniform(0, math.tau)
        return math.cos(angle), math.sin(angle)

    x0, y0 = math.floor(x), math.floor(y)
    offset_x, offset_y = x - x0, y - y0
    faded_x, faded_y = fade(offset_x), fade(offset_y)

    def dot_product(grid_x, grid_y):
        gradient_x, gradient_y = gradient(grid_x, grid_y)
        return gradient_x * (x - grid_x) + gradient_y * (y - grid_y)

    return _interpolate_float(
        _interpolate_float(
            dot_product(x0, y0),
            dot_product(x0 + 1, y0),
            faded_x,
        ),
        _interpolate_float(
            dot_product(x0, y0 + 1),
            dot_product(x0 + 1, y0 + 1),
            faded_x,
        ),
        faded_y,
    )


def _seamless_noise(x, y, seed=0):
    normalized_x = x / TILE_SIZE
    normalized_y = y / TILE_SIZE

    # Blend shifted samples to reduce seams at opposite tile edges.
    return (
        _raw_noise(x, y, seed) * (1 - normalized_x) * (1 - normalized_y)
        + _raw_noise(x - TILE_SIZE, y, seed)
        * normalized_x
        * (1 - normalized_y)
        + _raw_noise(x, y - TILE_SIZE, seed)
        * (1 - normalized_x)
        * normalized_y
        + _raw_noise(x - TILE_SIZE, y - TILE_SIZE, seed)
        * normalized_x
        * normalized_y
    )


def _fractal_brownian_motion(x, y, octaves=3, frequency=0.13, seed=0):
    value = 0.0
    amplitude = 0.6
    current_frequency = frequency
    total_amplitude = 0.0

    for octave in range(octaves):
        value += amplitude * _seamless_noise(
            x * current_frequency,
            y * current_frequency,
            seed + octave * 997,
        )
        total_amplitude += amplitude
        amplitude *= 0.5
        current_frequency *= 2.0

    return value / total_amplitude


def _make_grass():
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    dark = (24, 82, 18)
    middle = (44, 118, 30)
    light = (66, 148, 44)

    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            amount = (
                _fractal_brownian_motion(
                    x,
                    y,
                    octaves=4,
                    frequency=0.12,
                    seed=42,
                )
                + 1
            ) / 2
            color = (
                _interpolate_color(dark, middle, amount * 2)
                if amount < 0.5
                else _interpolate_color(middle, light, (amount - 0.5) * 2)
            )
            image.putpixel((x, y), color + (255,))

    blade_tip = (82, 160, 48)
    blade_side = (52, 128, 32)
    blade_shadow = (20, 72, 14)

    # Fixed seeds keep every generated texture reproducible.
    random_generator = random.Random(1337)
    for _ in range(32):
        blade_x = random_generator.randint(1, TILE_SIZE - 2)
        blade_y = random_generator.randint(2, TILE_SIZE - 2)
        _put_pixel(image, blade_x, blade_y - 2, blade_tip)
        _put_pixel(image, blade_x - 1, blade_y - 1, blade_side)
        _put_pixel(image, blade_x + 1, blade_y - 1, blade_side)
        _put_pixel(image, blade_x, blade_y, blade_shadow)

    return image


HILL_PALETTES = {
    1: ((66, 148, 44), (24, 82, 18)),
    2: ((48, 118, 24), (22, 74, 14)),
    3: ((58, 96, 30), (30, 54, 16)),
    4: ((80, 100, 34), (42, 60, 18)),
    5: ((90, 78, 36), (52, 44, 20)),
}


def _make_hill(level):
    light, dark = HILL_PALETTES[level]
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))

    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            amount = (
                _fractal_brownian_motion(
                    x,
                    y,
                    octaves=3,
                    frequency=0.14,
                    seed=level * 31,
                )
                + 1
            ) / 2
            color = _interpolate_color(dark, light, amount)
            image.putpixel((x, y), color + (255,))

    if level >= 4:
        spacing = 6 if level == 4 else 4
        for y in range(TILE_SIZE):
            for x in range(TILE_SIZE):
                if (x + y) % spacing == 0:
                    base_color = image.getpixel((x, y))[:3]
                    darker_color = tuple(
                        _clamp_color_channel(channel - 18)
                        for channel in base_color
                    )
                    image.putpixel((x, y), darker_color + (255,))

    random_generator = random.Random(level * 77 + 5)
    detail_count = [20, 16, 14, 10, 8][level - 1]
    for _ in range(detail_count):
        x = random_generator.randint(0, TILE_SIZE - 1)
        y = random_generator.randint(0, TILE_SIZE - 1)
        base_color = image.getpixel((x, y))[:3]

        color_delta = random_generator.choice([-22, 18])
        detail_color = tuple(
            _clamp_color_channel(channel + color_delta)
            for channel in base_color
        )
        _put_pixel(image, x, y, detail_color)

    return image


def _make_water():
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    angular_step = math.tau / TILE_SIZE
    deep = (18, 50, 115)
    middle = (30, 80, 155)
    bright = (48, 108, 190)

    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            wave_value = (
                0.5
                * math.sin(2 * angular_step * x)
                * math.cos(angular_step * y)
                + 0.3
                * math.sin(4 * angular_step * x)
                * math.cos(2 * angular_step * y)
                + 0.2
                * math.sin(angular_step * x)
                * math.cos(3 * angular_step * y)
            )
            amount = (wave_value + 1) / 2
            color = (
                _interpolate_color(deep, middle, amount * 2)
                if amount < 0.5
                else _interpolate_color(middle, bright, (amount - 0.5) * 2)
            )
            image.putpixel((x, y), color + (255,))

    wave_color = (58, 120, 198)
    for base_y in range(4, TILE_SIZE, 7):
        for x in range(TILE_SIZE):
            offset = round(1.8 * math.sin(x * angular_step * 2))
            y = (base_y + offset) % TILE_SIZE
            image.putpixel((x, y), wave_color + (255,))

    return image


def _make_obstacle_tile(grass_image):
    tile = grass_image.copy().convert("RGBA")
    overlay_path = TEXTURE_DIR / "_obstacle_overlay.png"

    if overlay_path.exists():
        try:
            with Image.open(overlay_path) as source:
                overlay = source.convert("RGBA")
            if overlay.size != (TILE_SIZE, TILE_SIZE):
                overlay = overlay.resize(
                    (TILE_SIZE, TILE_SIZE),
                    Image.Resampling.LANCZOS,
                )
            tile = Image.alpha_composite(tile, overlay)
            print(f"  Using custom overlay: {overlay_path}")
            return tile
        except OSError as error:
            print(f"  Warning: error reading overlay ({error}). Using default X.")

    print("  Warning: _obstacle_overlay.png not found. Using default X.")
    print("  Tip: save your custom obstacle as textures/_obstacle_overlay.png")
    draw = ImageDraw.Draw(tile)
    padding = 5
    draw.line(
        [(padding, padding), (TILE_SIZE - padding, TILE_SIZE - padding)],
        fill=(25, 12, 12, 220),
        width=3,
    )
    draw.line(
        [(TILE_SIZE - padding, padding), (padding, TILE_SIZE - padding)],
        fill=(25, 12, 12, 220),
        width=3,
    )
    draw.line(
        [(padding, padding), (TILE_SIZE - padding, TILE_SIZE - padding)],
        fill=(160, 22, 22, 200),
        width=2,
    )
    draw.line(
        [(TILE_SIZE - padding, padding), (padding, TILE_SIZE - padding)],
        fill=(160, 22, 22, 200),
        width=2,
    )
    return tile


def generate_textures():
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating textures (flat + seamless)...")
    grass = _make_grass()

    textures = {
        "grass.png": grass,
        "water.png": _make_water(),
        "hill1.png": _make_hill(1),
        "hill2.png": _make_hill(2),
        "hill3.png": _make_hill(3),
        "hill4.png": _make_hill(4),
        "hill5.png": _make_hill(5),
    }

    for filename, image in textures.items():
        path = TEXTURE_DIR / filename
        image.convert("RGBA").save(path)
        print(f"  Saved: {path}")

    obstacle_path = TEXTURE_DIR / "obstacle.png"
    _make_obstacle_tile(grass).save(obstacle_path)
    print(f"  Saved: {obstacle_path}")

    print(f"\nTextures in {TEXTURE_DIR}")
    overlay_path = TEXTURE_DIR / "_obstacle_overlay.png"
    print(f"Tip: place an overlay in {overlay_path} to preserve it.")


if __name__ == "__main__":
    generate_textures()
