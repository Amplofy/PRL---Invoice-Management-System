# Requirements Document

Feature Name: po-bulk-release-and-print
Updated: 2026-09-17

## Introduction

Finance releases surveyor payment one payment order at a time from the Payment Orders page, and prints one payment order at a time. After a batch of invoices is approved, finance must clear many payment orders that share one release channel, sometimes returns several incorrect pay orders together, and often prints the cleared payment orders as a single packet for signatures. This feature adds row selection to the Payment Orders page, a finance-only Bulk Release that clears several payment orders in one request, a finance-only Bulk Reject that returns several payment orders with one shared reason, and a Bulk Print that renders the selected payment orders into one printable document.

## Glossary

- **Payment Order (PO)**: A row in `po_versions` generated when an invoice is approved.
- **Awaiting Finance**: A payment order whose status is `Generated` and which finance has not yet cleared or rejected.
- **Payment Release**: The finance decision that sets a payment order to `Cleared`, records `released_amount`, sets the linked invoice to `Paid`, and consumes budget or accrual.
- **Bulk Release**: One Payment Release applied to several selected payment orders in a single request.
- **Bulk Reject**: One finance rejection applied to several selected payment orders with one shared reason.
- **Shared Channel Values**: One Released Via, Release Reference and Remarks set that Bulk Release records on every released payment order.
- **Bulk Print**: One print job that renders several selected payment orders into a single printable document.
- **Finance Role**: A user whose role is `admin`, `superadmin` or `finance`.
- **FY Lock**: The closed-fiscal-year protection that requires an unlock before a write.
- **Closed FY**: A fiscal year whose start year is earlier than the running fiscal year.
- **Unpaid Prior-Year Invoice**: An invoice whose date belongs to a Closed FY and whose status is other than `Paid`.

## Requirements

### Requirement 1 — Select payment orders

**User Story:** AS a user viewing the Payment Orders page, I want to select several payment orders, so that I can act on them together.

#### Acceptance Criteria

1. The Payment Orders page SHALL show a selection checkbox on every payment-order row and a select-all checkbox in the header.
2. WHEN the user marks the select-all checkbox, the system SHALL select every payment order in the current filtered and sorted view.
3. WHEN the user marks a row checkbox while holding the Shift key, the system SHALL select the range between the last marked row and the current row.
4. WHILE one or more payment orders are selected, the system SHALL display the selected count and the summed PO amount in an action bar.
5. WHEN the user clears the action bar, the system SHALL remove every selection.

### Requirement 2 — Bulk release

**User Story:** AS a finance official, I want to release several payment orders in one action, so that a batch of approved invoices is paid without repeating the single-release form.

#### Acceptance Criteria

1. WHILE no payment order is selected, the system SHALL keep the Bulk Release action unavailable.
2. WHEN a user without the Finance Role requests Bulk Release, the system SHALL reject the request and SHALL state that finance permission is required.
3. WHEN finance confirms Bulk Release, the system SHALL apply Payment Release to each selected payment order whose status is Awaiting Finance.
4. The system SHALL set each released payment order's `released_amount` to that payment order's own generated amount.
5. The system SHALL record the optional shared Released Via, Release Reference and Remarks values on every released payment order.
6. WHEN Payment Release completes for a payment order, the system SHALL set the linked invoice status to `Paid`.
7. WHEN Payment Release completes for a payment order, the system SHALL write the `FinanceApproved` and `PaymentReleased` history rows and the finance audit entry for that payment order.
8. IF a selected payment order belongs to a Closed FY that FY Lock protects, the system SHALL release no payment order in that batch and SHALL report the locked fiscal year.
9. IF a selected payment order is not Awaiting Finance, the system SHALL skip that payment order and SHALL report the PO serial number as skipped.
10. WHEN Bulk Release finishes, the system SHALL report the released count, the skipped count and the failed count.

### Requirement 3 — Bulk reject

**User Story:** AS a finance official, I want to reject several payment orders with one reason, so that a batch of incorrect pay orders is returned in one action.

#### Acceptance Criteria

1. WHILE no payment order is selected, the system SHALL keep the Bulk Reject action unavailable.
2. WHEN a user without the Finance Role requests Bulk Reject, the system SHALL reject the request and SHALL state that finance permission is required.
3. IF the shared rejection reason is empty, the system SHALL reject the request and SHALL state that a rejection reason is required.
4. WHEN finance confirms Bulk Reject, the system SHALL set each selected payment order whose status is Awaiting Finance to `Rejected` and SHALL record the shared reason as `finance_remarks`.
5. The system SHALL clear `released_amount`, `released_by`, `released_at`, `released_via` and `release_reference` on every rejected payment order.
6. WHEN a payment order is rejected, the system SHALL write the `FinanceRejected` history row and the finance audit entry for that payment order.
7. IF a selected payment order belongs to a Closed FY that FY Lock protects, the system SHALL reject no payment order in that batch and SHALL report the locked fiscal year.
8. IF a selected payment order is not Awaiting Finance, the system SHALL skip that payment order and SHALL report the PO serial number as skipped.
9. WHEN Bulk Reject finishes, the system SHALL report the rejected count and the skipped count.

### Requirement 4 — Bulk print

**User Story:** AS a user, I want to print several selected payment orders in one job, so that I can hand a single packet to the signatories.

#### Acceptance Criteria

1. WHILE no payment order is selected, the system SHALL keep the Bulk Print action unavailable.
2. WHEN the user triggers Bulk Print, the system SHALL render every selected payment order with the configured payment-order template.
3. The system SHALL place each printed payment order on its own page.
4. The system SHALL open one print window and SHALL invoke the browser print dialog one time for the whole selection.
5. The system SHALL compute each printed amount with the same rule as single print: the released amount when greater than zero, else the generated amount.
6. IF the browser blocks the print window, the system SHALL keep the current selection and SHALL show an error message.

### Requirement 5 — Result feedback

**User Story:** AS a user, I want clear feedback after a bulk action, so that I know what changed.

#### Acceptance Criteria

1. WHEN Bulk Release succeeds, the system SHALL show a success message with the released count.
2. WHEN Bulk Reject succeeds, the system SHALL show a success message with the rejected count.
3. WHEN Bulk Release or Bulk Reject skips or fails for one or more payment orders, the system SHALL show a warning message that lists the affected PO serial numbers.
4. WHEN a bulk action completes, the system SHALL reload the Payment Orders list and SHALL preserve the current search, filters, sort and grouping.
5. WHEN Bulk Print completes, the system SHALL preserve the current selection.
