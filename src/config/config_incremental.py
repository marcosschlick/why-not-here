# Incremental / Closed-loop settings (Brandão 2021: True = incremental cutting planes, False = monolithic single-step MILP)
USE_INCREMENTAL_SOLVER = False
MAX_ISP_ITERATIONS = 150
INCREMENTAL_TOLERANCE = 1e-4
CLOSED_LOOP_TIMEOUT_SEC = 1800.0

# A* search scope for cutting planes ("GLOBAL" or "SUBGRAPH")
INCREMENTAL_ASTAR_SCOPE = "GLOBAL"
