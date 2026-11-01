class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 422, fields: dict | None = None):
        self.code, self.message, self.status, self.fields = code, message, status, fields or {}
        super().__init__(message)


def require(condition: bool, code: str, message: str, status: int = 422) -> None:
    if not condition:
        raise DomainError(code, message, status)
