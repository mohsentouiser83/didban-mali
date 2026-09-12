import io
import zipfile

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.imports.validation import receive_and_validate, safe_original_name


def upload(name: str, content: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=name,
        headers=Headers({"content-type": content_type}),
    )


@pytest.mark.asyncio
async def test_csv_is_hashed_and_path_is_removed_from_name() -> None:
    validated = await receive_and_validate(
        upload("../../دفتر.csv", "سند,مبلغ\n۱,۱۰۰\n".encode(), "text/csv")
    )
    try:
        assert validated.original_name == "دفتر.csv"
        assert validated.size_bytes > 0
        assert len(validated.sha256) == 64
        assert validated.metadata["detected_format"] == "csv"
    finally:
        validated.stream.close()


@pytest.mark.asyncio
async def test_executable_disguised_as_csv_is_rejected() -> None:
    with pytest.raises(HTTPException) as caught:
        await receive_and_validate(upload("گزارش.csv", b"MZnot-a-spreadsheet", "text/csv"))
    assert caught.value.status_code == 415


@pytest.mark.asyncio
async def test_macro_enabled_workbook_is_rejected() -> None:
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w") as workbook:
        workbook.writestr("[Content_Types].xml", "<Types />")
        workbook.writestr("xl/workbook.xml", "<workbook />")
        workbook.writestr("xl/vbaProject.bin", b"macro")
    with pytest.raises(HTTPException) as caught:
        await receive_and_validate(
            upload(
                "دفتر.xlsx",
                content.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        )
    assert caught.value.status_code == 415


def test_control_characters_are_removed_from_original_name() -> None:
    assert safe_original_name("folder\\صورت\nحساب.csv") == "صورت‌حساب.csv".replace("‌", "")
