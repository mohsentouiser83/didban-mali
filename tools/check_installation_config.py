"""Non-mutating readiness checks; never print resolved secrets/configuration."""

from __future__ import annotations
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit
from installation_snapshot import ComposeInstallation, run


def validate(configuration: dict) -> list[str]:
    services = configuration["services"]
    env = services["api"]["environment"]
    origin = urlsplit(env.get("DIDBAN_PUBLIC_ORIGIN", ""))
    if (
        origin.scheme != "https"
        or not origin.hostname
        or origin.hostname in ("localhost", "127.0.0.1")
        or origin.username
        or origin.password
        or origin.query
        or origin.fragment
        or origin.path not in ("", "/")
    ):
        raise ValueError("Organization origin must be an exact HTTPS host.")
    if str(env.get("DIDBAN_COOKIE_SECURE", "")).lower() != "true":
        raise ValueError(
            "Secure session cookies are required for organizational installation."
        )
    if len(env.get("DIDBAN_SECRET", "")) < 48:
        raise ValueError("A persistent strong application secret is required.")
    passwords = [
        env.get("DIDBAN_APP_DB_PASSWORD", ""),
        env.get("DIDBAN_IDENTITY_DB_PASSWORD", ""),
        services["worker"]["environment"].get("DIDBAN_WORKER_DB_PASSWORD", ""),
        services["postgres"]["environment"].get("POSTGRES_PASSWORD", ""),
    ]
    if any(len(p) < 32 for p in passwords) or len(set(passwords)) != 4:
        raise ValueError(
            "Four distinct strong database boundary passwords are required."
        )
    for name in ("api", "web"):
        for port in services[name].get("ports", []):
            if port.get("host_ip") != "127.0.0.1":
                raise ValueError(
                    "Application ports must remain on loopback behind TLS."
                )
        if not services[name].get("read_only"):
            raise ValueError("Application root filesystems must be read-only.")
    if services["postgres"].get("ports"):
        raise ValueError("PostgreSQL must not publish a host port.")
    if any(
        k in services["web"]["environment"]
        for k in ("DIDBAN_SECRET", "DIDBAN_APP_DB_PASSWORD", "DIDBAN_MODEL_API_KEY")
    ):
        raise ValueError(
            "Web process must not receive database, session or model secrets."
        )
    if any(
        k in services["worker"]["environment"]
        for k in (
            "DIDBAN_SECRET",
            "DIDBAN_IDENTITY_DB_PASSWORD",
            "DIDBAN_DB_ADMIN_PASSWORD",
        )
    ):
        raise ValueError("Worker process must retain its separate restricted boundary.")
    return [
        "exact_https_origin",
        "secure_cookies",
        "persistent_application_secret",
        "distinct_boundary_secrets",
        "private_database",
        "loopback_app_ports",
        "read_only_app_root",
        "web_and_worker_secret_isolation",
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    installation = ComposeInstallation(args.project, args.env_file)
    checks = validate(
        json.loads(run(installation.command + ["config", "--format", "json"]))
    )
    print(
        json.dumps(
            {
                "status": "configuration_passed",
                "checks": checks,
                "not_verified": [
                    "certificate trust and TLS handshake",
                    "fresh image startup",
                    "restore rehearsal",
                    "capacity",
                    "organization acceptance",
                ],
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
