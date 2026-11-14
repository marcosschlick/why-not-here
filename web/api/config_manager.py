import copy
import sys
from collections.abc import Iterator
from contextlib import contextmanager

from src import config
from src.pipeline.experiment_config import (
    CONFIG_REGISTRY,
    get_experiment_configurations,
    update_configurations,
)
from src.pipeline.storage import get_output_directory, set_output_directory
from web.api.runner import runner

__all__ = [
    "get_experiment_configurations",
    "isolated_pipeline_state",
    "update_configurations",
]


@contextmanager
def isolated_pipeline_state() -> Iterator[None]:
    keys = (
        *CONFIG_REGISTRY,
        "IMPASSABLE_TERRAINS",
        "V_MAX",
        "START_COORD",
        "GOAL_COORD",
    )
    configuration = {key: copy.deepcopy(getattr(config, key)) for key in keys}
    modules = {
        name: {
            key: copy.deepcopy(getattr(module, key))
            for key in keys
            if hasattr(module, key)
        }
        for name, module in list(sys.modules.items())
        if name.startswith("src.") and module is not None
    }
    output_directory = get_output_directory()
    with runner.lock:
        runner_state = copy.deepcopy(runner.state)
    try:
        yield
    finally:
        for name, module in list(sys.modules.items()):
            if not name.startswith("src.") or module is None:
                continue
            previous = modules.get(name)
            for key in keys:
                if previous is None:
                    if hasattr(module, key):
                        setattr(module, key, copy.deepcopy(configuration[key]))
                elif key in previous:
                    setattr(module, key, copy.deepcopy(previous[key]))
                elif hasattr(module, key):
                    delattr(module, key)
        set_output_directory(output_directory)
        with runner.lock:
            runner.state.clear()
            runner.state.update(runner_state)
