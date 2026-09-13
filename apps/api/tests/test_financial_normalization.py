from app.financial.normalization import mask_iban, normalize_text


def test_normalized_text_preserves_digits_and_unifies_persian_characters() -> None:
    assert normalize_text("  حساب كالا، کد ABC-۱۲۳  ") == "حساب کالا کد abc ۱۲۳"


def test_normalized_text_uses_nfc_and_collapses_punctuation_and_spacing() -> None:
    assert normalize_text("فروش\t\tشهریور... ۱۴۰۵") == "فروش شهریور ۱۴۰۵"


def test_iban_is_masked_without_returning_the_full_value() -> None:
    masked, last4 = mask_iban("IR82 0540 1026 8002 0817 9090 01")
    assert masked == "IR••••••••••••••••••••9001"
    assert last4 == "9001"
    assert "0540102680020817909001" not in masked
