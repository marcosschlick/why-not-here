import unittest

from src.config import BASE_TERRAIN, TARGET_TERRAIN, WATER_TERRAIN
from src.grid.grid import Grid
from src.incremental.explanation import generate_explanation_text
from src.incremental.step_solver import IncrementalISPSolver
from src.incremental.validator import ISPValidator, validate_global_optimality
from src.isp.formulation import build_base_formulation
from src.isp.semantics import SemanticModifications
from src.isp.solver import ISPSolver
from src.planning.astar import astar
from src.planning.dijkstra import dijkstra
from web.api.schemas import SemanticModificationsData


class WaterInterventionTests(unittest.TestCase):
    def make_grid(self) -> Grid:
        return Grid(h=3, w=3, connectivity=4, max_slope_deg=90.0)

    def water_case(
        self,
    ) -> tuple[Grid, list[tuple[int, int]], tuple[int, int], tuple[int, int]]:
        grid = self.make_grid()
        start = (1, 0)
        goal = (1, 2)
        alternative_path = [start, (1, 1), goal]
        grid.get_cell((1, 1)).terrain = WATER_TERRAIN
        return grid, alternative_path, start, goal

    def test_non_water_alternative_keeps_zero_intervention_objective(self) -> None:
        grid = self.make_grid()
        start = (0, 0)
        goal = (2, 2)
        alternative_path = [start, (0, 1), (0, 2), (1, 2), goal]

        formulation = build_base_formulation(grid, alternative_path)
        self.assertIsNotNone(formulation)
        self.assertIsNone(formulation.z_water)

        success, modifications, objective = ISPSolver(solver_name="HIGHS").solve(
            grid, start, goal, alternative_path
        )

        self.assertTrue(success)
        self.assertEqual(objective, 0.0)
        self.assertEqual(modifications, SemanticModifications([], [], []))

    def test_alternative_crossing_water_becomes_feasible_with_z_water(self) -> None:
        grid, alternative_path, start, goal = self.water_case()
        self.assertEqual(
            ISPValidator.compute_path_cost(grid, alternative_path), float("inf")
        )

        formulation = build_base_formulation(grid, alternative_path)
        self.assertIsNotNone(formulation)
        self.assertIsNotNone(formulation.z_water)
        self.assertEqual(formulation.z_water.shape, (1,))

        success, modifications, objective = ISPSolver(solver_name="HIGHS").solve(
            grid, start, goal, alternative_path
        )

        self.assertTrue(success)
        self.assertEqual(objective, 1.0)
        self.assertEqual(modifications.water_nodes, [(1, 1)])

    def test_solution_reports_water_intervention_count(self) -> None:
        grid, alternative_path, start, goal = self.water_case()
        success, modifications, _ = ISPSolver(solver_name="HIGHS").solve(
            grid, start, goal, alternative_path
        )
        self.assertTrue(success)

        result = SemanticModificationsData(
            terrain=len(modifications.terrain_nodes),
            obstacle=len(modifications.obstacle_nodes),
            slope=len(modifications.slope_edges),
            water=len(modifications.water_nodes),
            terrain_nodes=modifications.terrain_nodes,
            obstacle_nodes=modifications.obstacle_nodes,
            slope_edges=modifications.slope_edges,
            water_nodes=modifications.water_nodes,
        )
        explanation = generate_explanation_text(modifications, grid)

        self.assertEqual(result.model_dump()["water"], 1)
        self.assertEqual(result.model_dump()["water_nodes"], [(1, 1)])
        self.assertIn("Make 1 water cell traversable", explanation)

    def test_incremental_cut_solver_uses_water_intervention(self) -> None:
        grid, alternative_path, start, goal = self.water_case()
        competing_path = [start, (0, 0), (0, 1), (0, 2), goal]

        success, modifications, objective = IncrementalISPSolver(
            solver_name="HIGHS"
        ).solve_step(grid, start, goal, alternative_path, [competing_path])

        self.assertTrue(success)
        self.assertEqual(objective, 1.0)
        self.assertEqual(modifications.water_nodes, [(1, 1)])

    def test_obstacle_removal_does_not_make_water_traversable(self) -> None:
        grid, _, _, _ = self.water_case()
        grid.get_cell((1, 1)).obstacle = 1
        modified_grid = ISPValidator.apply_modifications(
            grid, SemanticModifications([], [(1, 1)], [])
        )

        self.assertEqual(modified_grid.get_cell((1, 1)).obstacle, 0)
        self.assertEqual(modified_grid.get_cell((1, 1)).terrain, WATER_TERRAIN)
        self.assertFalse(modified_grid.is_traversable((1, 0), (1, 1)))

    def test_terrain_intervention_does_not_convert_water(self) -> None:
        grid, _, _, _ = self.water_case()
        modified_grid = ISPValidator.apply_modifications(
            grid, SemanticModifications([(1, 1)], [], [])
        )

        self.assertEqual(modified_grid.get_cell((1, 1)).terrain, WATER_TERRAIN)
        self.assertNotIn((1, 1), modified_grid.water_overrides)
        self.assertFalse(modified_grid.is_traversable((1, 0), (1, 1)))
        self.assertNotEqual(modified_grid.get_cell((1, 1)).terrain, TARGET_TERRAIN)

    def test_global_astar_and_dijkstra_accept_applied_water_override(self) -> None:
        grid, alternative_path, start, goal = self.water_case()
        success, modifications, _ = ISPSolver(solver_name="HIGHS").solve(
            grid, start, goal, alternative_path
        )
        self.assertTrue(success)

        modified_grid = ISPValidator.apply_modifications(grid, modifications)
        self.assertEqual(modified_grid.get_cell((1, 1)).terrain, WATER_TERRAIN)
        self.assertIn((1, 1), modified_grid.water_overrides)
        self.assertEqual(
            modified_grid.get_velocity((1, 0), (1, 1)),
            modified_grid.speeds[BASE_TERRAIN],
        )

        globally_valid, _, alternative_cost, shortest_cost = validate_global_optimality(
            grid, start, goal, alternative_path, modifications
        )
        astar_path, astar_cost, _ = astar(modified_grid, start, goal)
        dijkstra_path, dijkstra_cost, _ = dijkstra(modified_grid, start, goal)

        self.assertTrue(globally_valid)
        self.assertIsNotNone(astar_path)
        self.assertIsNotNone(dijkstra_path)
        self.assertAlmostEqual(alternative_cost, shortest_cost)
        self.assertAlmostEqual(astar_cost, alternative_cost)
        self.assertAlmostEqual(dijkstra_cost, alternative_cost)

    def test_water_override_round_trips_and_old_maps_default_to_empty(self) -> None:
        grid, _, _, _ = self.water_case()
        grid.water_overrides.add((1, 1))

        restored = Grid.from_dict(grid.to_dict())
        self.assertEqual(restored.water_overrides, {(1, 1)})
        self.assertEqual(restored.get_cell((1, 1)).terrain, WATER_TERRAIN)

        legacy_data = grid.to_dict()
        legacy_data.pop("water_overrides")
        legacy_restored = Grid.from_dict(legacy_data)
        self.assertEqual(legacy_restored.water_overrides, set())


if __name__ == "__main__":
    unittest.main()
