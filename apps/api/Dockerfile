ARG DIDBAN_PYTHON_IMAGE=python:3.12-slim
FROM ${DIDBAN_PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/apps/api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY apps/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && useradd --create-home --uid 10001 didban
COPY --chown=didban:didban apps/api /app/apps/api
COPY --chown=didban:didban apps/web/public/fonts /app/apps/web/public/fonts
COPY --chown=didban:didban scripts /app/scripts
RUN mkdir -p /app/var/private && chown -R didban:didban /app/var
USER didban
EXPOSE 8000
CMD ["uvicorn", "didban.api:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS aws
ADD --chmod=0444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem

FROM runtime AS local
