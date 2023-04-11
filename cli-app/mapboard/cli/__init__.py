# Typer command-line application

import typer
import click
import subprocess

app = typer.Typer()


@app.command()
def hello(name: str):
    typer.echo(f"Hello {name}")


# Get click object


def _compose(args):
    """Run docker compose commands in the appropriate context"""
    subprocess.run(["docker", "compose", *args])


@click.command(
    "main",
    context_settings=dict(
        ignore_unknown_options=True,
        help_option_names=[],
        max_content_width=160,
        # Doesn't appear to have landed in Click 7? Or some other reason we can't access...
        # short_help_width=160,
    ),
)
@click.argument("args", nargs=-1, type=click.UNPROCESSED)
def compose(args):
    """Run docker compose commands in the appropriate context"""
    _compose(args)


typer_click_object = typer.main.get_command(app)
typer_click_object.add_command(compose, "compose")
