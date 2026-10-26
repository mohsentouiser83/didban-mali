from __future__ import annotations


class ApiError(Exception):
    def __init__(
        self, status: int, code: str, message: str, *, fields: list[dict] | None = None
    ):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or []


def forbidden() -> ApiError:
    return ApiError(403, "permission_denied", "اجازه این عملیات را ندارید.")


def missing() -> ApiError:
    return ApiError(404, "not_found", "مورد در دسترس نیست.")


def conflict(code: str = "version_conflict") -> ApiError:
    return ApiError(409, code, "اطلاعات تغییر کرده است؛ دوباره دریافت کنید.")
