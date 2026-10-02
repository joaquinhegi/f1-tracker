# syntax=docker/dockerfile:1
#
# OpenF1 (https://github.com/br-g/openf1) installed from GitHub at a pinned commit.
# Multi-arch: only official python slim images, works on linux/amd64 and linux/arm64.
#
# Targets:
#   openf1     -> OpenF1 package (query API, real-time ingestor, scrapers)
#   scheduler  -> openf1 + our session scheduler (infra/scheduler)
#
# Build context: infra/

ARG PYTHON_IMAGE=python:3.11-slim-bookworm

# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS builder

# Pinned upstream commits. Bump deliberately.
ARG OPENF1_SHA=87540e3f495bbd9bedb37b10456dd848c8f193d6
# OpenF1's requirements.txt pulls fastf1_livetiming from its default branch
# (unpinned), so we force it to a known commit afterwards.
ARG FASTF1_LIVETIMING_SHA=5c3676e8a1cc06d428bd383b231ce7154a432d88

RUN apt-get update \
    && apt-get install -y --no-install-recommends git build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        "openf1 @ git+https://github.com/br-g/openf1.git@${OPENF1_SHA}" \
    && pip install --no-cache-dir --no-deps --force-reinstall \
        "fastf1_livetiming @ git+https://github.com/br-g/fastf1-livetiming.git@${FASTF1_LIVETIMING_SHA}"

# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS openf1

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # openf1.util.mqtt does int(os.getenv("OPENF1_MQTT_PORT")) at import time,
    # which crashes the real-time ingestor if unset. MQTT itself stays disabled
    # as long as OPENF1_MQTT_URL is NOT set.
    OPENF1_MQTT_PORT=1883

COPY --from=builder /opt/venv /opt/venv

RUN useradd --create-home --uid 10001 openf1 \
    && mkdir -p /data && chown openf1:openf1 /data
USER openf1
WORKDIR /home/openf1

EXPOSE 8000
CMD ["uvicorn", "openf1.services.query_api.app:app", "--host", "0.0.0.0", "--port", "8000"]

# ---------------------------------------------------------------------------
FROM openf1 AS scheduler

ENV PYTHONPATH=/opt/scheduler
COPY --chown=openf1:openf1 scheduler/f1_scheduler /opt/scheduler/f1_scheduler

CMD ["python", "-m", "f1_scheduler"]
