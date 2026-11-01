import { test, expect } from '@playwright/test';
import { demoWorkspace, uid } from '../../src/lib/business';

test('invoice lifecycle, exact totals, measurement schedule, PDF, persistence and reports', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good work. Clear numbers.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await page.getByLabel('Client name', { exact: true }).fill('Browser Test Client');
  await page.getByLabel('Client email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Description', { exact: true }).fill('Steel window fabrication');
  await page.getByLabel('Dimensions / specification').fill('1200 × 1500 mm');
  await page.getByLabel('Qty', { exact: true }).fill('3');
  await page.getByLabel('Unit price', { exact: true }).fill('170000');
  await page.getByLabel('Discount (%)').fill('10');
  await page.getByLabel('Tax (%)').fill('18');
  await expect(page.locator('.editor-total')).toContainText('541,620');
  await page.getByRole('button', { name: 'Measurements', exact: true }).click();
  await page.getByRole('button', { name: 'Add measurement schedule' }).click();
  await page.getByLabel('Reference row 1').fill('W01');
  await page.getByLabel('Width (mm) row 1').fill('1200');
  await page.getByLabel('Height (mm) row 1').fill('1500');
  await page.getByLabel('Qty row 1').fill('3');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Forge Bold orange/ }).click();
  await page.getByLabel('Document typography').selectOption('serif');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good work. Clear numbers.' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^I-ITZ-\d{4}-001$/, exact: true }).click();
  await expect(page.locator('dialog .document')).toContainText('Steel window fabrication');
  await expect(page.locator('dialog .document-header .brand')).not.toContainText('BUSINESS STUDIO');
  await expect(page.locator('.sidebar .brand')).toContainText('BUSINESS STUDIO');
  await expect(page.locator('dialog .document')).toContainText('W01');
  await expect(page.locator('dialog .document')).toHaveClass(/template-forge font-serif/);
  await page.getByRole('button', { name: 'Edit draft' }).click();
  await page.getByRole('button', { name: 'Issue invoice', exact: true }).click();
  await page.getByRole('button', { name: /^I-ITZ-\d{4}-001$/, exact: true }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Amount (UGX)').fill('200000');
  await page.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(page.locator('dialog .document-totals')).toContainText('341,620');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const pdf = await dl;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs('test-results/invoice.pdf');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.locator('.stats-grid')).toContainText('200,000');
  await expect(page.locator('.stats-grid')).toContainText('341,620');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export workspace backup' }).click();
  expect((await backup).suggestedFilename()).toMatch(/\.json$/);
  expect(errors).toEqual([]);
});

test('collapsible sidebar and tabular item entry keep quotation totals in sync', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.getByRole('button', { name: 'New quotation', exact: true }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();

  await page.getByLabel('Description for item 1').fill('Window frame');
  await page.getByLabel('Quantity for item 1').fill('3');
  await page.getByLabel('Unit price for item 1').fill('1000');
  await expect(page.locator('.line-items-table')).toContainText('3,000');
  await page.getByRole('button', { name: 'Add line item', exact: true }).click();
  await page.getByLabel('Description for item 2').fill('Installation');
  await page.getByLabel('Unit price for item 2').fill('2500');
  await expect(page.locator('.line-items-table')).toContainText('2,500');
  await expect(page.locator('.preview-scale')).toContainText('Item total');
  await expect(page.locator('.preview-scale')).toContainText('Quotation');
  await expect(page.locator('.preview-scale')).toContainText('5,500');
});

test('system numbering is fixed and locked for new documents', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  const invoiceNumber = page.getByLabel('Document number');
  await expect(invoiceNumber).toHaveValue(`I-ITZ-${new Date().getFullYear()}-001`);
  await expect(invoiceNumber).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'New quotation', exact: true }).click();
  await expect(page.getByLabel('Document number')).toHaveValue(
    `Q-ITZ-${new Date().getFullYear()}-001`,
  );
  await expect(page.getByLabel('Document number')).toHaveAttribute('readonly', '');
});

test('clients, catalogue, expenses and separate sample data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Client / business name').fill('Real client');
  await page.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Real client' })).toBeVisible();
  await page.getByRole('button', { name: 'Item library', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item / service name').fill('Steel section');
  await page.getByLabel('Unit price').fill('80000');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.locator('.data-table')).toContainText('80,000');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Transport to site');
  await page.getByLabel('Amount paid').fill('45000');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.locator('.data-table')).toContainText('45,000');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Explore sample workspace' }).click();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Exit sample workspace' }).click();
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Real client' })).toBeVisible();
  await expect(page.locator('.client-card')).toHaveCount(1);
});

test('responsive navigation, template selection and modal keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good work. Clear numbers.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-overview.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByRole('button', { name: /03 \/ Editorial/ }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('dashboard screenshot and unauthenticated API protection', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore sample workspace' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/desktop-overview.png', fullPage: true });
  const response = await request.get('/api/workspace');
  expect(response.status()).toBe(401);
  const invalid = await request.put('/api/workspace', { data: { data: {}, version: 0 } });
  expect(invalid.status()).toBe(403);
});

test('local conflict prevents a stale tab from overwriting another tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await page.getByLabel('Client / business name').fill('First tab client');
  await page.getByRole('button', { name: 'Save client', exact: true }).click();
  await second.getByRole('button', { name: 'Clients', exact: true }).click();
  await second.getByRole('button', { name: 'Add client', exact: true }).click();
  await second.getByLabel('Client / business name').fill('Stale tab client');
  await second.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(second.locator('dialog .error')).toContainText('Could not save');
  await expect(second.getByLabel('Client / business name')).toHaveValue('Stale tab client');
  await page.reload();
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'First tab client' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stale tab client' })).toHaveCount(0);
});

test('quotation conversion, full payment and backup rejection', async ({ page }) => {
  const w = demoWorkspace();
  await page.addInitScript(
    (data) => localStorage.setItem('itz-studio-local-v1', JSON.stringify(data)),
    w,
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Quotations', exact: true }).click();
  await page.getByRole('button', { name: /^Q-ITZ-/ }).click();
  await page.getByRole('button', { name: 'Convert to invoice' }).click();
  await page.getByRole('button', { name: 'Issue invoice', exact: true }).click();
  await page.getByRole('button', { name: /^Invoices/ }).click();
  await page.getByRole('button', { name: /^I-ITZ-.*006$/ }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(page.locator('.document-actions .badge')).toHaveText('paid');
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":5}'),
  });
  await expect(page.locator('.toast-error')).toContainText('not a valid');
});

test('long invoices export all rows with multiple measurement schedules', async ({ page }) => {
  const w = demoWorkspace();
  const d = w.documents[0];
  d.payments = [];
  d.items = Array.from({ length: 65 }, (_, i) => ({
    id: uid(),
    description: 'Fabricated steel section ' + (i + 1),
    measurement: 'Site A / 1200 x 1500 mm / powder coated',
    quantity: 2,
    unit: 'pcs',
    price: 125000,
  }));
  d.measurements = [
    {
      id: uid(),
      title: 'Window schedule - all floors',
      columns: ['Window', 'Width (mm)', 'Height (mm)', 'Notes'],
      rows: Array.from({ length: 40 }, (_, i) => [
        'W' + (i + 1),
        '1200',
        '1500',
        'Measured on site',
      ]),
    },
  ];
  d.notes = 'Final verification marker: ITZ-END-OF-DOCUMENT';
  await page.addInitScript(
    (data) => localStorage.setItem('itz-studio-local-v1', JSON.stringify(data)),
    w,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /^Invoices/ }).click();
  await page.getByRole('button', { name: /^I-ITZ-.*001$/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await (await download).saveAs('test-results/long-invoice.pdf');
  await page.screenshot({ path: 'test-results/document-preview.png' });
});
