FROM python:3.12.10-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace/apps/api

COPY apps/api/pyproject.toml ./
COPY apps/api/app ./app
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/alembic ./alembic

RUN pip install --upgrade pip && pip install .

RUN useradd --create-home --uid 10001 didban && chown -R didban:didban /workspace
USER didban

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
