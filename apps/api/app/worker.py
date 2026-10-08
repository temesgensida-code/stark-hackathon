"""Redis (RQ) worker for parsing jobs. Run with: python -m app.worker (set JOB_BACKEND=rq on the API)."""

from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings

if __name__ == "__main__":
    conn = Redis.from_url(get_settings().redis_url)
    Worker([Queue("parse", connection=conn)], connection=conn).work()
