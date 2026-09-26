import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
import uuid
import os
import sys

# Ensure apps/api is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../apps/api")))

from sqlalchemy import select
from app.core.database import async_session_factory
from app.core.tenant import set_request_user, set_request_company
from app.companies.models import Company, CompanyAccess, CompanyRole
from app.identity.models import User, Membership
from app.customer_success.models import (
    CustomerSuccessRecord,
    GoLiveValidation,
    SupportTicket,
    ProductFeedback,
)

COHORT_COMPANIES = [
    {
        "legal_name": "شرکت فناوری و خدمات ابری پارس",
        "industry": "فناوری اطلاعات و خدمات نرم‌افزاری B2B",
        "finance_team_size": 3,
        "accounting_system": "سپیدار سیستم",
        "bank_account_count": 4,
        "monthly_transaction_volume": 450,
        "champion_name": "آقای رضایی (مدیر مالی)",
        "implementation_owner_name": "کارشناس موفقیت مشتری دیدبان",
        "executive_sponsor": "مهندس توکلی (مدیرعامل)",
        "primary_business_objective": "پیش‌بینی نقدینگی ۱۳ هفته‌ای و کنترل مطالبات پروژه‌های B2B",
        "main_pain_point": "اکسل‌های دستی متعدد، تاخیر در کشف مطالبات معوق، عدم هماهنگی مانده بانک با دفاتر",
        "primary_use_case": "پیش‌بینی جریان وجوه نقد و وصول خودکار مطالبات سررسیدشده",
        "pricing_tier": "control",
        "monthly_contract_value_irr": Decimal("180000000"),  # 18 million Toman / month
        "implementation_hours_dev": Decimal("2.5"),
        "implementation_hours_consultant": Decimal("6.0"),
        "implementation_hours_cs": Decimal("4.0"),
        "baseline_process": {
            "monthly_close_days": 12,
            "reconciliation_hours_weekly": 14,
            "overdue_ar_tracking": "اکسل دستی نامنظم با تاخیر ۲ ماهه",
            "cash_visibility": "بررسی روزانه ورود به اینترنت‌بانک‌های جداگانه",
        },
        "expected_outcomes": {
            "target_close_days": 4,
            "target_reconciliation_accuracy_pct": 95,
            "target_ar_reduction_pct": 25,
            "target_runway_visibility_weeks": 13,
        },
        "review_30d": {
            "actual_close_days": 5,
            "reconciliation_accuracy_pct": 96.2,
            "active_users_weekly": 3,
            "resolved_findings_count": 14,
            "feedback": "مدیرعامل برای اولین بار وضعیت نقدینگی را بدون نیاز به تماس با حسابداری مشاهده می‌کند.",
        },
        "review_60d": {
            "actual_close_days": 4,
            "reconciliation_accuracy_pct": 98.1,
            "ar_overdue_recovered_irr": 32000000000,  # 3.2 billion Rials
            "adoption_rate": "روزانه در جلسه صبحگاهی خزانه استفاده می‌شود.",
        },
        "review_90d": {
            "nps_score": 9,
            "renewal_intent": "confirmed_annual",
            "referenceable": True,
            "roi_ratio": "5.4x نسبت به هزینه لایسنس سالانه",
        },
        "validation_data": {
            "cash_position_irr": Decimal("28500000000"),
            "receivables_irr": Decimal("74200000000"),
            "payables_irr": Decimal("31000000000"),
            "reconciliation_difference_irr": Decimal("0"),
            "user_statement": "مانده کلیه حساب‌های بانکی و تراز معین اسناد با دفاتر حسابداری انطباق کامل دارد و صحه‌گذاری می‌شود.",
        },
    },
    {
        "legal_name": "شرکت پخش و توزیع پیشرو کاسپین",
        "industry": "پخش و توزیع مویرگی (FMCG)",
        "finance_team_size": 6,
        "accounting_system": "راهکاران سیستم",
        "bank_account_count": 18,
        "monthly_transaction_volume": 3200,
        "champion_name": "خانم کاظمی (رئیس حسابداری)",
        "implementation_owner_name": "متخصص پیاده‌سازی دیدبان",
        "executive_sponsor": "آقای سعادت (معاون مالی و اقتصادی)",
        "primary_business_objective": "مغایرت‌گیری بلادرنگ روزانه ۱۸ حساب بانکی و کشف واریزی‌های نامشخص",
        "main_pain_point": "حجم سرسام‌آور تراکنش‌های بانکی، واریزی‌های مشتریان بدون شناسه، خطاهای انسانی در ثبت دفتر",
        "primary_use_case": "موتور مغایرت‌گیری بانکی و کارتابل پیگیری موارد معلق",
        "pricing_tier": "advanced",
        "monthly_contract_value_irr": Decimal("320000000"),  # 32 million Toman / month
        "implementation_hours_dev": Decimal("4.0"),
        "implementation_hours_consultant": Decimal("10.5"),
        "implementation_hours_cs": Decimal("8.0"),
        "baseline_process": {
            "monthly_close_days": 18,
            "reconciliation_hours_weekly": 35,
            "unidentified_deposits_avg_monthly_irr": 18000000000,
            "cash_visibility": "گزارش هفتگی با خطای تراز",
        },
        "expected_outcomes": {
            "target_close_days": 6,
            "target_reconciliation_accuracy_pct": 92,
            "target_unidentified_reduction_pct": 80,
        },
        "review_30d": {
            "actual_close_days": 8,
            "reconciliation_accuracy_pct": 91.5,
            "unidentified_recovered_irr": 14500000000,
            "feedback": "بستن ماهانه از ۱۸ روز به ۸ روز کاهش یافته و خطاهای واریزی بلادرنگ کشف می‌شوند.",
        },
        "review_60d": {
            "actual_close_days": 6,
            "reconciliation_accuracy_pct": 95.0,
            "resolved_findings_count": 42,
            "adoption_rate": "تیم ۴ نفره حسابداری روزانه با دیدبان تطبیق انجام می‌دهند.",
        },
        "review_90d": {
            "nps_score": 10,
            "renewal_intent": "confirmed_annual",
            "referenceable": True,
            "roi_ratio": "8.2x صرفه‌جویی در جریمه و بازیابی سریع نقدینگی",
        },
        "validation_data": {
            "cash_position_irr": Decimal("142000000000"),
            "receivables_irr": Decimal("380000000000"),
            "payables_irr": Decimal("295000000000"),
            "reconciliation_difference_irr": Decimal("0"),
            "user_statement": "تطبیق ۱۸ حساب بانکی انجام گردید و تراز نهایی مورد تایید رسمی واحد مالی است.",
        },
    },
    {
        "legal_name": "شرکت مهندسی و ساخت سازه تهران",
        "industry": "پیمانکاری EPC و ساختمانی",
        "finance_team_size": 4,
        "accounting_system": "تدبیر",
        "bank_account_count": 8,
        "monthly_transaction_volume": 680,
        "champion_name": "مهندس ابراهیمی (معاونت اداری و مالی)",
        "implementation_owner_name": "کارشناس استقرار دیدبان",
        "executive_sponsor": "دکتر معتمدی (رئیس هیئت مدیره)",
        "primary_business_objective": "پیش‌بینی نقدینگی پروژه‌ای و پیشگیری از جرایم دیرکرد مالیات و بیمه",
        "main_pain_point": "پروژه‌ها دچار شوک‌های نقدینگی غیرمنتظره می‌شدند و مطالبات کارفرماها به موقع تسویه نمی‌شد",
        "primary_use_case": "دیدبان نقدینگی، کنترل سررسیدهای پرداخت و رصد شاخص‌های سلامت مالی",
        "pricing_tier": "control",
        "monthly_contract_value_irr": Decimal("220000000"),  # 22 million Toman / month
        "implementation_hours_dev": Decimal("1.5"),
        "implementation_hours_consultant": Decimal("8.0"),
        "implementation_hours_cs": Decimal("5.0"),
        "baseline_process": {
            "monthly_close_days": 15,
            "reconciliation_hours_weekly": 18,
            "unexpected_cash_shortfall_count_quarterly": 4,
            "statutory_late_fees_annual_irr": 8500000000,
        },
        "expected_outcomes": {
            "target_close_days": 5,
            "target_reconciliation_accuracy_pct": 94,
            "zero_statutory_penalties": True,
        },
        "review_30d": {
            "actual_close_days": 6,
            "reconciliation_accuracy_pct": 93.8,
            "prevented_penalties_irr": 2100000000,
            "feedback": "هشدار زودهنگام دیدبان مانع از جریمه عدم ارسال لیست ماده ۱۶۹ شد.",
        },
        "review_60d": {
            "actual_close_days": 5,
            "reconciliation_accuracy_pct": 96.4,
            "runway_accuracy_pct": 92,
            "adoption_rate": "جلسات هفتگی کنترل پروژه روی نمودار ۱۳ هفته‌ای دیدبان برگزار می‌شود.",
        },
        "review_90d": {
            "nps_score": 9,
            "renewal_intent": "confirmed_annual",
            "referenceable": True,
            "roi_ratio": "4.8x با پیشگیری کامل از جرایم و بهره دیرکرد",
        },
        "validation_data": {
            "cash_position_irr": Decimal("64000000000"),
            "receivables_irr": Decimal("210000000000"),
            "payables_irr": Decimal("178000000000"),
            "reconciliation_difference_irr": Decimal("0"),
            "user_statement": "کلیه اقلام دریافتی، صورت‌وضعیت‌ها و تعهدات بانکی مورد ارزیابی قرار گرفت و صحه‌گذاری شد.",
        },
    },
    {
        "legal_name": "شرکت داروسازی و سلامت کیمیا",
        "industry": "تولید و توزیع دارو و مکمل‌های درمانی",
        "finance_team_size": 5,
        "accounting_system": "سپیدار سیستم",
        "bank_account_count": 6,
        "monthly_transaction_volume": 890,
        "champion_name": "دکتر حسینی (مدیر امور مالیاتی و حسابداری)",
        "implementation_owner_name": "سرپرست موفقیت مشتری",
        "executive_sponsor": "مهندس نیک‌پی (مدیرعامل)",
        "primary_business_objective": "انطباق قطعی اسناد با گزارش‌های مالی و ردیابی داده‌ها برای ممیزی قانونی",
        "main_pain_point": "حجم زیاد ضمائم کاغذی، مغایرت‌های جزئی مکرر در فاکتورها، ریسک رد دفاتر مالیاتی",
        "primary_use_case": "ردیابی شجره داده (Data Lineage) و حل خودکار تعارضات اسناد",
        "pricing_tier": "control",
        "monthly_contract_value_irr": Decimal("200000000"),  # 20 million Toman / month
        "implementation_hours_dev": Decimal("1.0"),
        "implementation_hours_consultant": Decimal("7.0"),
        "implementation_hours_cs": Decimal("4.5"),
        "baseline_process": {
            "monthly_close_days": 14,
            "audit_preparation_weeks": 6,
            "tax_discrepancy_risk_rating": "بالا",
        },
        "expected_outcomes": {
            "target_close_days": 4,
            "target_audit_prep_days": 3,
            "tax_discrepancy_risk_rating": "ناچیز",
        },
        "review_30d": {
            "actual_close_days": 5,
            "reconciliation_accuracy_pct": 97.2,
            "lineage_inspections_count": 86,
            "feedback": "قابلیت دیدن سطر دقیق اکسل منبع در هر یافته، اعتماد کامل تیم مالی را جلب کرد.",
        },
        "review_60d": {
            "actual_close_days": 4,
            "reconciliation_accuracy_pct": 98.7,
            "audit_prep_completed_days": 2,
            "adoption_rate": "گزارش مجمع و تاییدیه حسابرس قانونی با داده‌های دیدبان مستندسازی شد.",
        },
        "review_90d": {
            "nps_score": 10,
            "renewal_intent": "confirmed_annual",
            "referenceable": True,
            "roi_ratio": "6.1x در کاهش خطاهای ممیزی مالیاتی و تسریع بستن دفاتر",
        },
        "validation_data": {
            "cash_position_irr": Decimal("92000000000"),
            "receivables_irr": Decimal("185000000000"),
            "payables_irr": Decimal("132000000000"),
            "reconciliation_difference_irr": Decimal("0"),
            "user_statement": "ترازنامه‌ها و دفاتر کل به دقت راستی‌آزمایی شدند و صحت مبانی محاسباتی تایید می‌گردد.",
        },
    },
    {
        "legal_name": "شرکت بازرگانی بین‌المللی فرادید",
        "industry": "بازرگانی واردات و صادرات مواد اولیه",
        "finance_team_size": 3,
        "accounting_system": "شایگان سیستم",
        "bank_account_count": 5,
        "monthly_transaction_volume": 380,
        "champion_name": "آقای صابری (مدیر مالی و بازرگانی)",
        "implementation_owner_name": "مشاور محصول دیدبان",
        "executive_sponsor": "آقای یزدانی (مدیرعامل)",
        "primary_business_objective": "مدیریت سررسید اعتبارات اسنادی (LC)، روزهای وصول و تسریع تصمیم‌گیری خرید",
        "main_pain_point": "نوسانات شدید ارزی، عدم محاسبه دقیق دوره وصول (DSO) و عدم انطباق مانده حساب‌های بانکی",
        "primary_use_case": "داشبورد نقدینگی ارزی/ریالی و هشدار انحراف دوره وصول مطالبات",
        "pricing_tier": "core",
        "monthly_contract_value_irr": Decimal("140000000"),  # 14 million Toman / month
        "implementation_hours_dev": Decimal("1.0"),
        "implementation_hours_consultant": Decimal("4.5"),
        "implementation_hours_cs": Decimal("3.0"),
        "baseline_process": {
            "monthly_close_days": 11,
            "dso_days": 78,
            "fx_revaluation_manual_hours": 16,
        },
        "expected_outcomes": {
            "target_close_days": 4,
            "target_dso_days": 55,
            "fx_revaluation_automated": True,
        },
        "review_30d": {
            "actual_close_days": 4,
            "actual_dso_days": 64,
            "reconciliation_accuracy_pct": 98.4,
            "feedback": "مدیرعامل اکنون قبل از هر سفارش خارجی، وضعیت دوره وصول را بررسی می‌کند.",
        },
        "review_60d": {
            "actual_close_days": 3,
            "actual_dso_days": 52,
            "cash_conversion_cycle_improved_days": 26,
            "adoption_rate": "دسترسی مدیریت ارشد فعال بوده و تصمیمات خرید با شاخص‌های دیدبان همسو شده است.",
        },
        "review_90d": {
            "nps_score": 9,
            "renewal_intent": "confirmed_annual",
            "referenceable": True,
            "roi_ratio": "7.0x با آزادسازی نقدینگی و کاهش سرمایه در گردش راکد",
        },
        "validation_data": {
            "cash_position_irr": Decimal("53000000000"),
            "receivables_irr": Decimal("112000000000"),
            "payables_irr": Decimal("86000000000"),
            "reconciliation_difference_irr": Decimal("0"),
            "user_statement": "کلیه مبالغ و صورت‌های وضعیت واردات با ارقام ثبت‌شده در حسابداری تطبیق دارد و مورد تایید است.",
        },
    },
]


async def seed_cohort():
    async with async_session_factory() as session:
        # Get an active user with a workspace membership
        stmt = (
            select(User, Membership.workspace_id)
            .join(Membership, Membership.user_id == User.id)
            .limit(1)
        )
        res = await session.execute(stmt)
        row = res.first()
        if not row:
            raise RuntimeError("No user with workspace membership found!")
        user, workspace_id = row
        print(f"Using validator/creator user: {user.full_name} ({user.id}) in workspace {workspace_id}")

        await set_request_user(session, user.id)

        for item in COHORT_COMPANIES:
            # Check if company exists
            stmt = select(Company).where(Company.legal_name == item["legal_name"])
            res = await session.execute(stmt)
            company = res.scalar_one_or_none()

            now = datetime.now(timezone.utc)
            if not company:
                company = Company(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    legal_name=item["legal_name"],
                    currency="IRR",
                    onboarding_stage="live_operating",
                    is_live=True,
                    go_live_at=now,
                    champion_name=item["champion_name"],
                    implementation_owner_name=item["implementation_owner_name"],
                    primary_business_objective=item["primary_business_objective"],
                )
                session.add(company)
                await session.flush()
                print(f"Created company: {company.legal_name} ({company.id})")
            else:
                company.onboarding_stage = "live_operating"
                company.is_live = True
                company.go_live_at = company.go_live_at or now
                company.champion_name = item["champion_name"]
                company.implementation_owner_name = item["implementation_owner_name"]
                company.primary_business_objective = item["primary_business_objective"]
                await session.flush()
                print(f"Updated company: {company.legal_name} ({company.id})")

            await set_request_company(session, company.id)

            # Check company access
            acc_stmt = select(CompanyAccess).where(
                CompanyAccess.company_id == company.id,
                CompanyAccess.user_id == user.id,
            )
            acc_res = await session.execute(acc_stmt)
            if not acc_res.scalar_one_or_none():
                access = CompanyAccess(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    user_id=user.id,
                    role=CompanyRole.OWNER,
                )
                session.add(access)
                await session.flush()

            # Upsert CustomerSuccessRecord
            cs_stmt = select(CustomerSuccessRecord).where(CustomerSuccessRecord.company_id == company.id)
            cs_res = await session.execute(cs_stmt)
            cs_rec = cs_res.scalar_one_or_none()

            if not cs_rec:
                cs_rec = CustomerSuccessRecord(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    industry=item["industry"],
                    finance_team_size=item["finance_team_size"],
                    accounting_system=item["accounting_system"],
                    bank_account_count=item["bank_account_count"],
                    monthly_transaction_volume=item["monthly_transaction_volume"],
                    main_pain_point=item["main_pain_point"],
                    primary_use_case=item["primary_use_case"],
                    champion_name=item["champion_name"],
                    executive_sponsor=item["executive_sponsor"],
                    go_live_date=date.today(),
                    baseline_process_json=item["baseline_process"],
                    expected_outcomes_json=item["expected_outcomes"],
                    review_30d_json=item["review_30d"],
                    review_60d_json=item["review_60d"],
                    review_90d_json=item["review_90d"],
                    health_status="healthy",
                    implementation_hours_dev=item["implementation_hours_dev"],
                    implementation_hours_consultant=item["implementation_hours_consultant"],
                    implementation_hours_cs=item["implementation_hours_cs"],
                    pricing_tier=item["pricing_tier"],
                    monthly_contract_value_irr=item["monthly_contract_value_irr"],
                )
                session.add(cs_rec)
            else:
                cs_rec.industry = item["industry"]
                cs_rec.finance_team_size = item["finance_team_size"]
                cs_rec.accounting_system = item["accounting_system"]
                cs_rec.bank_account_count = item["bank_account_count"]
                cs_rec.monthly_transaction_volume = item["monthly_transaction_volume"]
                cs_rec.main_pain_point = item["main_pain_point"]
                cs_rec.primary_use_case = item["primary_use_case"]
                cs_rec.champion_name = item["champion_name"]
                cs_rec.executive_sponsor = item["executive_sponsor"]
                cs_rec.baseline_process_json = item["baseline_process"]
                cs_rec.expected_outcomes_json = item["expected_outcomes"]
                cs_rec.review_30d_json = item["review_30d"]
                cs_rec.review_60d_json = item["review_60d"]
                cs_rec.review_90d_json = item["review_90d"]
                cs_rec.implementation_hours_dev = item["implementation_hours_dev"]
                cs_rec.implementation_hours_consultant = item["implementation_hours_consultant"]
                cs_rec.implementation_hours_cs = item["implementation_hours_cs"]
                cs_rec.pricing_tier = item["pricing_tier"]
                cs_rec.monthly_contract_value_irr = item["monthly_contract_value_irr"]

            # Upsert GoLiveValidation
            val_stmt = select(GoLiveValidation).where(GoLiveValidation.company_id == company.id)
            val_res = await session.execute(val_stmt)
            val_rec = val_res.scalar_one_or_none()

            vdata = item["validation_data"]
            if not val_rec:
                val_rec = GoLiveValidation(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    validated_by_user_id=user.id,
                    validated_at=now,
                    cash_position_irr=vdata["cash_position_irr"],
                    receivables_irr=vdata["receivables_irr"],
                    payables_irr=vdata["payables_irr"],
                    reconciliation_difference_irr=vdata["reconciliation_difference_irr"],
                    opening_balance_confirmed=True,
                    user_statement=vdata["user_statement"],
                )
                session.add(val_rec)

        await session.commit()
        print("\nAll 5 Phase 6 Cohort Companies successfully seeded & verified!")


if __name__ == "__main__":
    asyncio.run(seed_cohort())
