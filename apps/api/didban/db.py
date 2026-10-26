from __future__ import annotations
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings


class Database:
    def __init__(self, settings: Settings):
        self.identity = ConnectionPool(
            settings.identity_dsn,
            min_size=1,
            max_size=settings.pool_size,
            open=False,
            kwargs={"row_factory": dict_row},
            timeout=5,
        )
        self.financial = ConnectionPool(
            settings.app_dsn,
            min_size=1,
            max_size=settings.pool_size,
            open=False,
            kwargs={"row_factory": dict_row},
            timeout=5,
        )

    def open(self) -> None:
        try:
            self.identity.open(wait=True, timeout=10)
            self.financial.open(wait=True, timeout=10)
            for pool, required, forbidden in [
                (self.identity, "didban_identity", "didban_app"),
                (self.financial, "didban_app", "didban_identity"),
            ]:
                with pool.connection() as conn:
                    role = conn.execute(
                        "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,current_user=session_user AS direct_login,pg_has_role(current_user,%s,'MEMBER') AS allowed,pg_has_role(current_user,%s,'MEMBER') AS forbidden,pg_has_role(current_user,'didban_worker','MEMBER') AS worker FROM pg_roles WHERE rolname=current_user",
                        (required, forbidden),
                    ).fetchone()
                    owns_schema_objects = conn.execute(
                        "SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','didban_meta') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns"
                    ).fetchone()["owns"]
                    if (
                        any(
                            role[k]
                            for k in (
                                "rolsuper",
                                "rolbypassrls",
                                "rolcreaterole",
                                "rolcreatedb",
                            )
                        )
                        or not role["direct_login"]
                        or not role["allowed"]
                        or role["forbidden"]
                        or role["worker"]
                        or owns_schema_objects
                    ):
                        raise RuntimeError("Runtime role boundary invalid")
                    if (
                        conn.execute(
                            "SELECT app.runtime_version() AS version"
                        ).fetchone()["version"]
                        != 10
                    ):
                        raise RuntimeError("Run migrations before starting the API")
        except Exception:
            self.close()
            raise

    def close(self) -> None:
        self.identity.close()
        self.financial.close()

    @contextmanager
    def transaction(
        self, *, identity: bool, actor: str | None = None, company: str | None = None
    ) -> Iterator[Connection]:
        pool = self.identity if identity else self.financial
        with pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    "SELECT set_config('timezone','UTC',true),set_config('search_path','app,pg_catalog',true),set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
                    (actor or "", company or ""),
                )
                yield conn
