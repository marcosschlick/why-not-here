import os
from pathlib import Path


def available_memory_bytes() -> int:
    limits = []
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                limits.append(int(line.split()[1]) * 1024)
                break
    except (OSError, ValueError):
        pass
    for limit_path, usage_path in (
        ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.current"),
        (
            "/sys/fs/cgroup/memory/memory.limit_in_bytes",
            "/sys/fs/cgroup/memory/memory.usage_in_bytes",
        ),
    ):
        try:
            limit = int(Path(limit_path).read_text())
            usage = int(Path(usage_path).read_text())
            limits.append(max(0, limit - usage))
        except (OSError, ValueError):
            pass
    if not limits:
        try:
            limits.append(os.sysconf("SC_AVPHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"))
        except (OSError, ValueError, AttributeError):
            limits.append(512 * 1024**2)
    return min(limits)


def require_memory(estimated_bytes: int, operation: str) -> None:
    budget = int(available_memory_bytes() * 0.6)
    if estimated_bytes > budget:
        raise ValueError(
            f"Insufficient memory for {operation}: estimated {estimated_bytes / 1024**3:.2f} GiB, "
            f"safe available budget {budget / 1024**3:.2f} GiB. Select a smaller grid or region. "
            "The requested grid has not been resized."
        )
