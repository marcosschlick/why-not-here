import csv
import io
from collections.abc import Iterable


def render_csv(rows: Iterable[dict], fields: tuple[str, ...], missing=None) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        values = {}
        for key in fields:
            value = row.get(key)
            if value is None:
                value = missing
            if isinstance(value, str) and value.lstrip().startswith(
                ("=", "+", "-", "@")
            ):
                value = "'" + value
            values[key] = value
        writer.writerow(values)
    return "\ufeff" + output.getvalue()
