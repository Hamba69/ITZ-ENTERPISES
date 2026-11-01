import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, lineTotal, totals, type Invoice } from './business';
export function exportPdf(doc: Invoice) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const colors = {
    industrial: [10, 77, 140],
    forge: [196, 91, 24],
    editorial: [52, 61, 72],
    blueprint: [36, 116, 107],
  } as const;
  const color = [...colors[doc.template]] as [number, number, number];
  const font = doc.font === 'serif' ? 'times' : doc.font === 'mono' ? 'courier' : 'helvetica';
  // Standard PDF fonts are portable. Transliterate unsupported typographic symbols.
  const clean = (s: string) =>
    s
      .replaceAll('×', 'x')
      .replace(/[–—]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replaceAll('·', ' / ');
  const cash = (n: number) =>
    `${doc.currency} ${n.toLocaleString('en-GB', { minimumFractionDigits: ['UGX', 'JPY'].includes(doc.currency) ? 0 : 2, maximumFractionDigits: ['UGX', 'JPY'].includes(doc.currency) ? 0 : 2 })}`;
  pdf.setFont(font);
  pdf.setFillColor(...color);
  pdf.rect(0, 0, 210, 4, 'F');
  pdf.setTextColor(...color);
  pdf.setFontSize(25);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ITZ', 16, 21);
  pdf.setDrawColor(217, 119, 54);
  pdf.setLineWidth(0.8);
  pdf.line(16, 23, 31, 23);
  pdf.setFontSize(8);
  pdf.text('ENGINEERING / BUSINESS STUDIO', 16, 27);
  pdf.setFont(font, 'bold');
  pdf.setFontSize(23);
  pdf.text(doc.kind === 'invoice' ? 'INVOICE' : 'QUOTATION', 194, 21, { align: 'right' });
  pdf.setFontSize(10);
  pdf.text(clean(doc.number), 194, 29, { align: 'right' });
  if (doc.status !== 'issued') {
    pdf.setFontSize(9);
    pdf.text(doc.status.toUpperCase(), 194, 36, { align: 'right' });
  }
  let y = 42;
  const table = (head: string[], body: string[][]) => {
    autoTable(pdf, {
      startY: y,
      margin: { left: 16, right: 16, top: 16, bottom: 18 },
      head: [head.map(clean)],
      body: body.map((r) => r.map(clean)),
      styles: {
        font,
        fontSize: 9,
        cellPadding: 2.6,
        overflow: 'linebreak',
        textColor: [44, 53, 65],
        lineColor: [225, 231, 237],
      },
      headStyles: {
        fillColor:
          doc.template === 'editorial' || doc.template === 'blueprint' ? [238, 243, 245] : color,
        textColor:
          doc.template === 'editorial' || doc.template === 'blueprint' ? color : [255, 255, 255],
        fontStyle: 'bold',
      },
      theme: doc.template === 'blueprint' ? 'grid' : 'striped',
      alternateRowStyles: { fillColor: [247, 249, 251] },
      rowPageBreak: 'avoid',
      pageBreak: body.length < 3 ? 'avoid' : 'auto',
    });
    y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  };
  table(
    ['FROM', 'BILL TO', 'DOCUMENT DETAILS'],
    [
      [
        [
          doc.company.name,
          doc.company.address,
          doc.company.email,
          doc.company.phone,
          doc.company.tin && `TIN: ${doc.company.tin}`,
        ]
          .filter(Boolean)
          .join('\n'),
        [
          doc.client.name,
          doc.client.address,
          doc.client.email,
          doc.client.phone,
          doc.client.tin && `TIN: ${doc.client.tin}`,
        ]
          .filter(Boolean)
          .join('\n'),
        `Issued: ${formatDate(doc.issueDate)}\n${doc.kind === 'invoice' ? 'Due' : 'Valid until'}: ${formatDate(doc.dueDate)}\nCurrency: ${doc.currency}\n${doc.project}`,
      ],
    ],
  );
  const schedule = () => {
    for (const m of doc.measurements) {
      if (y > 245) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(11);
      pdf.setTextColor(...color);
      const titleLines = pdf.splitTextToSize(clean(m.title), 178);
      pdf.text(titleLines, 16, y);
      y += titleLines.length * 4.5;
      table(m.columns, m.rows);
    }
  };
  if (doc.measurementPosition === 'before') schedule();
  table(
    ['#', 'Description', 'Qty', 'Unit', 'Unit price', 'Item total'],
    doc.items.map((i, n) => [
      String(n + 1),
      i.description + (i.measurement ? '\n' + i.measurement : ''),
      String(i.quantity),
      i.unit,
      cash(i.price),
      cash(lineTotal(i, doc.currency)),
    ]),
  );
  const t = totals(doc);
  const rows = [
    ['Subtotal', cash(t.subtotal)],
    ...(doc.discount ? [['Discount (' + doc.discount + '%)', '-' + cash(t.discount)]] : []),
    ['Tax (' + doc.tax + '%)', cash(t.tax)],
    ['TOTAL', cash(t.total)],
    ...(t.paid
      ? [
          ['Payments received', cash(t.paid)],
          ['BALANCE DUE', cash(t.balance)],
        ]
      : []),
  ];
  autoTable(pdf, {
    startY: y,
    margin: { left: 111, right: 16, top: 16, bottom: 18 },
    body: rows,
    theme: 'plain',
    styles: { font, fontSize: 9, cellPadding: 2.2, textColor: [77, 97, 113] },
    columnStyles: { 0: { cellWidth: 43 }, 1: { halign: 'right' } },
    didParseCell(data) {
      if (
        data.row.raw &&
        (data.row.index === rows.length - 1 || rows[data.row.index][0] === 'TOTAL')
      ) {
        data.cell.styles.fillColor = doc.template === 'forge' ? color : [236, 242, 247];
        data.cell.styles.textColor = doc.template === 'forge' ? [255, 255, 255] : color;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    pageBreak: 'avoid',
  });
  y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  if (doc.measurementPosition === 'after') schedule();
  if (doc.payments.length)
    table(
      ['Payment date', 'Method / reference', 'Received'],
      doc.payments.map((p) => [formatDate(p.date), p.method + ' / ' + p.reference, cash(p.amount)]),
    );
  table(
    ['PAYMENT DETAILS', 'TERMS & NOTES'],
    [
      [
        doc.company.paymentDetails || 'Please contact us for payment arrangements.',
        [doc.terms, doc.notes].filter(Boolean).join('\n\n'),
      ],
    ],
  );
  const count = pdf.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    pdf.setPage(i);
    pdf.setFont(font, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(pdf.splitTextToSize(clean(`${doc.company.name} / ${doc.number}`), 155)[0], 16, 288);
    pdf.text(`${i} / ${count}`, 194, 288, { align: 'right' });
  }
  pdf.save(doc.number.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
  return pdf;
}
