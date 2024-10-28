"""
A Celery-based interface for running tasks. Can be accessed either from
the command line or via an API.
"""

from os import environ
from celery import Celery
from redis import Redis

TASK_BROKER = environ.get("TASK_BROKER")

# Set up the Celery runner and message queue

app = Celery(
    "mapboard.task_runner",
    broker=TASK_BROKER,
)

queue = Redis.from_url(TASK_BROKER)
