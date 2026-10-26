from __future__ import annotations
import hmac
from datetime import datetime, timedelta, timezone

from ..config import Settings
from ..db import Database
from ..errors import ApiError, conflict, forbidden, missing
from ..infrastructure.identity import IdentityRepository
from ..security import DUMMY_HASH, HASHER, Security, json_value, verify_password
from .idempotency import Replay


def user_view(user: dict) -> dict:
    return {
        key: user[key]
        for key in ("id", "display_name", "email", "is_installation_admin")
    }


def response(
    body: dict,
    status: int = 200,
    *,
    cookies: dict | None = None,
    etag: int | None = None,
) -> dict:
    return {
        "body": json_value(body),
        "status": status,
        "cookies": cookies or {},
        "etag": etag,
    }


class AuthService:
    def __init__(self, db: Database, settings: Settings, security: Security):
        self.db, self.settings, self.security = db, settings, security
        self.replay = Replay(security)

    def authenticate(self, token: str | None, *, required: bool = True) -> dict | None:
        user = None
        if token and len(token) <= 128:
            with self.db.transaction(identity=True) as conn:
                user = IdentityRepository(conn).session(
                    self.security.digest("session", token)
                )
        if required and user is None:
            raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
        return user

    def csrf(self, actor: dict | None, cookies: dict) -> dict:
        client = cookies.get("didban_client")
        if not self.security.valid_csrf(client):
            client = self.security.csrf()
        token = cookies.get("didban_csrf")
        usable = self.security.valid_csrf(token)
        if actor:
            usable = usable and hmac.compare_digest(
                self.security.digest("csrf-session", token or ""),
                actor["csrf_token_hash"],
            )
        if not usable:
            token = self.security.csrf()
            if actor:
                with self.db.transaction(identity=True) as conn:
                    IdentityRepository(conn).rotate_csrf(
                        actor["session_id"], self.security.digest("csrf-session", token)
                    )
        return response(
            {"token": token}, cookies={"didban_client": client, "didban_csrf": token}
        )

    def check_csrf(
        self, actor: dict | None, cookie: str | None, header: str | None
    ) -> None:
        if (
            not self.security.valid_csrf(cookie)
            or not header
            or not hmac.compare_digest(cookie, header)
        ):
            raise ApiError(403, "csrf_failed", "درخواست معتبر نیست؛ صفحه را تازه کنید.")
        if actor and not hmac.compare_digest(
            actor["csrf_token_hash"], self.security.digest("csrf-session", header)
        ):
            raise ApiError(403, "csrf_failed", "درخواست معتبر نیست؛ صفحه را تازه کنید.")

    def throttle(self, kind: str, ip: str, identity: str) -> None:
        with self.db.transaction(identity=True) as conn:
            repo = IdentityRepository(conn)
            allowed_ip = repo.throttle(
                self.security.digest("rate", kind + "|ip|" + ip),
                self.settings.login_attempts * 5,
                self.settings.rate_window_seconds,
            )
            allowed_identity = (
                repo.throttle(
                    self.security.digest("rate", kind + "|identity|" + identity),
                    self.settings.login_attempts,
                    self.settings.rate_window_seconds,
                )
                if allowed_ip
                else False
            )
        # Commit the count even when the request will be rejected.
        if not (allowed_ip and allowed_identity):
            raise ApiError(
                429,
                "rate_limited",
                "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.",
            )

    def login(
        self, body: dict, key: str, client: str, ip: str, current: dict | None
    ) -> dict:
        email = body["email"].strip().lower()
        self.throttle("login", ip, email)
        with self.db.transaction(identity=True) as conn:
            candidate = IdentityRepository(conn).user_email(email)
        encoded = candidate["password_hash"] if candidate else DUMMY_HASH
        valid = verify_password(encoded, body["password"])
        if (
            not valid
            or not candidate
            or candidate["disabled_at"]
            or not candidate["activated_at"]
        ):
            raise ApiError(401, "invalid_credentials", "ایمیل یا رمز عبور معتبر نیست.")
        with self.db.transaction(identity=True, actor=str(candidate["id"])) as conn:
            repo = IdentityRepository(conn)

            def action() -> dict:
                user = repo.user(str(candidate["id"]), lock=True)
                if (
                    user["disabled_at"]
                    or not user["activated_at"]
                    or user["auth_version"] != candidate["auth_version"]
                ):
                    raise ApiError(
                        401, "invalid_credentials", "ایمیل یا رمز عبور معتبر نیست."
                    )
                if current:
                    repo.revoke_session(current["session_id"])
                token, csrf = self.security.token(), self.security.csrf()
                repo.new_session(
                    user,
                    self.security.digest("session", token),
                    self.security.digest("csrf-session", csrf),
                    self.settings.session_seconds,
                )
                return response(
                    user_view(user),
                    cookies={"didban_session": token, "didban_csrf": csrf},
                )

            result = self.replay.run(
                conn,
                identity=True,
                scope=self.security.digest("browser", client),
                actor=None,
                company=None,
                route="login",
                key=key,
                payload=body,
                action=action,
            )
            cached = result["cookies"].get("didban_session")
            if (
                not cached
                or repo.session(self.security.digest("session", cached)) is None
            ):
                raise conflict("replayed_session_expired")
            return result

    def logout(self, actor: dict, key: str) -> dict:
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:

            def action() -> dict:
                IdentityRepository(conn).revoke_session(actor["session_id"])
                return response(
                    {"ok": True}, cookies={"didban_session": None, "didban_csrf": None}
                )

            return self.replay.run(
                conn,
                identity=True,
                scope=str(actor["session_id"]),
                actor=str(actor["id"]),
                company=None,
                route="logout",
                key=key,
                payload={},
                action=action,
            )

    def create_user(self, actor: dict, body: dict, key: str) -> dict:
        if not actor["is_installation_admin"]:
            raise forbidden()
        unusable = HASHER.hash(self.security.token())
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            self._admin_live(IdentityRepository(conn), actor)

            def action() -> dict:
                repo = IdentityRepository(conn)
                user = repo.create_invited(
                    body["email"].strip().lower(),
                    body["display_name"].strip(),
                    unusable,
                )
                return self._token_response(repo, user, "invitation", actor)

            return self.replay.run(
                conn,
                identity=True,
                scope=str(actor["id"]),
                actor=str(actor["id"]),
                company=None,
                route="createInvitedUser",
                key=key,
                payload=body,
                action=action,
            )

    def password_reset_token(
        self, actor: dict, user_id: str, key: str, *, invitation: bool = False
    ) -> dict:
        if not actor["is_installation_admin"]:
            raise forbidden()
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            repo = IdentityRepository(conn)
            self._admin_live(repo, actor)

            def action() -> dict:
                user = repo.user(user_id, lock=True)
                if (
                    not user
                    or user["disabled_at"]
                    or bool(user["activated_at"]) == invitation
                ):
                    raise missing()
                return self._token_response(
                    repo, user, "invitation" if invitation else "password_reset", actor
                )

            return self.replay.run(
                conn,
                identity=True,
                scope=str(actor["id"]),
                actor=str(actor["id"]),
                company=None,
                route=("reissueInvitation:" if invitation else "issuePasswordReset:")
                + user_id,
                key=key,
                payload={},
                action=action,
            )

    def consume(self, kind: str, body: dict, key: str, client: str, ip: str) -> dict:
        token_hash = self.security.digest("identity-token", body["token"])
        self.throttle("identity-token", ip, token_hash)
        if not body["new_password"].strip():
            raise ApiError(422, "invalid_password", "رمز عبور معتبر نیست.")
        encoded = HASHER.hash(body["new_password"])
        with self.db.transaction(identity=True) as conn:
            repo = IdentityRepository(conn)

            def action() -> dict:
                initial = repo.find_token(token_hash, kind)
                if not initial:
                    raise self._invalid_token()
                user = repo.user(str(initial["user_id"]), lock=True)
                token = repo.find_token(token_hash, kind, lock=True)
                if not user or user["disabled_at"] or not token:
                    raise self._invalid_token()
                if kind == "invitation" and user["activated_at"]:
                    raise self._invalid_token()
                user = repo.set_password(user["id"], encoded)
                # Activation/reset never logs the caller in implicitly.
                return (
                    response(user_view(user), 201)
                    if kind == "invitation"
                    else response({"ok": True})
                )

            return self.replay.run(
                conn,
                identity=True,
                scope=self.security.digest("browser", client),
                actor=None,
                company=None,
                route="consume:" + kind,
                key=key,
                payload=body,
                action=action,
            )

    def _token_response(
        self, repo: IdentityRepository, user: dict, kind: str, actor: dict
    ) -> dict:
        token = self.security.token()
        expiry = datetime.now(timezone.utc) + timedelta(
            hours=24 if kind == "invitation" else 1
        )
        repo.issue_token(
            user["id"],
            kind,
            self.security.digest("identity-token", token),
            expiry,
            actor["id"],
        )
        return response(
            {"user_id": user["id"], "token": token, "expires_at": expiry}, 201
        )

    @staticmethod
    def _admin_live(repo: IdentityRepository, actor: dict) -> None:
        if not repo.require_session(actor):
            raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
        live = repo.user(str(actor["id"]), share=True)
        if not live or live["disabled_at"] or not live["is_installation_admin"]:
            raise forbidden()

    @staticmethod
    def _invalid_token() -> ApiError:
        return ApiError(
            422, "identity_token_invalid", "کد معتبر نیست یا مهلت آن تمام شده است."
        )
