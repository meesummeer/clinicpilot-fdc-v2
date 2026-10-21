// Shared invoice math. An invoice's net cost and due amount are always
// derived, never stored, so a late discount/payment edit can't leave a
// stale "Due" figure lying around.

export function invoiceNet(invoice) {
  const cost = Number(invoice.cost) || 0;
  const discount = Number(invoice.discount) || 0;
  const lab = Number(invoice.lab_cost) || 0;
  return Math.max(cost - discount, 0) + lab;
}

export function invoicePaid(invoice, paymentsByInvoiceId) {
  const list = paymentsByInvoiceId.get(invoice.id) || [];
  return list.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function invoiceDue(invoice, paymentsByInvoiceId) {
  return Math.max(invoiceNet(invoice) - invoicePaid(invoice, paymentsByInvoiceId), 0);
}

export function invoiceStatus(invoice, paymentsByInvoiceId) {
  const net = invoiceNet(invoice);
  const paid = invoicePaid(invoice, paymentsByInvoiceId);
  if (paid <= 0) return 'unpaid';
  if (paid >= net) return 'paid';
  return 'partial';
}

export function groupPaymentsByInvoice(payments) {
  const map = new Map();
  for (const p of payments) {
    if (!map.has(p.invoice_id)) map.set(p.invoice_id, []);
    map.get(p.invoice_id).push(p);
  }
  return map;
}
