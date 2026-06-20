# Stage 1: Build
FROM python:3.13-slim AS builder

RUN pip install uv
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# Stage 2: Runtime
FROM python:3.13-slim

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

WORKDIR /app

# Create non-root user BEFORE copying files
RUN useradd -m appuser

# Copy files and set ownership in one layer
COPY --chown=appuser:appuser . /app

# Persistent dir for the confirmed-standings overlay (mounted as a volume in prod
# so the confirmation survives container rebuilds). Owned by appuser so the
# non-root process can write to a fresh named volume initialised from this path.
RUN mkdir -p /app/persistent && chown appuser:appuser /app/persistent

USER appuser

CMD ["sh", "-c", "alembic upgrade heads && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --loop asyncio --no-access-log --timeout-keep-alive 30"]