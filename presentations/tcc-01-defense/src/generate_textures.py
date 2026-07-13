import math
import os
import random

from PIL import Image, ImageDraw

SIZE = 32
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT_DIR, "textures")
os.makedirs(OUT_DIR, exist_ok=True)


def interpolate_float(a, b, t):
    return a + (b - a) * t


def interpolate_color_channel(a, b, t):
    return int(a + (b - a) * t)


def clamp(v):
    return max(0, min(255, int(v)))


def interpolate_color(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(interpolate_color_channel(c1[i], c2[i], t) for i in range(3))


def put_pixel(image, x, y, color):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        image.putpixel((x, y), color + (255,))


def _raw_noise(x, y, seed):
    def fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    def grad(ix, iy):
        r = random.Random(
            seed ^ (int(ix) * 1664525 + int(iy) * 1013904223) & 0xFFFFFFFF
        )
        a = r.uniform(0, math.tau)
        return math.cos(a), math.sin(a)

    x0, y0 = math.floor(x), math.floor(y)
    tx, ty = x - x0, y - y0
    u, v = fade(tx), fade(ty)

    def dot(ix, iy):
        gx, gy = grad(ix, iy)
        return gx * (x - ix) + gy * (y - iy)

    return interpolate_float(
        interpolate_float(dot(x0, y0), dot(x0 + 1, y0), u),
        interpolate_float(dot(x0, y0 + 1), dot(x0 + 1, y0 + 1), u),
        v,
    )


def seamless_noise(x, y, seed=0):

    nx, ny = x / SIZE, y / SIZE
    return (
        _raw_noise(x, y, seed) * (1 - nx) * (1 - ny)
        + _raw_noise(x - SIZE, y, seed) * nx * (1 - ny)
        + _raw_noise(x, y - SIZE, seed) * (1 - nx) * ny
        + _raw_noise(x - SIZE, y - SIZE, seed) * nx * ny
    )


def fractal_brownian_motion(x, y, octaves=3, freq=0.13, seed=0):
    v, amp, f = 0.0, 0.6, freq
    w = 0.0
    for o in range(octaves):
        v += amp * seamless_noise(x * f, y * f, seed + o * 997)
        w += amp
        amp *= 0.5
        f *= 2.0
    return v / w


def make_grass():

    image = Image.new("RGBA", (SIZE, SIZE))

    DARK = (24, 82, 18)
    MID = (44, 118, 30)
    LIGHT = (66, 148, 44)

    for y in range(SIZE):
        for x in range(SIZE):
            t = (fractal_brownian_motion(x, y, octaves=4, freq=0.12, seed=42) + 1) / 2
            color = (
                interpolate_color(DARK, MID, t * 2)
                if t < 0.5
                else interpolate_color(MID, LIGHT, (t - 0.5) * 2)
            )
            image.putpixel((x, y), color + (255,))

    TIP = (82, 160, 48)
    SIDE = (52, 128, 32)
    SHADOW = (20, 72, 14)
    rng = random.Random(1337)
    for _ in range(32):
        bx = rng.randint(1, SIZE - 2)
        by = rng.randint(2, SIZE - 2)
        put_pixel(image, bx, by - 2, TIP)
        put_pixel(image, bx - 1, by - 1, SIDE)
        put_pixel(image, bx + 1, by - 1, SIDE)
        put_pixel(image, bx, by, SHADOW)

    return image


HILL_PALETTES = {
    1: ((66, 148, 44), (24, 82, 18)),
    2: ((48, 118, 24), (22, 74, 14)),
    3: ((58, 96, 30), (30, 54, 16)),
    4: ((80, 100, 34), (42, 60, 18)),
    5: ((90, 78, 36), (52, 44, 20)),
}


def make_hill(level):

    light, dark = HILL_PALETTES[level]
    image = Image.new("RGBA", (SIZE, SIZE))

    for y in range(SIZE):
        for x in range(SIZE):
            t = (
                fractal_brownian_motion(x, y, octaves=3, freq=0.14, seed=level * 31) + 1
            ) / 2
            color = interpolate_color(dark, light, t)
            image.putpixel((x, y), color + (255,))

    if level >= 4:
        spacing = 6 if level == 4 else 4
        for y in range(SIZE):
            for x in range(SIZE):
                if (x + y) % spacing == 0:
                    base = image.getpixel((x, y))[:3]
                    darker = tuple(clamp(channel - 18) for channel in base)
                    image.putpixel((x, y), darker + (255,))

    rng = random.Random(level * 77 + 5)
    count = [20, 16, 14, 10, 8][level - 1]
    for _ in range(count):
        dx = rng.randint(0, SIZE - 1)
        dy = rng.randint(0, SIZE - 1)
        base = image.getpixel((dx, dy))[:3]

        delta = rng.choice([-22, 18])
        dot_color = tuple(clamp(channel + delta) for channel in base)
        put_pixel(image, dx, dy, dot_color)

    return image


def make_water():

    image = Image.new("RGBA", (SIZE, SIZE))
    S = math.tau / SIZE

    DEEP = (18, 50, 115)
    MID = (30, 80, 155)
    BRIGHT = (48, 108, 190)

    for y in range(SIZE):
        for x in range(SIZE):
            v = (
                0.5 * math.sin(2 * S * x) * math.cos(S * y)
                + 0.3 * math.sin(4 * S * x) * math.cos(2 * S * y)
                + 0.2 * math.sin(S * x) * math.cos(3 * S * y)
            )
            t = (v + 1) / 2
            color = (
                interpolate_color(DEEP, MID, t * 2)
                if t < 0.5
                else interpolate_color(MID, BRIGHT, (t - 0.5) * 2)
            )
            image.putpixel((x, y), color + (255,))

    WAVE = (58, 120, 198)
    for base_y in range(4, SIZE, 7):
        for x in range(SIZE):
            off = round(1.8 * math.sin(x * S * 2))
            y = (base_y + off) % SIZE
            image.putpixel((x, y), WAVE + (255,))

    return image


def make_obstacle_tile(grass_image):

    tile = grass_image.copy().convert("RGBA")

    overlay_path = os.path.join(OUT_DIR, "_obstacle_overlay.png")
    if os.path.exists(overlay_path):
        try:
            overlay = Image.open(overlay_path).convert("RGBA")
            if overlay.size != (SIZE, SIZE):
                overlay = overlay.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
            tile = Image.alpha_composite(tile, overlay)
            print(f"  Using custom overlay: {overlay_path}")
            return tile
        except Exception as e:
            print(f"  Warning: error reading overlay ({e}). Using default X.")

    print("  Warning: _obstacle_overlay.png not found. Using default X.")
    print("  Tip: save your custom obstacle as textures/_obstacle_overlay.png")
    draw = ImageDraw.Draw(tile)
    pad = 5
    draw.line([(pad, pad), (SIZE - pad, SIZE - pad)], fill=(25, 12, 12, 220), width=3)
    draw.line([(SIZE - pad, pad), (pad, SIZE - pad)], fill=(25, 12, 12, 220), width=3)
    draw.line([(pad, pad), (SIZE - pad, SIZE - pad)], fill=(160, 22, 22, 200), width=2)
    draw.line([(SIZE - pad, pad), (pad, SIZE - pad)], fill=(160, 22, 22, 200), width=2)
    return tile


def generate_all():
    print("Generating textures v3 (flat + seamless)...")
    grass = make_grass()

    tiles = {
        "grass.png": grass,
        "water.png": make_water(),
        "hill1.png": make_hill(1),
        "hill2.png": make_hill(2),
        "hill3.png": make_hill(3),
        "hill4.png": make_hill(4),
        "hill5.png": make_hill(5),
    }

    for filename, image in tiles.items():
        path = os.path.join(OUT_DIR, filename)
        image.convert("RGBA").save(path)
        print(f"  Saved: {path}")

    obstacle_path = os.path.join(OUT_DIR, "obstacle.png")
    make_obstacle_tile(grass).save(obstacle_path)
    print(f"  Saved: {obstacle_path}")

    print(f"\nTextures in {OUT_DIR}")
    overlay_path = os.path.join(OUT_DIR, "_obstacle_overlay.png")
    print(f"Tip: place an overlay in {overlay_path} to preserve it.")


if __name__ == "__main__":
    generate_all()
