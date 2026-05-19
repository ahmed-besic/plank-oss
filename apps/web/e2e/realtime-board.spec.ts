import { expect, test  } from '@playwright/test'
import type {Page} from '@playwright/test';

async function signUp(page: Page, email: string, password: string, name: string) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function createWorkspaceAndOpenBoard(page: Page, workspaceName: string) {
  await page.getByLabel('Your name').fill('Owner Person')
  await page.getByLabel('Workspace name').fill(workspaceName)
  await page.getByRole('button', { name: 'Create workspace' }).click()
  await page.getByRole('link', { name: 'Open workspace' }).click()
  await page.getByRole('link', { name: 'Open board' }).first().click()
}

async function dragCardToSecondColumn(page: Page, cardTitle: string) {
  const card = page.getByRole('button', { name: new RegExp(cardTitle) }).first()
  const destination = page.locator('text=In Progress').locator('..').locator('..')
  const sourceBox = await card.boundingBox()
  const destinationBox = await destination.boundingBox()

  if (!sourceBox || !destinationBox) {
    throw new Error('Could not locate drag handles for the board')
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2)
  await page.mouse.up()
}

test.describe('realtime board flow', () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, 'Set PLAYWRIGHT_E2E=1 to run local full-stack E2E flows.')

  test('creates and moves a card across two live sessions', async ({ browser, page }) => {
    const timestamp = Date.now()
    const password = 'password123'
    const workspaceName = `Realtime ${timestamp}`

    await signUp(page, `owner+${timestamp}@example.com`, password, 'Owner Person')
    await createWorkspaceAndOpenBoard(page, workspaceName)

    const storageState = await page.context().storageState()
    const secondContext = await browser.newContext({ storageState })
    const secondPage = await secondContext.newPage()
    await secondPage.goto(page.url())

    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByRole('button', { name: new RegExp('New card') }).first().waitFor()
    await secondPage.getByRole('button', { name: new RegExp('New card') }).first().waitFor()

    await dragCardToSecondColumn(page, 'New card')
    await expect(secondPage.getByText('In Progress')).toBeVisible()
  })
})
