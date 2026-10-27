import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { formatDate, formatMoney, PAYMENT_METHOD_LABELS, toWhatsAppNumber } from '../lib/format';
import { invoiceNet, invoicePaid, invoiceDue, invoiceStatus } from '../lib/billing';

const LOGO_SRC = `${import.meta.env.BASE_URL}fdc-logo-invoice.png`;
// Warm the cache at app load so the logo is already decoded by the time
// print or the html2canvas export runs on a freshly opened invoice.
new Image().src = LOGO_SRC;

// Renders one invoice as a printable/shareable document. `invoice` must
// carry its joined `patients` (name, mr_no, phone); `payments` is the list
// of payment rows for this invoice (caller already has them grouped).
function InvoiceDocument({ invoice, payments }) {
  const net = invoiceNet(invoice);
  const paid = invoicePaid(invoice, new Map([[invoice.id, payments]]));
  const due = invoiceDue(invoice, new Map([[invoice.id, payments]]));
  const subtotal = Number(invoice.cost) || 0;
  const discount = Number(invoice.discount) || 0;
  const labCost = Number(invoice.lab_cost) || 0;
  const lines = Array.isArray(invoice.line_items) && invoice.line_items.length > 0
    ? invoice.line_items
    : [{ name: invoice.procedure || 'Procedure', cost: subtotal }];
  const patient = invoice.patients || {};

  return (
    <div className="inv-doc-root">
      <div className="inv-doc-top">
        <img className="inv-doc-logo" src={LOGO_SRC} alt="Faseeh Dental Clinic" />
        <div className="inv-doc-head-right">
          <div className="inv-doc-title">INVOICE</div>
          <div className="inv-doc-number">MR #{patient.mr_no ?? '—'}</div>
        </div>
      </div>
      <div className="inv-doc-teal-line" />

      <div className="inv-doc-second-row">
        <div className="inv-doc-second-left">
          <div className="inv-doc-doctor">Faseeh Dental Clinic</div>
          <div className="inv-doc-doctor-sub">Karachi, Pakistan</div>
        </div>
        <div className="inv-doc-second-right">
          <div><span className="inv-doc-date-label">Date: </span>{formatDate(invoice.created_at)}</div>
        </div>
      </div>

      <div className="inv-doc-balance-bar">
        <span>{due > 0 ? 'Balance Due' : 'Paid in Full'}</span>
        <span className={due <= 0 ? 'inv-doc-balance-paid' : ''}>{formatMoney(due > 0 ? due : net)}</span>
      </div>

      <div className="inv-doc-patient-info">
        <div className="inv-doc-section-title">Billed To</div>
        <div className="inv-doc-patient-name">{patient.name || 'Unknown patient'}</div>
        <div className="inv-doc-patient-meta">MR #{patient.mr_no ?? '—'}{patient.phone ? ` · ${patient.phone}` : ''}</div>
      </div>
      <hr className="inv-doc-divider" />

      <table className="inv-doc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td className="inv-doc-num inv-doc-center">1</td>
              <td className="inv-doc-num">{formatMoney(l.cost)}</td>
              <td className="inv-doc-num">{formatMoney(l.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-doc-totals">
        <div>Subtotal: {formatMoney(subtotal)}</div>
        {discount > 0 && <div>Discount: −{formatMoney(discount)}</div>}
        {labCost > 0 && <div>Lab Cost: {formatMoney(labCost)}</div>}
        <div><strong>Net Total: {formatMoney(net)}</strong></div>
        <div>Paid: {formatMoney(paid)}</div>
        <div className="inv-doc-total-due">Due: {formatMoney(due)}</div>
      </div>

      {invoice.notes && (
        <div className="inv-doc-patient-info">
          <div className="inv-doc-section-title">Notes</div>
          <div className="inv-doc-patient-meta">{invoice.notes}</div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="inv-doc-patient-info">
          <div className="inv-doc-section-title">Payments Received</div>
          {payments.map((p) => (
            <div className="inv-doc-patient-meta" key={p.id}>
              {formatDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method} · {formatMoney(p.amount)}
            </div>
          ))}
        </div>
      )}

      <p className="inv-doc-foot">Thank you for choosing Faseeh Dental Clinic.</p>
    </div>
  );
}

// "<patient name> - <mr_no> - FDC", shared by the PNG download and the
// print/PDF title. Strips characters that are invalid in macOS/Windows filenames.
function invoiceFileBase(invoice) {
  const safe = (v) => String(v ?? '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  const name = safe(invoice.patients?.name) || 'Patient';
  const mrNo = safe(invoice.patients?.mr_no) || 'invoice';
  return `${name} - ${mrNo} - FDC`;
}

export default function InvoiceViewModal({ invoice, payments, onClose }) {
  const previewRef = useRef(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePrint() {
    // The browser uses document.title as the default "Save as PDF" filename.
    const originalTitle = document.title;
    document.title = invoiceFileBase(invoice);
    document.body.classList.add('printing-invoice');
    window.print();
    // afterprint doesn't fire reliably in every browser (notably some
    // in-app/embedded webviews), so also clear on a short fallback timer.
    const clear = () => {
      document.body.classList.remove('printing-invoice');
      document.title = originalTitle;
    };
    window.addEventListener('afterprint', clear, { once: true });
    setTimeout(clear, 2000);
  }

  async function handleSendCustomerCopy() {
    if (!previewRef.current) return;
    setWorking(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceFileBase(invoice)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      console.error(err);
      alert('Could not generate the invoice image: ' + err.message);
    }
    setWorking(false);

    const waNumber = toWhatsAppNumber(invoice.patients?.phone);
    if (waNumber) {
      const text = encodeURIComponent("Hi! Thank you for your visit at Faseeh Dental Clinic. Here's your invoice. Thanks!");
      window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank', 'noopener');
    } else {
      alert('Invoice image downloaded. This patient has no phone number on file to open WhatsApp.');
    }
  }

  return (
    <>
      <div className="invoice-copy-overlay" onClick={onClose}>
        <div className="invoice-copy-modal" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="invoice-copy-x" onClick={onClose} aria-label="Close">×</button>
          <div className="invoice-copy-modal-body">
            <div className="invoice-copy-preview-shell" ref={previewRef}>
              <InvoiceDocument invoice={invoice} payments={payments} />
            </div>
          </div>
          <div className="invoice-copy-modal-actions">
            <button type="button" className="btn invoice-copy-btn-pdf" onClick={handlePrint}>
              Print / Download Copy
            </button>
            <button type="button" className="btn invoice-copy-btn-wa" onClick={handleSendCustomerCopy} disabled={working}>
              {working ? 'Preparing…' : 'Send Customer Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* The print CSS (body.printing-invoice ... > *:not(#invoice-print-area))
          hides every direct child of <body> except this one, so it must
          actually be a direct child of <body> — not nested under #root —
          hence the portal. */}
      {createPortal(
        <div id="invoice-print-area" className="invoice-print-sheet">
          <InvoiceDocument invoice={invoice} payments={payments} />
        </div>,
        document.body
      )}
    </>
  );
}
