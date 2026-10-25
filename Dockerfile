# syntax=docker/dockerfile:1

# ---- 1. Build the React frontend -------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Resolve the Python environment with uv ------------------------------
FROM python:3.12-slim AS backend
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/src ./src
RUN uv sync --frozen --no-dev --no-editable

# ---- 3. Slim runtime: one process serves /api and the static app ------------
FROM python:3.12-slim AS runtime
RUN useradd --create-home --uid 10001 gale
WORKDIR /app
COPY --from=backend /app/.venv /app/.venv
COPY --from=frontend /app/frontend/dist /app/static
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GALE_STATIC_DIR=/app/static \
    PORT=8000
USER gale
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api/health\", timeout=2)"]
# Shell form so $PORT (set by Heroku/Render/Cloud Run) is honoured; exec keeps uvicorn as PID 1.
CMD ["sh", "-c", "exec uvicorn gale.main:app --host 0.0.0.0 --port \"${PORT}\" --proxy-headers --forwarded-allow-ips '*' --no-access-log"]
