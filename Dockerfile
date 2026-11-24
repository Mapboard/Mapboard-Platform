# Mapboard's Python services: the platform API and the topology worker.
FROM python:3.12-slim

# psycopg2 is built from source
RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY py-modules ./py-modules

RUN uv sync --frozen --no-dev --package mapboard.api

ENV PATH="/app/.venv/bin:$PATH" \
    MAPBOARD_ROOT=/app

EXPOSE 8000

CMD ["uvicorn", "--factory", "mapboard.api.app:default_app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
