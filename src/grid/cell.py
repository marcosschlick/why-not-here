from .. import config


class Cell:
    def __init__(
        self,
        terrain: str | None = None,
        elevation: float | None = None,
        obstacle: int | None = None,
    ) -> None:
        self.terrain = terrain if terrain is not None else config.DEFAULT_TERRAIN
        self.elevation = elevation if elevation is not None else config.DEFAULT_ELEVATION
        self.obstacle = obstacle if obstacle is not None else config.DEFAULT_OBSTACLE

    @property
    def is_blocked(self) -> bool:
        return self.obstacle != 0 or self.terrain in config.IMPASSABLE_TERRAINS
