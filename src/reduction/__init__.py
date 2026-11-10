from ..grid import Grid
from ..resources import require_memory
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
    protected_nodes: set[tuple[int, int]] | None = None,
) -> ReducedGraph | None:
    norm_method = method.strip().upper()
    if norm_method in {"BBOX", "SPARSIFIED", "FLOODFILL"}:
        points = p_star + p_prime
        rows = [u[0] for u in points]
        cols = [u[1] for u in points]
        node_count = (
            (max(rows) - min(rows) + 1) * (max(cols) - min(cols) + 1) if points else 0
        )
    elif norm_method == "PATH_ONLY":
        node_count = len(p_star) + len(p_prime)
    else:
        node_count = grid.h * grid.w
    require_memory(
        node_count * (512 + grid.connectivity * 2048), "ISP graph preparation"
    )
    if norm_method == "NONE":
        return None
    if norm_method == "BBOX":
        return extract_bbox(grid, p_star, p_prime)
    if norm_method == "FLOODFILL":
        return extract_floodfill(grid, p_star, p_prime)
    if norm_method == "SPARSIFIED":
        decision_nodes = set(p_prime) | (protected_nodes or set())
        semantic_nodes = decision_nodes | {
            neighbor for node in decision_nodes for neighbor in grid.get_neighbors(node)
        }
        return extract_sparsified(grid, p_star, p_prime, protected_nodes=semantic_nodes)
    if norm_method == "PATH_ONLY":
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
