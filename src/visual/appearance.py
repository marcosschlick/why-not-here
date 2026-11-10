import copy


def _tree(center_x: float, top: float, size: float) -> list[list[list[float]]]:
    outline = [
        [0, 0],
        [-0.18, 0.28],
        [-0.08, 0.28],
        [-0.3, 0.57],
        [-0.12, 0.57],
        [-0.38, 0.86],
        [0.38, 0.86],
        [0.12, 0.57],
        [0.3, 0.57],
        [0.08, 0.28],
        [0.18, 0.28],
        [0, 0],
    ]
    return [
        [[center_x + x * size, top + y * size] for x, y in outline],
        [[center_x, top + 0.86 * size], [center_x, top + size]],
    ]


def _texture_variants(texture: dict) -> list[dict]:
    variants = []
    for flip, offset_x, offset_y in [
        (False, 0.0, 0.0),
        (True, 0.02, -0.03),
        (False, -0.03, 0.04),
    ]:
        variants.append(
            {
                "strokes": [
                    [
                        [(1 - x if flip else x) + offset_x, y + offset_y]
                        for x, y in stroke
                    ]
                    for stroke in texture.get("strokes", [])
                ],
                "dots": [
                    [(1 - x if flip else x) + offset_x, y + offset_y, radius]
                    for x, y, radius in texture.get("dots", [])
                ],
            }
        )
    return variants


TERRAIN_TEXTURES = {
    "COMPACTED_SOIL": {
        "strokes": [
            [[0.18, 0.36], [0.37, 0.34], [0.46, 0.36]],
            [[0.52, 0.65], [0.68, 0.67], [0.82, 0.64]],
        ],
        "dots": [[0.7, 0.3, 0.025], [0.3, 0.73, 0.025]],
    },
    "UNPAVED_TRACK": {
        "strokes": [
            [[0.32, 0.15], [0.29, 0.4]],
            [[0.29, 0.52], [0.32, 0.85]],
            [[0.68, 0.15], [0.71, 0.48]],
            [[0.71, 0.61], [0.68, 0.85]],
        ],
        "dots": [[0.48, 0.35, 0.025], [0.52, 0.72, 0.025]],
    },
    "GRASS": {
        "strokes": [
            [[0.28, 0.7], [0.23, 0.47]],
            [[0.28, 0.7], [0.35, 0.33]],
            [[0.28, 0.7], [0.46, 0.51]],
            [[0.68, 0.76], [0.61, 0.56]],
            [[0.68, 0.76], [0.76, 0.42]],
        ],
    },
    "GRASSLAND": {
        "strokes": [
            [[0.23, 0.68], [0.28, 0.36], [0.32, 0.27]],
            [[0.28, 0.42], [0.18, 0.34]],
            [[0.66, 0.77], [0.7, 0.45], [0.77, 0.34]],
            [[0.7, 0.52], [0.61, 0.45]],
        ],
    },
    "DRY_VEGETATION": {
        "strokes": [
            [[0.28, 0.74], [0.39, 0.51], [0.35, 0.28]],
            [[0.39, 0.51], [0.22, 0.43]],
            [[0.39, 0.51], [0.53, 0.4]],
            [[0.65, 0.78], [0.71, 0.62], [0.78, 0.65]],
        ],
    },
    "SAND": {
        "strokes": [
            [[0.18, 0.65], [0.3, 0.61], [0.43, 0.64]],
            [[0.57, 0.38], [0.68, 0.35], [0.81, 0.38]],
        ],
        "dots": [
            [0.25, 0.29, 0.027],
            [0.45, 0.42, 0.022],
            [0.71, 0.72, 0.03],
            [0.51, 0.8, 0.022],
        ],
    },
    "MUD": {
        "strokes": [
            [[0.16, 0.39], [0.3, 0.33], [0.48, 0.37]],
            [[0.23, 0.48], [0.4, 0.47]],
            [[0.54, 0.68], [0.65, 0.62], [0.83, 0.66]],
            [[0.62, 0.77], [0.79, 0.76]],
        ],
    },
    "ROCKY": {
        "strokes": [
            [
                [0.18, 0.56],
                [0.25, 0.28],
                [0.43, 0.23],
                [0.58, 0.46],
                [0.47, 0.62],
                [0.18, 0.56],
            ],
            [[0.25, 0.28], [0.36, 0.46], [0.58, 0.46]],
            [[0.58, 0.77], [0.64, 0.61], [0.81, 0.6], [0.85, 0.78], [0.58, 0.77]],
        ],
    },
    "FOREST": {"strokes": _tree(0.5, 0.14, 0.7)},
    "DENSE_FOREST": {
        "strokes": _tree(0.3, 0.26, 0.5)
        + _tree(0.73, 0.23, 0.5)
        + _tree(0.52, 0.12, 0.55)
    },
    "WATER_RIVER": {
        "strokes": [
            [[0.15, 0.36], [0.28, 0.3], [0.41, 0.36], [0.54, 0.3]],
            [[0.4, 0.67], [0.54, 0.61], [0.68, 0.67], [0.83, 0.61]],
        ],
    },
}
TERRAIN_TEXTURES = {
    name: {**texture, "variants": _texture_variants(texture)}
    for name, texture in TERRAIN_TEXTURES.items()
}

MAP_APPEARANCE = {
    "relief": {
        "azimuth": 315.0,
        "altitude": 45.0,
        "vertical_exaggeration": 2.0,
        "strength": 0.8,
    },
    "terrain_textures": TERRAIN_TEXTURES,
    "texture_min_cell_pixels": 8,
    "texture_color": "#282828",
    "texture_opacity": 0.24,
    "texture_line_width": 0.045,
    "texture_overview": {
        "target_pixels": 16,
        "opacity": 0.16,
        "line_width": 0.045,
    },
    "obstacle_shade": 0.58,
    "obstacle_texture_color": "#F8F8F8",
    "obstacle_texture_opacity": 0.55,
}


def resolve_map_appearance(height: int, width: int) -> dict:
    appearance = copy.deepcopy(MAP_APPEARANCE)
    if max(height, width) > 128:
        appearance["relief"]["strength"] = 0.45
    return appearance
