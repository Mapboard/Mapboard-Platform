"""Celery app for Mapboard's background worker.

Run with: celery -A mapboard.tasks.app worker -Q topology --concurrency=1 --max-tasks-per-child=1
"""

from os import environ

from celery import Celery
from celery.signals import worker_ready

BROKER_URL = environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
TOPOLOGY_QUEUE = "topology"
TOPOLOGY_REBUILD = "mapboard.topology.rebuild"

# Producers and the worker must agree, or a task waits on a queue nobody reads.
TASK_ROUTES = {"mapboard.topology.*": {"queue": TOPOLOGY_QUEUE}}


def create_celery(name: str, **kwargs) -> Celery:
    celery = Celery(name, broker=BROKER_URL, **kwargs)
    celery.conf.task_routes = TASK_ROUTES
    celery.conf.broker_connection_retry_on_startup = True
    # A rebuild is slow; don't let the worker reserve a second one it can't start.
    celery.conf.worker_prefetch_multiplier = 1
    return celery


app = create_celery("mapboard", include=["mapboard.tasks.topology"])


@worker_ready.connect
def _close_orphaned_runs(**_):
    from mapboard.core.settings import core_db

    from .ledger import fail_orphaned_runs

    fail_orphaned_runs(core_db, "mapboard.topology.")
