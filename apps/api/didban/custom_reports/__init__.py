"""Custom Reports module for Didban-Mali."""

from .ai_composer import compose_report_block
from .data_sources import DATA_SOURCES, list_data_sources
from .field_registry import REGISTRY, get_entity_registry, serialize_entity_registry
from .query_engine import FinancialBlockQueryEngine

__all__ = [
    "DATA_SOURCES",
    "REGISTRY",
    "FinancialBlockQueryEngine",
    "compose_report_block",
    "get_entity_registry",
    "list_data_sources",
    "serialize_entity_registry",
]
