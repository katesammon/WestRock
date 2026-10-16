import { test, expect } from '@playwright/test'

test('owner configures costs, creates project, reviews report, inspects historical costs', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const status = await page.request.get('/api/auth/status'),
    { needsSetup } = await status.json()
  if (needsSetup) {
    await page.getByLabel('Company name').fill('Browser test company')
    await page.getByLabel('Your name').fill('Test owner')
  }
  await page.getByLabel('Email', { exact: true }).fill('browser@example.test')
  await page.getByLabel(/Password/).fill('browser-test-password-123')
  await page
    .getByRole('button', {
      name: needsSetup ? 'Create workspace' : 'Sign in',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
  const mode = info.project.name
  if (!needsSetup) {
    await page.goto('/#admin')
    await page
      .getByRole('button', { name: 'Labor & rates', exact: true })
      .click()
  } else {
    await page
      .getByRole('button', { name: 'Set up company data', exact: true })
      .click()
  }
  await page
    .getByRole('button', { name: 'Classification', exact: true })
    .click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Classification name').fill(`Operator ${mode}`)
  await dialog.getByLabel('Employment type').selectOption('Union')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Labor rate', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Classification', { exact: true })
    .selectOption({ label: `Operator ${mode}` })
  await dialog.getByLabel('Effective date').fill('2026-01-01')
  await dialog.getByLabel('Base wage ($/HR)').fill('40')
  await dialog.getByLabel('Pension ($/HR)').fill('10')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  // Go directly to the hash to exercise browser navigation on both screen sizes.
  await page.goto('/#projects')
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  dialog = page.getByRole('dialog')
  for (const [label, value] of Object.entries({
    'Job number': `125-${mode}`,
    'Project name': `Sewer improvement ${mode}`,
    Client: 'Test client',
    'Project type': 'Sewer',
    State: 'CA',
    Region: 'Bay Area',
    County: 'Alameda',
    City: 'Oakland',
    'Start date': '2026-01-01',
    'Contract value ($)': '100000',
    'Direct-cost budget ($)': '80000',
    'Primary costed activity': '8-inch PVC sewer',
    'Contract quantity · primary activity': '1000',
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value)
  await dialog.getByLabel('Production unit').selectOption('LF')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: `Sewer improvement ${mode}`,
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Daily report', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Project', { exact: true })
    .selectOption({ label: `125-${mode} · Sewer improvement ${mode}` })
  await dialog.getByLabel('Work date').fill('2026-02-02')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Daily report', exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Transcript / field notes')
    .fill(
      'Test fixture: six operators, eight hours, 400 feet of sewer. No equipment or materials allocated to this test activity.',
    )
  await page.getByLabel('Installed quantity', { exact: true }).fill('400')
  await page.getByLabel('Workday hours · not person-hours').fill('8')
  await page.getByRole('button', { name: 'Add crew', exact: true }).click()
  await page
    .getByLabel('Classification', { exact: true })
    .selectOption({ label: `Operator ${mode}` })
  await page.getByLabel('Workers', { exact: true }).fill('6')
  await page.getByLabel('Regular hours', { exact: true }).fill('8')
  await page.getByLabel('I confirm all costs').check()
  await page
    .getByRole('button', { name: 'Calculate & review', exact: true })
    .click()
  await expect(page.locator('.cost-total')).toHaveText('$2,400.00')
  await page
    .getByRole('button', { name: 'Approve report', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirm approval', exact: true })
    .click()
  await expect(
    page.getByText('Approved and preserved', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('$6.00/LF', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByText('Approved and preserved', { exact: true }),
  ).toBeVisible()
  await page.goto('/#intelligence')
  await expect(
    page.getByRole('heading', { name: 'Cost intelligence', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Region', { exact: true }).selectOption('Bay Area')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '8-inch PVC sewer', exact: true }),
  ).toBeVisible()
  const link = page.getByRole('link', {
    name: `Inspect report for job 125-${mode}`,
    exact: true,
  })
  await link.click()
  await expect(
    page.getByText('Approved and preserved', { exact: true }),
  ).toBeVisible()
  await page.getByText('Rate snapshot', { exact: true }).click()
  await expect(
    page.getByText('"base_cents": 4000', { exact: false }),
  ).toBeVisible()
  await page.screenshot({
    path: `test-results/report-${mode}.png`,
    fullPage: true,
  })
  await page.goto('/#dashboard')
  await page.screenshot({
    path: `test-results/dashboard-${mode}.png`,
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy()
  expect(errors).toEqual([])
})
