"""Expose source-linked corrections and cancellations without guessing their financial effect."""

from collections import defaultdict, deque

from app.moadian.engine import identifier
from app.moadian.schemas import ComparisonItem, InvoiceSnapshot


def attach_related_documents(
    results: list[ComparisonItem], invoices: list[InvoiceSnapshot]
) -> None:
    nodes: dict[str, list[InvoiceSnapshot]] = defaultdict(list)
    edges: dict[str, set[str]] = defaultdict(set)
    for invoice in invoices:
        key, reference = identifier(invoice.tax_id), identifier(invoice.reference_tax_id)
        if key:
            nodes[key].append(invoice)
        if key and reference:
            edges[key].add(reference)
            edges[reference].add(key)
    for result in results:
        starts = {
            identifier(item.tax_id)
            for item in (result.internal, result.portal)
            if item and item.tax_id
        }
        if not starts.intersection(edges):
            continue
        own = {item.row_id for item in (result.internal, result.portal) if item}
        visited: set[str] = set()
        queue = deque(sorted(starts))
        related: list[InvoiceSnapshot] = []
        while queue and len(visited) < 20 and len(related) < 20:
            key = queue.popleft()
            if key in visited:
                continue
            visited.add(key)
            for item in nodes[key]:
                if item.row_id not in own and len(related) < 20:
                    related.append(item)
                    own.add(item.row_id)
            queue.extend(sorted(edges[key] - visited))
        result.related_documents = related
        if queue:
            result.limitations.append("نمایش اسناد مرتبط به ۲۰ مورد محدود شده است.")
