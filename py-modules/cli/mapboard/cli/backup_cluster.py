import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

import aiofiles
from sqlalchemy.engine import Engine
from datetime import datetime

from macrostrat.utils import get_logger
from macrostrat.database.transfer import pg_dump_to_file
from macrostrat.database import Database
from sqlalchemy import create_engine

from macrostrat.database.transfer.stream_utils import (
    print_stdout,
    print_stream_progress,
)
from macrostrat.database.transfer.utils import (
    _docker_local_run_args,
    raw_database_url,
)

log = get_logger(__name__)


async def pg_dump_cluster(
    engine: Engine,
    dump_dir: Path,
    *,
    command_prefix: Optional[list] = None,
    args: list = [],
    postgres_container: str = "postgres:15",
    user: Optional[str] = "postgres",
):
    """Dump an entire PostgreSQL cluster to a set of files.

    We use pg_dumpall to dump global objects, and pg_dump for
    each database (to allow space-efficient custom format dumps).

    TODO: move this to macrostrat.database
    """

    # Check if path is a directory
    if dump_dir.exists():
        if not dump_dir.is_dir():
            raise ValueError(f"Dump path {dump_dir} is not a directory")
    else:
        # Create a new subdirectory with a date-time suffix
        date_string = datetime.now().strftime("%Y-%m-%d")
        dump_dir = dump_dir / f"dump-{date_string}"

    log.info(f"Creating backup directory at {dump_dir}...")
    dump_dir.mkdir(parents=True, exist_ok=True)

    # Get a list of databases
    new_url = engine.url.set(database=user)
    db = Database(new_url)
    databases = db.run_query(
        "SELECT datname FROM pg_database WHERE datistemplate = false;"
    ).all()

    # First, dump global objects to an SQL file
    globals_dumpfile = dump_dir / "globals.sql"
    log.info(f"Dumping global objects to {globals_dumpfile}...")
    proc = await pg_dump_globals(
        engine,
        command_prefix=command_prefix,
        args=args,
        postgres_container=postgres_container,
        stdout=asyncio.subprocess.PIPE,
    )
    async with aiofiles.open(globals_dumpfile, mode="wb") as dest:
        await asyncio.gather(
            asyncio.create_task(print_stream_progress(proc.stdout, dest)),
            asyncio.create_task(print_stdout(proc.stderr)),
        )

    # Next, dump each database individually
    for row in databases:
        dbname = row.datname
        db_dumpfile = dump_dir / f"{dbname}.pg-dump"
        log.info(f"Dumping database {dbname} to {db_dumpfile}...")

        _url = engine.url.set(database=dbname)

        db_engine = create_engine(_url)
        await pg_dump_to_file(
            db_engine,
            db_dumpfile,
            command_prefix=command_prefix,
            args=args,
            postgres_container=postgres_container,
            user=user,
            custom_format=True,
        )


async def pg_dump_globals(
    engine: Engine,
    *,
    command_prefix: Optional[list] = None,
    args: list = [],
    postgres_container: str = "postgres:15",
    stdout=asyncio.subprocess.PIPE,
):

    prefix = command_prefix or _docker_local_run_args(postgres_container)

    _cmd = [
        *prefix,
        "pg_dumpall",
        "-d",
        raw_database_url(engine.url),
        "--globals-only",
        *args,
    ]

    env = dict(os.environ)
    password = engine.url.password
    if password is not None:
        env["PGPASSWORD"] = password

    return await asyncio.create_subprocess_exec(
        *_cmd, stdout=stdout, stderr=asyncio.subprocess.PIPE, env=env
    )
