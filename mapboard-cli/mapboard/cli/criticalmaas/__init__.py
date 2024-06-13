from typer import Typer
from os import environ
from requests import get
from rich.console import Console
from macrostrat.utils import get_logger

log = get_logger(__name__)

app = Typer(name="cdr", no_args_is_help=True)

console = Console()

cdr_api_address = environ.get("CDR_API_ADDRESS", None)
cdr_api_token = environ.get("CDR_AUTH_TOKEN", None)


# Map ID c4cc244cc5a0cd262be032844eb019a08bac07ac25a8318619a6d48c248c8ee1


@app.command(name="get")
def get_map_data(cog_id: str):
    """Get data from the CDR for a particular map"""

    url = f"{cdr_api_address}/v1/maps/cog/meta/{cog_id}"
    log.info(f"GET {url}")
    meta = get(url, headers={"Authorization": f"Bearer {cdr_api_token}"})
    console.print(meta.json())
