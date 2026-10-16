from app.settlements.bank_rules import account_keys, non_trade_movement


def test_transfers_between_known_own_accounts_cannot_pay_an_invoice():
    own = account_keys("بانک الف 212.850.123456.1 بانک ب 212.2.123456.1")
    assert non_trade_movement(
        "انتقالی از 212.850.123456.1 به 212.2.123456.1 بابت تأمین چک", own, "sales"
    )
    assert non_trade_movement("انتقالی از 212.850.123456.1 به 212.2.123456.1", own, "purchases")
    assert not non_trade_movement(
        "انتقالی از 212.2.123456.1 به 212.2845.1 کارمزد چک", own, "purchases"
    )


def test_deposit_interest_is_not_customer_collection():
    assert non_trade_movement("واریز سود علی الحساب سپرده", set(), "sales")
    assert not non_trade_movement("واریز از طرف خریدار", set(), "sales")


def test_iban_identity_is_full_length_not_last_four_digits():
    a = "IR000000000000000000010001"
    b = "IR000000000000000000020001"
    assert a[-4:] == b[-4:]
    assert account_keys(a) != account_keys(b)
    assert non_trade_movement(f"انتقال از شبا {a} به شبا {b}", account_keys(a + " " + b), "sales")
