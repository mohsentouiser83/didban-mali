"""Presentation-only grouping for exact decimal strings."""

import re


def grouped_amount(value: str) -> str:
    whole, dot, fraction = value.partition(".")
    return re.sub(r"\B(?=(\d{3})+(?!\d))", ",", whole) + dot + fraction
