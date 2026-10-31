"""Shared presentation rows for offline managerial exports."""

from .money_presentation import workbook_money
from ..domain.reports import REASON_LABELS, display_amount


def workbook_sections(content, sheet):
    management = content.get("management")
    if not management:
        return
    unit = content["manifest"].get("display_unit", "IRR")

    def shown(value):
        return workbook_money(display_amount(value, unit))

    statement = management["statements"]
    sheet(
        "صورت‌های مالی",
        ["سرفصل", "بخش", "مبلغ", "وضعیت", "علت"],
        [
            [
                r["label"],
                r.get("section", r["key"]),
                shown(r["value"]),
                r["status"],
                ";".join(r["reason_codes"]),
            ]
            for r in statement["lines"] + statement["totals"]
        ]
        + [
            [
                "کنترل تراز",
                "balance_control",
                shown(statement["balance_control"]["value"]),
                statement["balance_control"]["status"],
                ";".join(statement["balance_control"]["reason_codes"]),
            ]
        ],
    )
    sheet(
        "گزارش روزانه",
        [
            "تاریخ",
            "مانده آغاز",
            "واریز ثبت‌شده",
            "برداشت ثبت‌شده",
            "ورود خارجی",
            "خروج خارجی",
            "مانده پایان",
            "هزینه ثبت‌شده دفتر",
            "علت محدودیت نقد",
            "علت محدودیت هزینه",
        ],
        [
            [
                r["date"],
                shown(r["opening"]),
                shown(r["inflow_recorded"]),
                shown(r["outflow_recorded"]),
                shown(r["inflow_external"]),
                shown(r["outflow_external"]),
                shown(r["closing"]),
                shown(r["booked_expense"]["value"]),
                ";".join(r["cash_reason_codes"]),
                ";".join(r["booked_expense"]["reason_codes"]),
            ]
            for r in management["daily"]["days"]
        ],
    )
    sheet(
        "تحلیل تغییر سود",
        ["حساب", "سرفصل", "دوره جاری", "دوره مقایسه", "اثر بر تغییر سود"],
        [
            [
                r["account"],
                r["label"],
                shown(r["current"]),
                shown(r["previous"]),
                shown(r["profit_effect"]),
            ]
            for r in management["analysis"]["drivers"]
        ]
        + [
            [
                "جمع تغییر سود",
                "",
                "",
                "",
                shown(management["analysis"]["profit_delta"]),
            ],
            [
                "علت محدودیت",
                ";".join(management["analysis"]["reason_codes"]),
                "",
                "",
                "",
            ],
        ],
    )
    import json

    sheet(
        "شواهد صورت مالی",
        ["سرفصل", "حساب", "مبلغ", "ردیف‌های منبع"],
        [
            [
                r["label"],
                d["account"],
                shown(d["value"]),
                json.dumps(d["source_refs"], ensure_ascii=False),
            ]
            for r in statement["lines"]
            for d in r["details"]
        ],
    )
    flow = management.get("cashflow_statement")
    if flow:
        measures = [(r["label"], r["net"]) for r in flow["sections"]] + [
            (label, flow[key])
            for key, label in [
                ("opening", "وجه نقد آغاز"),
                ("closing", "وجه نقد پایان"),
                ("change", "تغییر وجه نقد"),
                ("unclassified_net", "خالص بدون طبقه‌بندی"),
                ("control", "کنترل تغییر وجه نقد"),
            ]
        ]
        sheet(
            "صورت جریان وجوه نقد",
            ["عنوان", "مبلغ", "وضعیت", "علت"],
            [
                [
                    label,
                    shown(m["value"]),
                    m["status"],
                    "؛ ".join(REASON_LABELS.get(c, c) for c in m["reason_codes"]),
                ]
                for label, m in measures
            ],
        )
        sheet(
            "شواهد جریان وجوه نقد",
            ["فعالیت", "خالص طبقه‌بندی‌شده", "ردیف‌های منبع"],
            [
                [
                    r["label"],
                    shown(r["classified_net"]["value"]),
                    json.dumps(r["source_refs"], ensure_ascii=False),
                ]
                for r in flow["sections"]
            ]
            + [
                [
                    "بدون طبقه‌بندی",
                    shown(flow["unclassified_net"]["value"]),
                    json.dumps(flow["unclassified_refs"], ensure_ascii=False),
                ]
            ],
        )
    cash = management["analysis"].get("cash")
    if cash:
        sheet(
            "تحلیل تغییر نقد",
            ["عنوان", "مبلغ", "وضعیت", "علت"],
            [
                [
                    label,
                    shown(cash[key]["value"]),
                    cash[key]["status"],
                    ";".join(cash[key]["reason_codes"]),
                ]
                for key, label in [
                    ("opening", "مانده آغاز"),
                    ("closing", "مانده پایان"),
                    ("change", "تغییر نقد"),
                    ("inflow", "واریز ثبت‌شده"),
                    ("outflow", "برداشت ثبت‌شده"),
                    ("external_inflow", "ورود خارجی"),
                    ("external_outflow", "خروج خارجی"),
                ]
            ],
        )
        sheet(
            "سهم منابع بانکی",
            ["منبع", "برگه", "اثر خالص", "علت", "تراکنش‌ها"],
            [
                [
                    d["label"],
                    d["sheet_name"],
                    shown(d["value"]),
                    ";".join(d["reason_codes"]),
                    json.dumps(d["source_refs"], ensure_ascii=False),
                ]
                for d in cash["drivers"]
            ],
        )
    sheet(
        "قالب صورت مالی",
        ["نام قالب", "کلید", "عنوان", "بخش", "حساب‌ها"],
        [
            [
                (management.get("template") or {}).get("name", "قالب پایه"),
                r["key"],
                r["label"],
                r["section"],
                ",".join(r["accounts"]),
            ]
            for r in statement["lines"]
        ]
        + [
            ["حساب‌های نگاشت‌نشده", "", "", "", ",".join(statement["unmapped_accounts"])],
            ["بازه", management["starts_on"], management["as_of_date"], "واحد", unit],
        ],
    )


def pdf_sections(story, content, paragraph, heading, money):
    management = content.get("management")
    if not management:
        return
    from reportlab.platypus import Spacer, Table, TableStyle, PageBreak
    from reportlab.lib import colors
    from reportlab.lib.units import mm

    p = paragraph
    unit = "تومان" if content["manifest"].get("display_unit") == "IRT" else "ریال"

    def shown(value):
        return "ناموجود" if value is None else money(value)

    def table(headers, rows):
        grid = Table(
            [[p(v) for v in headers]] + [[p(v) for v in row] for row in rows],
            colWidths=[55 * mm, 115 * mm],
            repeatRows=1,
            hAlign="RIGHT",
        )
        grid.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEDFF")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E9ECF5")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            )
        )
        story.append(grid)

    statement = management["statements"]
    from datetime import date
    import jdatetime

    range_label = " تا ".join(
        jdatetime.date.fromgregorian(date=date.fromisoformat(management[key])).strftime(
            "%Y/%m/%d"
        )
        for key in ("starts_on", "as_of_date")
    )
    story += [
        PageBreak(),
        p("صورت‌های مالی", heading),
        p(range_label),
        p((management.get("template") or {}).get("name", "قالب پایه")),
        p("واحد: " + unit),
        p(
            "مبنای صورت‌ها: "
            + (
                "تراز آزمایشی"
                if management.get("statement_basis") == "trial_balance"
                else "دفتر حسابداری"
            )
        ),
    ]
    rows = []
    for r in statement["lines"] + statement["totals"]:
        reason = "؛ ".join(REASON_LABELS.get(c, c) for c in r["reason_codes"])
        rows.append(
            [shown(r["value"]), r["label"] + (" | " + reason if reason else "")]
        )
    table(["مبلغ", "سرفصل"], rows)
    control = statement["balance_control"]
    story += [
        Spacer(1, 5 * mm),
        p(
            "کنترل تراز: "
            + (
                "برابر"
                if control["value"] == "0"
                else "؛ ".join(REASON_LABELS.get(c, c) for c in control["reason_codes"])
            )
        ),
    ]
    days = management["daily"]["days"]
    if days:
        from datetime import date
        import jdatetime

        day = days[-1]
        story += [
            Spacer(1, 7 * mm),
            p("گزارش روزانه مدیر مالی", heading),
            p(
                jdatetime.date.fromgregorian(
                    date=date.fromisoformat(day["date"])
                ).strftime("%Y/%m/%d")
            ),
        ]
        table(
            ["مبلغ", "عنوان"],
            [
                [shown(day[key]), label]
                for key, label in [
                    ("opening", "مانده آغاز روز"),
                    ("inflow_recorded", "واریز ثبت‌شده بانک"),
                    ("outflow_recorded", "برداشت ثبت‌شده بانک"),
                    ("closing", "مانده پایان روز"),
                ]
            ]
            + [[shown(day["booked_expense"]["value"]), "هزینه ثبت‌شده دفتر"]],
        )
        for code in dict.fromkeys(
            day["cash_reason_codes"] + day["booked_expense"]["reason_codes"]
        ):
            story.append(p(REASON_LABELS.get(code, code)))
    analysis = management["analysis"]
    story += [
        Spacer(1, 7 * mm),
        p("تحلیل تغییر سود", heading),
        p("تغییر سود خالص: " + shown(analysis["profit_delta"]) + " " + unit),
    ]
    for code in analysis["reason_codes"]:
        story.append(p(REASON_LABELS.get(code, code)))
    for driver in analysis["drivers"][:8]:
        story.append(
            p(
                driver["account"]
                + " | "
                + driver["label"]
                + " | اثر بر سود: "
                + shown(driver["profit_effect"])
                + " "
                + unit
            )
        )
    cash = analysis.get("cash")
    if cash:
        story += [Spacer(1, 7 * mm), p("تحلیل تغییر نقدینگی در بازه گزارش", heading)]
        table(
            ["مبلغ", "عنوان"],
            [
                [
                    shown(cash[key]["value"]),
                    label
                    + (
                        " | "
                        + "؛ ".join(
                            REASON_LABELS.get(c, c) for c in cash[key]["reason_codes"]
                        )
                        if cash[key]["reason_codes"]
                        else ""
                    ),
                ]
                for key, label in [
                    ("opening", "مانده آغاز"),
                    ("closing", "مانده پایان"),
                    ("change", "تغییر نقد"),
                    ("inflow", "واریز ثبت‌شده"),
                    ("outflow", "برداشت ثبت‌شده"),
                ]
            ],
        )
    flow = management.get("cashflow_statement")
    if flow:
        story += [
            PageBreak(),
            p("صورت جریان وجوه نقد", heading),
            p(range_label),
            p("مبنای دفتری · واحد: " + unit),
        ]
        measures = [(r["label"], r["net"]) for r in flow["sections"]] + [
            (label, flow[key])
            for key, label in [
                ("opening", "وجه نقد آغاز"),
                ("closing", "وجه نقد پایان"),
                ("change", "تغییر وجه نقد"),
                ("unclassified_net", "خالص بدون طبقه‌بندی"),
                ("control", "کنترل تغییر وجه نقد"),
            ]
        ]
        table(
            ["مبلغ", "عنوان"],
            [
                [
                    shown(m["value"]),
                    label
                    + (
                        " | "
                        + "؛ ".join(REASON_LABELS.get(c, c) for c in m["reason_codes"])
                        if m["reason_codes"]
                        else ""
                    ),
                ]
                for label, m in measures
            ],
        )
        if flow["unclassified_count"]:
            story.append(
                p("تعداد ردیف نقد بدون طبقه‌بندی: " + str(flow["unclassified_count"]))
            )
    story.append(p("تمام روزها، اجزای تغییر سود و شواهد در Excel همین نسخه موجود است."))
