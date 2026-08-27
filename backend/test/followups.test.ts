import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderTemplate, textToHtml, escapeHtml } from '../src/services/emailService.js'

test('renderTemplate substitutes placeholders', () => {
  const tpl = 'Dear {{vendorName}}, invoice {{invoiceNo}} amount {{amount}}'
  const out = renderTemplate(tpl, {
    vendorName: 'ABC Co',
    invoiceNo: 'INV-001',
    amount: 'Rs 1,000',
  })
  assert.equal(out, 'Dear ABC Co, invoice INV-001 amount Rs 1,000')
})

test('renderTemplate leaves unknown placeholders empty', () => {
  const out = renderTemplate('Hello {{missing}}', {})
  assert.equal(out, 'Hello ')
})

test('escapeHtml escapes dangerous chars', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
})

test('textToHtml converts newlines to br', () => {
  assert.equal(textToHtml('line1\nline2'), 'line1<br/>line2')
})
