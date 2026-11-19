"""Test user profile and avatar management."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from didban import models as m
from didban.api import app
from didban.config import settings
from didban.db import transaction
from didban.security import hasher


@pytest.fixture
def profile_client():
    u_id = f"u-prof-{uuid4().hex[:6]}"
    c_id = f"c-prof-{uuid4().hex[:6]}"
    email = f"{u_id}@test.local"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(
            id=u_id,
            email=email,
            name="کاربر آزمون",
            password_hash=hasher.hash(pwd),
        )
        company = m.Company(id=c_id, name="شرکت تست پروفایل")
        db.add_all([user, company])
        db.flush()
        member = m.Membership(company_id=c_id, user_id=u_id, role="owner")
        db.add(member)

    client = TestClient(app)
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": pwd},
    )
    assert login_res.status_code == 200, login_res.text
    csrf = login_res.json()["csrf"]
    client.headers.update({"x-csrf-token": csrf, "origin": settings.web_origin})
    return client


def test_update_profile_name_and_avatar(profile_client):
    client = profile_client

    # Verify initial auth/me
    me = client.get("/api/v1/auth/me").json()
    assert me["user"]["name"] == "کاربر آزمون"
    assert me["user"]["avatar"] is None

    # Update name
    res = client.patch("/api/v1/auth/profile", json={"name": "نام جدید کاربر"})
    assert res.status_code == 200
    assert res.json()["user"]["name"] == "نام جدید کاربر"

    # Update avatar with data URI
    avatar_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    res = client.patch("/api/v1/auth/profile", json={"avatar": avatar_data})
    assert res.status_code == 200
    assert res.json()["user"]["avatar"] == avatar_data

    # Check that auth/me reflects updated avatar
    me = client.get("/api/v1/auth/me").json()
    assert me["user"]["avatar"] == avatar_data

    # Clear avatar
    res = client.patch("/api/v1/auth/profile", json={"avatar": ""})
    assert res.status_code == 200
    assert res.json()["user"]["avatar"] is None

    # Invalid avatar format
    res = client.patch("/api/v1/auth/profile", json={"avatar": "not-an-image"})
    assert res.status_code == 400
