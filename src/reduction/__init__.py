from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges, prepare_subgraph
from .bbox import extract_bbox
from .floodfill import extract_floodfill
from .path_only import extract_path_only
from .sparsified import extract_sparsified


def create_reduced_graph(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
    method: str = "NONE",
    margin: int = 2,
) -> ReducedGraph | None:
    norm_method = method.strip().upper()
    if norm_method == "NONE":
        return None
    if norm_method == "BBOX":
        return extract_bbox(grid, p_star, p_prime, margin=margin)
    if norm_method == "FLOODFILL":
        return extract_floodfill(grid, p_star, p_prime)
    if norm_method == "SPARSIFIED":
        return extract_sparsified(grid, p_star, p_prime, margin=margin)
    if norm_method in ("PATH_ONLY", "PATHONLY"):
        return extract_path_only(grid, p_star, p_prime)
    raise ValueError(f"Unknown graph reduction method: {method}")


__all__ = [
    "ReducedGraph",
    "create_reduced_graph",
    "extract_bbox",
    "extract_floodfill",
    "extract_induced_edges",
    "extract_path_only",
    "extract_sparsified",
    "prepare_subgraph",
]
