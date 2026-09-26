from app.calculations.base import MetricCalculatorInterface
from app.calculations.burn_rate import BurnRateCalculator
from app.calculations.cash_forecast import CashForecastCalculator
from app.calculations.cash_movement import CashMovementCalculator
from app.calculations.cash_position import CashPositionCalculator
from app.calculations.ccc import CCCCalculator
from app.calculations.dpo import DPOCalculator
from app.calculations.dso import DSOCalculator
from app.calculations.payables import PayablesCalculator
from app.calculations.receivables import ReceivablesCalculator
from app.calculations.runway import RunwayCalculator


class MetricRegistry:
    def __init__(self) -> None:
        self._calculators: dict[str, MetricCalculatorInterface] = {}
        self._ordered_keys: list[str] = []
        self._register_defaults()

    def register(self, calculator: MetricCalculatorInterface) -> None:
        self._calculators[calculator.metric_key] = calculator
        if calculator.metric_key not in self._ordered_keys:
            self._ordered_keys.append(calculator.metric_key)

    def get(self, metric_key: str) -> MetricCalculatorInterface | None:
        return self._calculators.get(metric_key)

    def get_ordered_calculators(self) -> list[MetricCalculatorInterface]:
        """Returns calculators in logical dependency execution order."""
        return [self._calculators[k] for k in self._ordered_keys if k in self._calculators]

    def _register_defaults(self) -> None:
        # Dependency order is essential:
        # 1. Cash Position & Cash Movement (provides liquidity and baseline flow)
        # 2. Receivables & Payables (provides open obligations and aging)
        # 3. DSO & DPO (uses receivables/payables + sales/expenses)
        # 4. CCC (uses DSO & DPO)
        # 5. Burn Rate & Runway (uses cash position + net flow)
        # 6. Cash Forecast 13W (uses cash position + open receivables/payables + burn)
        self.register(CashPositionCalculator())
        self.register(CashMovementCalculator())
        self.register(ReceivablesCalculator())
        self.register(PayablesCalculator())
        self.register(DSOCalculator())
        self.register(DPOCalculator())
        self.register(CCCCalculator())
        self.register(BurnRateCalculator())
        self.register(RunwayCalculator())
        self.register(CashForecastCalculator())


registry = MetricRegistry()
