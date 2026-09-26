#!/usr/bin/env python3
"""
دیدبان مالی - کلاینت همگام‌ساز محلی (Didban Mali Local Sync Agent)
=============================================================
این اسکریپت سبک و مستقل برای اجرا در سرورهای محلی شرکت‌ها (Windows Server یا Linux)
طراحی شده است تا داده‌های مالی نرم‌افزارهای حسابداری محلی (مانند سپیدار سیستم،
راهکاران همکاران سیستم و پایگاه‌های داده SQL Server محلی) را بدون نیاز به باز کردن
پورت ورودی (Inbound Port) به صورت امن، فشرده و یک‌طرفه (Outbound HTTPS) به سامانه دیدبان مالی ارسال نماید.

قابلیت‌ها:
۱. استخراج دوره‌ای یا تک‌نوبتی (Once / Scheduled Daemon)
۲. محاسبه چک‌سام SHA-256 و کلیدهای یکتایی برای جلوگیری از ورود داده تکراری (Idempotent)
۳. تبدیل و استانداردسازی ارقام فارسی و تاریخ‌های خورشیدی
۴. ارسال امن بر بستر HTTPS با توکن اختصاصی (Agent Key)
۵. تلاش مجدد خودکار با تاخیر فزاینده (Exponential Backoff) در صورت نوسان شبکه

نحوه اجرا:
python didban_sync_agent.py --config config.json
یا با تعیین متغیرهای محیطی:
DIDBAN_AGENT_KEY="dmb_..." python didban_sync_agent.py --once
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.parse
import urllib.request

# تنظیمات لاگینگ با فرمت فارسی و شفاف
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("didban_agent.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("DidbanSyncAgent")

VERSION = "1.0.0"

# نمونه کوئری‌های استاندارد سپیدار سیستم جهت استفاده در SQL Server
SAMPLE_SEPIDAR_QUERIES = {
    "journal_entries": """
        SELECT 
            v.VoucherID AS source_record_id,
            v.VoucherDate AS record_date,
            v.VoucherNumber AS document_number,
            vi.Debit - vi.Credit AS amount_irr,
            vi.AccountCode AS account_code,
            a.Title AS account_name,
            vi.Description AS description,
            c.Title AS counterparty,
            vi.ReferenceNumber AS reference
        FROM ACC_Voucher v
        INNER JOIN ACC_VoucherItem vi ON v.VoucherID = vi.VoucherID
        LEFT JOIN ACC_Account a ON vi.AccountID = a.AccountID
        LEFT JOIN GNR_Party c ON vi.PartyID = c.PartyID
        WHERE v.VoucherDate >= :last_sync_date
        ORDER BY v.VoucherDate ASC, v.VoucherNumber ASC;
    """,
    "bank_transactions": """
        SELECT 
            r.ReceiptID AS source_record_id,
            r.ReceiptDate AS record_date,
            r.ReceiptNumber AS document_number,
            r.Amount AS amount_irr,
            b.AccountCode AS account_code,
            b.BankTitle AS account_name,
            r.Description AS description,
            p.Title AS counterparty,
            r.TrackingNumber AS reference
        FROM TR_Receipt r
        INNER JOIN TR_BankAccount b ON r.BankAccountID = b.BankAccountID
        LEFT JOIN GNR_Party p ON r.PayerPartyID = p.PartyID
        WHERE r.ReceiptDate >= :last_sync_date
        ORDER BY r.ReceiptDate ASC;
    """,
}


def normalize_persian_digits(text: str) -> str:
    """تبدیل ارقام فارسی و عربی به ارقام استاندارد لاتین"""
    if not isinstance(text, str):
        return str(text)
    mapping = {
        "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
        "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    }
    for fa, en in mapping.items():
        text = text.replace(fa, en)
    return text.strip()


class DidbanSyncAgent:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_url = config.get("api_url", "http://localhost:8000").rstrip("/")
        self.company_id = config.get("company_id")
        self.connection_id = config.get("connection_id")
        self.agent_key = config.get("agent_key")
        self.source_system = config.get("source_system", "sepidar")
        self.data_dir = config.get("data_dir", "./agent_data")
        self.state_file = config.get("state_file", "didban_agent_state.json")

        if not self.company_id or not self.connection_id or not self.agent_key:
            raise ValueError(
                "تنظیمات ناقص است: company_id، connection_id و agent_key الزامی هستند."
            )

    def load_last_watermark(self) -> Optional[str]:
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("last_watermark")
            except Exception as e:
                logger.warning(f"عدم امکان خواندن فایل وضعیت: {e}")
        return None

    def save_last_watermark(self, watermark: str) -> None:
        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "last_watermark": watermark,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            logger.error(f"خطا در ذخیره وضعیت همگام‌ساز: {e}")

    def extract_from_sql_server(self, watermark: Optional[str]) -> List[Dict[str, Any]]:
        """
        اتصال به پایگاه داده محلی SQL Server (سپیدار / راهکاران)
        در صورت عدم نصب pyodbc/pymssql، فایل‌های صادر شده در پوشه داده خوانده می‌شوند.
        """
        conn_str = self.config.get("sql_connection_string")
        if not conn_str:
            logger.info("رشته اتصال SQL Server تنظیم نشده است. ورود به حالت خواندن از پوشه فایل...")
            return self.extract_from_files(watermark)

        try:
            import pyodbc  # type: ignore

            logger.info("در حال اتصال به پایگاه داده محلی SQL Server...")
            conn = pyodbc.connect(conn_str, timeout=10)
            cursor = conn.cursor()

            query = SAMPLE_SEPIDAR_QUERIES.get("journal_entries", "")
            last_date = watermark or "1403/01/01"
            cursor.execute(query.replace(":last_sync_date", f"'{last_date}'"))

            columns = [column[0].lower() for column in cursor.description]
            records = []
            for row in cursor.fetchall():
                row_dict = dict(zip(columns, row))
                records.append({
                    "source_entity_type": "journal_entry",
                    "source_record_id": str(row_dict.get("source_record_id")),
                    "record_date": normalize_persian_digits(str(row_dict.get("record_date"))),
                    "amount_irr": int(row_dict.get("amount_irr") or 0),
                    "account_code": str(row_dict.get("account_code") or ""),
                    "account_name": str(row_dict.get("account_name") or ""),
                    "description": str(row_dict.get("description") or ""),
                    "counterparty": str(row_dict.get("counterparty") or ""),
                    "reference": str(row_dict.get("reference") or ""),
                    "document_number": str(row_dict.get("document_number") or ""),
                })
            conn.close()
            logger.info(f"تعداد {len(records)} سند از دیتابیس استخراج شد.")
            return records
        except ImportError:
            logger.warning("ماژول pyodbc نصب نیست. در حال استفاده از اسناد پوشه داده محلی...")
            return self.extract_from_files(watermark)
        except Exception as e:
            logger.error(f"خطا در واکشی از SQL Server: {e}")
            return self.extract_from_files(watermark)

    def extract_from_files(self, watermark: Optional[str]) -> List[Dict[str, Any]]:
        """خواندن فایل‌های استخراجی JSON یا CSV از پوشه محلی"""
        records: List[Dict[str, Any]] = []
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir, exist_ok=True)
            # ایجاد نمونه برای راهنمایی کاربر در اولین اجرا
            sample_file = os.path.join(self.data_dir, "sample_vouchers.json")
            if not os.path.exists(sample_file):
                sample_data = [
                    {
                        "source_entity_type": "journal_entry",
                        "source_record_id": "LOC-1404-001",
                        "record_date": "1404/07/20",
                        "amount_irr": 850000000,
                        "account_code": "10101",
                        "account_name": "بانک ملت - جاری مرکزی",
                        "description": "واریز تسویه فاکتور فروش",
                        "counterparty": "شرکت پیشگامان فناور",
                        "reference": "TR-998811",
                        "document_number": "V-1404-901",
                    }
                ]
                with open(sample_file, "w", encoding="utf-8") as sf:
                    json.dump(sample_data, sf, ensure_ascii=False, indent=2)

        for filename in sorted(os.listdir(self.data_dir)):
            if filename.endswith(".json"):
                filepath = os.path.join(self.data_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            for item in data:
                                records.append({
                                    "source_entity_type": item.get("source_entity_type", "journal_entry"),
                                    "source_record_id": str(item.get("source_record_id")),
                                    "record_date": normalize_persian_digits(str(item.get("record_date"))),
                                    "amount_irr": int(item.get("amount_irr", 0)),
                                    "account_code": item.get("account_code"),
                                    "account_name": item.get("account_name"),
                                    "description": item.get("description"),
                                    "counterparty": item.get("counterparty"),
                                    "reference": item.get("reference"),
                                    "document_number": item.get("document_number"),
                                    "raw_json": item.get("raw_json", {}),
                                })
                except Exception as e:
                    logger.error(f"خطا در پردازش فایل {filename}: {e}")

        logger.info(f"تعداد {len(records)} سند از فایل‌های محلی بارگذاری شد.")
        return records

    def push_to_didban(self, records: List[Dict[str, Any]], watermark: Optional[str]) -> bool:
        if not records:
            logger.info("سند جدیدی برای ارسال وجود ندارد.")
            return True

        endpoint = f"{self.api_url}/api/v1/companies/{self.company_id}/integrations/{self.connection_id}/agent-sync"
        
        # محاسبه چک‌سام
        serialized = json.dumps(records, sort_keys=True)
        checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        payload = {
            "agent_key": self.agent_key,
            "source_system": self.source_system,
            "agent_version": VERSION,
            "batch_id": f"batch-{int(time.time())}",
            "watermark": watermark or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "checksum_sha256": checksum,
            "records": records,
            "metadata": {
                "hostname": os.uname().nodename if hasattr(os, "uname") else "local-server",
                "os": sys.platform,
                "record_count": len(records),
            },
        }

        data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data_bytes,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": f"DidbanLocalAgent/{VERSION}",
            },
            method="POST",
        )

        max_retries = 3
        backoff = 1.5

        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"در حال ارسال {len(records)} سند به سامانه دیدبان مالی (تلاش {attempt})...")
                with urllib.request.urlopen(req, timeout=30) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    logger.info(f"پاسخ سرور دیدبان: {resp_data.get('message_fa')}")
                    if resp_data.get("success"):
                        new_watermark = resp_data.get("watermark_cursor") or payload["watermark"]
                        self.save_last_watermark(new_watermark)
                        return True
                    return False
            except urllib.error.HTTPError as he:
                err_body = he.read().decode("utf-8", errors="replace")
                logger.error(f"خطای HTTP {he.code}: {err_body}")
                if he.code in (401, 403):
                    logger.critical("احراز هویت کلاینت ناموفق بود! لطفاً کلید Agent Key را بررسی فرمایید.")
                    return False
                time.sleep(backoff ** attempt)
            except Exception as e:
                logger.error(f"خطای ارتباطی در ارسال: {e}")
                time.sleep(backoff ** attempt)

        return False

    def run_cycle(self) -> bool:
        logger.info("=== آغاز چرخه همگام‌سازی محلی دیدبان مالی ===")
        watermark = self.load_last_watermark()
        logger.info(f"آخرین نشانگر زمانی (Watermark): {watermark or 'شروع اولیه'}")
        
        records = self.extract_from_sql_server(watermark)
        success = self.push_to_didban(records, watermark)
        if success:
            logger.info("=== چرخه همگام‌سازی با موفقیت پایان یافت ===")
        else:
            logger.error("=== چرخه همگام‌سازی با خطا متوقف شد ===")
        return success


def parse_args():
    parser = argparse.ArgumentParser(description="Didban Mali Local Sync Agent")
    parser.add_argument("--config", default="didban-agent.json", help="Path to JSON configuration file")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--interval", type=int, default=3600, help="Sync interval in seconds (default 3600)")
    parser.add_argument("--test-connection", action="store_true", help="Test connectivity to Didban API")
    return parser.parse_args()


def load_config(path: str) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    
    # مقادیر متغیرهای محیطی در اولویت هستند
    if os.environ.get("DIDBAN_API_URL"):
        cfg["api_url"] = os.environ["DIDBAN_API_URL"]
    if os.environ.get("DIDBAN_COMPANY_ID"):
        cfg["company_id"] = os.environ["DIDBAN_COMPANY_ID"]
    if os.environ.get("DIDBAN_CONNECTION_ID"):
        cfg["connection_id"] = os.environ["DIDBAN_CONNECTION_ID"]
    if os.environ.get("DIDBAN_AGENT_KEY"):
        cfg["agent_key"] = os.environ["DIDBAN_AGENT_KEY"]
    if os.environ.get("DIDBAN_SQL_CONNECTION"):
        cfg["sql_connection_string"] = os.environ["DIDBAN_SQL_CONNECTION"]

    return cfg


def main():
    args = parse_args()
    config = load_config(args.config)

    if not config.get("agent_key") or not config.get("company_id") or not config.get("connection_id"):
        logger.error(
            "پیکربندی لازم یافت نشد. لطفاً فایل didban-agent.json را تکمیل نموده یا "
            "متغیرهای محیطی DIDBAN_COMPANY_ID, DIDBAN_CONNECTION_ID و DIDBAN_AGENT_KEY را مقداردهی کنید."
        )
        sys.exit(1)

    agent = DidbanSyncAgent(config)

    if args.test_connection:
        logger.info(f"در حال بررسی اتصال به سرور دیدبان: {agent.api_url}")
        try:
            with urllib.request.urlopen(f"{agent.api_url}/health", timeout=10) as resp:
                if resp.status == 200:
                    logger.info("اتصال به سرور دیدبان با موفقیت تایید شد.")
                    sys.exit(0)
        except Exception as e:
            logger.error(f"خطا در برقراری ارتباط با سرور: {e}")
            sys.exit(1)

    if args.once:
        success = agent.run_cycle()
        sys.exit(0 if success else 1)
    else:
        logger.info(f"کلاینت همگام‌ساز در حالت زمان‌بندی‌شده (هر {args.interval} ثانیه) شروع به کار کرد.")
        while True:
            agent.run_cycle()
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
