"""
Define tasks for the task runner.
"""

from .core import app

from mapboard.topology_manager import update_topology


@app.task
def update_topology():
    """
    Update the topology of the map.
    """
    pass
