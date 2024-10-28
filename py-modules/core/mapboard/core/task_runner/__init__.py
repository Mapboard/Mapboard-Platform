"""
A Celery-based interface for running tasks. Can be accessed either from
the command line or via an API.
"""

from os import environ
from celery import Celery
from redis import Redis


def get_celery_app(broker_url=None):
    broker_url = _get_broker_url(broker_url)

    return Celery(
        "mapboard.core.task_runner",
        broker=broker_url,
    )


def get_message_queue(broker_url=None):
    broker_url = _get_broker_url(broker_url)
    return Redis.from_url(broker_url)


def _get_broker_url(broker_url=None):
    if broker_url is None:
        broker_url = environ.get("TASK_BROKER", None)

    if broker_url is None:
        raise RuntimeError("No task broker defined")
    return broker_url
