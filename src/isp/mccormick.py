import cvxpy as cp
import numpy as np
from scipy.sparse import lil_matrix


def linearize_mccormick_terms(
    cross_items: list[tuple[int, int, int, float]],
    num_edges: int,
    z_terrain: cp.Variable | None,
    z_slope: cp.Variable | None,
) -> tuple[cp.Expression | None, list[cp.Constraint]]:
    if not cross_items or z_terrain is None or z_slope is None:
        return None, []

    num_cross = len(cross_items)
    y_cross = cp.Variable(num_cross, nonneg=True)
    M_cross = lil_matrix((num_edges, num_cross), dtype=np.float64)
    constraints: list[cp.Constraint] = []

    for ci, (k_edge, t_idx, s_idx, delta) in enumerate(cross_items):
        M_cross[k_edge, ci] = delta
        constraints.append(y_cross[ci] <= z_terrain[t_idx])
        constraints.append(y_cross[ci] <= z_slope[s_idx])
        constraints.append(y_cross[ci] >= z_terrain[t_idx] + z_slope[s_idx] - 1.0)

    cross_term = M_cross.tocsr() @ y_cross
    return cross_term, constraints
