from decimal import Decimal

import pytest

from didban.errors import DomainError
from didban.ingestion import money
from didban.money_type import canonical_money


def test_toman_conversion_is_rejected_before_exceeding_canonical_database_precision():
    for amount in ("10000000000000000000000000000000", "-10000000000000000000000000000000"):
        with pytest.raises(DomainError) as error:
            money(amount, "TOMAN")
        assert error.value.code == "amount_precision"


def test_near_boundary_toman_conversion_remains_exact_and_database_compatible():
    converted = money("9999999999999999999999999999999.999999", "TOMAN")
    assert converted == "99999999999999999999999999999999.999990"
    assert Decimal(canonical_money(converted)) == Decimal(converted)
