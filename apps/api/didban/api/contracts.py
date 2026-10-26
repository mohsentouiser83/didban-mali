from __future__ import annotations
import json
from functools import lru_cache

from jsonschema import Draft202012Validator, FormatChecker

from ..config import ROOT
from ..errors import ApiError

DOCUMENT = json.loads((ROOT / "contracts/openapi.json").read_text())


@lru_cache(maxsize=256)
def validator(schema_json: str) -> Draft202012Validator:
    schema = json.loads(schema_json)
    return Draft202012Validator(
        schema | {"components": DOCUMENT["components"]}, format_checker=FormatChecker()
    )


def validate(value, schema: dict, *, response: bool = False) -> None:
    errors = list(validator(json.dumps(schema, sort_keys=True)).iter_errors(value))
    if not errors:
        return
    if response:
        raise RuntimeError("Response failed the published API contract")
    fields = [
        {
            "field": "/" + "/".join(map(str, error.absolute_path)),
            "code": str(error.validator),
            "message_fa": "مقدار معتبر نیست.",
        }
        for error in errors[:10]
    ]
    raise ApiError(
        422, "validation_failed", "اطلاعات واردشده معتبر نیست.", fields=fields
    )
