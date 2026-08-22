"""``python -m disastermind.api`` — serve the live Commander Dashboard.

PRD Step 7 (dashboard) + Step 10 (WebSocket refresh). This thin CLI builds a full
DisasterMind system via :func:`disastermind.api.server.create_server` and serves
the FastAPI app (and static UI) with uvicorn. FastAPI/uvicorn are imported lazily
inside :meth:`DashboardServer.run`, so importing this module never requires them
(HARD RULE 2). Host/port come from ``DM_API_HOST`` / ``DM_API_PORT`` or
``--host`` / ``--port``.

Examples
--------
    python -m disastermind.api
    python -m disastermind.api --host 0.0.0.0 --port 9001
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .server import create_server


def _load_dotenv() -> None:
    """Populate ``os.environ`` from a local ``.env`` (stdlib only, best-effort).

    Mirrors the ``.env`` / ``.env.example`` convention without taking a
    ``python-dotenv`` dependency (the package stays stdlib-first). Real
    environment variables always win — already-set keys are never overwritten —
    so exported secrets and platform-injected vars (Railway/Fly) take priority.
    Looks in the current working directory and the repository root.
    """
    candidates = [Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"]
    seen: set[Path] = set()
    for path in candidates:
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        try:
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                # Drop inline " # comment" and surrounding quotes.
                val = val.split(" #", 1)[0].strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
        except OSError:
            pass


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="disastermind.api",
        description="Serve the DisasterMind Commander Dashboard (PRD Step 7 + 10).",
    )
    # Hosted platforms (Railway/Heroku/Fly) inject $PORT and expect the process to
    # bind 0.0.0.0 so their router can reach it; locally we stay on 127.0.0.1.
    _hosted = bool(os.environ.get("PORT"))
    parser.add_argument(
        "--host",
        default=os.environ.get("DM_API_HOST") or ("0.0.0.0" if _hosted else "127.0.0.1"),
        help="Bind address (default: %(default)s; env DM_API_HOST).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT") or os.environ.get("DM_API_PORT") or "8000"),
        help="Bind port (default: %(default)s; env PORT / DM_API_PORT).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Build + serve the dashboard; return a process exit code."""
    _load_dotenv()
    args = _parse_args(argv)
    server = create_server()
    try:
        server.run(host=args.host, port=args.port)
    except RuntimeError as exc:  # FastAPI/uvicorn missing -> fail loudly, exit 1
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:  # pragma: no cover - interactive Ctrl-C
        return 0
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised via the CLI
    raise SystemExit(main())
