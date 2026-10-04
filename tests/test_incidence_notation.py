import unittest
from pathlib import Path


class IncidenceNotationTests(unittest.TestCase):
    def test_incidence_matrix_uses_a_notation(self) -> None:
        root = Path(__file__).resolve().parents[1]
        excluded = {".git", ".venv", "venv", "node_modules", "dist", "build"}
        supported_suffixes = {".py", ".md", ".ts", ".tsx", ".tex"}
        obsolete_notation = (
            "B" + "_T",
            "$" + "Bx",
            "$" + "B x",
            "B" + "^T",
            "B" + "^{T}",
        )
        files = (
            path
            for path in root.rglob("*")
            if path.is_file()
            and path.suffix in supported_suffixes
            and not excluded.intersection(path.parts)
        )

        matches = [
            f"{path.relative_to(root)}: {token}"
            for path in files
            for content in (path.read_text(encoding="utf-8"),)
            for token in obsolete_notation
            if token in content
        ]

        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
