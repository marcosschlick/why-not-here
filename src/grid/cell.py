from ..config import (
    DEFAULT_ELEVATION,
    DEFAULT_OBSTACLE,
    DEFAULT_TERRAIN,
    IMPASSABLE_TERRAINS,
)


class Cell:
    def __init__(
        self,
        terrain: str = DEFAULT_TERRAIN,
        elevation: float = DEFAULT_ELEVATION,
        obstacle: int = DEFAULT_OBSTACLE,
    ) -> None:
        self.terrain = terrain
        self.elevation = elevation
        self.obstacle = obstacle

    @property
    def is_blocked(self) -> bool:
        return self.obstacle != 0 or self.terrain in IMPASSABLE_TERRAINS
