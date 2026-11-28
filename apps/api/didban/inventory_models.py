"""Company stock catalog and immutable evidence of approved stock movements."""

from datetime import date

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class InventoryUnit(Entity, Tenant, Base):
    __tablename__ = "inventory_units"
    __table_args__ = (UniqueConstraint("company_id", "name"),)

    name: Mapped[str] = mapped_column(String(40))


class InventoryItem(Entity, Tenant, Versioned, Base):
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
    base_unit: Mapped[str] = mapped_column(String(40), default="عدد", server_default="عدد")
    item_kind: Mapped[str] = mapped_column(String(20), default="goods", server_default="goods")
    inventory_account_id: Mapped[str] = mapped_column(String(36))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryWarehouse(Entity, Tenant, Versioned, Base):
    __tablename__ = "inventory_warehouses"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "code"),
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(150))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryWarehouseItem(Entity, Tenant, Base):
    __tablename__ = "inventory_warehouse_items"
    __table_args__ = (
        UniqueConstraint("company_id", "warehouse_id", "item_id"),
        ForeignKeyConstraint(
            ["company_id", "warehouse_id"], ["inventory_warehouses.company_id", "inventory_warehouses.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["company_id", "item_id"], ["inventory_items.company_id", "inventory_items.id"],
            ondelete="CASCADE",
        ),
        Index("ix_inventory_warehouse_items_company_item", "company_id", "item_id"),
    )

    warehouse_id: Mapped[str] = mapped_column(String(36))
    item_id: Mapped[str] = mapped_column(String(36))


class InventoryMovement(Entity, Tenant, Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        UniqueConstraint("company_id", "journal_id", "warehouse_id", "kind", "line_index"),
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
            "(kind = 'sale_goods' AND quantity < 0) OR "
            "(kind = 'sale_return' AND quantity > 0) OR "
            "(kind = 'purchase_return' AND quantity < 0) OR "
            "(kind = 'restock' AND quantity > 0) OR "
            "(kind = 'opening_stock' AND quantity > 0) OR "
            "(kind = 'transfer_in' AND quantity > 0) OR "
            "(kind = 'transfer_out' AND quantity < 0) OR "
            "(kind = 'adjustment' AND quantity <> 0) OR "
            "(kind = 'reversal' AND quantity <> 0)",
            name="inventory_movement_kind_quantity",
        ),
        Index("ix_inventory_movements_bucket_sequence", "company_id", "item_id", "warehouse_id", "sequence"),
    )
    item_id: Mapped[str] = mapped_column(String(36))
    warehouse_id: Mapped[str] = mapped_column(String(36))
    journal_id: Mapped[str] = mapped_column(String(36))
    operation_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    document_line_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    kind: Mapped[str] = mapped_column(String(30))
    date: Mapped[date] = mapped_column(Date)
    sequence: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(BigInteger)
    value_irr: Mapped[str] = mapped_column(Money())
    evidence: Mapped[dict] = mapped_column(JSON)
