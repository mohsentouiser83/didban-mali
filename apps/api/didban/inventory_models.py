"""Company stock catalog and immutable evidence of approved stock movements."""

from datetime import date

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant
from .money_type import Money


class InventoryItem(Entity, Tenant, Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "code"),
        ForeignKeyConstraint(
            ["company_id", "inventory_account_id"],
            ["accounting_accounts.company_id", "accounting_accounts.id"],
        ),
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(150))
    inventory_account_id: Mapped[str] = mapped_column(String(36))


class InventoryWarehouse(Entity, Tenant, Base):
    __tablename__ = "inventory_warehouses"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "code"),
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(150))


class InventoryMovement(Entity, Tenant, Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        UniqueConstraint("company_id", "journal_id"),
        UniqueConstraint("company_id", "sequence"),
        ForeignKeyConstraint(["company_id", "item_id"], ["inventory_items.company_id", "inventory_items.id"]),
        ForeignKeyConstraint(
            ["company_id", "warehouse_id"], ["inventory_warehouses.company_id", "inventory_warehouses.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "operation_id"], ["accounting_operations.company_id", "accounting_operations.id"]
        ),
        CheckConstraint(
            "(kind = 'purchase_goods' AND quantity > 0) OR "
            "(kind = 'sale_goods' AND quantity < 0) OR (kind = 'reversal' AND quantity <> 0)",
            name="inventory_movement_kind_quantity",
        ),
        Index("ix_inventory_movements_bucket_sequence", "company_id", "item_id", "warehouse_id", "sequence"),
    )
    item_id: Mapped[str] = mapped_column(String(36))
    warehouse_id: Mapped[str] = mapped_column(String(36))
    journal_id: Mapped[str] = mapped_column(String(36))
    operation_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    date: Mapped[date] = mapped_column(Date)
    sequence: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(BigInteger)
    value_irr: Mapped[str] = mapped_column(Money())
    evidence: Mapped[dict] = mapped_column(JSON)
