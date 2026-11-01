'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  X,
  Palette,
  Upload,
  Pencil,
} from 'lucide-react';
import {
  addDays,
  csv,
  currencies,
  demoWorkspace,
  downloadFile,
  emptyWorkspace,
  formatDate,
  money,
  newDocument,
  nextNumber,
  statusOf,
  templates,
  today,
  totals,
  uid,
  workspaceSchema,
  type Currency,
  type Invoice,
  type Workspace,
} from '@/lib/business';
import { createClient } from '@/lib/supabase/client';
import { Brand, Empty, Field, Modal, SectionTitle, Stat } from './ui';
import { DocumentView } from './document-view';
import { DocumentEditor } from './document-editor';
import { CompanyForm, RecordModal, type RecordForm } from './record-forms';

type Mode = 'local' | 'demo' | 'cloud';
type Page =
  | 'Overview'
  | 'Invoices'
  | 'Quotations'
  | 'Clients'
  | 'Item library'
  | 'Expenses'
  | 'Reports'
  | 'Templates'
  | 'Settings';
const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Invoices', icon: FileText },
  { label: 'Quotations', icon: BookOpen },
  { label: 'Clients', icon: Users },
  { label: 'Item library', icon: Package },
  { label: 'Expenses', icon: Wallet },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Templates', icon: Palette },
] as const;
const localKey = 'itz-studio-local-v1';
export function Studio() {
  const [w, setW] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('local');
  const [version, setVersion] = useState(0);
  const [user, setUser] = useState('');
  const [page, setPage] = useState<Page>('Overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [currency, setCurrency] = useState<Currency>('UGX');
  const [editor, setEditor] = useState<Invoice | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<RecordForm | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset' | 'update'>('signin');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [payment, setPayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [help, setHelp] = useState(false);
  const localSnapshot = useRef<string | null>(null);
  const localCorrupt = useRef(false);
  const selectedDoc = w.documents.find((d) => d.id === selected);
  const notify = (text: string, error = false) => setNotice({ text, error });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(localKey);
      localSnapshot.current = raw;
      if (raw) {
        const parsed = workspaceSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setW(parsed.data);
        else {
          localCorrupt.current = true;
          notify(
            'Saved local data could not be read. It has been left intact. Export a raw device backup in Settings, then restore a valid backup.',
            true,
          );
        }
      }
    } catch {
      localCorrupt.current = true;
      notify(
        'Browser storage is unavailable or unreadable. Do not rely on local saving until this is resolved.',
        true,
      );
    }
    setReady(true);
    const params = new URLSearchParams(window.location.search);
    if (params.has('recovery')) {
      setAuthMode('update');
      setAuthOpen(true);
    } else if (params.has('confirmed')) {
      setAuthMode('signin');
      setAuthOpen(true);
      setAuthError('Email confirmed. Sign in to open your workspace.');
    } else if (params.has('auth_error')) {
      setAuthOpen(true);
      setAuthError('This sign-in link is expired or invalid. Request a new link.');
    }
    if (params.has('recovery') || params.has('confirmed') || params.has('auth_error'))
      window.history.replaceState({}, '', window.location.pathname);
    const client = createClient();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update');
        setAuthOpen(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.error ? 15000 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (editor) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [editor]);
  const go = (p: Page) => {
    if (editor && !window.confirm('Leave the editor and discard unsaved changes?')) return;
    setEditor(null);
    setPage(p);
    setQuery('');
    setFilter('all');
    setMobile(false);
  };
  async function commit(next: Workspace, replacing = false) {
    if (savingRef.current) return false;
    const parsed = workspaceSchema.safeParse(next);
    if (!parsed.success) {
      notify(parsed.error.issues[0].message, true);
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (mode === 'cloud') {
        const res = await fetch('/api/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: parsed.data, version }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setVersion(body.version);
      } else if (mode === 'local') {
        const write = () => {
          if (localCorrupt.current && !replacing)
            throw new Error('Recover your unreadable local data in Settings before saving.');
          if (localStorage.getItem(localKey) !== localSnapshot.current)
            throw new Error(
              'Local records changed in another tab. Export a backup of this view, then reload before saving.',
            );
          const raw = JSON.stringify(parsed.data);
          if (new Blob([raw]).size > 5_000_000)
            throw new Error('Workspace exceeds 5 MB. Export an archive before adding more data.');
          localStorage.setItem(localKey, raw);
          localSnapshot.current = raw;
          localCorrupt.current = false;
        };
        if (navigator.locks) await navigator.locks.request(localKey, write);
        else write();
      }
      setW(parsed.data);
      notify(
        mode === 'cloud'
          ? 'Saved to your cloud workspace.'
          : mode === 'demo'
            ? 'Updated sample workspace.'
            : 'Saved on this device.',
      );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Save failed. Please try again.', true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function openCloud() {
    try {
      const auth = await createClient().auth.getUser();
      if (!auth.data.user) {
        setAuthOpen(true);
        return;
      }
      const res = await fetch('/api/workspace', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const next = body.data ? workspaceSchema.parse(body.data) : emptyWorkspace();
      setW(next);
      setVersion(body.version);
      setUser(auth.data.user.email || 'Signed in');
      setMode('cloud');
      setAuthOpen(false);
      notify('Cloud workspace opened. Local records remain separate.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not open cloud workspace.';
      notify(message, true);
      setAuthError(message);
    }
  }
  function openLocal() {
    try {
      const raw = localStorage.getItem(localKey);
      localSnapshot.current = raw;
      setW(raw ? workspaceSchema.parse(JSON.parse(raw)) : emptyWorkspace());
      setMode('local');
      go('Overview');
    } catch {
      notify('Could not read local data. Your stored data has been left intact.', true);
    }
  }
  const start = (kind: Invoice['kind'] = 'invoice', template?: Invoice['template']) =>
    setEditor({ ...newDocument(w, kind), ...(template ? { template } : {}) });
  async function saveDocument(d: Invoice) {
    return commit({
      ...w,
      documents: w.documents.some((x) => x.id === d.id)
        ? w.documents.map((x) => (x.id === d.id ? d : x))
        : [d, ...w.documents],
    });
  }
  function duplicate(d: Invoice, convert = false) {
    const kind = convert ? 'invoice' : d.kind;
    setSelected(null);
    setEditor({
      ...structuredClone(d),
      id: uid(),
      number: nextNumber(w, kind),
      kind,
      status: 'draft',
      issueDate: today(),
      dueDate: addDays(today(), 30),
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  async function pdf(d: Invoice) {
    try {
      const { exportPdf } = await import('@/lib/pdf');
      exportPdf(d);
    } catch {
      notify('PDF could not be generated. Please retry or use Print.', true);
    }
  }
  function exportCsv() {
    const docs = w.documents.filter((d) => d.currency === currency);
    downloadFile(
      'itz-documents-' + today() + '.csv',
      csv([
        [
          'Number',
          'Type',
          'Client',
          'Issue date',
          'Due date',
          'Status',
          'Currency',
          'Subtotal',
          'Discount',
          'Tax',
          'Total',
          'Paid',
          'Balance',
        ],
        ...docs.map((d) => {
          const t = totals(d);
          return [
            d.number,
            d.kind,
            d.client.name,
            d.issueDate,
            d.dueDate,
            statusOf(d),
            d.currency,
            t.subtotal,
            t.discount,
            t.tax,
            t.total,
            t.paid,
            t.balance,
          ];
        }),
      ]),
      'text/csv;charset=utf-8',
    );
  }
  const invoices = w.documents.filter(
    (d) => d.kind === 'invoice' && d.status === 'issued' && d.currency === currency,
  );
  const received = invoices.reduce((a, d) => a + totals(d).paid, 0);
  const outstanding = invoices.reduce((a, d) => a + totals(d).balance, 0);
  const overdue = invoices.filter((d) => statusOf(d) === 'overdue');
  const expenses = w.expenses
    .filter((e) => e.currency === currency)
    .reduce((a, e) => a + e.amount, 0);
  const filtered = w.documents
    .filter(
      (d) =>
        d.kind === (page === 'Quotations' ? 'quotation' : 'invoice') &&
        (filter === 'all' || statusOf(d) === filter) &&
        `${d.number} ${d.client.name} ${d.project}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt),
    );
  const currencySelect = (
    <select
      className="compact-select"
      aria-label="Reporting currency"
      value={currency}
      onChange={(e) => setCurrency(e.target.value as Currency)}
    >
      {currencies.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
  const documentTable = (docs: Invoice[], compact = false) => (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Document / client</th>
            {!compact && <th>Project</th>}
            <th>Due date</th>
            <th>Status</th>
            <th className="number">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="table-link" onClick={() => setSelected(d.id)}>
                  {d.number}
                </button>
                <small>{d.client.name}</small>
              </td>
              {!compact && <td>{d.project || '—'}</td>}
              <td>{formatDate(d.dueDate)}</td>
              <td>
                <span className={'badge ' + statusOf(d)}>
                  <span />
                  {statusOf(d)}
                </span>
              </td>
              <td className="number">
                <strong>{money(totals(d).total, d.currency)}</strong>
                <small>
                  {totals(d).paid > 0
                    ? money(totals(d).paid, d.currency) + ' paid'
                    : d.kind === 'quotation'
                      ? 'Estimate'
                      : 'Total amount'}
                </small>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open ${d.number}`}
                  onClick={() => setSelected(d.id)}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!ready)
    return (
      <main className="loading">
        <Brand />
        <p>Opening your workspace…</p>
      </main>
    );
  return (
    <div className={'app-shell ' + (sidebarCollapsed ? 'sidebar-collapsed' : '')}>
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <a
          href="#"
          className="brand-link"
          title="ITZ Engineering Business Studio"
          onClick={(e) => {
            e.preventDefault();
            go('Overview');
          }}
        >
          <Brand />
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">I</span>
          <div>
            <strong>ITZ Metal Works</strong>
            <small>Business workspace</small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              title={label}
              aria-label={label}
              className={page === label && !editor ? 'active' : ''}
              onClick={() => {
                go(label);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === 'Invoices' && w.documents.length > 0 && (
                <small>{w.documents.filter((d) => d.kind === 'invoice').length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="studio-note">
            <span className="little-cross">+</span>
            <strong>
              Made for the work
              <br />
              you’re proud of.
            </strong>
            <p>
              From the workshop
              <br />
              to the final invoice.
            </p>
            <div className="note-lines" />
          </div>
          <button
            title="Settings"
            aria-label="Settings"
            onClick={() => go('Settings')}
            className={page === 'Settings' ? 'active' : ''}
          >
            <Settings size={18} />
            Settings
          </button>
          <button
            title="Workspace guide"
            aria-label="Workspace guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
            Workspace guide
          </button>
          <div className="sidebar-footer">
            <span className="live-dot" />
            {mode === 'cloud'
              ? 'CLOUD WORKSPACE'
              : mode === 'demo'
                ? 'SAMPLE WORKSPACE'
                : 'LOCAL WORKSPACE'}
            <small>v1.0</small>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button sidebar-toggle"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{editor ? 'Document studio' : page}</strong>
          </div>
          <div className="topbar-right">
            <span className={'storage-state ' + (mode === 'demo' ? 'sample' : '')}>
              <span />
              {saving
                ? 'Saving…'
                : mode === 'cloud'
                  ? 'Cloud connected'
                  : mode === 'demo'
                    ? 'Sample data'
                    : 'Saved on this device'}
            </span>
            {mode === 'local' ? (
              <button className="button small" onClick={openCloud} disabled={!!editor || saving}>
                <Cloud size={15} />
                Connect cloud
              </button>
            ) : mode === 'demo' ? (
              <button className="button small" onClick={openLocal} disabled={!!editor || saving}>
                Exit sample workspace
              </button>
            ) : (
              <button
                className="icon-button"
                aria-label="Sign out of cloud"
                disabled={!!editor || saving}
                onClick={async () => {
                  const { error } = await createClient().auth.signOut();
                  if (error) notify(error.message, true);
                  else {
                    setUser('');
                    openLocal();
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            )}
            <div className="avatar" title={user || 'ITZ workspace'}>
              IT
            </div>
          </div>
        </header>
        {editor ? (
          <DocumentEditor
            initial={editor}
            workspace={w}
            onSave={saveDocument}
            onClose={() => setEditor(null)}
          />
        ) : (
          <main className="main-content">
            {mode === 'demo' && (
              <div className="demo-banner">
                <Sparkles size={16} />
                You’re exploring sample data. Your real local and cloud records are separate.
              </div>
            )}
            {page === 'Overview' && (
              <>
                <SectionTitle
                  eyebrow="THE BUSINESS, AT A GLANCE"
                  title="Good work. Clear numbers."
                  description="A little organisation. A lot more room to build."
                  actions={
                    <>
                      <button className="button" onClick={() => start('quotation')}>
                        New quotation
                      </button>
                      <button className="button primary" onClick={() => start()}>
                        <Plus size={17} />
                        Create invoice
                      </button>
                    </>
                  }
                />
                <div className="overview-hero">
                  <div>
                    <div className="hero-kicker">
                      <span /> YOUR WORKSHOP. YOUR WORKSPACE.
                    </div>
                    <h2>
                      Built with care.
                      <br />
                      Billed with confidence.
                    </h2>
                    <p>
                      Bring every project, payment and client
                      <br className="desktop-break" /> into one well-crafted workspace.
                    </p>
                    <button className="hero-link" onClick={() => start()}>
                      Let’s make your next invoice <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <div className="technical-art" aria-hidden="true">
                    <div className="art-grid" />
                    <div className="art-frame frame-one" />
                    <div className="art-frame frame-two" />
                    <div className="art-frame frame-three" />
                    <span className="dimension d-top">PRECISION / 001</span>
                    <span className="dimension d-bottom">ITZ ENGINEERING</span>
                    <div className="art-cross cross-one">+</div>
                    <div className="art-cross cross-two">+</div>
                    <div className="art-label">
                      <span>DESIGNED TO WORK.</span>
                      <b>ITZ</b>
                    </div>
                  </div>
                </div>
                <div className="row-heading">
                  <h2>Your financial snapshot</h2>
                  <div className="actions">
                    <span className="muted small-text">All time · currency specific</span>
                    {currencySelect}
                  </div>
                </div>
                <div className="stats-grid">
                  <Stat
                    label="Payments received"
                    value={money(received, currency)}
                    detail="Recorded invoice payments"
                    accent
                  />
                  <Stat
                    label="Awaiting payment"
                    value={money(outstanding, currency)}
                    detail={`${invoices.filter((d) => totals(d).balance > 0).length} open invoices`}
                  />
                  <Stat
                    label="Overdue"
                    value={money(
                      overdue.reduce((a, d) => a + totals(d).balance, 0),
                      currency,
                    )}
                    detail={`${overdue.length} invoices need a follow-up`}
                  />
                  <Stat
                    label="Expenses paid"
                    value={money(expenses, currency)}
                    detail="Materials, labour & running costs"
                  />
                </div>
                <div className="overview-lower">
                  <section className="panel recent-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Recent documents</h2>
                        <p>The latest from your workspace.</p>
                      </div>
                      <button className="text-button" onClick={() => go('Invoices')}>
                        View all <ArrowUpRight size={15} />
                      </button>
                    </div>
                    {w.documents.length ? (
                      documentTable(
                        [...w.documents]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .slice(0, 5),
                        true,
                      )
                    ) : (
                      <Empty
                        title="Your first invoice starts here"
                        description="Add a client, describe the work, and make it official."
                        action={
                          <button className="button primary" onClick={() => start()}>
                            <Plus size={16} />
                            Create an invoice
                          </button>
                        }
                      />
                    )}
                  </section>
                  <section className="panel quick-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Keep things moving</h2>
                        <p>A good next step.</p>
                      </div>
                    </div>
                    {[
                      {
                        icon: Users,
                        title: 'Build your client book',
                        sub: `${w.clients.length} saved clients`,
                        action: () => setRecordForm({ kind: 'client' }),
                      },
                      {
                        icon: Package,
                        title: 'Stock your item library',
                        sub: 'Reuse prices & specifications',
                        action: () => setRecordForm({ kind: 'product' }),
                      },
                      {
                        icon: Receipt,
                        title: 'Log a business expense',
                        sub: 'Keep the small costs in sight',
                        action: () => setRecordForm({ kind: 'expense' }),
                      },
                    ].map(({ icon: Icon, title, sub, action }) => (
                      <button className="quick-action" key={title} onClick={action}>
                        <span>
                          <Icon size={20} />
                        </span>
                        <div>
                          <strong>{title}</strong>
                          <small>{sub}</small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {mode === 'local' && (
                      <div className="sample-invite">
                        <Sparkles size={18} />
                        <p>Want to see the full picture?</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setW(demoWorkspace());
                            setMode('demo');
                          }}
                        >
                          Explore sample workspace <ArrowUpRight size={14} />
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
            {(page === 'Invoices' || page === 'Quotations') && (
              <>
                <SectionTitle
                  eyebrow="FROM GREAT WORK TO GETTING PAID"
                  title={page}
                  description={
                    page === 'Invoices'
                      ? 'Every invoice, from first draft to final payment.'
                      : 'Turn a considered estimate into your next project.'
                  }
                  actions={
                    <button
                      className="button primary"
                      onClick={() => start(page === 'Invoices' ? 'invoice' : 'quotation')}
                    >
                      <Plus size={17} />
                      New {page === 'Invoices' ? 'invoice' : 'quotation'}
                    </button>
                  }
                />
                <div className="panel">
                  <div className="list-toolbar">
                    <div className="filter-tabs">
                      {(page === 'Invoices'
                        ? ['all', 'draft', 'unpaid', 'partial', 'paid', 'overdue', 'void']
                        : ['all', 'draft', 'issued', 'void']
                      ).map((s) => (
                        <button
                          key={s}
                          className={filter === s ? 'active' : ''}
                          onClick={() => setFilter(s)}
                        >
                          {s === 'all' ? 'All documents' : s}
                        </button>
                      ))}
                    </div>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label="Search documents"
                        placeholder="Search documents…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {filtered.length ? (
                    documentTable(filtered)
                  ) : (
                    <Empty
                      title={
                        query || filter !== 'all'
                          ? 'No matching documents'
                          : 'A fresh page for your business'
                      }
                      description={
                        query || filter !== 'all'
                          ? 'Try a different search or status.'
                          : 'Create your first document and keep everything in one place.'
                      }
                      action={
                        !query && filter === 'all' ? (
                          <button
                            className="button primary"
                            onClick={() => start(page === 'Invoices' ? 'invoice' : 'quotation')}
                          >
                            Create {page === 'Invoices' ? 'invoice' : 'quotation'}
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                  <div className="table-footer">
                    {filtered.length} document{filtered.length !== 1 ? 's' : ''}
                    <span>Amounts shown in each document’s currency</span>
                  </div>
                </div>
              </>
            )}
            {(page === 'Clients' || page === 'Item library' || page === 'Expenses') && (
              <>
                <SectionTitle
                  eyebrow={
                    page === 'Clients'
                      ? 'GOOD BUSINESS IS PERSONAL'
                      : page === 'Item library'
                        ? 'YOUR KNOW-HOW, READY TO REUSE'
                        : 'KNOW WHERE IT GOES'
                  }
                  title={page}
                  description={
                    page === 'Clients'
                      ? 'Keep the people behind every project close.'
                      : page === 'Item library'
                        ? 'Materials, services and prices. Ready for the next job.'
                        : 'A simple, honest record of your business spending.'
                  }
                  actions={
                    <button
                      className="button primary"
                      onClick={() =>
                        setRecordForm({
                          kind:
                            page === 'Clients'
                              ? 'client'
                              : page === 'Item library'
                                ? 'product'
                                : 'expense',
                        })
                      }
                    >
                      <Plus size={17} />
                      Add{' '}
                      {page === 'Clients' ? 'client' : page === 'Item library' ? 'item' : 'expense'}
                    </button>
                  }
                />
                <div className="panel">
                  <div className="list-toolbar">
                    <h2>
                      {page === 'Clients'
                        ? 'Your client book'
                        : page === 'Item library'
                          ? 'Products & services'
                          : 'Expense ledger'}
                    </h2>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label={`Search ${page.toLowerCase()}`}
                        placeholder="Search…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {page === 'Clients' ? (
                    <div className="client-grid">
                      {w.clients
                        .filter((c) =>
                          `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
                        )
                        .map((c) => (
                          <div className="client-card" key={c.id}>
                            <div className="client-head">
                              <span className="client-avatar">
                                {c.name.slice(0, 2).toUpperCase()}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${c.name}`}
                                onClick={() => setRecordForm({ kind: 'client', record: c })}
                              >
                                <Pencil size={16} />
                              </button>
                            </div>
                            <h3>{c.name}</h3>
                            <p>{c.email || 'No email added'}</p>
                            <p>{c.phone || 'No phone added'}</p>
                            <p className="muted preserve">{c.address || 'No address added'}</p>
                            <div className="client-foot">
                              <span>
                                {w.documents.filter((d) => d.client.id === c.id).length} documents
                              </span>
                              <button
                                className="text-button"
                                onClick={() => setEditor({ ...newDocument(w), client: { ...c } })}
                              >
                                Create invoice <ArrowUpRight size={14} />
                              </button>
                              <button
                                className="icon-button danger"
                                aria-label={`Delete ${c.name}`}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Remove this client from your book? Existing documents keep their client details.',
                                    )
                                  )
                                    commit({
                                      ...w,
                                      clients: w.clients.filter((x) => x.id !== c.id),
                                    });
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      {!w.clients.filter((c) =>
                        `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
                      ).length && (
                        <Empty
                          title="No clients here yet"
                          description="Add your first client or adjust your search."
                        />
                      )}
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{page === 'Item library' ? 'Item / service' : 'Expense'}</th>
                            <th>{page === 'Item library' ? 'Specification' : 'Category / date'}</th>
                            <th className="number">
                              {page === 'Item library' ? 'Unit price' : 'Amount paid'}
                            </th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {page === 'Item library'
                            ? w.products
                                .filter((p) =>
                                  `${p.name} ${p.description}`
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                                )
                                .map((p) => (
                                  <tr key={p.id}>
                                    <td>
                                      <strong>{p.name}</strong>
                                      <small>Per {p.unit}</small>
                                    </td>
                                    <td>{p.description || '—'}</td>
                                    <td className="number">{money(p.price, p.currency)}</td>
                                    <td>
                                      <div className="actions">
                                        <button
                                          className="icon-button"
                                          aria-label={`Edit ${p.name}`}
                                          onClick={() =>
                                            setRecordForm({ kind: 'product', record: p })
                                          }
                                        >
                                          <Pencil size={16} />
                                        </button>
                                        <button
                                          className="icon-button danger"
                                          aria-label={`Delete ${p.name}`}
                                          onClick={() => {
                                            if (
                                              window.confirm(
                                                'Remove this library item? Existing invoice lines are preserved.',
                                              )
                                            )
                                              commit({
                                                ...w,
                                                products: w.products.filter((x) => x.id !== p.id),
                                              });
                                          }}
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                            : w.expenses
                                .filter((e) =>
                                  `${e.description} ${e.vendor} ${e.category}`
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                                )
                                .sort((a, b) => b.date.localeCompare(a.date))
                                .map((e) => (
                                  <tr key={e.id}>
                                    <td>
                                      <strong>{e.description}</strong>
                                      <small>
                                        {e.vendor || 'No supplier'}
                                        {e.reference && ' · ' + e.reference}
                                      </small>
                                    </td>
                                    <td>
                                      {e.category}
                                      <small>{formatDate(e.date)}</small>
                                    </td>
                                    <td className="number">{money(e.amount, e.currency)}</td>
                                    <td>
                                      <div className="actions">
                                        <button
                                          className="icon-button"
                                          aria-label={`Edit ${e.description}`}
                                          onClick={() =>
                                            setRecordForm({ kind: 'expense', record: e })
                                          }
                                        >
                                          <Pencil size={16} />
                                        </button>
                                        <button
                                          className="icon-button danger"
                                          aria-label={`Delete ${e.description}`}
                                          onClick={() => {
                                            if (window.confirm('Delete this expense record?'))
                                              commit({
                                                ...w,
                                                expenses: w.expenses.filter((x) => x.id !== e.id),
                                              });
                                          }}
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                        </tbody>
                      </table>
                      {(page === 'Item library' ? w.products : w.expenses).length === 0 && (
                        <Empty
                          title={
                            page === 'Item library'
                              ? 'Your expertise belongs here'
                              : 'Start with the small things'
                          }
                          description={
                            page === 'Item library'
                              ? 'Save materials and services to add them to invoices in one click.'
                              : 'Record your first paid expense to begin tracking costs.'
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {page === 'Reports' && (
              <>
                <SectionTitle
                  eyebrow="A CLEARER VIEW OF THE BUSINESS"
                  title="Follow the money."
                  description="Recorded cash movement, grouped by currency. No exchange-rate assumptions."
                  actions={
                    <>
                      {currencySelect}
                      <button className="button" onClick={exportCsv}>
                        <Download size={16} />
                        Export documents CSV
                      </button>
                    </>
                  }
                />
                <div className="stats-grid">
                  <Stat
                    label="Cash received"
                    value={money(received, currency)}
                    detail="All recorded invoice payments"
                    accent
                  />
                  <Stat
                    label="Expenses paid"
                    value={money(expenses, currency)}
                    detail="All recorded cash expenses"
                  />
                  <Stat
                    label="Net cash movement"
                    value={money(received - expenses, currency)}
                    detail="Payments received less expenses"
                  />
                  <Stat
                    label="Receivables"
                    value={money(outstanding, currency)}
                    detail="Issued invoices still outstanding"
                  />
                </div>
                <div className="reports-grid">
                  <div className="panel report-panel">
                    <h2>The last six months</h2>
                    <p className="muted">Payments received and expenses paid · {currency}</p>
                    <CashChart workspace={w} currency={currency} />
                  </div>
                  <div className="panel report-panel">
                    <h2>Spending by category</h2>
                    <p className="muted">All time · {currency}</p>
                    {['Materials', 'Labour', 'Transport', 'Equipment', 'Utilities', 'Other'].map(
                      (c) => {
                        const n = w.expenses
                          .filter((e) => e.currency === currency && e.category === c)
                          .reduce((a, e) => a + e.amount, 0);
                        return (
                          <div className="category-row" key={c}>
                            <div>
                              <span>{c}</span>
                              <strong>{money(n, currency)}</strong>
                            </div>
                            <div className="meter">
                              <span
                                style={{ width: (expenses ? (n / expenses) * 100 : 0) + '%' }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Needs a follow-up</h2>
                      <p>Overdue balances in {currency}.</p>
                    </div>
                  </div>
                  {overdue.length ? (
                    documentTable(overdue)
                  ) : (
                    <Empty
                      title="Nothing overdue"
                      description="There are no overdue issued invoices in this currency."
                    />
                  )}
                </div>
                <p className="report-footnote">
                  This is a cash overview, not a statutory profit-and-loss statement. Drafts,
                  quotations and void documents are excluded. Tax is included in invoice totals.
                </p>
              </>
            )}
            {page === 'Templates' && (
              <>
                <SectionTitle
                  eyebrow="A SIGNATURE FOR YOUR BUSINESS"
                  title="Great work. Beautifully presented."
                  description="Considered layouts for every kind of project. All unmistakably ITZ."
                />
                <div className="template-gallery">
                  {templates.map((t, i) => (
                    <button
                      className="gallery-card"
                      key={t.id}
                      onClick={() => start('invoice', t.id)}
                    >
                      <div
                        className={'gallery-preview mini-' + t.id}
                        style={{ '--template-color': t.color } as React.CSSProperties}
                      >
                        <div className="gallery-page">
                          <div className="gallery-page-header">
                            <b>ITZ</b>
                            <strong>INVOICE</strong>
                          </div>
                          <div className="gallery-rule" />
                          <div className="gallery-parties">
                            <span>
                              PREPARED FOR
                              <br />
                              <b>Your next client</b>
                              <i />
                              <i />
                            </span>
                            <span>
                              ISSUED
                              <br />
                              <b>With care.</b>
                              <i />
                              <i />
                            </span>
                          </div>
                          <div className="gallery-table">
                            <span>DESCRIPTION</span>
                            <span>QTY</span>
                            <span>AMOUNT</span>
                          </div>
                          {[0, 1, 2].map((n) => (
                            <div key={n} className="gallery-line">
                              <i />
                              <i />
                              <i />
                            </div>
                          ))}
                          <div className="gallery-total">
                            TOTAL <b>UGX 0</b>
                          </div>
                          <div className="gallery-thanks">
                            Thank you for choosing ITZ Engineering.
                          </div>
                        </div>
                      </div>
                      <div className="gallery-caption">
                        <span>
                          0{i + 1} / {t.name}
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <p>{t.description}</p>
                    </button>
                  ))}
                </div>
                <div className="template-note">
                  <Palette size={23} />
                  <div>
                    <h3>Make the details yours.</h3>
                    <p>
                      Choose modern sans, classic serif or technical mono in the editor. Every
                      template supports itemised pricing, tax, payments and measurement schedules.
                    </p>
                  </div>
                </div>
              </>
            )}
            {page === 'Settings' && (
              <>
                <SectionTitle
                  eyebrow="THE DETAILS THAT MAKE IT YOURS"
                  title="Business settings"
                  description="Your identity, payment instructions and workspace data."
                />
                <div className="settings-grid">
                  <CompanyForm
                    key={mode}
                    company={w.company}
                    onSave={(company) => commit({ ...w, company })}
                  />
                  <div className="settings-side">
                    <section className="panel">
                      <Cloud size={26} className="blue-icon" />
                      <h2>Your workspace</h2>
                      <p className="muted">
                        {mode === 'cloud'
                          ? `Signed in as ${user}. Changes save to Supabase.`
                          : mode === 'demo'
                            ? 'You are exploring temporary sample data.'
                            : 'Local mode saves to this browser on this device. Back up regularly or connect your cloud account.'}
                      </p>
                      {mode !== 'cloud' && (
                        <button className="button primary" onClick={openCloud}>
                          Connect Supabase account
                        </button>
                      )}
                      <p className="small-text muted">
                        Cloud mode requires the included database migration. Each account owns a
                        private business workspace.
                      </p>
                    </section>
                    <section className="panel">
                      <Download size={25} className="blue-icon" />
                      <h2>Backups & portability</h2>
                      <p className="muted">
                        Export all business data as JSON. Restore a validated backup when you need
                        it.
                      </p>
                      <div className="stack-actions">
                        {localCorrupt.current && (
                          <button
                            className="button"
                            onClick={() => {
                              try {
                                downloadFile(
                                  'itz-raw-device-backup.txt',
                                  localStorage.getItem(localKey) || '',
                                  'text/plain',
                                );
                              } catch {
                                notify('Browser storage cannot be read.', true);
                              }
                            }}
                          >
                            Export raw device backup
                          </button>
                        )}
                        <button
                          className="button"
                          onClick={() =>
                            downloadFile(
                              'itz-backup-' + today() + '.json',
                              JSON.stringify(w, null, 2),
                            )
                          }
                        >
                          <Download size={16} />
                          Export workspace backup
                        </button>
                        <button className="button" onClick={() => importRef.current?.click()}>
                          <Upload size={16} />
                          Restore JSON backup
                        </button>
                        <button className="button" onClick={exportCsv}>
                          <FileText size={16} />
                          Export documents ({currency})
                        </button>
                        <button
                          className="button"
                          onClick={() =>
                            downloadFile(
                              'itz-expenses-' + today() + '.csv',
                              csv([
                                [
                                  'Date',
                                  'Description',
                                  'Vendor',
                                  'Category',
                                  'Amount',
                                  'Currency',
                                  'Reference',
                                ],
                                ...w.expenses.map((e) => [
                                  e.date,
                                  e.description,
                                  e.vendor,
                                  e.category,
                                  e.amount,
                                  e.currency,
                                  e.reference,
                                ]),
                              ]),
                              'text/csv;charset=utf-8',
                            )
                          }
                        >
                          <Receipt size={16} />
                          Export expenses CSV
                        </button>
                      </div>
                      <input
                        ref={importRef}
                        hidden
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          if (file.size > 5_000_000) {
                            notify('Backup is larger than 5 MB.', true);
                            return;
                          }
                          try {
                            const next = workspaceSchema.parse(JSON.parse(await file.text()));
                            if (
                              window.confirm(
                                `Replace this ${mode} workspace with ${next.documents.length} documents, ${next.clients.length} clients and ${next.expenses.length} expenses? Export your current backup first.`,
                              )
                            )
                              await commit(next, true);
                          } catch {
                            notify(
                              'This is not a valid ITZ Studio backup. Nothing was changed.',
                              true,
                            );
                          }
                        }}
                      />
                    </section>
                    <section className="panel">
                      <h2>About this studio</h2>
                      <p className="muted">
                        Crafted for ITZ Engineering and I.T.Z Metal Works Ltd. A focused workspace
                        for quotations, invoicing and everyday business records.
                      </p>
                      <span className="badge issued">Version 1.0</span>
                    </section>
                  </div>
                </div>
              </>
            )}
            <footer className="app-footer">
              <span>
                ITZ ENGINEERING <span className="footer-dot">/</span> BUILT FOR THE BUSINESS OF
                MAKING.
              </span>
              <span>{new Date().getFullYear()} · Business Studio</span>
            </footer>
          </main>
        )}
      </div>
      {notice && (
        <div
          className={'toast ' + (notice.error ? 'toast-error' : '')}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.error ? <CircleHelp size={18} /> : <Check size={18} />}</span>
          <p>{notice.text}</p>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {recordForm && (
        <RecordModal
          form={recordForm}
          workspace={w}
          onSave={commit}
          onClose={() => setRecordForm(null)}
        />
      )}
      {selectedDoc && (
        <Modal
          wide
          title={`${selectedDoc.number} · ${selectedDoc.client.name}`}
          onClose={() => {
            setSelected(null);
            setPayment(false);
          }}
        >
          <div className="document-actions">
            <span className={'badge ' + statusOf(selectedDoc)}>{statusOf(selectedDoc)}</span>
            <div className="actions">
              <button className="button" onClick={() => pdf(selectedDoc)}>
                <Download size={16} />
                Download PDF
              </button>
              <button className="button" onClick={() => window.print()}>
                <Printer size={16} />
                Print
              </button>
              {selectedDoc.client.email && (
                <a
                  className="button"
                  href={`mailto:${encodeURIComponent(selectedDoc.client.email)}?subject=${encodeURIComponent(selectedDoc.number + ' · ' + selectedDoc.company.name)}&body=${encodeURIComponent(`Hello ${selectedDoc.client.name},\n\nPlease find ${selectedDoc.kind} ${selectedDoc.number} for ${money(totals(selectedDoc).total, selectedDoc.currency)}.\n\nDue: ${formatDate(selectedDoc.dueDate)}\n\n${selectedDoc.company.name}\n${selectedDoc.company.phone}\n\n[Attach the downloaded PDF before sending.]`)}`}
                >
                  <Mail size={16} />
                  Email draft
                </a>
              )}
              <button className="button" onClick={() => duplicate(selectedDoc)}>
                <Copy size={16} />
                Duplicate
              </button>
              {selectedDoc.kind === 'quotation' && selectedDoc.status !== 'void' && (
                <button className="button primary" onClick={() => duplicate(selectedDoc, true)}>
                  Convert to invoice
                </button>
              )}
              {selectedDoc.status === 'draft' && (
                <button
                  className="button primary"
                  onClick={() => {
                    setEditor(selectedDoc);
                    setSelected(null);
                  }}
                >
                  Edit draft
                </button>
              )}
              {selectedDoc.kind === 'invoice' &&
                selectedDoc.status === 'issued' &&
                totals(selectedDoc).balance > 0 && (
                  <button className="button primary" onClick={() => setPayment(!payment)}>
                    <Plus size={16} />
                    Record payment
                  </button>
                )}
            </div>
          </div>
          {notice?.error && (
            <p className="error" role="alert">
              {notice.text}
            </p>
          )}
          {payment && (
            <form
              className="payment-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const amount = Number(f.get('amount'));
                if (amount <= 0 || amount > totals(selectedDoc).balance) {
                  notify('Payment must be positive and no more than the balance.', true);
                  return;
                }
                if (
                  await saveDocument({
                    ...selectedDoc,
                    payments: [
                      ...selectedDoc.payments,
                      {
                        id: uid(),
                        amount,
                        date: String(f.get('date')),
                        method: String(f.get('method')),
                        reference: String(f.get('reference')),
                      },
                    ],
                    updatedAt: new Date().toISOString(),
                  })
                )
                  setPayment(false);
              }}
            >
              <h3>Record a received payment</h3>
              <div className="form-grid">
                <Field label={`Amount (${selectedDoc.currency})`}>
                  <input
                    name="amount"
                    type="number"
                    min={['UGX', 'JPY'].includes(selectedDoc.currency) ? 1 : 0.01}
                    max={totals(selectedDoc).balance}
                    step={['UGX', 'JPY'].includes(selectedDoc.currency) ? 1 : 0.01}
                    required
                    defaultValue={totals(selectedDoc).balance}
                  />
                </Field>
                <Field label="Payment date">
                  <input name="date" type="date" max={today()} required defaultValue={today()} />
                </Field>
                <Field label="Payment method">
                  <select name="method">
                    <option>Bank transfer</option>
                    <option>Mobile money</option>
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Reference">
                  <input name="reference" placeholder="Transaction or receipt reference" />
                </Field>
              </div>
              <button className="button primary" disabled={saving}>
                Save payment
              </button>
              <p className="muted small-text">
                This records money already received; it does not charge the client.
              </p>
            </form>
          )}
          <div className="full-preview print-area">
            <DocumentView doc={selectedDoc} />
          </div>
          <div className="document-management">
            {selectedDoc.status === 'draft' ? (
              <button
                className="button danger"
                onClick={async () => {
                  if (
                    window.confirm('Delete this draft permanently?') &&
                    (await commit({
                      ...w,
                      documents: w.documents.filter((d) => d.id !== selectedDoc.id),
                    }))
                  )
                    setSelected(null);
                }}
              >
                <Trash2 size={16} />
                Delete draft
              </button>
            ) : selectedDoc.status === 'issued' && selectedDoc.payments.length === 0 ? (
              <button
                className="button danger"
                onClick={async () => {
                  if (
                    window.confirm(
                      'Void this document? It will remain in your records and be excluded from reports.',
                    )
                  )
                    await saveDocument({
                      ...selectedDoc,
                      status: 'void',
                      updatedAt: new Date().toISOString(),
                    });
                }}
              >
                Void document
              </button>
            ) : (
              <p className="muted">
                Issued documents remain in your records. Duplicate to create a revised draft.
              </p>
            )}
            {selectedDoc.payments.length > 0 && (
              <details>
                <summary>Correct a payment record</summary>
                <p className="muted">Remove a mistaken entry, then record the correct payment.</p>
                {selectedDoc.payments.map((p) => (
                  <div className="payment-entry" key={p.id}>
                    <span>
                      {formatDate(p.date)} · {p.method} · {money(p.amount, selectedDoc.currency)}
                    </span>
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (
                          window.confirm('Remove this payment entry? This does not refund money.')
                        )
                          saveDocument({
                            ...selectedDoc,
                            payments: selectedDoc.payments.filter((x) => x.id !== p.id),
                            updatedAt: new Date().toISOString(),
                          });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>
        </Modal>
      )}
      {authOpen && (
        <Modal
          title={
            authMode === 'signup'
              ? 'Create your cloud account'
              : authMode === 'reset'
                ? 'Reset your password'
                : authMode === 'update'
                  ? 'Choose a new password'
                  : 'Open your cloud workspace'
          }
          onClose={() => {
            setAuthOpen(false);
            setAuthError('');
          }}
        >
          <form
            className="modal-body auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthBusy(true);
              setAuthError('');
              const f = new FormData(e.currentTarget);
              const email = String(f.get('email') || '');
              const password = String(f.get('password') || '');
              try {
                const client = createClient();
                if (authMode === 'reset') {
                  const { error } = await client.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/auth/callback?recovery=1',
                  });
                  if (error) throw error;
                  setAuthError('If that account exists, a password reset link has been sent.');
                } else if (authMode === 'update') {
                  const { error } = await client.auth.updateUser({ password });
                  if (error) throw error;
                  setAuthMode('signin');
                  setAuthError('Password updated. Sign in to open your workspace.');
                } else if (authMode === 'signup') {
                  const { data, error } = await client.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: window.location.origin + '/auth/callback' },
                  });
                  if (error) throw error;
                  if (data.session) await openCloud();
                  else setAuthError('Check your email to confirm your account, then sign in here.');
                } else {
                  const { error } = await client.auth.signInWithPassword({ email, password });
                  if (error) throw error;
                  await openCloud();
                }
              } catch (e) {
                setAuthError(e instanceof Error ? e.message : 'Authentication failed.');
              } finally {
                setAuthBusy(false);
              }
            }}
          >
            <div className="auth-symbol">
              <Cloud size={28} />
            </div>
            <p className="muted">
              A private workspace for your business, available across your devices. Local records
              stay separate; use backup and restore to transfer them.
            </p>
            {authMode !== 'update' && (
              <Field label="Email address">
                <input name="email" type="email" autoComplete="email" required />
              </Field>
            )}
            {authMode !== 'reset' && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  minLength={authMode === 'signin' ? 1 : 12}
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  required
                />
              </Field>
            )}
            {authError && (
              <p className="auth-message" role="status">
                {authError}
              </p>
            )}
            <button className="button primary" disabled={authBusy}>
              {authBusy
                ? 'Please wait…'
                : authMode === 'signin'
                  ? 'Sign in'
                  : authMode === 'signup'
                    ? 'Create account'
                    : authMode === 'reset'
                      ? 'Send reset link'
                      : 'Update password'}
            </button>
            <div className="auth-links">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
                  setAuthError('');
                }}
              >
                {authMode === 'signup' ? 'Already registered? Sign in' : 'Create an account'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setAuthMode(authMode === 'reset' ? 'signin' : 'reset');
                  setAuthError('');
                }}
              >
                {authMode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {help && (
        <Modal title="A little guide to your workspace" onClose={() => setHelp(false)}>
          <div className="modal-body guide">
            <h3>1. Make it yours</h3>
            <p>
              Check your business name, contact details, currency and payment instructions in
              Settings.
            </p>
            <h3>2. Bring the work together</h3>
            <p>
              Save clients and reusable materials or services. Create an invoice or quotation, add
              quantities and prices, then customise its template, typeface and measurement tables.
            </p>
            <h3>3. Review, issue, export</h3>
            <p>
              Save drafts while you work. Issue a document when it is ready. Download a PDF or print
              it. Email draft opens your mail app; attach the PDF before sending.
            </p>
            <h3>4. Keep track of payments</h3>
            <p>
              Record deposits and final payments against issued invoices. Status and balances update
              automatically. Add paid expenses to see net cash movement in Reports.
            </p>
            <h3>5. Keep your records safe</h3>
            <p>
              Local mode stores data only in this browser. Export JSON backups in Settings. Cloud
              mode uses your private Supabase account after the included migration has been applied.
              Sample mode is separate and temporary.
            </p>
            <h3>Document integrity</h3>
            <p>
              Issued documents keep their original business and client details. Duplicate to revise
              them; void unpaid documents when necessary. Quotations are excluded from receivables.
              Tax defaults to zero and is set per document.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function CashChart({ workspace, currency }: { workspace: Workspace; currency: Currency }) {
  const base = new Date(today() + 'T12:00:00Z');
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 5 + i, 1));
    const key = date.toISOString().slice(0, 7);
    const incoming = workspace.documents
      .filter((d) => d.kind === 'invoice' && d.status === 'issued' && d.currency === currency)
      .flatMap((d) => d.payments)
      .filter((p) => p.date.startsWith(key))
      .reduce((a, p) => a + p.amount, 0);
    const outgoing = workspace.expenses
      .filter((e) => e.currency === currency && e.date.startsWith(key))
      .reduce((a, e) => a + e.amount, 0);
    return {
      key,
      label: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      incoming,
      outgoing,
    };
  });
  const max = Math.max(1, ...months.flatMap((m) => [m.incoming, m.outgoing]));
  return (
    <>
      <div
        className="cash-chart"
        role="img"
        aria-label={`Cash received and expenses paid for the last six months in ${currency}`}
      >
        <div className="chart-grid" />
        {months.map((m) => (
          <div className="month-bars" key={m.key}>
            <div className="bar-pair">
              <div
                className="bar incoming"
                style={{ height: Math.max(m.incoming ? 2 : 0, (m.incoming / max) * 100) + '%' }}
                title={`${m.label} received: ${money(m.incoming, currency)}`}
              />
              <div
                className="bar outgoing"
                style={{ height: Math.max(m.outgoing ? 2 : 0, (m.outgoing / max) * 100) + '%' }}
                title={`${m.label} expenses: ${money(m.outgoing, currency)}`}
              />
            </div>
            <span>{m.label}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i />
          Received
        </span>
        <span>
          <i />
          Expenses
        </span>
      </div>
      <details className="chart-data">
        <summary>View exact figures</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Received</th>
              <th>Expenses</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <td>{m.key}</td>
                <td>{money(m.incoming, currency)}</td>
                <td>{money(m.outgoing, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
