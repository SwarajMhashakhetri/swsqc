"""Vercel serverless entrypoint: exposes the Gale FastAPI (ASGI) app as ``app``.

Vercel bundles every file in the repository into the function, but only puts
this directory on the import path, so the backend package is added explicitly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))

from gale.main import app  # noqa: E402  (import must follow the path setup above)

__all__ = ["app"]
