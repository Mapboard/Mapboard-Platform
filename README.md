## Running

The Mapboard CLI is the command-line tool that runs the system. It uses the `macrostrat.app_frame` module
to create an app runnable by Docker Compose.

### Environment configuration

- `MAPBOARD_API_ADDRESS`: The address of the Macrostrat API, in case you want to override it for localhost development.
  Formatted as <host:port>
  If not defined, the API will be run within the `docker compose` stack of containers.
