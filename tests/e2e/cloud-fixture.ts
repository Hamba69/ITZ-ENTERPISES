import type { BrowserContext, Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../../src/lib/business';
export async function mockCloud(
  target: BrowserContext | Page,
  initial: Workspace = emptyWorkspace(),
) {
  let data = initial;
  let version = 1;
  await target.route('**/api/client-links', (route) =>
    route.fulfill({ json: { links: [], galleries: [], comments: [], media: [] } }),
  );
  await target.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data, version } });
    const body = route.request().postDataJSON();
    if (body.version !== version)
      return route.fulfill({
        status: 409,
        json: { error: 'Workspace changed on another device. Reload before saving.' },
      });
    data = body.data;
    version++;
    return route.fulfill({ json: { version } });
  });
  return { read: () => data };
}
