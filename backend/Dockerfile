# Stage 1: Build
FROM python:3.13-slim AS builder

RUN pip install uv
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# Stage 2: Runtime
FROM python:3.13-slim

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

WORKDIR /app

# Create non-root user
RUN useradd -m appuser
USER appuser

COPY . /app

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
