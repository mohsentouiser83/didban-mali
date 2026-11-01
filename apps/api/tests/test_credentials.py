import pytest
from pydantic import ValidationError

from didban.schemas import LoginInput, UserInput


def test_password_whitespace_is_not_silently_changed():
    secret = "  twelve-character-password  "
    assert LoginInput(email=" user@example.test ", password=secret).password == secret
    assert UserInput(name=" نام ", email="user@example.test", password=secret).password == secret
    assert UserInput(name=" نام ", email="user@example.test", password=secret).name == "نام"
    for cls, payload in [
        (LoginInput, {"email": "user@example.test"}),
        (UserInput, {"name": "نام", "email": "user@example.test"}),
    ]:
        with pytest.raises(ValidationError):
            cls(**payload, password=" " * 20)
