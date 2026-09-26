import time
import httpx
import pytest

from app.identity.totp import generate_totp_code

API_URL = "http://localhost:8000/api/v1"


def test_mfa_flow_setup_enable_enforce_and_disable() -> None:
    client = httpx.Client(base_url=API_URL)
    email = f"mfa-user-{time.time_ns()}@example.com"
    password = "Secure-Password-123456"

    # 1. Register
    reg_res = client.post(
        "/auth/register",
        json={
            "email": email,
            "full_name": "کاربر احراز دو مرحله‌ای",
            "password": password,
            "workspace_name": "فضای امن",
        },
    )
    assert reg_res.status_code == 201, reg_res.text
    csrf = client.cookies["didban_csrf"]

    # 2. Check initial MFA status
    status_res = client.get("/auth/mfa/status")
    assert status_res.status_code == 200
    assert status_res.json()["enabled"] is False

    # 3. Setup MFA
    setup_res = client.post("/auth/mfa/setup", headers={"X-CSRF-Token": csrf})
    assert setup_res.status_code == 200
    data = setup_res.json()
    secret = data["secret"]
    assert len(secret) >= 16
    assert "otpauth://totp/" in data["otpauth_uri"]

    # 4. Try enabling with wrong code
    bad_enable = client.post(
        "/auth/mfa/enable",
        headers={"X-CSRF-Token": csrf},
        json={"secret": secret, "code": "000000"},
    )
    assert bad_enable.status_code == 400

    # 5. Enable with valid TOTP code
    valid_code = generate_totp_code(secret)
    enable_res = client.post(
        "/auth/mfa/enable",
        headers={"X-CSRF-Token": csrf},
        json={"secret": secret, "code": valid_code},
    )
    assert enable_res.status_code == 200

    # 6. Verify status is now enabled
    status_res = client.get("/auth/mfa/status")
    assert status_res.status_code == 200
    assert status_res.json()["enabled"] is True

    # 7. Logout
    client.post("/auth/logout", headers={"X-CSRF-Token": csrf})

    # 8. Try logging in without OTP code -> should be rejected with MFA_REQUIRED
    login_no_mfa = client.post("/auth/login", json={"email": email, "password": password})
    assert login_no_mfa.status_code == 401
    assert login_no_mfa.json()["detail"] == "MFA_REQUIRED"
    assert login_no_mfa.headers.get("x-mfa-required") == "true"

    # 9. Try logging in with invalid OTP code
    login_bad_mfa = client.post(
        "/auth/login",
        json={"email": email, "password": password, "otp_code": "999999"},
    )
    assert login_bad_mfa.status_code == 401
    assert "نامعتبر" in login_bad_mfa.json()["detail"]

    # 10. Login with valid OTP code
    valid_login_code = generate_totp_code(secret)
    login_success = client.post(
        "/auth/login",
        json={"email": email, "password": password, "otp_code": valid_login_code},
    )
    assert login_success.status_code == 200
    assert login_success.json()["user"]["mfa_enabled"] is True
    new_csrf = client.cookies["didban_csrf"]

    # 11. Disable MFA with wrong password
    bad_disable = client.post(
        "/auth/mfa/disable",
        headers={"X-CSRF-Token": new_csrf},
        json={"password": "Wrong-Password", "code": generate_totp_code(secret)},
    )
    assert bad_disable.status_code == 401

    # 12. Disable MFA with correct password & TOTP
    disable_res = client.post(
        "/auth/mfa/disable",
        headers={"X-CSRF-Token": new_csrf},
        json={"password": password, "code": generate_totp_code(secret)},
    )
    assert disable_res.status_code == 200

    # 13. Verify status is disabled
    status_res = client.get("/auth/mfa/status")
    assert status_res.json()["enabled"] is False

    # 14. Logout and log in without OTP code -> succeeds now
    client.post("/auth/logout", headers={"X-CSRF-Token": new_csrf})
    login_again = client.post("/auth/login", json={"email": email, "password": password})
    assert login_again.status_code == 200
    assert login_again.json()["user"]["mfa_enabled"] is False
