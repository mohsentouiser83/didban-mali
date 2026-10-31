"""Exact monetary presentation shared by the offline PDF and XLSX exporters."""

from dataclasses import dataclass
from decimal import Decimal
from ..domain.money_format import grouped_amount


@dataclass(frozen=True)
class WorkbookMoney:
    """Numeric Excel formatting when safe; grouped text beyond Excel precision."""

    value: str

    def cell_value(self) -> Decimal | str:
        significant = self.value.lstrip("-").replace(".", "").lstrip("0")
        if len(significant) <= 15:
            return Decimal(self.value)
        return grouped_amount(self.value)

    @property
    def number_format(self) -> str:
        fraction = self.value.partition(".")[2]
        return "#,##0" + ("." + "0" * len(fraction) if fraction else "")


def workbook_money(value: str | None) -> WorkbookMoney | None:
    return WorkbookMoney(value) if value is not None else None
