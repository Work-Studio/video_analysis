"""Generate docs/openapi.json from backend FastAPI app."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 以上で実行してください (datetime.UTC を使用するため)。")

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app


def main() -> None:
    output_path = PROJECT_ROOT / "docs" / "openapi.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    schema = app.openapi()
    output_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2))
    print(f"OpenAPI schema written to {output_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
