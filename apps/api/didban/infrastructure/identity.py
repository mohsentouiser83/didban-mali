from __future__ import annotations
from datetime import datetime, timedelta, timezone
from uuid import UUID
from psycopg import Connection


class IdentityRepository:
    def directory(self, cursor: tuple | None, limit: int) -> list[dict]:
        where = " WHERE (created_at,id)>(%s,%s)" if cursor else ""
        return self.conn.execute(
            "SELECT id,email,display_name,is_installation_admin,activated_at,disabled_at,created_at FROM app.users"
            + where
            + " ORDER BY created_at,id LIMIT %s",
            (*cursor, limit) if cursor else (limit,),
        ).fetchall()

    def member_profiles(self, ids: list) -> dict:
        rows = self.conn.execute(
            "SELECT id,email,display_name FROM app.users WHERE id=ANY(%s)", (ids,)
        ).fetchall()
        return {row["id"]: row for row in rows}

    def __init__(self, conn: Connection):
        self.conn = conn

    def user_email(self, email: str) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.users WHERE email=%s", (email,)
        ).fetchone()

    def require_session(self, actor: dict) -> bool:
        return bool(
            self.conn.execute(
                "SELECT app.assert_current_session(%s) AS allowed",
                (actor["token_hash"],),
            ).fetchone()["allowed"]
        )

    def user(
        self, user_id: str, *, lock: bool = False, share: bool = False
    ) -> dict | None:
        suffix = " FOR SHARE" if share else " FOR UPDATE" if lock else ""
        return self.conn.execute(
            "SELECT * FROM app.users WHERE id=%s" + suffix, (user_id,)
        ).fetchone()

    def session(self, token_hash: str) -> dict | None:
        return self.conn.execute(
            """SELECT u.*,s.id AS session_id,s.csrf_token_hash,s.token_hash
          FROM app.auth_sessions s JOIN app.users u ON u.id=s.user_id
          WHERE s.token_hash=%s AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
          AND u.disabled_at IS NULL AND u.activated_at IS NOT NULL AND s.user_auth_version=u.auth_version""",
            (token_hash,),
        ).fetchone()

    def new_session(
        self, user: dict, token_hash: str, csrf_hash: str, seconds: int
    ) -> None:
        self.conn.execute(
            """INSERT INTO app.auth_sessions(user_id,token_hash,csrf_token_hash,expires_at,user_auth_version)
          VALUES(%s,%s,%s,%s,%s)""",
            (
                user["id"],
                token_hash,
                csrf_hash,
                datetime.now(timezone.utc) + timedelta(seconds=seconds),
                user["auth_version"],
            ),
        )

    def rotate_csrf(self, session_id: UUID, token_hash: str) -> None:
        self.conn.execute(
            "UPDATE app.auth_sessions SET csrf_token_hash=%s WHERE id=%s",
            (token_hash, session_id),
        )

    def revoke_session(self, session_id: UUID) -> None:
        self.conn.execute(
            "UPDATE app.auth_sessions SET revoked_at=clock_timestamp() WHERE id=%s",
            (session_id,),
        )

    def throttle(self, bucket: str, limit: int, window: int) -> bool:
        row = self.conn.execute(
            """INSERT INTO app.auth_rate_limits(bucket_key,window_started_at,attempts)
          VALUES(%s,clock_timestamp(),1) ON CONFLICT(bucket_key) DO UPDATE SET
          attempts=CASE WHEN app.auth_rate_limits.window_started_at<clock_timestamp()-make_interval(secs=>%s)
            THEN 1 ELSE app.auth_rate_limits.attempts+1 END,
          window_started_at=CASE WHEN app.auth_rate_limits.window_started_at<clock_timestamp()-make_interval(secs=>%s)
            THEN clock_timestamp() ELSE app.auth_rate_limits.window_started_at END RETURNING attempts""",
            (bucket, window, window),
        ).fetchone()
        return row["attempts"] <= limit

    def create_invited(self, email: str, name: str, unusable_hash: str) -> dict:
        return self.conn.execute(
            """INSERT INTO app.users(email,display_name,password_hash) VALUES(%s,%s,%s) RETURNING *""",
            (email, name, unusable_hash),
        ).fetchone()

    def issue_token(
        self, user_id: UUID, kind: str, token_hash: str, expires: datetime, actor: UUID
    ) -> None:
        self.conn.execute(
            "UPDATE app.identity_tokens SET consumed_at=clock_timestamp() WHERE user_id=%s AND kind=%s AND consumed_at IS NULL",
            (user_id, kind),
        )
        self.conn.execute(
            "INSERT INTO app.identity_tokens(user_id,kind,token_hash,expires_at,issued_by) VALUES(%s,%s,%s,%s,%s)",
            (user_id, kind, token_hash, expires, actor),
        )

    def find_token(
        self, token_hash: str, kind: str, *, lock: bool = False
    ) -> dict | None:
        return self.conn.execute(
            """SELECT * FROM app.identity_tokens WHERE token_hash=%s AND kind=%s
          AND consumed_at IS NULL AND expires_at>clock_timestamp()"""
            + (" FOR UPDATE" if lock else ""),
            (token_hash, kind),
        ).fetchone()

    def set_password(self, user_id: UUID, encoded: str) -> dict:
        self.conn.execute(
            "UPDATE app.identity_tokens SET consumed_at=clock_timestamp() WHERE user_id=%s AND consumed_at IS NULL",
            (user_id,),
        )
        self.conn.execute(
            "UPDATE app.auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=%s AND revoked_at IS NULL",
            (user_id,),
        )
        return self.conn.execute(
            """UPDATE app.users SET password_hash=%s,activated_at=coalesce(activated_at,clock_timestamp()),auth_version=auth_version+1
          WHERE id=%s RETURNING *""",
            (encoded, user_id),
        ).fetchone()

    def companies(self, cursor: tuple | None, limit: int) -> list[dict]:
        where = " WHERE (created_at,id)>(%s,%s)" if cursor else ""
        return self.conn.execute(
            "SELECT * FROM app.identity_companies()"
            + where
            + " ORDER BY created_at,id LIMIT %s",
            (*cursor, limit) if cursor else (limit,),
        ).fetchall()

    def create_company(
        self, name: str, owner: str, timezone_name: str, unit: str
    ) -> dict:
        return self.conn.execute(
            "SELECT * FROM app.identity_create_company(%s,%s,%s,%s)",
            (name, owner, timezone_name, unit),
        ).fetchone()
