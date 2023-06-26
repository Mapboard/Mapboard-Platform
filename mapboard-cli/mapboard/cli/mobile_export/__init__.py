from pathlib import Path
from ..config import connection_string
from macrostrat.database import Database
from rich import print


def export_database(project: str, output: Path):
    """Export a Mapboard project database to a Spatialite file"""
    if output.exists():
        raise ValueError(f"Output file {output} already exists")

    if not output.parent.exists():
        raise ValueError(f"No such directory: {output.parent}")

    if not output.suffix == ".mapboard-project":
        raise ValueError(f"Output file must have .mapboard-project extension")

    # Check if project exists
    conn_string = connection_string(project)
    db = Database(conn_string)
    db.session.execute("SELECT 1")
    db.session.close()
    print(f"Database [bold]{project}[/bold] exists!")
