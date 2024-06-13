from typer import Typer
from os import environ
from requests import get
from rich.console import Console
from macrostrat.utils import get_logger
from ..projects import create_project
from ..database import connection_string
from macrostrat.database import Database
from psycopg2.sql import Identifier
from pathlib import Path
from json import dumps

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


@app.command(name="create")
def create(cog_id: str, system_version: str = None):
    """Create a Mapboard project database for a CDR map"""
    project_prefix = cog_id[:8]
    create_project(
        project_prefix,
        database="criticalmaas",
        srid=3857,
        tolerance=0.1,
    )

    DATABASE_URL = connection_string("criticalmaas")
    db = Database(
        DATABASE_URL,
        instance_params=dict(
            data_schema=Identifier(project_prefix),
            topo_schema=Identifier(f"{project_prefix}_topology"),
        ),
    )

    db.run_fixtures(Path(__file__).parent / "constraints.sql")

    db.run_query(
        "SET search_path TO {data_schema},public",
    )

    for table in ["map_layer", "linework", "polygon", "linework_type", "polygon_type"]:
        db.run_sql(
            "TRUNCATE TABLE {table} CASCADE",
            dict(table=Identifier(project_prefix, table)),
        )

    map_layer = db.run_query(
        "INSERT INTO map_layer (name, description, topological) VALUES ('meta', 'Meta', true) ON CONFLICT DO NOTHING RETURNING id"
    ).scalar()

    db.run_query(
        "INSERT INTO linework_type (id, name) VALUES ('arbitrary', 'Arbitrary')"
    )
    db.run_query(
        "INSERT INTO map_layer_linework_type (map_layer, type) VALUES (:map_layer, 'arbitrary')",
        dict(map_layer=map_layer),
    )

    db.session.commit()
    # Add a fake line to allow the database to load
    db.run_query(
        "INSERT INTO linework (type, map_layer, geometry) VALUES ('arbitrary', 1, ST_Multi(ST_SetSRID(ST_GeomFromText('LINESTRING(10000 0, 10001 0)'), 3857)))"
    )
    db.session.commit()

    legends = get_legend_items(cog_id, system_version=system_version)
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
                VALUES (:name, :description, true)
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

        db.run_query(
            "INSERT INTO polygon_type (id, name,  color) VALUES (:id, :name,:color) ON CONFLICT (id) DO NOTHING",
            dict(id=poly_type, name=name, color=color),
        )

        db.run_query(
            """INSERT INTO map_layer_polygon_type (map_layer, type) VALUES (:map_layer, :type) ON CONFLICT DO NOTHING""",
            dict(map_layer=map_layer, type=poly_type),
        )

        db.session.commit()

    polys = get_polygons(cog_id, system_version=system_version)

    for poly in polys:
        poly_type = poly["legend_id"]
        geom = poly["px_geojson"]
        map_layer = map_layer_index[poly["system"]]
        db.run_query(
            "INSERT INTO polygon (type, map_layer, geometry) VALUES (:type, :map_layer, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 3857)))",
            dict(type=poly_type, geom=dumps(geom), map_layer=map_layer),
        )
        db.session.commit()


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


@app.command(name="setup-topology")
def update_topology(cog_id: str):
    project_prefix = cog_id[:8]
    DATABASE_URL = connection_string("criticalmaas")
    db = Database(
        DATABASE_URL,
        instance_params=dict(
            data_schema=Identifier(project_prefix),
            topo_schema=Identifier(f"{project_prefix}_topology"),
        ),
    )

    db.run_fixtures(Path(__file__).parent / "update-topology.sql")
