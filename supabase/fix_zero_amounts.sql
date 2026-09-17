-- Repair zero-valued amounts recorded before the "zero means unset" rule.
--
-- Context: a stored zero was treated as a real value, so invoices imported or
-- approved with a blank approved_amount showed 0 in Payment Orders, accruals
-- and reports, and generated POs kept a 0 amount even when the invoice had a
-- positive amount.
--
-- Safe to re-run: every statement only touches rows whose amount is exactly 0
-- and only writes a value derived from the invoice. No rows are deleted.

-- 1) A zero approved_amount means "not set"; clearing it lets the invoice
--    amount drive POs, accruals and reports again.
update public.invoices
set approved_amount = null
where approved_amount = 0;

-- 2) Restore zero payment-order amounts from the owning invoice.
update public.po_versions po
set amount = coalesce(nullif(i.approved_amount, 0), i.amount, 0)
from public.invoices i
where i.id = po.invoice_id
  and po.amount = 0
  and coalesce(nullif(i.approved_amount, 0), i.amount, 0) > 0;

-- 3) Bring the generation history in line with the repaired PO amount.
update public.po_history h
set amount = po.amount
from public.po_versions po
where h.po_id = po.id
  and h.action = 'Generated'
  and coalesce(h.amount, 0) = 0
  and po.amount > 0;
