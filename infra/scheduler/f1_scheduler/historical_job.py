"""Ingest ONE finished session from the F1 static archive into the local MongoDB.

    python -m f1_scheduler.historical_job <year> <meeting_key> <session_key>

Exit codes: 0 ingested, 3 not published in the archive yet, 1 failed.

Runs OpenF1's own historical ingestor
(`openf1.services.ingestor_livetiming.historical.main.ingest_session`), which
downloads every topic of the session from livetiming.formula1.com/static and
processes it with the same code as the live ingestor. Then:

- Older copies of that session (e.g. a partial live recording) are deleted,
  but only in collections the archive actually produced documents for.
  OpenF1 ids are insertion timestamps in ms, so "older" is `_id < job start`.
  Re-running a job is therefore idempotent.
- Indexes on (session_key, date) are ensured. OpenF1 creates none, and
  without them every query scans the whole collection (location holds
  ~0.5-1 M documents per session), which hits the query API's 5 s limit as
  soon as a few sessions are stored.

This module imports the OpenF1 package, so it only runs inside the image.
It is an adapter (I/O only); the decision of what to ingest lives in
f1_scheduler.backfill.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Dict, List

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_NOT_PUBLISHED = 3

# Collections queried by time range (the big ones).
DATE_INDEXED = ("location", "car_data", "intervals", "position", "team_radio", "race_control", "weather", "pit", "overtakes")
# Collections queried by session only.
SESSION_INDEXED = ("drivers", "laps", "stints")

log = logging.getLogger("f1_scheduler.historical_job")


def ensure_indexes(db) -> None:
    for name in DATE_INDEXED:
        db[name].create_index([("session_key", 1), ("date", 1)], name="session_date")
    for name in SESSION_INDEXED:
        db[name].create_index([("session_key", 1)], name="session")


def prune_older_copies(db, collection_names: List[str], session_key: int, started_ms: int) -> Dict[str, Dict[str, int]]:
    summary: Dict[str, Dict[str, int]] = {}
    for name in collection_names:
        collection = db[name]
        fresh = collection.count_documents({"session_key": session_key, "_id": {"$gte": started_ms}})
        removed = 0
        if fresh > 0:
            removed = collection.delete_many({"session_key": session_key, "_id": {"$lt": started_ms}}).deleted_count
        summary[name] = {"ingested": fresh, "replaced": removed}
    return summary


def main(argv: List[str]) -> int:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s [historical] %(message)s")
    if len(argv) != 4:
        print(__doc__, file=sys.stderr)
        return EXIT_FAILED
    year, meeting_key, session_key = (int(a) for a in argv[1:4])

    from pymongo import MongoClient

    from openf1.services.ingestor_livetiming.core.objects import get_collections
    from openf1.services.ingestor_livetiming.historical import main as historical

    try:
        historical.get_session_url(year=year, meeting_key=meeting_key, session_key=session_key)
    except ValueError:
        log.info("Session %s (meeting %s, %s) is not in the static archive yet", session_key, meeting_key, year)
        return EXIT_NOT_PUBLISHED

    db = MongoClient(os.environ["MONGO_CONNECTION_STRING"])[os.getenv("OPENF1_DB_NAME", "openf1-livetiming")]
    ensure_indexes(db)

    started = time.time()
    started_ms = time.time_ns() // 1_000_000
    log.info("Ingesting session %s (meeting %s, %s) from the static archive", session_key, meeting_key, year)
    historical.ingest_session(year=year, meeting_key=meeting_key, session_key=session_key, verbose=True)

    names = sorted(c.__class__.name for c in get_collections(meeting_key=meeting_key, session_key=session_key))
    summary = prune_older_copies(db, names, session_key, started_ms)
    total = sum(v["ingested"] for v in summary.values())
    log.info(
        "Session %s: %d documents in %.0f s %s",
        session_key,
        total,
        time.time() - started,
        json.dumps({k: v for k, v in summary.items() if v["ingested"] or v["replaced"]}),
    )
    return EXIT_OK if total > 0 else EXIT_FAILED


if __name__ == "__main__":
    sys.exit(main(sys.argv))
