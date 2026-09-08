# Requirements Document

Feature Name: sundry-accruals
Updated: 2026-09-04

## Introduction

PRL-EOMS today deducts remaining budget when finance releases payment, and locks invoices, payment orders and budgets once a Pakistan fiscal year closes. Unpaid invoices that belong to a closed year still need a payment path, and that payment must consume the original year's secured accrual rather than the running year's budget. This feature adds Sundry Accruals per fiscal year, keeps unpaid prior-year invoices payable until payment is released, lets an admin with Master Access increase a fiscal-year budget, and records optional payment-channel fields on a payment order.

## Glossary

- **Fiscal Year (FY)**: Pakistan FY running 1 July to 30 June, labelled by the starting year (Jul 2026–Jun 2027 = FY26).
- **Closed FY**: A fiscal year whose start year is earlier than the running FY.
- **Running FY**: The fiscal year that contains today's date.
- **Sundry Accrual**: The amount secured against a specific FY for invoices of that FY that remain unpaid.
- **Accrual Balance**: Sundry Accrual minus payments later released against that FY's unpaid invoices.
- **Unpaid Prior-Year Invoice**: An invoice whose invoice date falls in a Closed FY and whose status is other than Paid.
- **Payment Release**: Finance Approve & Release on a payment order, which sets the invoice to Paid and records `released_amount`.
- **Master Access**: Admin session flag already used for locked auto-field overrides.
- **Released Via**: Optional channel describing how payment left the company (for example cheque, bank transfer).
- **Release Reference**: Optional bank, cheque or voucher number recorded at Payment Release.
- **Yearly Budget Line**: Admin-entered amount for one cost element in one FY.

## Requirements

### Requirement 1 — Sundry Accrual per fiscal year

**User Story:** AS a finance user, I want each fiscal year to hold a Sundry Accrual for unpaid invoices of that year, so that prior-year liabilities stay secured against the year that incurred them.

#### Acceptance Criteria

1. WHEN a fiscal year becomes a Closed FY, the system SHALL compute that year's Sundry Accrual as the sum of unpaid invoice amounts whose invoice date belongs to that FY.
2. WHILE a FY is closed, the system SHALL display that FY's Sundry Accrual, Accrual Balance, and the list of Unpaid Prior-Year Invoices that still feed the accrual.
3. WHEN finance completes Payment Release on an Unpaid Prior-Year Invoice, the system SHALL reduce that invoice year's Accrual Balance by the `released_amount`.
4. WHEN finance completes Payment Release on an Unpaid Prior-Year Invoice, the system SHALL leave the Running FY yearly budget remaining unchanged by that `released_amount`.
5. IF an invoice of a Closed FY already has status Paid, the system SHALL treat that invoice as consumed against Accrual Balance and SHALL exclude that invoice from the unpaid accrual list.
6. WHEN an admin with Master Access saves a Sundry Accrual override for a FY, the system SHALL use that override as the secured Sundry Accrual for that FY.
7. WHEN no override is stored for a FY, the system SHALL use the computed unpaid-plus-consumed total as the Sundry Accrual.

### Requirement 2 — Prior-year unpaid invoices stay payable

**User Story:** AS a finance official, I want unpaid invoices from a Closed FY to stay payable until Payment Release, so that year-end lock does not freeze outstanding surveyor payments.

#### Acceptance Criteria

1. WHILE an invoice is an Unpaid Prior-Year Invoice, the system SHALL keep invoice field edits and deletes under the existing Closed FY lock.
2. WHILE an invoice is an Unpaid Prior-Year Invoice, the system SHALL allow finance to approve, reject, and complete Payment Release on the related payment order without the closed-year unlock password.
3. WHEN Payment Release completes on an Unpaid Prior-Year Invoice, the system SHALL set invoice status to Paid and SHALL apply Closed FY lock to that invoice and its cleared payment order.
4. WHILE a record of a Closed FY is other than an open payment order for an Unpaid Prior-Year Invoice, the system SHALL keep the existing closed-year lock behaviour.

### Requirement 3 — Budget increase via Master Access

**User Story:** AS an admin with Master Access, I want to increase a fiscal-year budget, so that an authorised top-up can be recorded without reopening the whole year.

#### Acceptance Criteria

1. WHEN an admin with Master Access saves a Yearly Budget Line whose new amount is greater than the stored amount, the system SHALL persist the higher amount for that FY and cost element.
2. WHEN a user without Master Access attempts to save a Yearly Budget Line whose new amount is greater than the stored amount, the system SHALL reject the save and SHALL state that a budget increase requires Master Access.
3. WHEN an admin with Master Access increases a Closed FY budget, the system SHALL persist the increase without the closed-year unlock password.
4. WHEN a budget save keeps or lowers a Yearly Budget Line amount, the system SHALL keep the existing Administration budget save rules, including closed-year unlock for a Closed FY.

### Requirement 4 — Optional payment channel on Payment Release

**User Story:** AS a finance official, I want to record how payment was released and a reference number, so that the pay-order trail matches bank or cheque evidence.

#### Acceptance Criteria

1. WHEN finance opens Approve & Release, the system SHALL show optional fields Released Via and Release Reference.
2. WHEN the Released Via control is shown, the system SHALL offer Cheque, Bank transfer, RTGS, Other, and an empty choice.
3. WHEN finance submits Approve & Release with Released Via or Release Reference empty, the system SHALL complete Payment Release.
4. WHEN finance submits Approve & Release with Released Via and/or Release Reference filled, the system SHALL store those values on the payment order and SHALL show them on the payment-order list, detail, and print document.

### Requirement 5 — Visibility in Administration and Reports

**User Story:** AS an admin or finance user, I want Sundry Accrual figures next to yearly budgets, so that remaining budget and prior-year secured amounts are not mixed.

#### Acceptance Criteria

1. WHEN Administration Yearly budgets shows a FY, the system SHALL show that FY's Yearly Budget total, released-against-budget total, Sundry Accrual, and Accrual Balance as separate figures.
2. WHEN Reports compute remaining budget for the Running FY, the system SHALL use yearly budget minus Payment Release amounts whose invoices belong to the Running FY.
3. WHEN Reports show a Closed FY, the system SHALL show Accrual Balance for that FY beside budget versus released-in-year figures.
- **Unpaid Prior-Year Invoice**: An invoice whose budget FY (`service_to`, else `invoice_date`) falls in a Closed FY and whose status is other than Paid.
1. WHEN a fiscal year becomes a Closed FY, the system SHALL compute that year's Sundry Accrual as the sum of unpaid invoice amounts whose budget FY (`service_to`, else `invoice_date`) belongs to that FY.
