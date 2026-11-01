import { test, expect } from '@playwright/test';
import { demoWorkspace, templates } from '../../src/lib/business';

for (const template of templates) {
  test(`${template.name} template prints with the complete document`, async ({ page }) => {
    const w = demoWorkspace();
    const doc = w.documents[0];
    doc.template = template.id;
    doc.font =
      template.id === 'editorial' ? 'serif' : template.id === 'blueprint' ? 'mono' : 'sans';
    await page.addInitScript(
      (data) => localStorage.setItem('itz-studio-local-v1', JSON.stringify(data)),
      w,
    );
    await page.goto('/');
    await page.getByRole('button', { name: /^Invoices/ }).click();
    await page.getByRole('button', { name: /^INV-.*001$/ }).click();
    await expect(page.locator('dialog .document')).toHaveClass(
      new RegExp('template-' + template.id),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: `test-results/print-${template.id}.pdf`,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.screenshot({ path: `test-results/template-${template.id}.png` });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await (await download).saveAs(`test-results/export-${template.id}.pdf`);
  });
}
