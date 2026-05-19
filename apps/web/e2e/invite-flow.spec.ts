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

test.describe('invite flow', () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, 'Set PLAYWRIGHT_E2E=1 to run local full-stack E2E flows.')

  test('creates and accepts an invite token', async ({ browser, page }) => {
    const timestamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner+${timestamp}@example.com`
    const teammateEmail = `teammate+${timestamp}@example.com`

    await signUp(page, ownerEmail, password, 'Owner Person')
    await page.getByLabel('Your name').fill('Owner Person')
    await page.getByLabel('Workspace name').fill(`Invite ${timestamp}`)
    await page.getByRole('button', { name: 'Create workspace' }).click()
    await page.getByRole('link', { name: 'Open workspace' }).click()
    await page.getByRole('button', { name: 'Workspace settings' }).click()
    await page.getByRole('button', { name: 'Members' }).click()
    await page.getByRole('button', { name: 'Invite' }).click()
    await page.getByPlaceholder('teammate@company.com').fill(teammateEmail)
    await page.getByRole('button', { name: 'Send invite' }).click()

    const inviteText = await page.getByText(/\/invite\//).textContent()
    if (!inviteText) {
      throw new Error('Invite link was not rendered')
    }

    const invitePath = inviteText.replace(/^https?:\/\/[^/]+/, '')
    const invitePage = await browser.newPage()
    await invitePage.goto(invitePath)
    await invitePage.getByRole('link', { name: 'Sign in to continue' }).click()
    await invitePage.getByRole('button', { name: 'Create account' }).click()
    await invitePage.getByLabel('Your name').fill('Teammate Person')
    await invitePage.getByLabel('Email').fill(teammateEmail)
    await invitePage.getByLabel('Password').fill(password)
    await invitePage.getByRole('button', { name: 'Create account' }).click()

    await expect(invitePage).toHaveURL(/\/w\//)
  })
})
