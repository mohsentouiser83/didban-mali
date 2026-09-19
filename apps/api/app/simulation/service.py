from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cashflow.service import get_cashflow_forecast, get_cashflow_summary
from app.payables.service import get_payables_summary
from app.receivables.service import get_receivables_summary
from app.simulation.memo_pdf import render_decision_memo_pdf
from app.simulation.models import SavedScenario
from app.simulation.schemas import (
    ComparativeMatrixColumn,
    ComparativeMatrixRequest,
    ComparativeMatrixResponse,
    DecisionMemoExportRequest,
    MetricDeltaItem,
    PresetScenarioItem,
    PresetScenariosResponse,
    SavedScenarioCreateRequest,
    SavedScenarioItem,
    SavedScenariosListResponse,
    SimulatedWeekItem,
    SimulationParametersRequest,
    SimulationResultResponse,
)

PRESET_SCENARIOS = [
    PresetScenarioItem(
        id="cash_preservation",
        name_fa="حالت بقا و انباشت نقدینگی (Cash Defense)",
        description_fa=(
            "تسریع ۱۵ روزه وصول مطالبات، افزایش ۱۵ روزه مهلت تسویه بستانکاران "
            "و فریز کامل استخدام برای افزایش حداکثری تاب‌آوری."
        ),
        icon="shield",
        parameters=SimulationParametersRequest(
            dso_change_days=-15,
            early_settlement_discount_pct=2.0,
            discount_adoption_rate_pct=35.0,
            new_hires_count=0,
            avg_salary_monthly_irr=Decimal(0),
            fixed_cost_monthly_change_irr=Decimal(0),
            dpo_change_days=15,
            shock_customer_id=None,
            shock_delay_days=0,
            shock_default_pct=0.0,
        ),
    ),
    PresetScenarioItem(
        id="aggressive_growth",
        name_fa="توسعه و رشد تهاجمی (Aggressive Expansion)",
        description_fa=(
            "استخدام ۴ نیروی جدید و اعطای شرایط اعتباری منعطف‌تر به خریداران "
            "جهت فتح بازار و افزایش سهم فروش."
        ),
        icon="chart",
        parameters=SimulationParametersRequest(
            dso_change_days=10,
            early_settlement_discount_pct=0.0,
            discount_adoption_rate_pct=0.0,
            new_hires_count=4,
            avg_salary_monthly_irr=Decimal("150000000"),
            fixed_cost_monthly_change_irr=Decimal("100000000"),
            dpo_change_days=0,
            shock_customer_id=None,
            shock_delay_days=0,
            shock_default_pct=0.0,
        ),
    ),
    PresetScenarioItem(
        id="recession_stress",
        name_fa="تست استرس رکود و شوک وصول (Recession Stress Test)",
        description_fa=(
            "تعویق ۲۵ روزه در وصولی‌ها، سوخت فرضی ۱۰٪ مطالبات و افزایش ۱۵٪ هزینه‌های ثابت و سربار."
        ),
        icon="alert",
        parameters=SimulationParametersRequest(
            dso_change_days=25,
            early_settlement_discount_pct=0.0,
            discount_adoption_rate_pct=0.0,
            new_hires_count=0,
            avg_salary_monthly_irr=Decimal(0),
            fixed_cost_monthly_change_irr=Decimal("150000000"),
            dpo_change_days=-10,
            shock_customer_id=None,
            shock_delay_days=30,
            shock_default_pct=10.0,
        ),
    ),
]


def get_preset_scenarios() -> PresetScenariosResponse:
    return PresetScenariosResponse(items=PRESET_SCENARIOS)


async def run_simulation(
    session: AsyncSession, company_id: UUID, params: SimulationParametersRequest
) -> SimulationResultResponse:
    cash_sum = await get_cashflow_summary(session, company_id=company_id)
    cash_forecast = await get_cashflow_forecast(session, company_id=company_id)
    rec_sum = await get_receivables_summary(session, company_id=company_id)
    pay_sum = await get_payables_summary(session, company_id=company_id)

    # 1. Baseline Extraction
    current_cash = Decimal(cash_sum.current_cash_irr)
    monthly_burn = Decimal(cash_sum.monthly_burn_rate_irr)
    baseline_runway = Decimal(cash_sum.runway_days)
    baseline_dso = Decimal(rec_sum.dso_days)
    baseline_dpo = Decimal(pay_sum.dpo_days)
    baseline_ccc = Decimal(pay_sum.ccc_days)

    total_rec = rec_sum.total_receivables_irr
    total_pay = pay_sum.total_payables_irr

    # Daily rates
    daily_rev = (total_rec / baseline_dso) if baseline_dso > 0 else (monthly_burn / Decimal(30))
    daily_outflow = (total_pay / baseline_dpo) if baseline_dpo > 0 else (monthly_burn / Decimal(30))
    annual_revenue = daily_rev * Decimal(365)

    # 2. Levers Computations
    # Lever 1: DSO & Discount
    # If delta DSO is negative (faster collections), cash is released into treasury
    liquidity_released_irr = daily_rev * Decimal(-params.dso_change_days)
    discount_cost_annual_irr = (
        annual_revenue
        * (Decimal(str(params.discount_adoption_rate_pct)) / Decimal(100))
        * (Decimal(str(params.early_settlement_discount_pct)) / Decimal(100))
    )

    # Lever 2: Opex & Hiring
    additional_monthly_burn = (
        Decimal(params.new_hires_count) * params.avg_salary_monthly_irr
    ) + params.fixed_cost_monthly_change_irr

    # Lever 3: DPO & Payables terms
    dpo_cash_buffer_irr = daily_outflow * Decimal(params.dpo_change_days)

    # Lever 4: Customer Shock
    shock_default_loss_irr = total_rec * (Decimal(str(params.shock_default_pct)) / Decimal(100))

    # 3. Simulated Overall Metrics
    sim_monthly_burn = max(Decimal("1000000"), monthly_burn + additional_monthly_burn)
    sim_daily_burn = sim_monthly_burn / Decimal(30)

    # Working capital immediate net cash balance impact
    net_liquidity_impact = (
        liquidity_released_irr
        + dpo_cash_buffer_irr
        - shock_default_loss_irr
        - (discount_cost_annual_irr / Decimal(12))
    )
    sim_cash = max(Decimal(0), current_cash + net_liquidity_impact)

    # Simulated Runway
    sim_runway = int(sim_cash / sim_daily_burn) if sim_daily_burn > 0 else 999
    sim_runway = max(0, min(999, sim_runway))

    # Simulated CCC (CCC delta = delta_DSO - delta_DPO)
    ccc_delta = Decimal(params.dso_change_days - params.dpo_change_days)
    sim_ccc = max(Decimal(0), baseline_ccc + ccc_delta)

    # Annual profit impact
    annual_profit_impact = (
        -(additional_monthly_burn * Decimal(12)) - discount_cost_annual_irr - shock_default_loss_irr
    )

    # 4. Week-by-Week Trajectory (13 Weeks)
    sim_weeks: list[SimulatedWeekItem] = []
    running_sim_cash = sim_cash
    first_deficit_base: int | None = cash_sum.first_deficit_week
    first_deficit_sim: int | None = None

    weekly_burn_delta = additional_monthly_burn / Decimal(4)
    weekly_disc_cost = discount_cost_annual_irr / Decimal(52)
    weekly_dso_rate = liquidity_released_irr / Decimal(13)
    weekly_dpo_rate = dpo_cash_buffer_irr / Decimal(13)
    weekly_shock_rate = shock_default_loss_irr / Decimal(13)

    for w in cash_forecast.weeks:
        base_closing = Decimal(w.ending_cash_irr)
        base_inflows = Decimal(w.projected_inflows_irr)
        base_outflows = Decimal(w.projected_outflows_irr)

        # Apply simulation delta
        w_inflow = max(
            Decimal(0), base_inflows + weekly_dso_rate - weekly_disc_cost - weekly_shock_rate
        )
        w_outflow = max(Decimal(0), base_outflows + weekly_burn_delta - weekly_dpo_rate)
        net_w = w_inflow - w_outflow
        running_sim_cash += net_w

        is_def = running_sim_cash < 0
        if is_def and first_deficit_sim is None:
            first_deficit_sim = w.week_number

        sim_weeks.append(
            SimulatedWeekItem(
                week_number=w.week_number,
                start_date=w.start_date.isoformat(),
                end_date=w.end_date.isoformat(),
                baseline_closing_cash_irr=base_closing,
                simulated_closing_cash_irr=running_sim_cash,
                simulated_inflows_irr=w_inflow,
                simulated_outflows_irr=w_outflow,
                is_baseline_deficit=w.is_deficit,
                is_simulated_deficit=is_def,
            )
        )

    # 5. Strategic Executive Verdict & Warnings
    warnings: list[str] = []
    runway_diff = sim_runway - int(baseline_runway)

    if params.dpo_change_days > 20:
        warnings.append(
            "افزایش بیش از ۲۰ روز در مهلت تسویه بستانکاران می‌تواند خط تامین و تحویل مواد اولیه را "
            "به خطر بیندازد."
        )
    if params.new_hires_count > 0 and runway_diff < -10:
        warnings.append(
            f"استخدام {params.new_hires_count} نیروی جدید، تاب‌آوری نقدینگی را بیش از ۱۰ روز "
            "کاهش می‌دهد."
        )
    if first_deficit_sim is not None and (
        first_deficit_base is None or first_deficit_sim < first_deficit_base
    ):
        warnings.append(
            f"هشدار کسری: در این سناریو، شرکت در هفته {first_deficit_sim} "
            "دچار کسری نقدینگی خواهد شد."
        )
    if params.shock_default_pct > 0:
        warnings.append(
            f"سوخت طلب فرضی به مبلغ {shock_default_loss_irr:,} ریال مستقیماً از بافر خزانه کسر شد."
        )

    if runway_diff >= 10:
        verdict = (
            f"سناریوی بسیار مثبت و استحکام‌بخش: این تصمیم تاب‌آوری نقدینگی را {runway_diff} روز "
            f"افزایش داده و مانده نقدی امن را به {sim_runway} روز می‌رساند. "
            f"نقدینگی آزادشده از این تصمیم معادل {liquidity_released_irr:,} ریال است."
        )
    elif runway_diff <= -10:
        verdict = (
            f"سناریوی پرخطر برای خزانه: این تصمیم تاب‌آوری را به شدت تقلیل داده "
            f"({abs(runway_diff)} روز کاهش) و به {sim_runway} روز می‌رساند. "
            "اجرای آن نیازمند تمهید فوری خط اعتباری بانکی یا تزریق نقد است."
        )
    else:
        verdict = (
            "سناریوی متعادل با اثر محدود نقدینگی: تغییرات اعمال‌شده تراز نقدینگی را "
            f"با نوسان اندک ({runway_diff:+d} روز) در محدوده {sim_runway} روز تاب‌آوری پایدار "
            "نگه می‌دارد."
        )

    return SimulationResultResponse(
        runway_days_delta=MetricDeltaItem(
            baseline_value=baseline_runway,
            simulated_value=Decimal(sim_runway),
            delta_value=Decimal(runway_diff),
            unit="روز",
            is_improvement=runway_diff >= 0,
        ),
        monthly_burn_rate_delta=MetricDeltaItem(
            baseline_value=monthly_burn,
            simulated_value=sim_monthly_burn,
            delta_value=sim_monthly_burn - monthly_burn,
            unit="IRR",
            is_improvement=(sim_monthly_burn <= monthly_burn),
        ),
        cash_conversion_cycle_delta=MetricDeltaItem(
            baseline_value=baseline_ccc,
            simulated_value=sim_ccc,
            delta_value=sim_ccc - baseline_ccc,
            unit="روز",
            is_improvement=(sim_ccc <= baseline_ccc),
        ),
        liquidity_released_irr=liquidity_released_irr,
        discount_cost_annual_irr=discount_cost_annual_irr,
        net_annual_profit_impact_irr=annual_profit_impact,
        first_deficit_week_baseline=first_deficit_base,
        first_deficit_week_simulated=first_deficit_sim,
        executive_verdict_fa=verdict,
        risk_warnings_fa=warnings,
        weeks=sim_weeks,
    )


_MEM_SAVED_SCENARIOS: dict[UUID, list[SavedScenarioItem]] = {}


async def create_saved_scenario(
    session: AsyncSession,
    company_id: UUID,
    req: SavedScenarioCreateRequest,
    user_id: UUID | None = None,
) -> SavedScenarioItem:
    # 1. Run simulation to get fresh calculated results and summary
    sim_res = await run_simulation(session, company_id=company_id, params=req.parameters)

    summary: dict[str, Any] = {
        "runway_days_delta": str(sim_res.runway_days_delta.delta_value),
        "simulated_runway": str(sim_res.runway_days_delta.simulated_value),
        "monthly_burn_delta": str(sim_res.monthly_burn_rate_delta.delta_value),
        "ccc_delta": str(sim_res.cash_conversion_cycle_delta.delta_value),
        "net_annual_profit_impact": str(sim_res.net_annual_profit_impact_irr),
        "liquidity_released": str(sim_res.liquidity_released_irr),
        "executive_verdict": sim_res.executive_verdict_fa,
        "first_deficit_week": sim_res.first_deficit_week_simulated,
    }

    now_iso = datetime.now(UTC).isoformat()
    scenario_id = uuid4()

    item = SavedScenarioItem(
        id=scenario_id,
        company_id=company_id,
        name=req.name,
        description=req.description,
        is_favorite=req.is_favorite,
        parameters=req.parameters,
        result_summary=summary,
        created_at=now_iso,
        updated_at=now_iso,
    )

    try:
        db_obj = SavedScenario(
            id=scenario_id,
            company_id=company_id,
            name=req.name,
            description=req.description,
            is_favorite=req.is_favorite,
            parameters=req.parameters.model_dump(mode="json"),
            result_summary=summary,
            created_by=user_id,
        )
        session.add(db_obj)
        await session.flush()
    except Exception:
        # Fallback to memory store
        if company_id not in _MEM_SAVED_SCENARIOS:
            _MEM_SAVED_SCENARIOS[company_id] = []
        _MEM_SAVED_SCENARIOS[company_id].append(item)
        return item

    if company_id not in _MEM_SAVED_SCENARIOS:
        _MEM_SAVED_SCENARIOS[company_id] = []
    _MEM_SAVED_SCENARIOS[company_id].append(item)
    return item


async def list_saved_scenarios(
    session: AsyncSession, company_id: UUID
) -> SavedScenariosListResponse:
    items: list[SavedScenarioItem] = []
    try:
        stmt = (
            select(SavedScenario)
            .where(SavedScenario.company_id == company_id)
            .order_by(SavedScenario.created_at.desc())
        )
        res = await session.scalars(stmt)
        for row in res.all():
            items.append(
                SavedScenarioItem(
                    id=row.id,
                    company_id=row.company_id,
                    name=row.name,
                    description=row.description,
                    is_favorite=row.is_favorite,
                    parameters=SimulationParametersRequest(**row.parameters),
                    result_summary=row.result_summary,
                    created_at=row.created_at.isoformat(),
                    updated_at=row.updated_at.isoformat(),
                )
            )
    except Exception:
        # Fall back to in-memory store
        items = _MEM_SAVED_SCENARIOS.get(company_id, [])

    if not items and company_id in _MEM_SAVED_SCENARIOS:
        items = _MEM_SAVED_SCENARIOS[company_id]

    return SavedScenariosListResponse(items=items)


async def delete_saved_scenario(session: AsyncSession, company_id: UUID, scenario_id: UUID) -> bool:
    try:
        stmt = delete(SavedScenario).where(
            SavedScenario.company_id == company_id,
            SavedScenario.id == scenario_id,
        )
        await session.execute(stmt)
        await session.flush()
    except Exception:
        pass

    if company_id in _MEM_SAVED_SCENARIOS:
        _MEM_SAVED_SCENARIOS[company_id] = [
            s for s in _MEM_SAVED_SCENARIOS[company_id] if s.id != scenario_id
        ]
    return True


async def build_comparative_matrix(
    session: AsyncSession, company_id: UUID, req: ComparativeMatrixRequest
) -> ComparativeMatrixResponse:
    # 1. Baseline Extraction
    cash_sum = await get_cashflow_summary(session, company_id=company_id)
    pay_sum = await get_payables_summary(session, company_id=company_id)

    baseline_col = ComparativeMatrixColumn(
        scenario_id="baseline",
        name="وضعیت مبنا (Baseline)",
        is_baseline=True,
        runway_days=cash_sum.runway_days,
        runway_delta_days=0,
        monthly_burn_irr=cash_sum.monthly_burn_rate_irr,
        monthly_burn_delta_irr=Decimal(0),
        ccc_days=pay_sum.ccc_days,
        ccc_delta_days=0,
        liquidity_released_irr=Decimal(0),
        net_annual_profit_impact_irr=Decimal(0),
        first_deficit_week=cash_sum.first_deficit_week,
        verdict_fa="عملیات جاری خزانه‌داری بدون اعمال تغییر سیاست.",
        risk_level="low",
    )

    cols: list[ComparativeMatrixColumn] = [baseline_col]

    # Resolve target scenarios
    saved_list = await list_saved_scenarios(session, company_id)
    saved_map = {s.id: s for s in saved_list.items}

    target_pairs: list[tuple[str, str, SimulationParametersRequest]] = []
    for sid in req.scenario_ids:
        if sid in saved_map:
            s_obj = saved_map[sid]
            target_pairs.append((str(s_obj.id), s_obj.name, s_obj.parameters))

    if req.current_params is not None:
        target_pairs.append(("current_draft", "سناریوی جاری (پیش‌نویس)", req.current_params))

    # If no scenario requested, compare against top preset scenarios
    if not target_pairs:
        presets = get_preset_scenarios()
        for preset_item in presets.items[:2]:
            target_pairs.append((preset_item.id, preset_item.name_fa, preset_item.parameters))

    for s_id, s_name, param_req in target_pairs:
        sim_res = await run_simulation(session, company_id=company_id, params=param_req)
        delta_runway = int(Decimal(str(sim_res.runway_days_delta.delta_value)))

        risk = "low"
        if delta_runway < -10 or sim_res.first_deficit_week_simulated is not None:
            risk = "high"
        elif delta_runway < 0:
            risk = "medium"

        cols.append(
            ComparativeMatrixColumn(
                scenario_id=s_id,
                name=s_name,
                is_baseline=False,
                runway_days=int(Decimal(str(sim_res.runway_days_delta.simulated_value))),
                runway_delta_days=delta_runway,
                monthly_burn_irr=Decimal(str(sim_res.monthly_burn_rate_delta.simulated_value)),
                monthly_burn_delta_irr=Decimal(str(sim_res.monthly_burn_rate_delta.delta_value)),
                ccc_days=int(Decimal(str(sim_res.cash_conversion_cycle_delta.simulated_value))),
                ccc_delta_days=int(Decimal(str(sim_res.cash_conversion_cycle_delta.delta_value))),
                liquidity_released_irr=sim_res.liquidity_released_irr,
                net_annual_profit_impact_irr=sim_res.net_annual_profit_impact_irr,
                first_deficit_week=sim_res.first_deficit_week_simulated,
                verdict_fa=sim_res.executive_verdict_fa,
                risk_level=risk,
            )
        )

    return ComparativeMatrixResponse(columns=cols)


async def generate_decision_memo_pdf(
    session: AsyncSession,
    company_id: UUID,
    req: DecisionMemoExportRequest,
    company_name: str,
) -> bytes:
    # Resolve parameters
    params: SimulationParametersRequest = SimulationParametersRequest()
    if req.scenario_id:
        saved_list = await list_saved_scenarios(session, company_id)
        for s in saved_list.items:
            if s.id == req.scenario_id:
                params = s.parameters
                break
    elif req.custom_params is not None:
        params = req.custom_params

    # Run simulation
    sim_res = await run_simulation(session, company_id=company_id, params=params)

    # Render PDF
    return render_decision_memo_pdf(
        company_name=company_name,
        req=req,
        params=params,
        res=sim_res,
    )
