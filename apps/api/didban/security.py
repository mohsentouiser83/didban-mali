import secrets
from datetime import timedelta, timezone
from hashlib import sha256

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .errors import require
from .models import LoginAttempt, LoginSession, Membership, User, now

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))


def digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def authenticate(db: Session, token: str | None) -> tuple[User, LoginSession]:
    require(bool(token), "authentication_required", "دوباره وارد شوید.", 401)
    session = db.scalar(select(LoginSession).where(LoginSession.token_hash == digest(token or "")))
    require(session is not None, "session_expired", "دوباره وارد شوید.", 401)
    assert session
    require(
        session.expires_at.replace(tzinfo=timezone.utc) > now(), "session_expired", "دوباره وارد شوید.", 401
    )
    user = db.get(User, session.user_id)
    require(user is not None and user.active, "access_revoked", "دسترسی حساب غیرفعال است.", 401)
    assert user
    return user, session


def membership(db: Session, company: str, user: User, operation: str = "read") -> Membership:
    member = db.scalar(
        select(Membership).where(
            Membership.company_id == company, Membership.user_id == user.id, Membership.active.is_(True)
        )
    )
    require(member is not None, "not_found", "شرکت پیدا نشد.", 404)
    assert member
    if operation == "owner":
        require(member.role == "owner", "permission_denied", "فقط مالک شرکت مجاز است.", 403)
    elif operation == "write":
        require(
            member.role in ("owner", "finance_manager", "advisor"),
            "permission_denied",
            "اجازه ثبت ندارید.",
            403,
        )
    elif operation == "approve":
        require(
            member.role == "finance_manager"
            or (member.role in ("owner", "advisor") and member.approve_financial_report),
            "permission_denied",
            "مجوز تأیید گزارش ندارید.",
            403,
        )
    return member


def login(db: Session, email: str, password: str, ip: str) -> tuple[dict, str | None]:
    fingerprint = digest(email.strip().lower() + "|" + ip)
    count = (
        db.scalar(
            select(func.count())
            .select_from(LoginAttempt)
            .where(
                LoginAttempt.fingerprint == fingerprint,
                LoginAttempt.created_at > now() - timedelta(minutes=15),
                LoginAttempt.succeeded.is_(False),
            )
        )
        or 0
    )
    require(count < 8, "login_rate_limited", "۱۵ دقیقه دیگر تلاش کنید.", 429)
    user = db.scalar(select(User).where(User.email == email.strip().lower(), User.active.is_(True)))
    valid = False
    try:
        valid = hasher.verify(user.password_hash if user else DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError):
        pass
    db.add(LoginAttempt(fingerprint=fingerprint, succeeded=bool(user and valid)))
    if not user or not valid:
        return {"error": "ایمیل یا رمز عبور درست نیست."}, None
    token = secrets.token_urlsafe(48)
    session = LoginSession(
        user_id=user.id,
        token_hash=digest(token),
        csrf=secrets.token_urlsafe(32),
        expires_at=now() + timedelta(hours=settings.session_hours),
    )
    db.add(session)
    db.flush()
    return {"user": public_user(user), "csrf": session.csrf}, token


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "installation_admin": user.installation_admin,
    }
