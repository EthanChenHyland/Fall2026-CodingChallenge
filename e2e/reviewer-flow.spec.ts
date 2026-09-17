import { expect, test, type Page } from '@playwright/test'

async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with the demo account' }).click()
  await expect(page.getByRole('heading', { name: /Your internet/ })).toBeVisible()
}

test('reviewer can move through the core product', async ({ page }) => {
  await enterDemo(page)
  await expect(page.getByLabel('Search images')).toBeVisible()

  await page.getByRole('link', { name: 'Collections' }).click()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await page.getByRole('link', { name: /Museum of small things/ }).click()
  await expect(page.getByRole('heading', { name: 'Museum of small things' })).toBeVisible()
  await page.getByRole('tab', { name: /Canvas/ }).click()
  await expect(page.getByText('Make it yours.')).toBeVisible()

  await page.getByRole('link', { name: 'Explore' }).click()
  await expect(page.getByRole('heading', { name: /See what people/ })).toBeVisible()
  const firstPin = page.locator('.public-pin-image').first()
  await expect(firstPin).toBeVisible()
  await firstPin.click()
  await expect(page.locator('.pin-page-card')).toBeVisible()
  await expect(page.getByRole('button', { name: /like/i })).toBeVisible()
})

test('mobile shell stays usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await expect(page.locator('.mobile-nav')).toBeVisible()
  await page.getByRole('link', { name: 'Explore' }).last().click()
  await expect(page.getByRole('heading', { name: /See what people/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
