import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA_DIR", str(tmp_path))
    import importlib
    import app.config, app.db, app.main
    importlib.reload(app.config); importlib.reload(app.db)
    from app import pipeline
    importlib.reload(pipeline); importlib.reload(app.main)
    monkeypatch.setattr(pipeline, "start_identify", lambda pid: None)  # não chama a API externa no teste
    with TestClient(app.main.app) as c:
        yield c


def test_config(client):
    cfg = client.get("/api/config").json()
    assert cfg["brand"]["loaded"] and cfg["brand"]["name"] == "Virtus Parfums"
    assert set(cfg["formats"]) == {"9:16", "4:5", "16:9", "1:1"}


def test_upload_validation(client):
    r = client.post("/api/projects", files={"photo": ("a.txt", b"nada", "text/plain")}, data={"duration": 30, "aspect": "9:16"})
    assert r.status_code == 422
    r = client.post("/api/projects", files={"photo": ("a.png", b"x", "image/png")}, data={"duration": 45})
    assert r.status_code == 422


def test_upload_ok(client):
    buf = io.BytesIO(); Image.new("RGB", (40, 80), "white").save(buf, "PNG")
    r = client.post("/api/projects", files={"photo": ("p.png", buf.getvalue(), "image/png")}, data={"duration": 15, "aspect": "4:5"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["image"].endswith("original.png") and p["options"] == {"duration": 15, "aspect": "4:5"}
    assert client.get("/media/" + p["image"]).status_code == 200
    assert client.get("/media/../../etc/passwd").status_code == 404
    assert client.post(f"/api/projects/{p['id']}/direction", json={}).status_code == 409
