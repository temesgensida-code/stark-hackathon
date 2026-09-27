# EthioDeploy builds this automatically when it finds a Dockerfile.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends liblouis-data liblouis20 python3-louis \
 && rm -rf /var/lib/apt/lists/*
# Debian installs the louis bindings for the system Python; expose them to this one.
ENV PYTHONPATH=/usr/lib/python3/dist-packages
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
