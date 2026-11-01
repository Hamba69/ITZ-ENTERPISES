import { z } from 'zod';
import Decimal from 'decimal.js';

const text = z.string().max(4000);
const name = z.string().trim().min(1, 'A name is required').max(200);
const id = z.string().min(1).max(100);
const amount = z.number().finite().min(0).max(1e12);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Invalid date',
  );
export const currencies = ['UGX', 'KES', 'USD', 'EUR', 'GBP', 'JPY', 'INR'] as const;
export const templates = [
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Signature blue. Built for business.',
    color: '#0a4d8c',
  },
  {
    id: 'forge',
    name: 'Forge',
    description: 'Bold orange. A confident impression.',
    color: '#d4651c',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Quiet typography. Timeless detail.',
    color: '#343d48',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Technical precision. Every detail.',
    color: '#24746b',
  },
] as const;
export const clientSchema = z.object({
  id,
  name,
  email: z.union([z.literal(''), z.email()]),
  phone: text,
  address: text,
  tin: text,
});
export const itemSchema = z.object({
  id,
  description: text.trim().min(1),
  measurement: text,
  quantity: z.number().finite().positive().max(1e6),
  unit: text.trim().min(1).max(24),
  price: amount,
});
export const productSchema = z
  .object({
    id,
    name,
    description: text,
    unit: text.trim().min(1).max(24),
    price: amount,
    currency: z.enum(currencies),
  })
  .refine(
    (p) => p.price === new Decimal(p.price).toDecimalPlaces(digits(p.currency)).toNumber(),
    'Unit price precision must match its currency (whole shillings for UGX)',
  );
export const paymentSchema = z.object({
  id,
  amount: amount.positive(),
  date,
  method: text.min(1),
  reference: text,
});
export const companySchema = z.object({
  name,
  address: text,
  email: z.union([z.literal(''), z.email()]),
  phone: text,
  tin: text,
  paymentDetails: text,
  currency: z.enum(currencies),
  terms: text,
  notes: text,
});
export const measurementSchema = z
  .object({
    id,
    title: text.trim().min(1).max(120),
    columns: z.array(text.trim().min(1).max(60)).min(1).max(8),
    rows: z.array(z.array(text).max(8)).max(200),
  })
  .refine(
    (t) => t.rows.every((r) => r.length === t.columns.length),
    'Measurement cells must match the columns',
  );
export const documentSchema = z
  .object({
    id,
    number: text
      .trim()
      .min(1)
      .max(64)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/,
        'Use letters, numbers, spaces, dots, dashes or slashes for document numbers',
      ),
    kind: z.enum(['invoice', 'quotation']),
    status: z.enum(['draft', 'issued', 'void']),
    client: clientSchema,
    company: companySchema,
    project: text,
    issueDate: date,
    dueDate: date,
    currency: z.enum(currencies),
    items: z.array(itemSchema).min(1).max(200),
    discount: z.number().min(0).max(100),
    tax: z.number().min(0).max(100),
    payments: z.array(paymentSchema).max(500),
    notes: text,
    terms: text,
    template: z.enum(['industrial', 'forge', 'editorial', 'blueprint']),
    font: z.enum(['sans', 'serif', 'mono']),
    measurements: z.array(measurementSchema).max(20),
    measurementPosition: z.enum(['after', 'before', 'hidden']),
    createdAt: text,
    updatedAt: text,
  })
  .superRefine((d, ctx) => {
    if (d.dueDate < d.issueDate)
      ctx.addIssue({
        code: 'custom',
        message: 'Due date must be on or after the issue date',
        path: ['dueDate'],
      });
    if (d.kind === 'quotation' && d.payments.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Quotations cannot receive payments',
        path: ['payments'],
      });
    if (d.status === 'draft' && d.payments.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Issue the invoice before recording payments',
        path: ['payments'],
      });
    if (d.status === 'void' && d.payments.length)
      ctx.addIssue({
        code: 'custom',
        message: 'An invoice with payments cannot be voided',
        path: ['payments'],
      });
    if (totals(d).balance < 0)
      ctx.addIssue({
        code: 'custom',
        message: 'Payments exceed the document total',
        path: ['payments'],
      });
    if (totals(d).total > 1e12)
      ctx.addIssue({
        code: 'custom',
        message: 'Document total exceeds the supported limit of one trillion',
        path: ['items'],
      });
    if (
      d.payments.some(
        (p) => p.amount !== new Decimal(p.amount).toDecimalPlaces(digits(d.currency)).toNumber(),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Payment precision must match the document currency',
        path: ['payments'],
      });
    if (d.payments.some((p) => p.date > today()))
      ctx.addIssue({
        code: 'custom',
        message: 'Payment date cannot be in the future',
        path: ['payments'],
      });
    if (
      d.items.some(
        (p) => p.price !== new Decimal(p.price).toDecimalPlaces(digits(d.currency)).toNumber(),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Unit price precision must match the document currency',
        path: ['items'],
      });
    for (const key of ['items', 'payments', 'measurements'] as const)
      if (new Set(d[key].map((x) => x.id)).size !== d[key].length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${key} IDs`, path: [key] });
  });
export const expenseSchema = z
  .object({
    id,
    description: text.trim().min(1),
    vendor: text,
    category: z.enum(['Materials', 'Labour', 'Transport', 'Equipment', 'Utilities', 'Other']),
    date,
    amount: amount.positive(),
    currency: z.enum(currencies),
    reference: text,
  })
  .refine((e) => e.date <= today(), 'An expense payment cannot be dated in the future')
  .refine(
    (e) => e.amount === new Decimal(e.amount).toDecimalPlaces(digits(e.currency)).toNumber(),
    'Expense precision must match its currency (whole shillings for UGX)',
  );
export const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    company: companySchema,
    clients: z.array(clientSchema).max(5000),
    products: z.array(productSchema).max(5000),
    documents: z.array(documentSchema).max(5000),
    expenses: z.array(expenseSchema).max(10000),
  })
  .superRefine((w, ctx) => {
    for (const key of ['clients', 'products', 'documents', 'expenses'] as const)
      if (new Set(w[key].map((x) => x.id)).size !== w[key].length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${key} IDs` });
    if (new Set(w.documents.map((d) => d.number.toLowerCase())).size !== w.documents.length)
      ctx.addIssue({ code: 'custom', message: 'Document numbers must be unique' });
    for (const e of w.expenses)
      if (
        e.date > today() ||
        e.amount !== new Decimal(e.amount).toDecimalPlaces(digits(e.currency)).toNumber()
      )
        ctx.addIssue({ code: 'custom', message: 'Expense date or currency precision is invalid' });
    for (const p of w.products)
      if (p.price !== new Decimal(p.price).toDecimalPlaces(digits(p.currency)).toNumber())
        ctx.addIssue({ code: 'custom', message: 'Item price precision must match its currency' });
  });
export type Client = z.infer<typeof clientSchema>;
export type Company = z.infer<typeof companySchema>;
export type LineItem = z.infer<typeof itemSchema>;
export type Invoice = z.infer<typeof documentSchema>;
export type Product = z.infer<typeof productSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Currency = (typeof currencies)[number];
export const uid = () => crypto.randomUUID();
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function addDays(value: string, n: number) {
  const d = new Date(value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const digits = (currency: string) => (currency === 'UGX' || currency === 'JPY' ? 0 : 2);
export function money(n: number, currency: string = 'UGX') {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits(currency),
    maximumFractionDigits: digits(currency),
  }).format(n);
}
export function formatDate(value: string) {
  return new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
export function lineTotal(item: Pick<LineItem, 'quantity' | 'price'>, currency: string) {
  return new Decimal(item.quantity)
    .mul(item.price)
    .toDecimalPlaces(digits(currency), Decimal.ROUND_HALF_UP)
    .toNumber();
}
export function totals(d: Pick<Invoice, 'items' | 'discount' | 'tax' | 'payments' | 'currency'>) {
  const round = (n: Decimal) => n.toDecimalPlaces(digits(d.currency), Decimal.ROUND_HALF_UP);
  const subtotal = d.items.reduce((a, i) => a.plus(lineTotal(i, d.currency)), new Decimal(0));
  const discount = round(subtotal.mul(d.discount).div(100));
  const tax = round(subtotal.minus(discount).mul(d.tax).div(100));
  const total = subtotal.minus(discount).plus(tax);
  const paid = d.payments.reduce((a, p) => a.plus(p.amount), new Decimal(0));
  return {
    subtotal: subtotal.toNumber(),
    discount: discount.toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
    paid: paid.toNumber(),
    balance: round(total.minus(paid)).toNumber(),
  };
}
export function statusOf(d: Invoice) {
  if (d.status === 'void' || d.status === 'draft') return d.status;
  if (d.kind === 'quotation') return 'issued';
  const t = totals(d);
  if (t.balance === 0) return 'paid';
  if (d.dueDate < today()) return 'overdue';
  if (t.paid > 0) return 'partial';
  return 'unpaid';
}
export const defaultCompany: Company = {
  name: 'I.T.Z METAL WORKS LTD',
  address: 'Bwaise, Opposite Total Ltd',
  email: 'mulumbakacm@gmail.com',
  phone: '0704758195',
  tin: '',
  paymentDetails: '',
  currency: 'UGX',
  terms: 'Payment due within 30 days.',
  notes: 'Thank you for choosing ITZ Engineering.',
};
export function emptyWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    company: { ...defaultCompany },
    clients: [],
    products: [],
    documents: [],
    expenses: [],
  };
}
export function nextNumber(w: Workspace, kind: Invoice['kind']) {
  const documentPrefix = kind === 'invoice' ? 'I-ITZ' : 'Q-ITZ';
  const year = today().slice(0, 4);
  const prefix = `${documentPrefix}-${year}-`;
  let highestSequence = 0n;
  for (const document of w.documents) {
    const number = document.number.toUpperCase();
    if (!number.startsWith(prefix)) continue;
    const sequence = number.slice(prefix.length);
    if (/^\d+$/.test(sequence)) {
      const value = BigInt(sequence);
      if (value > highestSequence) highestSequence = value;
    }
  }
  let nextSequence = highestSequence + 1n;
  let candidate = `${prefix}${nextSequence.toString().padStart(3, '0')}`;
  while (
    w.documents.some((document) => document.number.toLowerCase() === candidate.toLowerCase())
  ) {
    nextSequence++;
    candidate = `${prefix}${nextSequence.toString().padStart(3, '0')}`;
  }
  return candidate;
}
export function newDocument(w: Workspace, kind: Invoice['kind'] = 'invoice'): Invoice {
  return {
    id: uid(),
    number: nextNumber(w, kind),
    kind,
    status: 'draft',
    client: w.clients[0] || { id: uid(), name: '', email: '', phone: '', address: '', tin: '' },
    company: { ...w.company },
    project: '',
    issueDate: today(),
    dueDate: addDays(today(), 30),
    currency: w.company.currency,
    items: [{ id: uid(), description: '', measurement: '', quantity: 1, unit: 'pcs', price: 0 }],
    discount: 0,
    tax: 0,
    payments: [],
    notes: w.company.notes,
    terms: w.company.terms,
    template: 'industrial',
    font: 'sans',
    measurements: [],
    measurementPosition: 'after',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function demoWorkspace(): Workspace {
  const w = emptyWorkspace();
  w.clients = [
    {
      id: uid(),
      name: 'Kampala Design Co. (sample)',
      email: 'studio@example.com',
      phone: '',
      address: 'Kampala, Uganda',
      tin: '',
    },
    {
      id: uid(),
      name: 'Northside Residences (sample)',
      email: 'projects@example.com',
      phone: '',
      address: 'Wakiso, Uganda',
      tin: '',
    },
    {
      id: uid(),
      name: 'Makerere Workshop (sample)',
      email: 'workshop@example.com',
      phone: '',
      address: 'Kampala, Uganda',
      tin: '',
    },
  ];
  w.products = [
    {
      id: uid(),
      name: 'Steel section · 80 × 40 × 2 mm',
      description: 'Supply of rectangular hollow steel section',
      unit: 'pcs',
      price: 170000,
      currency: 'UGX',
    },
    {
      id: uid(),
      name: 'Steel section · 60 × 40 × 1.5 mm',
      description: 'Supply of rectangular hollow steel section',
      unit: 'pcs',
      price: 80000,
      currency: 'UGX',
    },
    {
      id: uid(),
      name: 'Fabrication & installation',
      description: 'Workshop fabrication and on-site installation',
      unit: 'job',
      price: 900000,
      currency: 'UGX',
    },
  ];
  for (let i = 0; i < 6; i++) {
    const d = newDocument(w, i === 5 ? 'quotation' : 'invoice');
    d.client = w.clients[i % 3];
    d.project = ['Window frames & installation', 'Residential entrance gate', 'Workshop steelwork'][
      i % 3
    ];
    d.issueDate = addDays(today(), -35 + i * 5);
    d.dueDate = addDays(d.issueDate, 30);
    d.items = w.products.map((p) => ({
      id: uid(),
      description: p.name,
      measurement: '',
      quantity: p.unit === 'pcs' ? (i + 1) * 2 : 1,
      unit: p.unit,
      price: p.price,
    }));
    d.status = i === 4 ? 'draft' : 'issued';
    if (i === 1 || i === 2)
      d.payments = [
        {
          id: uid(),
          date: addDays(today(), -i * 3),
          amount: totals(d).total,
          method: 'Bank transfer',
          reference: 'Sample payment',
        },
      ];
    if (i === 0)
      d.payments = [
        {
          id: uid(),
          date: addDays(today(), -4),
          amount: 500000,
          method: 'Mobile money',
          reference: 'Sample deposit',
        },
      ];
    w.documents.push(d);
  }
  w.expenses = [
    {
      id: uid(),
      description: 'Steel supplies (sample)',
      vendor: 'Sample supplier',
      category: 'Materials',
      date: addDays(today(), -5),
      amount: 760000,
      currency: 'UGX',
      reference: '',
    },
    {
      id: uid(),
      description: 'Site transport (sample)',
      vendor: 'Sample transporter',
      category: 'Transport',
      date: addDays(today(), -2),
      amount: 85000,
      currency: 'UGX',
      reference: '',
    },
  ];
  return w;
}
export function csv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v ?? '');
          if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
}
export function downloadFile(name: string, content: Blob | string, type = 'application/json') {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
