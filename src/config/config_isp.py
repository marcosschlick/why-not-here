from src.config.config_terrain import TERRAINS

# Semantic target for terrain modification
TARGET_TERRAIN = "COMPACTED_SOIL"
TARGET_SPEED = TERRAINS[TARGET_TERRAIN]

# Intervention cost weights in MILP objective
RHO_TERRAIN = 1.0
RHO_OBSTACLE = 2.5
RHO_SLOPE = 1.5

# Regularization and penalty parameters
EPSILON_L1 = 1e-4
BIG_M = 1e4
