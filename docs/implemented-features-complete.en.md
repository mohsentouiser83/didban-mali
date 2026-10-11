# Didban Mali — Detailed Product Features

**Updated:** October 9, 2026  
**Scope:** Features implemented in the current project, described in English from a product and user perspective.

This document explains the purpose, behavior, information, and user interactions of Didban Mali’s features. It distinguishes features available in the current interface from implemented capabilities whose standalone screens have been removed, and from features that remain simulated or disabled.

## Contents

1. Product purpose
2. User accounts and company workspaces
3. Member management and access levels
4. Financial dashboard
5. Cash-flow overview
6. Payment planning
7. Cash forecasting capabilities
8. Receivables management
9. Payables management
10. Financial review and follow-up
11. Financial reports
12. Financial and banking connections
13. Local synchronization
14. Financial data preparation
15. Data quality and traceability
16. Financial analysis and explainable indicators
17. Bank-to-accounting reconciliation
18. Customer onboarding and support
19. Persian interface and everyday usability
20. Previously implemented capabilities outside the current interface
21. Current feature availability

## 1. Product Purpose

Didban Mali helps companies understand their financial position, identify financial exceptions, and organize the information needed for management decisions. It brings together accounting records, banking activity, and sales information to create a clearer view of liquidity, customer receivables, supplier obligations, and items requiring investigation.

The product’s central value is the connection between an overview and the records behind it. A user can begin with an outstanding balance or a financial exception and move toward customer invoices, supplier documents, report details, or supporting evidence.

The current product concentrates on six everyday areas:

- **Dashboard:** an overview of balances, expected cash movement, and issues requiring attention.
- **Cash flow:** expected receipts, scheduled payments, and the resulting cash position.
- **Receivables:** money customers owe, overdue amounts, and unpaid invoices.
- **Payables:** money owed to suppliers, estimated overdue obligations, and supporting documents.
- **Review and follow-up:** financial findings, their importance, and available evidence.
- **Reports:** saved financial reports and downloadable Persian PDFs.

Company connections and member management support these areas through settings. More extensive financial calculations and data preparation also exist in the project, although some no longer have their former standalone screens.

## 2. User Accounts and Company Workspaces

### 2.1 Registration and sign-in

The product includes registration and sign-in screens. A user establishes an account and enters the companies they are authorized to access. The authentication experience includes handling invalid credentials and unsuccessful requests, maintaining a session, and signing out.

Account access and company access are separate concepts: having an account does not automatically grant access to every company in the product.

### 2.2 Company creation

A company-creation flow lets users establish a company workspace. That workspace becomes the context for its financial information, members, connections, findings, planned payments, and reports.

Company information is available to the product so that the active business can be identified consistently throughout navigation and financial work.

### 2.3 Multiple company workspaces

A user can have access to more than one company. The company selector shows the available companies and identifies the active one.

Switching companies changes the financial context of the product. Dashboard information, receivables, payables, payment plans, reports, and settings are retrieved for the selected company. The interface clears or replaces previous-company information while loading the new context.

This supports professionals who work across several organizations, such as a financial manager or advisor, while keeping each company’s workspace distinct.

### 2.4 Restricted company visibility

Users work within the companies they are authorized to access. Company membership and role influence which information they can see and which actions they can perform.

The company selector is an access-aware workspace selector. It does not provide a consolidated holding-company financial statement or an intercompany elimination feature.

## 3. Member Management and Access Levels

### 3.1 Company member list

The member-management area presents the people associated with a company and their access levels. Users can search the member list to locate a particular person.

The feature gives company administrators a place to understand who has access rather than relying on financial screens to infer membership.

### 3.2 Adding and managing members

Authorized administrators can add a member and manage membership through a focused form. Selecting an existing member opens their details and the supported membership controls.

Removing a member requires a confirmation step. The consequence is described as ending that person’s access to the company.

The feature manages access to the selected company; removing a membership should not be understood as deleting the person’s entire account or all of their other company memberships.

### 3.3 Access levels

The product defines four company roles:

| Role | Product purpose |
| --- | --- |
| Owner | Company ownership and administrative responsibility. |
| Finance manager | Financial management and operational administration. |
| Advisor | Financial analysis and advisory work with permitted actions. |
| Viewer | Viewing information without the corresponding editing rights. |

Action availability is feature-specific. For example, owners, finance managers, and advisors can add planned payments and request reports, while connection management is reserved for owners and finance managers.

The interface adapts its controls to the user’s role. A person who can view a list does not necessarily receive its add, remove, or management actions.

## 4. Financial Dashboard

### 4.1 A company-level financial overview

The dashboard brings together information from cash flow, receivables, payables, customers, suppliers, and financial findings. Its purpose is to make the current company’s financial situation understandable without requiring the user to open every section first.

Information is loaded by area. When one part cannot be retrieved, the dashboard can identify the unavailable area while retaining information that was successfully loaded.

### 4.2 Balance visibility

The dashboard displays a bank-account balance when the current simplified presentation has a suitable recorded balance for a single account.

It avoids presenting an uncertain combination of account data as if it were a confirmed balance. If the required recorded balance is unavailable, it shows that the balance is missing.

This behavior matters because an estimated cash figure and a reported bank balance are different types of information. The simplified dashboard places a stricter condition on the balance it presents than the broader calculation capability available in the project.

### 4.3 Daily balance projection

The dashboard can show a chart of the projected end-of-day balance over the next 30 days. The projection combines the available opening balance with expected receipts and planned payments.

The chart helps the user see the timing of cash pressure. Two companies with the same total monthly receipts and payments can have very different risks if their payments occur before their receipts.

When the opening balance or forecast cannot support the chart, the product explains that the required information is unavailable and provides a route to the cash-flow area.

### 4.4 Attention items

The dashboard derives attention items from available financial information. These can include:

- A projected cash deficit and the date on which it occurs.
- Upcoming payments and their due dates.
- A critical or high-importance financial finding.

Items include a description and relevant amount or date when available. They link to the corresponding product section so that the user can continue investigating.

These items summarize known financial conditions. They do not constitute a separately implemented task-management workflow with automatic assignment or completion tracking.

### 4.5 Navigation into detail

The dashboard acts as a starting point for deeper work. Users can move to cash flow, receivables, payables, review, and reports through the navigation and relevant contextual links.

## 5. Cash-Flow Overview

### 5.1 A 30-day view

The current cash-flow screen focuses on the next 30 days. It presents four main figures:

| Figure | Meaning |
| --- | --- |
| Account balance | The available qualifying recorded account balance. |
| Upcoming payments | Planned cash outflows within the current horizon. |
| Expected receipts | Receipts projected for the next 30 days. |
| Balance after receipts and payments | Opening balance plus expected receipts minus upcoming payments, when all required values are available. |

The screen connects this summary directly to the payment plan beneath it.

### 5.2 Missing information remains visible

The product differentiates between a usable amount and information that has not been recorded or cannot be calculated.

For example, an empty payment plan is shown as unrecorded payments rather than silently interpreted as proof that the company has no future obligations. If the required opening balance, receipt amount, or payment amount is missing, the resulting balance is marked as not calculable.

### 5.3 Updating the outlook after a payment change

Adding or deleting a planned payment refreshes the cash-flow information. This allows the user to see the relationship between the payment schedule and the near-term financial outlook.

### 5.4 Company-specific planning

The overview and payment plan belong to the selected company. Switching companies replaces the planning context and avoids carrying one company’s schedule into another company’s view.

## 6. Payment Planning

### 6.1 Recording a planned payment

Authorized users can add a payment through a drawer containing:

- A payment title.
- A payment category.
- A future payment date.
- A positive amount entered in Toman.

A descriptive title, such as a monthly salary payment or supplier settlement, helps users recognize the obligation in the schedule.

### 6.2 Payment categories

The available categories are:

| Category | Typical use |
| --- | --- |
| Payroll and insurance | Salary-related and insurance obligations. |
| Suppliers | Expected supplier settlements. |
| Rent | Property or facility rental payments. |
| Tax | Planned tax payments. |
| Other payments | Payments outside the named categories. |

The category is shown alongside the payment title in the list.

### 6.3 Persian date and amount entry

The form uses a Persian date picker. The payment date must be today or a future date in the current entry experience.

Amounts accept Latin, Persian, and Arabic digits, including supported grouping separators. The entered Toman amount is interpreted consistently when incorporated into the product’s financial information.

A blank title, missing date, invalid amount, or nonpositive amount produces a validation message rather than a silently accepted payment.

### 6.4 Viewing upcoming payments

The visible schedule focuses on payments within the next 30 days. Each row shows the title, category, amount, and due date.

Payments are presented in date order so that the user can understand the timing of upcoming outflows.

### 6.5 Recording payments beyond the visible horizon

The form can record a payment with a date beyond the next 30 days. The product explains that the payment has been saved but is outside the current table and summary horizon.

This distinction prevents a saved payment from appearing to have been lost simply because it is not yet within the visible period.

### 6.6 Removing a payment

Authorized users can remove a payment after a confirmation dialog. The dialog explains that the item will be removed from the plan and forecast.

After a successful deletion, the schedule and related cash-flow information refresh. If deletion fails, an error and retry opportunity are shown.

### 6.7 Current boundaries

Payment planning records an expected obligation. It does not currently execute a bank transfer, record a bank-confirmed settlement, support a full approval chain, or provide an implemented paid/unpaid lifecycle for each planned item.

## 7. Cash Forecasting Capabilities

### 7.1 Forecast horizons

The project includes financial forecasting for a 30-day horizon and a 91-day, approximately 13-week horizon. The current simplified cash-flow screen emphasizes 30-day planning; the more extensive forecast capabilities should not all be assumed to have their previous full interface.

### 7.2 Weekly cash movement

The weekly projection can describe:

- Opening cash.
- Expected cash receipts.
- Expected cash payments.
- Net change in cash.
- Closing cash.
- Whether a deficit occurs.
- The amount of the deficit.

This structure makes cash movement understandable as a sequence rather than only a single end-of-period number.

### 7.3 Receipt and payment detail

Forecast periods can include the individual receipts and payments contributing to the totals. Each movement has a title, expected date, and amount.

The detail allows an aggregate cash change to be connected to specific expected events. It helps distinguish a week dominated by customer receipts from one dominated by payroll or supplier payments.

### 7.4 Alternative scenarios

Implemented forecasting supports three scenario assumptions:

- **Base:** baseline collection and consumption assumptions.
- **Pessimistic:** reduced expected collections and increased consumption.
- **Optimistic:** improved expected collections and reduced consumption.

The current financial logic uses a 30% reduction in the collection factor and a 10% increase in consumption for the pessimistic scenario. The optimistic scenario increases the collection factor by 15% and reduces consumption by 5%. Collection probability is capped at 100%.

These are explicit planning assumptions. They are not statistically measured probabilities that certify the future outcome.

### 7.5 Historical and planned outflows

Forecasting can use historical outflow patterns or recorded planned payments as the outflow basis.

The current 30-day planning experience uses planned outflows so that the user’s schedule participates in the outlook.

### 7.6 Safety buffer and liquidity pressure

The broader cash capability includes a safety buffer, the first projected deficit week, and the lowest projected cash balance.

These indicators help identify the severity and timing of cash pressure. A positive closing balance may still leave a company below its chosen operating buffer during the period.

### 7.7 Burn and runway

Implemented financial calculations include monthly cash consumption and the estimated number of days or months that current cash could support the relevant outflow pattern.

Runway can be categorized into critical, warning, monitoring, healthy, or sustainable conditions. The interpretation depends on the available cash and consumption evidence.

These calculations remain broader product capabilities; the current simplified cash screen does not present every historical runway panel.

## 8. Receivables Management

### 8.1 Receivables summary

The receivables screen presents:

- Total outstanding receivables.
- Receivables whose due dates have passed.
- Receivables whose due dates have not yet arrived.
- The number of customers with outstanding balances.

Amounts are shown in Toman. The figures apply to the selected company and the current reference date.

### 8.2 Customer list

The customer list organizes customers with outstanding balances. Its default presentation prioritizes the largest overdue amounts.

This directs attention toward customers whose unpaid balances have the greatest immediate overdue exposure.

### 8.3 Search and overdue filtering

Users can search for a customer by name and switch between all customers and those with overdue receivables.

The list distinguishes an empty customer portfolio from a search or filter that returns no matches. These cases have different implications for the user’s next action.

### 8.4 Customer detail

Selecting a customer opens a drawer containing their unsettled invoices. The user can inspect the customer’s balance through the actual invoices that contribute to it.

This supports investigation without leaving the receivables section or opening a separate full-page customer record.

### 8.5 Invoice detail

The implemented invoice information includes invoice number, issue date, due date where known, original amount, amount received, remaining amount, and delay.

The presentation distinguishes:

- Invoices not yet due.
- Invoices overdue by a known number of days.
- Invoices with an unknown due date.

An unknown due date is not treated as reliable evidence that an invoice is current or overdue.

### 8.6 Partial settlement

The receivables capability tracks paid and remaining amounts. A partially settled invoice can therefore remain visible with its outstanding balance rather than being treated as either entirely unpaid or fully closed.

### 8.7 Aging analysis

The implemented receivables analysis groups balances into not due, 1–30 days overdue, 31–60 days overdue, 61–90 days overdue, and more than 90 days overdue. A separate category identifies missing due dates.

Aging helps distinguish recent collection delays from balances that have remained unpaid for a much longer period.

### 8.8 Customer risk information

The broader receivables capability produces customer risk scores and levels, overdue ratios, average delay, counts of open invoices, and recommended collection actions.

It can also indicate that a risk assessment is incomplete. This prevents a risk label from implying that all required customer information was available.

The current simplified customer screen focuses on balances and invoice detail; the existence of these calculations does not mean all historical risk cards remain visible.

### 8.9 Current boundaries

Receivables analysis is implemented, but a complete collection-contact history, recorded promise-to-pay schedule, and next-contact workflow are not currently part of the feature.

## 9. Payables Management

### 9.1 Payables summary

The payables screen presents total obligations, overdue obligations, not-yet-due obligations, and the number of suppliers with balances owed to them.

It provides a parallel view to receivables: receivables describe money expected from customers, while payables describe obligations toward suppliers.

### 9.2 Estimated due dates

The current payables screen explicitly explains that due dates are estimated as 45 days after the accounting document date.

This is an important feature qualification. A displayed overdue supplier obligation may rely on the product’s estimate rather than a confirmed contractual due date.

### 9.3 Supplier list

Suppliers are presented with priority given to the largest overdue balances. Users can search suppliers and filter the list to overdue obligations.

The list supports deciding which supplier accounts require examination first.

### 9.4 Supplier detail

Selecting a supplier opens a drawer containing the relevant debt and payment documents for that supplier.

This lets the user connect the summary obligation to individual financial records and examine how the supplier’s balance is composed.

### 9.5 Aging and supplier exposure

The broader payable capability includes aging, overdue ratios, average delays, supplier shares of total obligations, and risk-related information.

These calculations help identify long-standing obligations and concentrated supplier exposure. They can support attention to a supplier whose unpaid balance may threaten the continuity of supply.

### 9.6 Relationship to payment planning

Payables describe obligations inferred from financial records. Planned payments describe the cash schedule entered by users.

The two features answer related questions, but the current implementation should not be described as a fully automated process that turns every payable document into an approved, bank-settled payment.

## 10. Financial Review and Follow-Up

### 10.1 A central financial findings list

The review area brings together financial items requiring investigation. Each row shows the subject, importance, current status, assigned person if known, and follow-up date if known.

The page presents critical and high-importance items prominently so that the user can focus on the most consequential exceptions first.

### 10.2 Searching and filtering

Users can search findings and filter by review status. A paginated list allows larger collections to be examined in manageable groups.

The interface distinguishes an empty findings list from a search/filter with no matching results.

### 10.3 Running another review

Authorized users can request another financial check from the page. The control changes while processing and prevents the same action from being casually repeated during the active request.

The page reports the result of the check, including how many items were evaluated, and refreshes the list.

### 10.4 Finding detail drawer

Selecting an item opens a detail drawer with:

- The finding’s explanation.
- Its current status.
- Its assigned person, when available.
- Its follow-up date, when available.
- The associated financial amount, when available.
- The supporting evidence recorded for the finding.

Missing assignment, missing date, and unknown amount are stated explicitly.

### 10.5 Evidence presentation

Evidence entries have a title and explanatory description. They help the user understand why the item exists rather than relying only on its severity label.

If no evidence has been recorded, the product says so. If the detail cannot be retrieved, the user receives an error and retry option.

### 10.6 Implemented detection categories

The current detection capability contains eight operational rules:

| Rule | Financial condition identified |
| --- | --- |
| Unmatched bank transaction | Bank activity with no corresponding accounting match. |
| Unmatched accounting entry | An accounting item without a corresponding bank match. |
| Potential duplicate transaction | Records that may represent duplicated activity. |
| Large unreconciled transaction | A materially large item that remains unreconciled. |
| Significant overdue receivable | An outstanding customer invoice meeting the applicable overdue and materiality conditions. |
| Customer overdue concentration | Overdue receivables concentrated in a customer. |
| Low runway | Cash resilience below the applicable threshold. |
| Projected cash deficit | A negative cash position projected within the forecast. |

Findings can carry importance, financial impact, dates, source references, and explanatory evidence. Similar findings are recognized using stable identities so that repeated evaluation does not automatically imply unrelated new issues.

### 10.7 Displayed lifecycle information versus available actions

The project retains information for investigation, resolution, verification, dismissal, and reopening. The current simplified page displays status, assignment, and due-date information.

The previous dedicated investigation screen and its lifecycle-editing actions have been removed. The current page should therefore be described as a findings list, rerun control, and evidence preview—not a complete interactive assignment/resolution/approval workspace.

## 11. Financial Reports

### 11.1 Report archive

The reports area lists saved financial reports from newest to oldest. Each entry includes the report title, financial period, generation status, and creation date.

The current archive retrieves up to 100 recent reports and explains when the displayed list reaches that limit.

### 11.2 Report search and status filtering

Users can search report titles and filter reports by generation status. Persian character normalization helps title search handle common Arabic/Persian character variants.

The archive distinguishes having no reports from having no matches for the selected search and status.

### 11.3 Creating a report

Authorized users open a report-creation drawer, choose a completed financial analysis, enter a report title, and optionally add a note.

Completed analyses with limited coverage can also be listed as report bases, with the limitation indicated. An unfinished analysis is not presented as a completed report basis.

If no eligible analysis exists, the product explains that a completed analysis is required.

### 11.4 Report notes

A user can add an optional report note to provide context, commentary, or an advisor’s interpretation. The note becomes part of the saved report information.

The creation form supports a title of up to 200 characters and an optional note of up to 4,000 characters.

### 11.5 Generation status and progress

A report can be queued, processing, ready, or failed. The archive updates pending statuses automatically.

The detail drawer shows progress when available, explains that queued reports are awaiting generation, and presents a failure message if generation fails.

If status updates stop because information cannot be retrieved, the user sees a retry option rather than being left with an apparently live progress display.

### 11.6 Saved report detail

Selecting a report opens its period, status, creation date, available financial summary, and saved note.

The product treats the report as a saved view of its financial basis. Subsequent changes in financial information do not mean an already-created report should be silently interpreted as the latest analysis.

### 11.7 Downloadable Persian PDF

Ready reports can be downloaded as PDFs. The document capability includes Persian right-to-left text, correctly shaped Persian writing, Persian digits in Persian contexts, A4 pages, and the IRANYekanX font family.

The output is intended for reading, archiving, and sharing financial conclusions outside the interactive workspace.

### 11.8 Report content

The reporting capability includes financial overview information, important findings, financial drivers, coverage information, review context, and advisor notes.

Supporting detail can preserve findings that are lower priority, dismissed, or resolved rather than restricting the record to only the most prominent items.

### 11.9 Company access

Report visibility and download access follow the selected company’s access controls. A report archive is company-specific.

## 12. Financial and Banking Connections

### 12.1 Connection list

The connections area lists the company’s financial and banking connections. Users can search connections and inspect their status and latest received information.

The current provider choices include Sepidar and a banking connection option.

### 12.2 Adding a connection

Authorized users enter connection information through a focused form. The page instructs them to obtain the necessary information from the accounting-system administrator or banking-service provider.

Connection information can include its name, provider, provider-specific settings, access information, and synchronization interval.

### 12.3 Connection detail

Selecting a connection opens a detail panel with its provider, status, synchronization information, errors when present, and supported actions.

This creates one place to inspect whether the product has received data and what happened during recent synchronization attempts.

### 12.4 Connection testing

The interface supports requesting a connection test and viewing the resulting message. The current bundled provider implementations validate the supplied configuration and return simulated success information.

A successful result in the present implementation should not be interpreted as proof that a real external Sepidar installation or bank service was contacted.

### 12.5 Receiving information manually

Authorized users can request synchronization. The feature records the attempt and presents information about received, imported, rejected, and duplicate-skipped records where available.

This allows a user to inspect an attempt rather than seeing only a single connected/disconnected label.

### 12.6 Synchronization history

The connection detail includes a history of data-receiving attempts. Attempts can contain a status, timestamps, record counts, summaries, and failure information.

The history helps distinguish an unused connection, a failed attempt, and a completed data-receiving operation.

### 12.7 Local-agent key

A connection can provide a dedicated key for the local synchronization feature. The connection panel supports displaying/copying the key and presenting setup-related information.

This key belongs to the synchronization use case rather than ordinary interactive member access.

### 12.8 Removing a connection

Removing a connection requires confirmation. The interface explains that future data receiving from that connection will stop.

The removal action should not be described as reversing all financial processing that may previously have occurred.

### 12.9 Present integration limitations

The included Sepidar and banking providers currently generate sample records. Real third-party integration is not completed merely because connection-management screens and synchronization history exist.

The product stores incoming synchronization records and detects duplicates. Their receipt alone does not establish that every record has completed all financial preparation and analysis steps.

The ability to enter a synchronization interval also does not, by itself, establish an active recurring synchronization service.

## 13. Local Synchronization

### 13.1 Purpose

The local synchronization capability is designed to collect financial information from a company’s own environment and send it outward to Didban Mali.

This supports the use case of accounting software hosted inside the company rather than requiring the product to open an inbound connection to that environment.

### 13.2 Supported input paths

The implemented client can attempt to extract records from a local SQL Server installation using the included accounting query templates. It can also read supported local JSON exports.

When database configuration or extraction is unavailable, it can fall back to reading files. The current file-reading implementation should not be advertised as a completed general-purpose CSV importer.

### 13.3 One-time and repeated operation

The client supports running a single synchronization cycle or continuing at a configured interval. It saves a local progress marker to support subsequent cycles.

These operating modes belong to the local client. They are separate from the connection screen’s interval field.

### 13.4 Consistent record handling

The client supports Persian/Arabic digit normalization and sends information identifying the source records. The receiving capability recognizes duplicate record identities and reports skipped duplicates.

This helps repeated receiving attempts avoid being interpreted as entirely new financial activity.

### 13.5 Retry behavior

The client retries temporary communication failures. Authentication failures stop the retry path and indicate that the synchronization key needs attention.

A successful receiving result updates its local progress information. Communication failures remain visible in its operating messages.

### 13.6 Present boundaries

The capability is an implemented local client and receiving flow. It is not a certified connector for every installation or a completed packaged Windows service. Source-system compatibility and live financial preparation remain separate requirements.

## 14. Financial Data Preparation

The following data-preparation capabilities are implemented in the project. Their former standalone manual-import and mapping screens have been removed, so they should be understood as retained processing capabilities rather than a complete currently visible manual-import journey.

### 14.1 Accounting, banking, and sales inputs

The preparation capability supports accounting journal data, bank transaction data, and sales invoices. These sources describe different parts of financial reality and can contribute to different indicators.

A company with accounting information but no bank statements can still have some analyses available, while bank-dependent results remain limited.

### 14.2 Spreadsheet and CSV handling

The project supports CSV and Excel spreadsheet intake, including previewing input rows, choosing a spreadsheet sheet, and identifying the header row.

The current default file limit is 50 MiB, and the preparation capability has a maximum row limit of 250,000. These are processing boundaries, not an assertion that every file at those limits has been successfully processed in a live deployment.

### 14.3 Column interpretation

The preparation capability suggests mappings between source columns and financial meanings. Persian and English column naming are supported in the suggestion process.

Suggested interpretation requires explicit confirmation. An ambiguous column should not silently become a confirmed financial field.

### 14.4 Calendar and currency interpretation

Calendar selection distinguishes Jalali and Gregorian dates. Currency-unit selection distinguishes Rial and Toman.

This is essential to interpreting Iranian financial exports: the same number can represent different amounts if its unit is misunderstood, and a date can be misinterpreted if its calendar is assumed incorrectly.

### 14.5 Reusing known mappings

Mapping profiles allow known file structures to be interpreted consistently across repeated imports. Versioned mapping information preserves how a particular batch was understood.

### 14.6 Input validation

The preparation capability distinguishes accepted rows, rejected rows, and warnings. It can identify invalid dates, amounts, missing fields, and problematic input structures, with explanatory information supporting correction.

A partially usable file can therefore have an explicit coverage result rather than being treated as wholly complete.

### 14.7 Safe file handling

The implemented intake includes malware scanning and checks for unsupported or suspicious file content. Files await a clean result before being made available through the corresponding processing/download flow.

Duplicate files can be recognized so that a repeated submission does not automatically become an unnoticed second copy of the same source.

### 14.8 Consistent financial records

Source information can be standardized into accounts, accounting documents, journal lines, bank accounts, bank transactions, counterparties, and sales invoices.

The process preserves the original source context while making records suitable for consistent calculation and comparison.

## 15. Data Quality and Traceability

### 15.1 Finding the source of a financial record

The project includes a traceability capability connecting a standardized accounting entry, journal line, bank transaction, or sales invoice back to its source.

Available traceability information can identify the original file, sheet, row, raw values, interpretation settings, transformations, and normalized values.

This helps answer practical questions such as “Which row produced this invoice?” or “Was this amount originally entered in Toman?”

### 15.2 Preserving original information

Raw source values are retained alongside interpreted records. The product can therefore explain a transformation without requiring the user to assume that the standardized value was the original input.

### 15.3 Financial coverage

Implemented analyses describe which source categories were available and why an indicator may be missing or limited.

Coverage helps users distinguish a complete financial picture from a result based on only accounting data, only bank data, or incomplete classifications.

### 15.4 Accounting balance checks

The preparation capability can identify accounting documents whose debit and credit sides do not balance. Such checks help expose source or interpretation problems before figures are accepted without qualification.

### 15.5 Missing dates and uncertain assumptions

Missing invoice due dates, estimated payable due dates, estimated cash bases, and incomplete risk information remain distinct conditions.

These qualifications change how the corresponding amounts and warnings should be interpreted. They are part of the feature’s explanation rather than incidental technical metadata.

### 15.6 Supported and unsupported conclusions

When input information cannot support an indicator, the calculation capability can return an insufficient-data result instead of inventing a number.

This preserves the distinction between “the result is zero” and “the result is unknown.”

## 16. Financial Analysis and Explainable Indicators

The financial-analysis capability remains implemented, although its former dedicated analysis screen is absent from the current simplified product.

### 16.1 Analysis for a financial period

The project can create financial analyses for selected periods and preserve completed results. A completed analysis can be used as the basis of a report.

The result is associated with the information and interpretation used at the time of calculation, supporting consistent review later.

### 16.2 Financial performance

Implemented period analysis includes revenue, expenses, net profit, and net profit margin when suitable classifications and records exist.

These figures describe business performance over a period rather than only cash movement in bank accounts.

### 16.3 Financial position

Implemented analysis includes asset, liability, and equity balances based on the available classified accounting information.

These results provide a financial-position view distinct from the shorter-term payment plan and projected receipts.

### 16.4 Bank and sales information

When source information is available, analysis can include net bank cash movement, invoiced sales, received amounts, and remaining invoice balances.

These measures help distinguish accounting performance, invoiced activity, and actual or recorded cash collection.

### 16.5 Collection period

The implemented collection-period indicator relates open receivables to sales over a selected period. It helps describe how large the outstanding balance is relative to the company’s sales activity.

Because available sales information does not reliably distinguish cash from credit sales, the indicator is qualified as an approximation in the relevant case.

### 16.6 Payment period

The implemented payment-period indicator relates outstanding obligations to the available expense or outflow basis over the relevant period.

When a bank-outflow approximation is used because the preferred information is missing, that basis is identified. When obligations exist but no usable denominator is available, the result can remain unknown.

### 16.7 Collection-to-payment gap

The project can explain the difference between collection and payment periods. This describes a timing gap that may matter for working capital.

A complete cash-conversion cycle also requires inventory timing. Since that information is unavailable in the current capability, the product’s calculation does not present the collection/payment gap as a fully established cash-conversion cycle.

### 16.8 Indicator explanations

Implemented metric information can include definitions, calculation basis, contributing amounts, period, confidence, coverage, warnings, and supporting records.

These explanations are designed to let a user assess an indicator rather than relying only on a number and a label.

## 17. Bank-to-Accounting Reconciliation

The reconciliation capability remains implemented, but its former standalone reconciliation screen has been removed.

### 17.1 Comparing two financial views

Reconciliation compares banking activity with accounting records to identify corresponding transactions and exceptions.

This supports discovering bank movements that may not have been recorded in accounting, accounting activity without a corresponding bank movement, or mismatched transaction information.

### 17.2 Exact matches

Exact matching considers amount, date, and identifying information. Automatic acceptance is restricted to an unambiguous compatible match.

A transaction with several plausible counterparts is not simply declared reconciled because one candidate appears similar.

### 17.3 Suggested matches

The broader matching capability identifies possible counterparts using date distance, amount, references, and description similarity.

A suggested match remains a candidate requiring review. Similarity does not by itself establish that two financial records represent the same event.

### 17.4 Discrepancies and duplicates

Implemented reconciliation can identify amount discrepancies, date discrepancies, unmatched records, strong duplicate identities, and weaker potential duplicates.

Separating these conditions helps distinguish a missing counterpart from a counterpart that exists but contains inconsistent information.

### 17.5 Two-sided evidence

Reconciliation evidence can include the amount, date, description, reference, and source information from both sides of a comparison.

This gives the reviewer the information needed to understand why a match was accepted, suggested, or rejected.

### 17.6 Current availability

The calculation and comparison logic remains in the project. The current user interface does not provide the previous complete interactive reconciliation workspace.

## 18. Customer Onboarding and Support

### 18.1 Baseline validation

The project includes a company-onboarding capability for recording validation of baseline cash, receivables, payables, and reconciliation difference.

It can preserve the person who validated the information, the validation date, confirmation of opening balances, and the user’s statement.

This establishes an explicit validation record rather than treating the first imported figures as automatically approved.

### 18.2 Go-live confirmation

The onboarding capability can record that a company has entered formal use, with a go-live time. Final baseline validation and activation are restricted to the appropriate administrative financial roles.

The former dedicated readiness/acceptance page is absent; this capability should not be described as a complete current standalone onboarding screen.

### 18.3 Support requests

The product includes support-request functionality. A support request can describe its category, subject, problem, relevant product location, and associated error context.

The support entry provides a way to report a problem from the product. Support records can be retained with their current status and resolution information.

### 18.4 Product feedback

Implemented feedback capture allows users to submit product-related observations separately from financial findings.

A financial exception describes the company’s data or position; product feedback describes the user’s experience of the software.

## 19. Persian Interface and Everyday Usability

### 19.1 Persian-first presentation

The product uses Persian labels, right-to-left layout, Persian number/date presentation, and IRANYekanX typography.

Financial information is presented with explicit currency labels. The current payment-entry and primary financial summaries use Toman in the visible experience.

### 19.2 Jalali dates

Financial dates are displayed in the Jalali calendar in relevant screens. Payment planning uses a Persian date picker, and the header uses the Tehran-local date.

This allows users to work with familiar dates while maintaining consistent interpretation of financial periods and payment deadlines.

### 19.3 Consistent navigation

The main navigation focuses on dashboard, cash flow, receivables, payables, review, and reports. Settings and quick search provide access to relevant supporting destinations.

The active company remains visible in the header so that users can identify the financial context before taking an action.

### 19.4 Detail without losing context

Customer invoices, supplier documents, findings, reports, connections, and member forms use drawers or dialogs where implemented.

This allows a user to inspect or edit a specific item while retaining the surrounding list as their working context.

### 19.5 Loading, errors, and retry

Screens indicate when information is being retrieved. Where retrieval fails, they provide an error and a retry action.

Different areas can distinguish empty data, an unmatched search, a processing operation, and an actual failure. These distinctions make the next step clearer.

### 19.6 Role-aware actions

Add, remove, rerun, and management actions appear according to the user’s permitted role in the company.

A view-only experience can still show financial information without presenting the same writing actions available to administrators and advisors.

### 19.7 Responsive presentation

The interface includes responsive navigation, layouts, tables, and detail panels for different screen sizes. Wide financial lists use local scrolling where required rather than assuming every screen has desktop width.

### 19.8 Search and financial formatting

Search is present in several everyday lists, including customers, suppliers, findings, reports, connections, and members. Relevant searches normalize common Persian character differences.

Amounts, dates, status labels, unknown values, and missing data are formatted consistently enough to support moving between related financial sections.

## 20. Previously Implemented Capabilities Outside the Current Interface

These capabilities remain represented in the project but should be described with their present availability. They are not all usable as complete features in the current simplified interface.

### 20.1 Early financial warnings

The retained warning capability evaluates conditions such as very low runway, concentrated customer receivables, long-overdue receivables, risky customers, supplier stoppage exposure, and overdue payable accumulation.

Warnings can carry severity, financial context, suggested action, and acknowledgement/resolution information. The former standalone warning experience is removed, and a complete automatic external-notification process is not currently established.

### 20.2 Webhook notification configuration

The project retains the ability to configure and test an external notification destination and record delivery-test information.

Testing a destination is distinct from automatically delivering every new warning. The retained notification capability should not be presented as a completed continuous alert-delivery feature.

### 20.3 Financial decision simulation

The retained simulation capability explores hypothetical changes to collection timing, supplier payment timing, early-payment discounts, hiring, salary expense, fixed expense, and customer delay/default assumptions.

It can describe effects on liquidity, burn, runway, the collection/payment gap, discount cost, and comparative weekly cash movement.

This allows a hypothetical decision to be compared with a baseline. The former scenarios workspace has been removed, so the capability is not currently a complete accessible scenario-management feature.

### 20.4 Saved scenarios and comparison

Saved-scenario and comparison behavior remains implemented, including comparative cash views and financial conclusions.

There is an existing persistence limitation: some failures can lead to temporary scenario storage that does not survive a restart. Saved scenarios should therefore not be described as uniformly reliable permanent records.

### 20.5 Decision memorandum

The project retains a Persian PDF decision-memo capability associated with financial simulation. Its purpose is to turn a scenario comparison into a document suitable for management discussion.

The former dedicated simulation journey for producing that memo is not currently exposed as it previously was.

### 20.6 Constrained AI assistance

The retained AI capability is designed around explaining existing findings and ranking already identified reconciliation candidates using the available evidence.

Its intended constraints include using known amounts and evidence, avoiding invented candidates, and requiring human review of relevant output.

The current AI provider is disabled, and no live external model is connected. This is therefore not an active intelligent assistant or a currently working natural-language financial advisor.

### 20.7 Expanded finding investigation

The project retains information supporting assignment, due dates, investigation, resolution, verification, and activity history.

The previous dedicated investigation, resolution, and verification interfaces have been removed. Current users can see the available finding context through the simplified review list and preview, but that does not imply that the former editing workflow remains available.

### 20.8 Other removed standalone areas

Previous standalone surfaces for manual data entry, readiness/acceptance, financial policies, automation, holding-company views, product health, and the assistant are absent from the current product structure.

Their historical presence should not be used to describe the current interface. The remaining capabilities are covered above only where they still have a meaningful implemented function.

## 21. Current Feature Availability

| Feature | Current availability |
| --- | --- |
| Registration and sign-in | Present in the current interface. |
| Company creation and switching | Present in the current interface. |
| Member list and access management | Present in company settings. |
| Financial dashboard | Present in the current interface. |
| Daily 30-day balance projection | Present on the dashboard when the required balance and forecast are available. |
| 30-day cash-flow summary | Present in the current interface. |
| Planned payment entry and removal | Present for permitted roles. |
| Receivables summary and customer invoices | Present in the current interface. |
| Payables summary and supplier documents | Present, with explicitly estimated due dates. |
| Financial findings list and detail preview | Present in the current interface. |
| Requesting another financial review | Present for permitted roles. |
| Report creation, archive, detail, and PDF download | Present; report creation requires an eligible completed analysis. |
| Financial and banking connection management | Present; the bundled provider behavior remains simulated. |
| Local synchronization key and receiving flow | Implemented; live source compatibility requires appropriate setup. |
| Financial preparation and source traceability | Implemented capability; former manual preparation screens removed. |
| Period financial analysis and indicator explanations | Implemented capability; former dedicated analysis screen removed. |
| Extended forecasting and runway information | Implemented capability; current simplified screens expose a narrower experience. |
| Bank-to-accounting reconciliation | Implemented capability; former dedicated workspace removed. |
| Baseline validation and go-live records | Implemented capability; former dedicated readiness screen removed. |
| Support requests and feedback | Implemented capability with supporting product components. |
| Financial warning and notification configuration | Retained capability; no complete current standalone/continuous notification feature. |
| What-if simulation and decision memo | Retained capability; former scenario interface removed. |
| AI explanation and semantic assistance | Disabled; no live external provider. |
| Full finding assignment/resolution/verification workflow | Retained feature information; former interactive workflow removed. |

This feature description reflects the inspected project on the stated date. It describes existing functionality and its availability; it does not add proposed features or represent a new verification of every live user journey.
