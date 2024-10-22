from typer import Typer
from os import environ
from requests import get
from rich.console import Console
from macrostrat.utils import get_logger
from ..projects import create_project
from ..database import connection_string, setup_database, core_db
from macrostrat.database import Database
from psycopg2.sql import Identifier
from pathlib import Path
from json import dumps
from mapboard.topology_manager.commands.update import _update

# import logging
# import http.client
#
# http.client.HTTPConnection.debuglevel = 1
#
# logging.basicConfig()
# # logging.getLogger().setLevel(logging.DEBUG)
# requests_log = logging.getLogger("requests.packages.urllib3")
# requests_log.setLevel(logging.DEBUG)
# requests_log.propagate = True

log = get_logger(__name__)

app = Typer(name="cdr", no_args_is_help=True)

console = Console()

cdr_api_address = environ.get("CDR_API_ADDRESS", None)
cdr_api_token = environ.get("CDR_AUTH_TOKEN", None)


# Map ID c4cc244cc5a0cd262be032844eb019a08bac07ac25a8318619a6d48c248c8ee1
# 78c274e9575d1ac948d55a55265546d711551cdd5cdd53592c9928d502d50700


@app.command(name="get")
def get_map_data(cog_id: str):
    """Get data from the CDR for a particular map"""

    meta = cdr_get(cog_id, f"/maps/cog/meta/{cog_id}")
    console.print(meta)

    polygons = cdr_get(cog_id, f"/features/{cog_id}/polygon_extractions")
    console.print(polygons)


def cdr_get(route: str, params=None):
    url = f"{cdr_api_address}/v1{route}"
    log.info(f"GET {url}, params={params}")
    return get(
        url, headers={"Authorization": f"Bearer {cdr_api_token}"}, params=params
    ).json()


@app.command(name="show")
def show_versions(cog_id: str):
    """Show the versions of a CDR map"""
    versions = cdr_get(f"/features/{cog_id}/system_versions")
    for version in versions:
        console.print(version)


@app.command(name="create")
def create(cog_id: str, system: str, system_version: str):
    """Create a Mapboard project database for a CDR map"""

    # Check that we have a valid set of system versions
    is_valid = False
    versions = cdr_get(f"/features/{cog_id}/system_versions")
    for version in versions:
        if version[0] == system and version[1] == system_version:
            is_valid = True
            break
    if not is_valid:
        raise ValueError(f"Invalid system version: {system} {system_version}")

    project_prefix = cog_id[:8] + "_" + system + "_" + system_version
    create_project(
        project_prefix,
        database="criticalmaas",
        srid=3857,
        tolerance=0.5,
    )

    db = setup_database(project_prefix)

    db.run_fixtures(Path(__file__).parent / "constraints.sql")

    db.run_query(
        "SET search_path TO {data_schema},public",
    )

    for table in ["map_layer", "linework", "polygon", "linework_type", "polygon_type"]:
        db.run_sql(
            "TRUNCATE TABLE {table} CASCADE",
            dict(table=Identifier(project_prefix, table)),
        )

    source = f"{system} {system_version}"

    legends = get_legend_items(cog_id, system=system, system_version=system_version)
    map_layer_index = {}
    for legend in legends:
        if legend["category"] != "polygon":
            continue

        del legend["px_geojson"]

        system = legend["system"]
        system_version = legend["system_version"]
        desc = f"{system} - {system_version}"
        poly_type = legend["legend_id"]

        console.print(system, system_version, desc, poly_type)

        # Get existing map layer, or create a new one
        map_layer = db.run_query(
            "SELECT id FROM map_layer WHERE name = :name", dict(name=system)
        ).scalar()
        if map_layer is None:
            map_layer = db.run_query(
                """INSERT INTO map_layer (name, description, topological)
                VALUES (:name, :description, false)
                ON CONFLICT (name) DO NOTHING RETURNING id""",
                dict(name=system, description=desc),
            ).scalar()

        map_layer_index[system] = map_layer

        console.print(map_layer)

        color = legend["color"]
        if color == "":
            color = None

        name = legend["label"]
        if name == "":
            name = None
        if name is None:
            name = legend["abbreviation"]
        if name == "":
            name = None
        if name is None:
            name = legend["legend_id"]

        db.run_sql(
            "INSERT INTO polygon_type (id, name,  color) VALUES (:id, :name,:color) ON CONFLICT (id) DO NOTHING",
            dict(id=poly_type, name=name, color=color),
        )

        db.run_sql(
            """INSERT INTO map_layer_polygon_type (map_layer, type) VALUES (:map_layer, :type) ON CONFLICT DO NOTHING""",
            dict(map_layer=map_layer, type=poly_type),
        )

    polys = get_polygons(cog_id, system=system, system_version=system_version)

    for poly in polys:
        poly_type = poly["legend_id"]
        geom = poly["px_geojson"]
        map_layer = map_layer_index[poly["system"]]
        db.run_sql(
            """
            INSERT INTO polygon (type, map_layer, geometry, source)
            VALUES (:type, :map_layer, ST_Multi(ST_Scale(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 3857), 1, -1)), :source)
            """,
            dict(type=poly_type, geom=dumps(geom), map_layer=map_layer, source=source),
        )


def get_legend_items(cog_id: str, **kwargs):
    yield from cdr_get(f"/features/{cog_id}/legend_items", params=kwargs)


def get_polygons(cog_id: str, **kwargs):
    yield from paged_result_set(f"/features/{cog_id}/polygon_extractions", **kwargs)


def paged_result_set(route: str, **kwargs):
    feature_type = route.split("/")[-1]
    page = 0
    feature_count = 0
    per_page = 100
    while True:
        params = {
            "size": per_page,
            "page": page,
        }
        params.update(kwargs)
        results = cdr_get(route, params=params)
        page += 1
        feature_count += len(results)
        yield from results
        if len(results) < per_page:
            break

    console.print(f"Total {feature_type}: {feature_count}")


@app.command(name="list")
def list_projects():
    res = core_db.run_query(
        "SELECT slug, title FROM projects WHERE database = 'criticalmaas'"
    ).all()
    for row in res:
        console.print(row)


@app.command(name="setup-topology")
def update_topology(project_id: str):
    db = setup_database(project_id)
    assert db.engine.url.database == "criticalmaas"
    db.run_fixtures(Path(__file__).parent / "update-topology.sql")
    # Report statistics
    exp = {
        "polygon": "polygon seeds",
        "linework": "boundary lines",
    }
    for table in ["polygon", "linework"]:
        res = db.run_query(
            f"SELECT count(*) FROM {table} WHERE source = 'expand-topology'",
            dict(table=Identifier(table)),
        ).one()
        console.print(f"- {res[0]} {exp[table]} ")

    # Update the topology layers
    _update(db, bulk=True)


@app.command(name="simplify-topology")
def simplify_topology(project_id: str):
    db = setup_database(project_id)
    assert db.engine.url.database == "criticalmaas"

    # Show number of edges and faces
    res = db.run_query("SELECT count(*) FROM {topo_schema}.edge").one()
    console.print(f"Edges: {res[0]}")
    res = db.run_query("SELECT count(*) FROM {topo_schema}.face").one()
    console.print(f"Faces: {res[0]}")

    db.run_fixtures(Path(__file__).parent / "simplify-topology.sql")
