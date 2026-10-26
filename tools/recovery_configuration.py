"""Self-contained effective configuration; never confuse env-file text with live state."""

from __future__ import annotations
from copy import deepcopy
import hashlib
from pathlib import Path
import shutil


def validate_effective(configuration: dict, containers: dict) -> None:
    for service in ("api", "worker", "postgres", "web"):
        if service not in containers:
            raise ValueError("A complete installation is required for backup.")
        actual = dict(
            item.split("=", 1)
            for item in containers[service]["Config"]["Env"]
            if "=" in item
        )
        declared = configuration["services"][service].get("environment", {})
        if {k for k in actual if k.startswith("DIDBAN_")} != {
            k for k in declared if k.startswith("DIDBAN_")
        }:
            raise ValueError(
                "Undeclared live application overrides prevent a safe backup."
            )
        for name, expected in declared.items():
            if actual.get(name) != str(expected):
                raise ValueError(
                    "Live configuration differs from resolved Compose settings; backup refused."
                )


def portable(configuration: dict, containers: dict, directory: Path) -> dict:
    validate_effective(configuration, containers)
    result = deepcopy(configuration)
    result.pop("name", None)
    for section in ("volumes", "networks"):
        for definition in result.get(section, {}).values():
            if (
                definition.get("external")
                or definition.get("driver_opts")
                or definition.get("driver") not in (None, "local", "bridge")
            ):
                raise ValueError(
                    "External volumes/networks require a separate coordinated recovery plan."
                )
            definition.pop("name", None)  # Never reuse the source project's resources.
    api_image = containers["api"]["Image"]
    for service, definition in result["services"].items():
        definition.pop("build", None)
        if definition.get("container_name"):
            raise ValueError("Fixed container names are unsafe for isolated restore.")
        if service in containers:
            definition["image"] = containers[service]["Image"]
        elif service in ("migrate", "storage-init"):
            definition["image"] = api_image
        for mount in definition.get("volumes", []):
            if mount["type"] == "bind":
                source = Path(mount["source"])
                if not source.is_file() or source.is_symlink():
                    raise ValueError(
                        "Only regular configuration-file bind mounts are supported."
                    )
                target = (
                    directory
                    / "configuration-bindings"
                    / (hashlib.sha256(str(source).encode()).hexdigest() + ".conf")
                )
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                if not target.exists():
                    shutil.copyfile(source, target)
                target.chmod(0o600)
                mount["source"] = "./configuration-bindings/" + target.name

    # A resolved config is parsed again on restore. Preserve literal $ in secrets
    # and shell commands rather than interpolating against the recovery host.
    def escape(value):
        if isinstance(value, str):
            return value.replace("$", "$$")
        if isinstance(value, list):
            return [escape(item) for item in value]
        if isinstance(value, dict):
            return {k: escape(v) for k, v in value.items()}
        return value

    return escape(result)
