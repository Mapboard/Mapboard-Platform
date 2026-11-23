"""Sign-in, per-project access and topology runs, against a throwaway database.

Needs the local Postgres (`docker compose up database`); skipped without it.
"""

from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from macrostrat.auth_system.session import AuthSettings
from macrostrat.database import Database
from macrostrat.dinosaur import temp_database
from mapboard.api.app import create_app
from mapboard.core.settings import connection_string
from mapboard.tasks import enqueue, ledger
from mapboard.tasks.topology import run_topology_rebuild
from starlette.testclient import TestClient

FIXTURES = Path(__file__).parents[2] / "cli" / "core-fixtures"
SCHEMA = [
    "00-extensions.sql",
    "01-schema.sql",
    "01.1-functions.sql",
    "01.6-access.sql",
    "01.7-task-run.sql",
    "02.0-api.sql",
]

EDITOR = "0000-0002-1825-0097"
VISITOR = "0000-0001-5109-3700"


@pytest.fixture(scope="module")
def db():
    url = connection_string("mapboard_platform_api_test")
    try:
        ctx = temp_database(url)
        engine = ctx.__enter__()
    except Exception as err:
        pytest.skip(f"No local database: {err}")
    database = Database(engine.url)
    for name in SCHEMA:
        database.run_sql(FIXTURES / name, raise_errors=True)
    with database.engine.begin() as conn:
        conn.exec_driver_sql(
            """
            INSERT INTO mapboard.project (slug, title, is_public)
            VALUES ('open', 'Open', true), ('closed', 'Closed', false);
            INSERT INTO mapboard.canvas (project_id, slug, database, data_schema, topo_schema)
            SELECT id, 'main', 'mapboard', slug || '_data', slug || '_topo' FROM mapboard.project;
            INSERT INTO mapboard.context (project_id, canvas_id, name, slug)
            SELECT project_id, id, 'Main', 'main' FROM mapboard.canvas;
            UPDATE mapboard.project p SET main_context = c.id
            FROM mapboard.context c WHERE c.project_id = p.id;
            GRANT USAGE ON SCHEMA mapboard_api TO web_anon, web_user;
            GRANT SELECT ON ALL TABLES IN SCHEMA mapboard_api TO web_anon, web_user;
            """
        )
    yield database
    database.engine.dispose()
    ctx.__exit__(None, None, None)


class Provider:
    """Stands in for ORCID; `sub` is whoever signs in next."""

    sub = EDITOR

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path.endswith("/token"):
            return httpx2.Response(200, json={"access_token": "t"})
        return httpx2.Response(200, json={"sub": self.sub, "given_name": "Test"})


@pytest.fixture(scope="module")
def provider():
    return Provider()


@pytest.fixture
def client(db, provider):
    settings = AuthSettings(
        secret_key="a-test-secret-key-of-sufficient-length",
        oauth_client_id="APP-TEST",
        oauth_client_secret="secret",
        redirect_uri="https://mapboard.test/auth/callback",
    )
    app = create_app(db, settings, transport=httpx2.MockTransport(provider))
    return TestClient(app, base_url="https://mapboard.test", follow_redirects=False)


def sign_in(client, provider, sub):
    provider.sub = sub
    res = client.get("/auth/login")
    state = parse_qs(urlparse(res.headers["location"]).query)["state"][0]
    res = client.get("/auth/callback", params={"code": "c", "state": state})
    assert res.status_code == 307


def grant(db, sub, project, access):
    with db.engine.begin() as conn:
        conn.exec_driver_sql(
            """INSERT INTO mapboard.project_member (project_id, user_id, access)
               SELECT p.id, u.id, %(access)s::mapboard.access_level
               FROM mapboard.project p, public.users u
               WHERE p.slug = %(project)s AND u.sub = %(sub)s
               ON CONFLICT (project_id, user_id) DO UPDATE SET access = EXCLUDED.access""",
            dict(sub=sub, project=project, access=access),
        )


def access(client, project):
    res = client.get(f"/auth/access/{project}")
    if res.status_code == 404:
        return None
    return res.json()["access"]


def test_anonymous_reads_public_only(client):
    assert access(client, "open") == "read"
    assert access(client, "closed") is None
    assert access(client, "missing") is None


def test_sign_in_creates_account_without_access(client, provider, db):
    sign_in(client, provider, VISITOR)
    assert client.get("/auth/me").json()["sub"] == VISITOR
    assert access(client, "open") == "read"
    assert access(client, "closed") is None


def test_grants_are_per_project(client, provider, db):
    sign_in(client, provider, EDITOR)
    grant(db, EDITOR, "closed", "edit")
    assert access(client, "closed") == "edit"
    assert access(client, "open") == "read"
    grant(db, EDITOR, "closed", "read")
    assert access(client, "closed") == "read"


def visible_projects(db, role, sub=None):
    with db.engine.begin() as conn:
        if sub is not None:
            conn.exec_driver_sql(
                "SELECT set_config('request.jwt.claims', %(c)s, true)",
                dict(c='{"sub": "%s"}' % sub),
            )
        if role is not None:
            conn.exec_driver_sql(f"SET LOCAL ROLE {role}")
        rows = conn.exec_driver_sql(
            "SELECT slug, access::text FROM mapboard_api.project ORDER BY slug"
        ).all()
    return [tuple(r) for r in rows]


def test_postgrest_view_follows_the_session(db, client, provider):
    sign_in(client, provider, EDITOR)
    grant(db, EDITOR, "closed", "edit")
    assert visible_projects(db, "web_anon") == [("open", "read")]
    assert visible_projects(db, "web_user", VISITOR) == [("open", "read")]
    assert visible_projects(db, "web_user", EDITOR) == [
        ("closed", "edit"),
        ("open", "read"),
    ]
    # mapboard_server reads the views as the owner and must see every project.
    assert [slug for slug, _ in visible_projects(db, None)] == ["closed", "open"]


class FakeManager:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def update(self, **kwargs):
        self.calls.append(kwargs)
        print("Updating faces")
        if self.fail:
            raise RuntimeError("topology exploded")


@pytest.fixture
def sent(monkeypatch):
    sent = []

    class Result:
        id = "celery-task-id"

    def send_task(name, args):
        sent.append((name, args))
        return Result()

    monkeypatch.setattr(enqueue.app, "send_task", send_task)
    return sent


def test_rebuild_needs_edit_access(client, provider, db, sent):
    assert client.post("/tasks/topology/open", json={}).status_code == 401
    sign_in(client, provider, VISITOR)
    assert client.post("/tasks/topology/open", json={}).status_code == 403
    assert client.post("/tasks/topology/closed", json={}).status_code == 404
    assert sent == []


def test_rebuild_runs_once_per_canvas(client, provider, db, sent):
    sign_in(client, provider, EDITOR)
    grant(db, EDITOR, "closed", "edit")

    res = client.post("/tasks/topology/closed", json={"reset": False})
    assert res.status_code == 202
    run_id = res.json()["id"]
    assert sent == [("mapboard.topology.rebuild", [run_id])]
    assert res.json()["state"] == "queued"

    assert client.post("/tasks/topology/closed", json={}).status_code == 409

    mgr = FakeManager()
    assert run_topology_rebuild(db, run_id, lambda canvas_id: mgr) == "succeeded"
    assert mgr.calls == [dict(reset=False, fix_failed=False, composite_layers=False)]
    # A redelivered message must not run the rebuild twice.
    assert run_topology_rebuild(db, run_id, lambda canvas_id: mgr) == "skipped"

    run = client.get(f"/tasks/runs/{run_id}").json()
    assert run["state"] == "succeeded"
    assert "Updating faces" in run["log"]

    res = client.post("/tasks/topology/closed", json={})
    assert res.status_code == 202
    failed_id = res.json()["id"]
    failing = FakeManager(fail=True)
    assert run_topology_rebuild(db, failed_id, lambda canvas_id: failing) == "failed"
    run = client.get(f"/tasks/runs/{failed_id}").json()
    assert run["state"] == "failed"
    assert "topology exploded" in run["error"]

    runs = client.get("/tasks/topology/closed").json()
    assert [r["state"] for r in runs] == ["failed", "succeeded"]


def test_orphaned_runs_are_closed(client, provider, db, sent):
    sign_in(client, provider, EDITOR)
    grant(db, EDITOR, "closed", "edit")
    run_id = client.post("/tasks/topology/closed", json={}).json()["id"]
    ledger.start_run(db, run_id)
    assert ledger.fail_orphaned_runs(db, "mapboard.topology.") == 1
    assert client.post("/tasks/topology/closed", json={}).status_code == 202


@pytest.fixture
def control(monkeypatch):
    from mapboard.api import tasks

    calls = []
    monkeypatch.setattr(
        tasks.celery_app.control, "revoke", lambda tid, **kw: calls.append(("revoke", kw))
    )
    monkeypatch.setattr(
        tasks, "request_cancel", lambda redis, run_id: calls.append("cancel") or 1
    )
    monkeypatch.setattr(tasks, "read_all", lambda redis, run_id: "partial output")
    return calls


def test_cancel_and_kill_need_edit_access(client, provider, db, sent, control):
    sign_in(client, provider, EDITOR)
    grant(db, EDITOR, "closed", "edit")

    # An earlier test may have left one queued; the canvas holds one live run.
    for run in client.get("/tasks/topology/closed").json():
        if run["state"] in ledger.LIVE_STATES:
            ledger.end_live_run(db, run["id"], state="failed", error="test setup")
    queued = client.post("/tasks/topology/closed", json={}).json()["id"]
    sign_in(client, provider, VISITOR)
    assert client.post(f"/tasks/runs/{queued}/cancel").status_code == 404
    sign_in(client, provider, EDITOR)
    res = client.post(f"/tasks/runs/{queued}/cancel")
    assert res.json()["state"] == "cancelled"
    assert control == [("revoke", {})]
    assert client.post(f"/tasks/runs/{queued}/cancel").status_code == 409

    running = client.post("/tasks/topology/closed", json={}).json()["id"]
    ledger.start_run(db, running)
    # The worker records a cancel of a running run.
    assert client.post(f"/tasks/runs/{running}/cancel").json()["state"] == "running"
    assert control[-1] == "cancel"

    res = client.post(f"/tasks/runs/{running}/kill")
    assert res.json()["state"] == "killed"
    assert control[-1] == ("revoke", {"terminate": True, "signal": "SIGKILL"})
    assert ledger.get_log(db, running) == "partial output"
