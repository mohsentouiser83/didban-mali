import io
from zipfile import ZIP_DEFLATED, ZipFile

import openpyxl
import pytest

from didban.errors import DomainError
from didban.ingestion import read_file


def workbook_bytes():
    book = openpyxl.Workbook()
    book.active.append(["date", "amount", "reference"])
    book.active.append(["2026-09-01", "100", "REF1"])
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def modified_workbook(path: str, payload: bytes):
    output = io.BytesIO()
    with ZipFile(io.BytesIO(workbook_bytes())) as source, ZipFile(output, "w", ZIP_DEFLATED) as target:
        for part in source.infolist():
            if part.filename != path:
                target.writestr(part.filename, source.read(part))
        target.writestr(path, payload)
    return output.getvalue()


@pytest.mark.parametrize("part", ["xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/_rels/workbook.xml.rels"])
def test_malformed_xml_has_sanitized_file_error(part):
    with pytest.raises(DomainError) as error:
        read_file("broken.xlsx", modified_workbook(part, b"<root><broken"))
    assert error.value.code == "invalid_file" and error.value.status == 415


@pytest.mark.parametrize("part", ["xl/macrosheets/sheet1.xml", "xl/embeddings/embedded.bin", "xl/activeX/control1.bin", "xl/ctrlProps/control.xml", "customUI/customUI.xml"])
def test_macro_sheets_and_embedded_executable_controls_are_rejected(part):
    with pytest.raises(DomainError) as error:
        read_file("unsafe.xlsx", modified_workbook(part, b"<root/>"))
    assert error.value.code == "unsafe_workbook"


def test_dtd_and_entity_expansion_are_rejected_without_external_resolution():
    payload = b'<!DOCTYPE root [<!ENTITY private SYSTEM "file:///nonexistent-sensitive-file">]><root>&private;</root>'
    with pytest.raises(DomainError) as error:
        read_file("entity.xlsx", modified_workbook("xl/workbook.xml", payload))
    assert error.value.code == "invalid_file" and error.value.status == 415


def test_disguised_macro_content_type_is_rejected_even_without_vba_filename():
    payload = b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>'
    with pytest.raises(DomainError) as error:
        read_file("disguised.xlsx", modified_workbook("[Content_Types].xml", payload))
    assert error.value.code == "unsafe_workbook"


@pytest.mark.parametrize("binary_present", [False, True])
def test_macro_default_type_applies_only_to_existing_parts(binary_present):
    output = io.BytesIO()
    with ZipFile(io.BytesIO(workbook_bytes())) as source, ZipFile(output, "w", ZIP_DEFLATED) as target:
        for part in source.infolist():
            payload = source.read(part)
            if part.filename == "[Content_Types].xml":
                payload = payload.replace(
                    b"</Types>",
                    b'<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/></Types>',
                )
            target.writestr(part.filename, payload)
        if binary_present:
            target.writestr("xl/hidden.bin", b"binary payload")
    if binary_present:
        with pytest.raises(DomainError) as error:
            read_file("export.xlsx", output.getvalue())
        assert error.value.code == "unsafe_workbook"
    else:
        sheets = read_file("export.xlsx", output.getvalue())
        assert sheets[0].rows[0][1]["amount"] == "100"
