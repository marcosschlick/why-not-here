import time

from src import config
from src.grid.grid import Grid
from src.incremental import (
    ClosedLoopResult,
    ISPValidator,
    solve_closed_loop,
    validate_global_optimality,
)
from src.isp.precheck import validate_alternative_path
from src.isp.solver import ISPSolver
from src.planning import plan_path
from src.reduction import create_reduced_graph
from src.visual.plotter import render_tactical_map

from .utils import create_alternative_path, get_project_path, prepare_endpoints


def format_artifact_skip_note(result: ClosedLoopResult) -> str | None:
    if result.success:
        return None

    modifications = result.modifications
    has_candidates = modifications is not None and any(
        (
            modifications.terrain_nodes,
            modifications.obstacle_nodes,
            modifications.slope_edges,
        )
    )

    if result.solver_status == "INFEASIBLE":
        return " (Note: Maps 4 and 5 were skipped because no viable modifications were found)"

    if result.solver_status in {"TIMEOUT", "MAX_ITERATIONS_EXCEEDED"}:
        return " (Note: Maps 4 and 5 were skipped because the solver reached the limit before certifying a global solution)"

    if has_candidates and result.solver_status in {
        "SUBGRAPH_OPTIMAL_ONLY",
        "SUBOPTIMAL",
        "DISCONNECTED_GRAPH",
        "STALLED_OR_CYCLE",
    }:
        return " (Note: Maps 4 and 5 were skipped because the candidate modifications failed global validation)"

    if has_candidates:
        return " (Note: Maps 4 and 5 were skipped because candidate modifications were returned without global certification)"

    return " (Note: Maps 4 and 5 were skipped because the solver did not return a usable globally certified solution)"


def run_isp(
    verbose: bool = True, user_path: list[tuple[int, int]] | None = None
) -> ClosedLoopResult | None:
    map_dir = get_project_path(config.OUTPUT_DIR) / "map"
    map_json_path = map_dir / "map.json"
    if not map_json_path.exists():
        map_json_path = get_project_path(config.DEFAULT_MAP_FILE)
    if not map_json_path.exists():
        print(f"Error: Map file not found at '{map_json_path}'. Run option 1 first.")
        return None

    log_lines = []

    msg_load = f"[2] Loading map from '{map_json_path}'..."
    if verbose:
        print(msg_load)
    log_lines.append(msg_load)

    grid = Grid.load(map_json_path)
    start, goal = prepare_endpoints(grid)

    p_star, cost_star, expanded = plan_path(
        grid, start, goal, algorithm=config.DEFAULT_PLANNER
    )
    if not p_star:
        print("Error: No traversable path found between start and goal.")
        return None

    if user_path is not None:
        p_user = [tuple(p) for p in user_path]
    else:
        p_user = create_alternative_path(grid, start, goal)

    validation_started = time.perf_counter()
    is_valid, invalid_status, invalid_message = validate_alternative_path(
        grid, start, goal, p_user
    )
    if not is_valid:
        if verbose and invalid_message:
            print(invalid_message)
        return ClosedLoopResult(
            success=False,
            modifications=None,
            explanation_text=invalid_message or "The alternative path is invalid.",
            iterations=0,
            competing_paths_count=0,
            original_optimal_path=p_star if p_star else [],
            original_optimal_cost=cost_star,
            final_alternative_cost=float("inf"),
            runtime_sec=time.perf_counter() - validation_started,
            solver_status=invalid_status or "INVALID_ALTERNATIVE_PATH",
            reduction_method=config.DEFAULT_REDUCTION_METHOD,
            cost_baseline_text="",
        )

    cost_user_orig = ISPValidator.compute_path_cost(grid, p_user)

    msg_star = f"Optimal path ({config.DEFAULT_PLANNER}): {len(p_star)} steps (cost: {cost_star:.2f}s, expanded: {expanded} nodes)"
    log_lines.append(msg_star)
    if verbose:
        print(msg_star)

    if cost_user_orig < float("inf"):
        diff_sec = cost_user_orig - cost_star
        pct = (diff_sec / cost_star) * 100.0 if cost_star > 0 else 0.0
        msg_user = f"Alternative candidate path: {len(p_user)} steps (cost: {cost_user_orig:.2f}s, +{diff_sec:.2f}s / +{pct:.1f}%)"
    else:
        msg_user = f"Alternative candidate path: {len(p_user)} steps (cost: impassable in original map)"
    log_lines.append(msg_user)
    if verbose:
        print(msg_user)

    strategy_name = "INCREMENTAL" if config.USE_INCREMENTAL_SOLVER else "MONOLITHIC"
    msg_strat = f"Running ISP solver (Strategy: {strategy_name}, Reduction: {config.DEFAULT_REDUCTION_METHOD}, Solver: {config.DEFAULT_SOLVER})..."
    log_lines.append(msg_strat)
    if verbose:
        print(msg_strat)

    if config.USE_INCREMENTAL_SOLVER:
        isp_result = solve_closed_loop(
            grid,
            start,
            goal,
            p_user,
            reduction_method=config.DEFAULT_REDUCTION_METHOD,
            bbox_margin=config.BBOX_MARGIN,
            solver_name=config.DEFAULT_SOLVER,
            timeout=config.SOLVER_TIMEOUT_SEC,
            max_iterations=config.MAX_ISP_ITERATIONS,
            tolerance=config.INCREMENTAL_TOLERANCE,
        )
    else:
        start_time = time.perf_counter()
        reduced_graph = create_reduced_graph(
            grid,
            p_star if p_star else p_user,
            p_user,
            method=config.DEFAULT_REDUCTION_METHOD,
            margin=config.BBOX_MARGIN,
        )
        solver = ISPSolver(
            solver_name=config.DEFAULT_SOLVER,
            timeout=config.SOLVER_TIMEOUT_SEC,
            tolerance=config.INCREMENTAL_TOLERANCE,
        )
        success, modifications, _ = solver.solve(
            grid, start, goal, p_user, reduced_graph=reduced_graph
        )
        elapsed = time.perf_counter() - start_time

        final_alt_cost = cost_user_orig
        if success and modifications is not None:
            is_globally_optimal, _, p_cost, _ = validate_global_optimality(
                grid, start, goal, p_user, modifications
            )
            final_alt_cost = p_cost
            if not is_globally_optimal:
                solver_status = "SUBGRAPH_OPTIMAL_ONLY" if reduced_graph is not None else "SUBOPTIMAL"
                success = False
            else:
                solver_status = solver.last_solver_status or "OPTIMAL"
        else:
            solver_status = solver.last_solver_status or "SOLVER_FAILED"

        if success and modifications is not None:
            explanation = ISPValidator.generate_explanation_text(modifications, grid)
        elif solver_status == "OPTIMAL_INACCURATE":
            explanation = (
                "The MILP solver returned OPTIMAL_INACCURATE; the run is inconclusive "
                "and does not certify minimum intervention cardinality."
            )
        else:
            explanation = (
                "The alternative path p' could not be made optimal by the planner "
                "within the allowed intervention domain."
            )
        cost_baseline = ISPValidator.generate_cost_baseline_justification(
            cost_star,
            cost_user_orig,
        )
        isp_result = ClosedLoopResult(
            success=success,
            modifications=modifications,
            explanation_text=explanation,
            iterations=1,
            competing_paths_count=1,
            original_optimal_path=p_star if p_star else [],
            original_optimal_cost=cost_star,
            final_alternative_cost=final_alt_cost,
            runtime_sec=elapsed,
            solver_status=solver_status,
            reduction_method=config.DEFAULT_REDUCTION_METHOD,
            cost_baseline_text=cost_baseline,
        )

    out_dir = get_project_path(config.OUTPUT_DIR)
    results_dir = out_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    img1 = results_dir / "1_optimal_path.png"
    img2 = results_dir / "2_user_path.png"
    img3 = results_dir / "3_both_paths.png"
    img4 = results_dir / "4_isp_modifications.png"
    img5 = results_dir / "5_isp_with_user_path.png"

    render_tactical_map(
        grid=grid,
        optimal_path=p_star,
        title="1. Optimal Path (A*)",
        save_path=str(img1),
    )

    render_tactical_map(
        grid=grid,
        user_path=p_user,
        title="2. Alternative Candidate Path",
        save_path=str(img2),
    )

    render_tactical_map(
        grid=grid,
        optimal_path=p_star,
        user_path=p_user,
        title="3. Optimal vs Alternative Path",
        save_path=str(img3),
    )

    saved_images = [img1, img2, img3]

    if isp_result.success and isp_result.modifications:
        mod_grid = ISPValidator.apply_modifications(grid, isp_result.modifications)
        render_tactical_map(
            grid=grid,
            modifications=isp_result.modifications,
            modified_grid=mod_grid,
            title="4. ISP Modifications Only",
            save_path=str(img4),
        )
        render_tactical_map(
            grid=grid,
            user_path=p_user,
            modifications=isp_result.modifications,
            modified_grid=mod_grid,
            title="5. ISP Modifications with Alternative Path",
            save_path=str(img5),
        )
        saved_images.extend([img4, img5])

    mods = isp_result.modifications
    n_terrain = len(mods.terrain_nodes) if mods else 0
    n_obs = len(mods.obstacle_nodes) if mods else 0
    n_slope = len(mods.slope_edges) if mods else 0
    artifact_skip_note = format_artifact_skip_note(isp_result)

    log_lines.append("-" * 60)
    log_lines.append(
        f"ISP Status: {isp_result.solver_status} "
        f"(Method: {isp_result.reduction_method}, Iterations: {isp_result.iterations}, Time: {isp_result.runtime_sec:.3f}s)"
    )
    log_lines.append(
        f"Modifications: {n_terrain} terrain, {n_obs} obstacles, {n_slope} slopes"
    )
    log_lines.append(
        f"\nContrastive Explanation (Experimental Group):\n{isp_result.explanation_text}"
    )
    if isp_result.cost_baseline_text:
        log_lines.append(
            f"\nCost Baseline Justification (Control Group):\n{isp_result.cost_baseline_text}"
        )
    log_lines.append("\nSaved artifacts in output/:")
    for img in saved_images:
        log_lines.append(f" - {img.name}")
    if artifact_skip_note:
        log_lines.append(artifact_skip_note)
    log_lines.append("-" * 60)

    log_content = "\n".join(log_lines) + "\n"
    if verbose:
        print("-" * 60)
        print(
            f"ISP Status: {isp_result.solver_status} "
            f"(Method: {isp_result.reduction_method}, Iterations: {isp_result.iterations}, Time: {isp_result.runtime_sec:.3f}s)"
        )
        print(
            f"Modifications: {n_terrain} terrain, {n_obs} obstacles, {n_slope} slopes"
        )
        print(
            f"\nContrastive Explanation (Experimental Group):\n{isp_result.explanation_text}"
        )
        if isp_result.cost_baseline_text:
            print(
                f"\nCost Baseline Justification (Control Group):\n{isp_result.cost_baseline_text}"
            )
        print("\nSaved artifacts in output/:")
        for img in saved_images:
            print(f" - {img.name}")
        if artifact_skip_note:
            print(artifact_skip_note)
        print("-" * 60)

    log_path = results_dir / "log.txt"
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(log_content)

    return isp_result
