import { expect, test, type Page } from '@playwright/test'

let e2eIpSuffix = 10

test.beforeEach(async ({ context }) => {
  e2eIpSuffix += 1
  await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `203.0.113.${e2eIpSuffix}` })
})

async function enterDemo(page: Page) {
  await page.goto('/')
  const introSignIn = page.getByRole('button', { name: 'Sign in', exact: true }).first()
  if (await introSignIn.count()) await introSignIn.click()
  await page.getByLabel('Email').fill('demo@mosaic.local')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Save the good stuff.' })).toBeVisible()
}

test('sign in form is keyboard-friendly and exposes useful errors', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Find it once. Keep it.' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await expect(page.getByLabel('Account action').getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true')
  for (const button of await page.getByLabel('Account action').getByRole('button').all()) {
    const box = await button.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(42)
  }
  await page.getByLabel('Email').fill('demo@mosaic.local')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
  await expect(page.getByText("Don't have an account?")).toBeVisible()
  await page.getByRole('button', { name: 'Create one', exact: true }).click()
  await expect(page.getByLabel('Account action').getByRole('button', { name: 'Create account' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('checkbox', { name: /at least 13 years old/i })).not.toBeChecked()
  await expect(page.getByLabel('Email')).toHaveValue('demo@mosaic.local')
  await page.getByLabel('Account action').getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
})

test('expired sessions return to auth and do not leak cached account data', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(page.getByRole('link', { name: /Museum of small things/ })).toBeVisible()
  await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
  })
  await page.goto('/collections/smart/recent')
  await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible()

  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Fresh Account')
  await page.getByLabel('Email').fill(`fresh-${Date.now()}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('fresh-password')
  await page.getByRole('checkbox', { name: /at least 13 years old/i }).check()
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Recently saved' })).toBeVisible()
  await expect(page.getByText('Nothing here yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Museum of small things/ })).toHaveCount(0)
})

test('sign out returns immediately to the login screen', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
})

test('a user can permanently delete their own account from Edit profile', async ({ page }) => {
  const email = `delete-ui-${Date.now()}@example.test`
  const password = 'delete-ui-password'
  await page.goto('/')
  await page.getByRole('button', { name: 'Start collecting' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Delete UI')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('checkbox', { name: /at least 13 years old/i }).check()
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Save the good stuff.' })).toBeVisible()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'View profile' }).click()
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByRole('button', { name: 'Delete account', exact: true }).click()
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Type DELETE to confirm').fill('DELETE')
  await page.getByRole('button', { name: 'Delete permanently' }).click()

  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible()
  const login = await page.evaluate(async ({ email, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return response.status
  }, { email, password })
  expect(login).toBe(401)
})

test('reviewer can move through the core product', async ({ page }) => {
  await enterDemo(page)
  const search = page.getByLabel('Search images')
  await expect(search).toBeVisible()
  await search.focus()
  await expect(search).toBeFocused()
  const focusShadow = await page.locator('.discover-search').evaluate((element) => getComputedStyle(element).boxShadow)
  expect(focusShadow).not.toBe('none')
  const recommendedSearches = page.getByLabel('Recommended searches')
  await expect(recommendedSearches).toBeVisible()
  const firstSuggestion = recommendedSearches.getByRole('button').first()
  const suggestedQuery = await firstSuggestion.innerText()
  await firstSuggestion.click()
  await expect(search).toHaveValue(suggestedQuery)

  await page.getByRole('link', { name: 'Collections' }).click()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await page.getByRole('link', { name: /Museum of small things/ }).click()
  await expect(page.getByRole('heading', { name: 'Museum of small things' })).toBeVisible()
  await page.getByRole('button', { name: 'Section', exact: true }).click()
  await page.getByLabel('Section name').fill('Favorites')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Favorites', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('.selection-toggle').first().click()
  await page.getByLabel('Assign selected pins to section').selectOption({ label: 'Favorites' })
  await page.getByRole('button', { name: 'Organize', exact: true }).click()
  await expect(page.getByText('Pins organized into section')).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('.selection-toggle').first().click()
  await page.getByLabel('Destination collection').selectOption({ label: 'Tokyo after dark' })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByText('1 pin copied')).toBeVisible()
  await page.getByRole('tab', { name: /Canvas/ }).click()
  await expect(page.getByText('Make it yours.')).toBeVisible()
  await page.getByRole('button', { name: 'Remix board' }).click()
  await expect(page.getByText('Board remixed')).toBeVisible()

  await page.getByRole('link', { name: 'Explore' }).click()
  await expect(page.getByRole('heading', { name: 'What people are saving.' })).toBeVisible()
  const saveButton = page.locator('.public-pin-card').first().getByRole('button', { name: 'Save', exact: true })
  await saveButton.click()
  await expect(page.getByRole('heading', { name: 'Choose a collection' })).toBeVisible()
  const collectionChoice = page.getByRole('button', { name: /Tokyo after dark/ })
  await expect(collectionChoice).toBeEnabled()
  await collectionChoice.click()
  await expect(page.getByText('Saved to collection')).toBeVisible()
  const firstPin = page.locator('.public-pin-image').first()
  await expect(firstPin).toBeVisible()
  await firstPin.click()
  await expect(page.locator('.public-pin-detail-dialog')).toBeVisible()
  await page.getByRole('link', { name: 'Open full pin' }).click()
  await expect(page.locator('.pin-page-card')).toBeVisible()
  await expect(page.getByRole('button', { name: /like/i })).toBeVisible()
  await page.getByLabel('Comment').fill('E2E thread starter')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  const thread = page.locator('.pin-comment-thread').filter({ hasText: 'E2E thread starter' })
  await expect(thread).toBeVisible()
  await thread.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(page.getByText('Replying to Demo Curator')).toBeVisible()
  const commentBox = page.getByRole('textbox', { name: 'Comment', exact: true })
  await expect(commentBox).toHaveValue('@Demo Curator ')
  await commentBox.fill('@Demo Curator following up in-thread.')
  await page.locator('.pin-comment-form').getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(thread.locator('.pin-comment.reply')).toContainText('following up in-thread.')
})

test('manual image and profile photo changes require content-rights confirmation', async ({ page }) => {
  await enterDemo(page)
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()

  await page.goto('/collections/2')
  await page.getByRole('button', { name: 'Add pin' }).click()
  await page.getByLabel('Image URL', { exact: true }).fill('https://example.com/manual-reference.jpg')
  await page.getByLabel('Title', { exact: true }).fill('Manual reference')
  const addPin = page.getByRole('button', { name: 'Add pin', exact: true }).last()
  await expect(addPin).toBeDisabled()
  await page.getByRole('checkbox', { name: /right to use this image/i }).check()
  await expect(addPin).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()

  await page.goto('/people/demo-curator')
  await page.getByRole('button', { name: 'Edit profile' }).click()
  const photoRights = page.getByRole('checkbox', { name: /right to use this profile photo/i })
  await expect(photoRights).not.toBeChecked()
  await page.getByLabel('Photo URL').fill('https://example.com/new-profile-photo.jpg')
  const saveProfile = page.getByRole('button', { name: 'Save profile' })
  await expect(saveProfile).toBeDisabled()
  await photoRights.check()
  await expect(saveProfile).toBeEnabled()
})

test('Import supports bulk image files and Mosaic collection exports', async ({ page }) => {
  await enterDemo(page)
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()
  const target = await page.evaluate(async () => {
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Import target ${Date.now()}` }),
    })
    return (await response.json() as { collection: { id: number; name: string } }).collection
  })

  await page.route('https://api.cloudinary.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      secure_url: 'https://res.cloudinary.com/e2e/image/upload/imported-test.jpg',
      width: 800,
      height: 600,
      original_filename: 'Imported test',
    }),
  }))
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bring things into Mosaic.' })).toBeVisible()
  await expect(page.getByText('Images from your device')).toBeVisible()
  await expect(page.getByText('Mosaic collection export')).toBeVisible()
  await page.getByLabel('Save into').selectOption(String(target.id))
  await page.getByRole('checkbox', { name: /right to use the images/i }).check()
  await page.getByLabel('Choose images to import').setInputFiles({ name: 'imported-test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 217]) })
  await page.getByRole('button', { name: 'Import 1 image' }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${target.id}$`))
  await expect(page.locator('.saved-card')).toContainText('Imported test')

  await page.goto('/collections')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Bring things into Mosaic.' })
  const importBounds = await importDialog.boundingBox()
  expect(importBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((importBounds?.x ?? 0) + (importBounds?.width ?? 390)).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  const importedName = `Imported export ${Date.now()}`
  const portableExport = {
    format: 'mosaic.collection',
    version: 2,
    collection: { name: importedName, description: 'UI import test', theme: 'paper', gridLayout: 'gallery', coverFocusX: 50, coverFocusY: 50, coverSourceId: null },
    sections: [],
    items: [],
    media: [],
  }
  await page.getByLabel('Choose Mosaic JSON export').setInputFiles({ name: 'mosaic-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(portableExport)) })
  await expect(page.getByRole('heading', { name: importedName })).toBeVisible()
})

test('Pixabay feeds retry failed next pages and Explore keeps the web feed at the bottom', async ({ page }) => {
  let failSecondPage = true
  await page.route(/\/api\/search\?/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/search') return route.continue()
    const pageNumber = Number(url.searchParams.get('page') ?? 1)
    if (pageNumber === 2 && failSecondPage) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Pixabay is temporarily busy. Retry loading more in a moment.' }) })
    }
    const id = pageNumber === 1 ? 8101 : 8102
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'pixabay',
        nextPage: pageNumber === 1 ? 2 : undefined,
        results: [{ id: `pixabay-${id}`, title: `Pixabay page ${pageNumber}`, creator: 'E2E', imageUrl: `https://example.com/${id}.jpg`, pageUrl: `https://pixabay.com/images/id-${id}/`, tags: ['test'], width: 640, height: 480 }],
      }),
    })
  })

  await enterDemo(page)
  await expect(page.getByText('Pixabay page 1', { exact: true })).toBeVisible()
  await page.locator('.discovery-loader').scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Retry loading more' })).toBeVisible()
  failSecondPage = false
  await page.getByRole('button', { name: 'Retry loading more' }).click()
  await expect(page.getByText('Pixabay page 2', { exact: true })).toBeVisible()

  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Fresh from Pixabay' })).toBeVisible()
  const featuredCollections = page.getByRole('region', { name: 'Featured public collections' })
  await expect(featuredCollections).toBeVisible()
  expect(await featuredCollections.locator('.explore-collection-card').count()).toBeGreaterThan(0)
  const webFeedIsAfterCommunityFeed = await page.evaluate(() => {
    const communityEnd = document.querySelector('.feed-sentinel')
    const webFeed = document.querySelector('.explore-web-section')
    return Boolean(communityEnd && webFeed && (communityEnd.compareDocumentPosition(webFeed) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(webFeedIsAfterCommunityFeed).toBe(true)
  await page.getByRole('button', { name: 'Trending', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pins people are talking about' })).toBeVisible()
  await expect(page.locator('.explore-web-section')).toBeVisible()
  await page.locator('.explore-web-section .discovery-loader').scrollIntoViewIfNeeded()
  await expect(page.getByText('Pixabay page 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Following', exact: true }).click()
  await expect(page.locator('.explore-web-section')).toHaveCount(0)
})

test('Pixabay shuffle stays responsive without turning rapid clicks into provider spam', async ({ page }) => {
  let searchRequests = 0
  await page.route(/\/api\/search\?/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/search') return route.continue()
    searchRequests += 1
    const batch = searchRequests
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'pixabay',
        results: Array.from({ length: 8 }, (_, index) => ({
          id: `pixabay-${batch}-${index}`,
          title: `Shuffle ${batch}-${index}`,
          creator: 'E2E',
          imageUrl: `https://example.com/shuffle-${batch}-${index}.jpg`,
          pageUrl: `https://pixabay.com/images/id-${batch}-${index}/`,
          tags: ['shuffle', 'test'],
          width: 640 + index,
          height: 480,
        })),
      }),
    })
  })

  await enterDemo(page)
  const discoverShuffle = page.getByRole('button', { name: 'Shuffle Pixabay finds' })
  await expect(discoverShuffle).toBeVisible()
  const discoverBefore = await page.locator('.image-card .image-meta strong').allTextContents()
  const discoverRequestsBefore = searchRequests
  for (let index = 0; index < 8; index += 1) await discoverShuffle.click()
  await expect(discoverShuffle).toBeEnabled()
  await page.waitForTimeout(250)
  const discoverAfter = await page.locator('.image-card .image-meta strong').allTextContents()
  expect(discoverAfter).not.toEqual(discoverBefore)
  expect(searchRequests - discoverRequestsBefore).toBeLessThanOrEqual(1)

  await page.goto('/explore')
  const exploreShuffle = page.getByRole('button', { name: 'Shuffle Pixabay finds' })
  await expect(exploreShuffle).toBeVisible()
  const exploreRequestsBefore = searchRequests
  for (let index = 0; index < 8; index += 1) await exploreShuffle.click()
  await expect(exploreShuffle).toBeEnabled()
  await page.waitForTimeout(250)
  expect(searchRequests - exploreRequestsBefore).toBeLessThanOrEqual(1)
})

test('explore supports multi-select saves into one collection', async ({ page }) => {
  await enterDemo(page)
  const target = await page.evaluate(async () => {
    const name = `Explore batch ${Date.now()}`
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = await response.json() as { collection: { id: number; name: string } }
    return body.collection
  })

  await page.goto('/explore')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const cards = page.locator('.public-pin-card')
  await expect(cards.first().locator('.public-pin-select-surface')).toBeVisible()
  const initialToolbar = page.getByRole('region', { name: 'Save selected pins' })
  await expect(page.locator('.explore-feed-controls + .explore-bulk-toolbar')).toBeVisible()
  await expect(initialToolbar.getByLabel('Save selected to collection')).toHaveValue('')
  await expect(initialToolbar.getByRole('button', { name: 'Save selected' })).toBeDisabled()
  await cards.first().locator('.public-pin-select-surface').click()
  await page.getByRole('button', { name: 'Following', exact: true }).click()
  await expect(initialToolbar).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'For you', exact: true }).click()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const indexes = await cards.evaluateAll((elements) => {
    const seen = new Set<string>()
    const result: number[] = []
    elements.forEach((element, index) => {
      const sourceId = element.getAttribute('data-source-id')
      if (sourceId && !seen.has(sourceId) && result.length < 2) {
        seen.add(sourceId)
        result.push(index)
      }
    })
    return result
  })
  expect(indexes).toHaveLength(2)
  for (const index of indexes) await cards.nth(index).locator('.public-pin-select-surface').click()

  const toolbar = page.getByRole('region', { name: 'Save selected pins' })
  await toolbar.getByLabel('Save selected to collection').selectOption(String(target.id))
  await toolbar.getByRole('button', { name: 'Save selected' }).click()
  await expect(page.getByText('2 saved', { exact: true })).toBeVisible()
  await expect(toolbar).toHaveCount(0)
  const savedCount = await page.evaluate(async (collectionId) => {
    const response = await fetch(`/api/collections/${collectionId}`)
    const body = await response.json() as { collection: { items: unknown[] } }
    return body.collection.items.length
  }, target.id)
  expect(savedCount).toBe(2)
})

test('direct messages persist between accounts and surface unread threads', async ({ page, browser }) => {
  await enterDemo(page)
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()
  const samId = await page.evaluate(async () => {
    const response = await fetch('/api/search/social?q=sam')
    const data = await response.json() as { people: Array<{ id: number; name: string }> }
    return data.people.find((person) => person.name === 'Sam Rivera')!.id
  })
  await page.goto(`/people/${samId}`)
  await expect(page).toHaveURL(/\/people\/sam-rivera$/)
  const statTops = await page.locator('.profile-stats strong').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect(new Set(statTops).size).toBe(1)
  await page.getByRole('link', { name: 'Message', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Keep the idea moving.' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Want to compare material boards?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Want to compare material boards?')).toBeVisible()

  await page.goto('/explore')
  await page.locator('.public-pin-image').first().click()
  await expect(page.locator('.public-pin-detail-dialog')).toBeVisible()
  await page.getByRole('link', { name: 'Open full pin' }).click()
  await expect(page.locator('.pin-page-card')).toBeVisible()
  const sharedPinTitle = await page.locator('.pin-page-copy h1').innerText()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: /Sam Rivera/ }).click()
  await expect(page.getByText('Sent to Sam Rivera')).toBeVisible()

  const recipient = await browser.newContext()
  const sam = await recipient.newPage()
  await sam.goto('http://127.0.0.1:3199/')
  const loggedIn = await sam.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@mosaic.local', password: 'demo1234' }),
    })
    return response.ok
  })
  expect(loggedIn).toBe(true)
  await sam.goto('http://127.0.0.1:3199/messages')
  const demoThread = sam.getByRole('link', { name: /Demo Curator/ })
  await expect(demoThread).toBeVisible()
  await expect(demoThread.locator('.conversation-unread')).toHaveText('2')
  await demoThread.click()
  await expect(sam.locator('.message-stream').getByText('Want to compare material boards?', { exact: true })).toBeVisible()
  await expect(sam.locator('.message-pin-preview')).toContainText(sharedPinTitle)
  await expect(sam.locator('.message-pin-preview')).toHaveAttribute('href', /\/pin\/\d+/)
  await sam.getByRole('textbox', { name: 'Message', exact: true }).fill('Yes — sending mine now.')
  await sam.getByRole('button', { name: 'Send message' }).click()
  await expect(sam.locator('.message-stream').getByText('Yes — sending mine now.', { exact: true })).toBeVisible()
  await recipient.close()
})

test('mobile shell stays usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await expect(page.locator('.topbar-search')).toHaveCount(0)
  for (const control of [
    page.getByRole('button', { name: /notifications/i }),
    page.getByRole('button', { name: 'Account menu' }),
  ]) {
    const box = await control.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button', { name: 'Account menu' }).click()
  const signOut = await page.getByRole('button', { name: 'Sign out' }).boundingBox()
  expect(signOut?.height ?? 0).toBeGreaterThanOrEqual(44)
  await page.getByRole('button', { name: 'Account menu' }).click()
  const searchBox = await page.getByLabel('Search images').boundingBox()
  expect(searchBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  await expect(page.locator('.mobile-nav')).toBeVisible()
  await page.getByRole('link', { name: 'Explore' }).last().click()
  await expect(page.getByRole('heading', { name: 'What people are saving.' })).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const bulkToolbar = page.getByRole('region', { name: 'Save selected pins' })
  await expect(bulkToolbar).toBeVisible()
  await expect(page.locator('.explore-feed-controls + .explore-bulk-toolbar')).toBeVisible()
  const bulkSave = await bulkToolbar.getByRole('button', { name: 'Save selected' }).boundingBox()
  expect(bulkSave?.height ?? 0).toBeGreaterThanOrEqual(40)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.goto('/collections')
  const collectionHeaderBox = await page.locator('.page-title-row').boundingBox()
  const collectionActionsBox = await page.locator('.page-title-actions').boundingBox()
  expect(collectionActionsBox?.width ?? 0).toBeGreaterThanOrEqual((collectionHeaderBox?.width ?? 0) - 1)
  const coverBox = await page.locator('.collection-cover').first().boundingBox()
  expect(Math.abs((coverBox?.width ?? 0) / (coverBox?.height ?? 1) - 1.6)).toBeLessThan(0.03)
  await page.goto('/collections/2')
  const back = await page.getByRole('link', { name: 'All collections' }).boundingBox()
  expect(back?.height ?? 0).toBeGreaterThanOrEqual(32)
  const sharing = page.getByRole('button', { name: 'Manage sharing' })
  if (await sharing.count()) {
    const box = await sharing.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(32)
  }
})

test('shell popovers keep valid accessibility references and dialogs expose descriptions', async ({ page }) => {
  await enterDemo(page)
  const account = page.getByRole('button', { name: 'Account menu' })
  const notifications = page.getByRole('button', { name: /notifications/i })

  await expect(account).not.toHaveAttribute('aria-controls')
  await expect(notifications).not.toHaveAttribute('aria-controls')

  await account.click()
  await expect(account).toHaveAttribute('aria-controls', 'account-popover')
  await expect(page.locator('#account-popover')).toBeVisible()
  await account.click()
  await expect(page.locator('#account-popover')).toHaveCount(0)
  await expect(account).not.toHaveAttribute('aria-controls')

  await notifications.click()
  await expect(notifications).toHaveAttribute('aria-controls', 'notifications-popover')
  await expect(page.locator('#notifications-popover')).toBeVisible()
  await notifications.click()
  await expect(page.locator('#notifications-popover')).toHaveCount(0)
  await expect(notifications).not.toHaveAttribute('aria-controls')

  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await page.keyboard.press('n')
  const createDialog = page.getByRole('dialog')
  await expect(createDialog).toBeVisible()
  await expect(createDialog).toHaveAttribute('aria-describedby', /.+/)
})

test('stored user content stays inert instead of executing as HTML', async ({ page }) => {
  await enterDemo(page)
  const payload = '</h1><img src=x onerror="window.__mosaicXss=1">'
  const collection = await page.evaluate(async (name) => {
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = await response.json() as { collection: { id: number } }
    return body.collection
  }, payload)

  await page.goto(`/collections/${collection.id}`)
  await expect(page.getByRole('heading', { name: payload })).toBeVisible()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(await page.evaluate(() => (window as Window & { __mosaicXss?: number }).__mosaicXss)).toBeUndefined()
})

test('privacy policy is public and core pages stay inside 320px and 390px viewports', async ({ page }) => {
  const overflowReport = () => page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
      .slice(0, 5)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }))
    return { overflow, offenders }
  })

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Your data, in plain language.' })).toBeVisible()
  expect(await overflowReport()).toEqual({ overflow: 0, offenders: [] })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Find it once. Keep it.' })).toBeVisible()
  expect(await overflowReport()).toEqual({ overflow: 0, offenders: [] })
  const actionTop = async () => page.locator('.welcome-actions').evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY))
  const actionTops = [await actionTop()]
  await page.getByRole('button', { name: 'Show slide 2' }).click()
  actionTops.push(await actionTop())
  await page.getByRole('button', { name: 'Show slide 3' }).click()
  actionTops.push(await actionTop())
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(2)
  await page.getByRole('button', { name: 'Show slide 1' }).click()
  for (const control of await page.locator('.welcome-actions button, .welcome-arrow').all()) {
    const box = await control.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await overflowReport()).toEqual({ overflow: 0, offenders: [] })
  await page.getByRole('button', { name: 'Next slide' }).click()
  await expect(page.getByRole('heading', { name: 'Turn finds into a point of view.' })).toBeVisible()

  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await expect(page.getByRole('link', { name: 'Read the Privacy Policy' })).toBeVisible()
  const email = await page.getByLabel('Email').boundingBox()
  expect(email?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect((await overflowReport()).overflow).toBeLessThanOrEqual(1)
  await page.getByLabel('Email').fill('demo@mosaic.local')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Save the good stuff.' })).toBeVisible()
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()

  const collectionData = await page.evaluate(async () => {
    const response = await fetch('/api/collections')
    return response.json() as Promise<{ collections: Array<{ id: number; item_count: number; share_token?: string | null }> }>
  })
  const collectionId = [...collectionData.collections].sort((a, b) => b.item_count - a.item_count)[0]!.id
  const shareToken = collectionData.collections.find((collection) => collection.share_token)?.share_token
  await page.goto('/explore')
  const pinId = await page.locator('.public-pin-card').first().getAttribute('data-pin-id')
  const paths = ['/', '/explore', '/collections', `/collections/${collectionId}`, '/people/demo-curator', '/people/sam-rivera', '/messages', '/capture', '/privacy']
  if (pinId) paths.push(`/pin/${pinId}`)
  if (shareToken) paths.push(`/shared/${shareToken}`)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    for (const path of paths) {
      await page.goto(path)
      await page.locator('body').waitFor()
      const report = await overflowReport()
      expect(report, `${path} overflow at ${width}px: ${JSON.stringify(report.offenders)}`).toEqual({ overflow: 0, offenders: [] })
    }
  }

  await page.goto('/')
  const nav = page.locator('.mobile-nav')
  await expect(nav).toBeVisible()
  for (const control of await nav.locator('a, button').all()) {
    const box = await control.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48)
  }
})

test('header and profile avatars use the same square crop geometry', async ({ page }) => {
  await enterDemo(page)
  const avatarUrl = 'https://example.com/mosaic-avatar.png'
  const updated = await page.evaluate(async (url) => {
    const response = await fetch('/api/profiles/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl: url }),
    })
    return response.ok
  }, avatarUrl)
  expect(updated).toBe(true)

  await page.goto('/people/demo-curator')
  await expect(page.locator('.avatar img')).toHaveAttribute('src', avatarUrl)
  await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', avatarUrl)

  const geometry = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)!
      const image = element.querySelector<HTMLImageElement>('img')!
      const box = element.getBoundingClientRect()
      const imageBox = image.getBoundingClientRect()
      const style = getComputedStyle(image)
      return {
        box: [box.width, box.height],
        image: [imageBox.width, imageBox.height],
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        src: image.currentSrc || image.src,
      }
    }
    return { header: read('.avatar'), profile: read('.profile-avatar') }
  })

  expect(geometry.header.box).toEqual([36, 36])
  expect(geometry.header.image).toEqual([36, 36])
  expect(geometry.profile.box).toEqual([150, 150])
  expect(geometry.profile.image).toEqual([150, 150])
  expect(geometry.header.objectFit).toBe('cover')
  expect(geometry.header.objectPosition).toBe(geometry.profile.objectPosition)
  expect(geometry.header.src).toBe(geometry.profile.src)

  await page.reload()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', avatarUrl)
  await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', avatarUrl)
})

test('profile collection covers fill their full frame', async ({ page }) => {
  await enterDemo(page)
  await page.goto('/people/demo-curator')

  const cover = page.locator('.profile-collection-card .collection-cover').first()
  await expect(cover.locator('img').first()).toBeVisible()

  const geometry = await cover.evaluate((element) => {
    const mosaic = element.querySelector<HTMLElement>('.collection-cover-mosaic')!
    const images = [...element.querySelectorAll<HTMLImageElement>('img')]
    const coverBox = element.getBoundingClientRect()
    const mosaicBox = mosaic.getBoundingClientRect()
    return {
      cover: [Math.round(coverBox.width), Math.round(coverBox.height)],
      mosaic: [Math.round(mosaicBox.width), Math.round(mosaicBox.height)],
      objectFits: images.map((image) => getComputedStyle(image).objectFit),
    }
  })

  expect(geometry.mosaic).toEqual(geometry.cover)
  expect(geometry.objectFits.length).toBeGreaterThan(0)
  expect(geometry.objectFits.every((value) => value === 'cover')).toBe(true)
})

test('collection visibility is discoverable from the collection header', async ({ page }) => {
  await enterDemo(page)
  const collection = await page.evaluate(async () => {
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Visibility test ${Date.now()}` }),
    })
    const body = await response.json() as { collection: { id: number } }
    return body.collection
  })

  await page.goto(`/collections/${collection.id}`)
  const visibility = page.getByRole('button', { name: 'Collection visibility: Private. Open privacy and sharing' })
  await expect(visibility).toBeVisible()
  await visibility.click()
  await expect(page.getByRole('heading', { name: 'Bring people into the board.' })).toBeVisible()
  await page.getByRole('button', { name: 'Public', exact: true }).click()
  await expect(page.getByText('Collection is public')).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.getByRole('button', { name: 'Collection visibility: Public. Open privacy and sharing' })).toBeVisible()
})

test('new account can create, capture, edit, share, revoke and undo', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start collecting' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Reviewer')
  await page.getByLabel('Email').fill(`reviewer-${Date.now()}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('reviewer-password')
  await page.getByRole('checkbox', { name: /at least 13 years old/i }).check()
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Save the good stuff.' })).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss quick tour' }).click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page.getByRole('button', { name: 'New collection', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Reviewer board')
  await page.getByRole('button', { name: 'Create collection', exact: true }).last().click()
  await page.getByRole('link', { name: /Reviewer board/ }).click()
  const boardUrl = page.url()
  await page.goto('/capture')
  await page.getByLabel('Image URL', { exact: true }).fill('https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=500')
  await page.getByLabel('Title', { exact: true }).fill('Reviewer reference')
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Remember this / composition')
  await expect(page.getByRole('button', { name: 'Save to Mosaic' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /right to use this image/i }).check()
  await page.getByRole('button', { name: 'Save to Mosaic' }).click()
  await expect(page.locator('.saved-card')).toContainText('Remember this / composition')
  await page.locator('.saved-card').getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Note', { exact: true }).fill('Edited / note')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.saved-card')).toContainText('Edited / note')
  await page.getByRole('button', { name: 'Privacy & sharing', exact: true }).click()
  await page.getByRole('button', { name: 'Public', exact: true }).click()
  const link = page.locator('.share-url')
  await expect(link).toBeVisible()
  const token = (await link.innerText()).split('/shared/')[1]
  const guest = await browser.newContext()
  const publicPage = await guest.newPage()
  await publicPage.goto(`http://127.0.0.1:3199/shared/${token}`)
  await expect(publicPage.getByRole('heading', { name: 'Reviewer board' })).toBeVisible()
  await page.getByRole('button', { name: 'Private', exact: true }).click()
  await expect(page.getByText('Only collaborators can open this collection while it is private.')).toBeVisible()
  await publicPage.reload()
  await expect(publicPage.getByText('This share link is no longer available.')).toBeVisible()
  await guest.close()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.locator('.saved-card').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator('.saved-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.saved-card')).toContainText('Edited / note')
  await page.reload()
  await expect(page.locator('.saved-card')).toContainText('Edited / note')
  expect(page.url()).toBe(boardUrl)
})

test('canvas keyboard focus survives persistence and failed saves roll back', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Dismiss quick tour' }).click()
  await page.goto('/collections/2')
  await page.getByRole('tab', { name: 'Canvas' }).click()
  const pin = page.locator('.canvas-item').first()
  await pin.focus()
  const initial = await pin.getAttribute('style')
  const saved = page.waitForResponse((response) => response.url().endsWith('/layout') && response.status() === 204)
  await pin.press('ArrowRight')
  await saved
  await expect(pin).toBeFocused()
  await expect(pin).not.toHaveAttribute('style', initial!)
  await page.route('**/api/collections/2/layout', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test save unavailable' }) }))
  const before = await pin.getAttribute('style')
  await pin.press('ArrowRight')
  await expect(page.getByText('Test save unavailable')).toBeVisible()
  await expect(pin).toHaveAttribute('style', before!)
})

test('390px capture, dialog focus and offline reload have usable recovery', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await page.getByRole('button', { name: 'Dismiss quick tour' }).click()
  await page.locator('.mobile-nav').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Save something new.' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('a/b')
  await page.getByRole('textbox', { name: 'Note', exact: true }).press('/')
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('a/b/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await expect(page.getByText('Offline', { exact: true })).toBeVisible()
  await context.setOffline(false)
  // Reload under the active worker before simulating a cold offline navigation.
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connect to Mosaic' })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Save something new.' })).toBeVisible()
})

test('topbar quick actions work on desktop and collapse into a usable mobile menu', async ({ page }) => {
  await enterDemo(page)
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()

  const quickActions = page.getByRole('navigation', { name: 'Quick actions' })
  await expect(quickActions).toBeVisible()
  await expect(quickActions.getByRole('button', { name: 'Quick save' })).toBeVisible()
  await expect(quickActions.getByRole('button', { name: 'Quick new collection' })).toBeVisible()
  await quickActions.getByRole('button', { name: 'Quick import' }).click()
  await expect(page.getByRole('dialog', { name: 'Bring things into Mosaic.' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Bring things into Mosaic.' })).toHaveCount(0)

  await quickActions.getByRole('button', { name: 'Quick save' }).click()
  await expect(page.getByRole('heading', { name: 'Save something new.' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Quick new collection' }).click()
  await expect(page.getByRole('dialog', { name: 'Start a new mood.' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('navigation', { name: 'Quick actions' })).toBeHidden()
  const mobileQuick = page.getByRole('button', { name: 'Quick actions menu' })
  await expect(mobileQuick).toBeVisible()
  const mobileQuickBox = await mobileQuick.boundingBox()
  expect(mobileQuickBox?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(mobileQuickBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  await mobileQuick.click()
  const mobileMenu = page.locator('#mobile-quick-actions')
  await expect(mobileMenu).toBeVisible()
  await expect(mobileMenu.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(mobileMenu.getByRole('button', { name: 'New collection', exact: true })).toBeVisible()
  await expect(mobileMenu.getByRole('button', { name: 'Import', exact: true })).toBeVisible()
  await expect(mobileMenu.getByRole('button', { name: /Commands/ })).toContainText('⌘ K / Ctrl K')
  await mobileMenu.getByRole('button', { name: /Commands/ }).click()
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('command palette supports both Windows and Mac shortcuts and launches presentation mode', async ({ page }) => {
  await enterDemo(page)
  const dismiss = page.getByRole('button', { name: 'Dismiss quick tour' })
  if (await dismiss.count()) await dismiss.click()

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  const search = page.getByLabel('Search commands and collections')
  await expect(search).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)

  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await expect(page.getByLabel('Search commands and collections')).toBeFocused()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const shortcuts = page.getByRole('dialog', { name: 'Move faster in Mosaic.' })
  await expect(shortcuts.getByText('⌘ K', { exact: true })).toBeVisible()
  await expect(shortcuts.getByText('Ctrl K', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await search.fill('Museum of small things')
  await expect(page.getByRole('option', { name: /Museum of small things/ })).toBeVisible()
  await search.press('Enter')
  await expect(page.getByRole('heading', { name: 'Museum of small things' })).toBeVisible()

  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const presentation = page.locator('.presentation-dialog')
  await expect(presentation).toBeVisible()
  await expect(presentation.getByText(/01 \//)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(presentation).toHaveCount(0)

  await page.setViewportSize({ width: 320, height: 568 })
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('public collection presentation works without an account', async ({ page, browser }) => {
  await enterDemo(page)
  const shared = await page.evaluate(async () => {
    const listResponse = await fetch('/api/collections')
    const list = await listResponse.json() as { collections: Array<{ id: number; item_count: number; audience: string }> }
    const candidate = list.collections.find((collection) => collection.item_count > 0)!
    const response = await fetch(`/api/collections/${candidate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: 'public' }),
    })
    const body = await response.json() as { collection: { id: number; name: string; share_token: string } }
    return { ...body.collection, previousAudience: candidate.audience }
  })

  const guest = await browser.newContext()
  const presentation = await guest.newPage()
  await presentation.goto(`http://127.0.0.1:3199/shared/${shared.share_token}/present`)
  const dialog = presentation.locator('.presentation-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: shared.name })).toBeVisible()
  await expect(dialog.locator('.presentation-progress')).toContainText(/\d{2} \/ \d{2}/)
  await expect(presentation.getByLabel('Email')).toHaveCount(0)
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await presentation.setViewportSize(viewport)
    expect(await presentation.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
  await guest.close()

  await page.evaluate(async ({ id, audience }) => {
    await fetch(`/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience }),
    })
  }, { id: shared.id, audience: shared.previousAudience })
})

test('pin detail supports collection-order keyboard navigation', async ({ page }) => {
  await enterDemo(page)
  const sequence = await page.evaluate(async () => {
    const listResponse = await fetch('/api/collections')
    const list = await listResponse.json() as { collections: Array<{ id: number; item_count: number }> }
    const candidate = list.collections.find((collection) => collection.item_count >= 2)!
    const detailResponse = await fetch(`/api/collections/${candidate.id}`)
    const detail = await detailResponse.json() as { collection: { items: Array<{ id: number; title: string }> } }
    return detail.collection.items.slice(0, 2)
  })
  expect(sequence).toHaveLength(2)

  await page.goto(`/pin/${sequence[0].id}`)
  await expect(page.getByRole('button', { name: 'Next pin in collection' })).toBeEnabled()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(new RegExp(`/pin/${sequence[1].id}$`))
  await expect(page.getByRole('heading', { name: sequence[1].title })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`/pin/${sequence[0].id}$`))
  await expect(page.getByRole('heading', { name: sequence[0].title })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 568 })
  await expect(page.locator('.pin-sequence-controls')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('discover remembers searches and filters result types and image shape', async ({ page }) => {
  await enterDemo(page)
  await page.evaluate(() => {
    localStorage.removeItem('mosaic:recent-searches')
    localStorage.removeItem('mosaic:saved-searches')
  })
  await page.reload()

  const search = page.getByLabel('Search images')
  await search.fill('ceramics')
  await search.press('Enter')
  const filterButton = page.getByRole('button', { name: /Discovery filters/ })
  await expect(filterButton).toBeVisible()
  await page.getByRole('button', { name: 'Save search' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()
  await filterButton.click()
  const filters = page.getByRole('group', { name: 'Discovery filters' })
  await filters.getByLabel('Result type').selectOption('People')
  await expect(page.getByRole('heading', { name: 'Results for “ceramics”' })).toHaveCount(0)
  await filters.getByLabel('Result type').selectOption('Images')
  await expect(page.getByRole('heading', { name: 'Results for “ceramics”' })).toBeVisible()
  await filters.getByLabel('Image orientation').selectOption('portrait')
  await expect(filters.getByLabel('Image orientation')).toHaveValue('portrait')
  await filters.getByLabel('Image order').selectOption('largest')
  await expect(filters.getByRole('button', { name: 'Reset filters' })).toBeVisible()
  await filters.getByRole('button', { name: 'Reset filters' }).click()
  await expect(filters.getByLabel('Image orientation')).toHaveValue('all')
  await expect(filters.getByLabel('Image order')).toHaveValue('default')

  await page.goto('/explore')
  await page.goto('/')
  const memory = page.getByLabel('Saved and recent searches')
  await expect(memory).toBeVisible()
  await expect(memory.getByRole('button', { name: /ceramics/ }).first()).toBeVisible()
  const searchBounds = await page.locator('.discover-search').boundingBox()
  const memoryBounds = await memory.boundingBox()
  expect((memoryBounds?.y ?? 0) - ((searchBounds?.y ?? 0) + (searchBounds?.height ?? 0))).toBeGreaterThanOrEqual(12)
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    const mobileFilterButton = page.getByRole('button', { name: /Discovery filters/ })
    if (await page.getByRole('group', { name: 'Discovery filters' }).count() === 0) await mobileFilterButton.click()
    const orientationBounds = await page.getByRole('group', { name: 'Discovery filters' }).getByLabel('Image orientation').boundingBox()
    expect(orientationBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
})

test('Discover and Explore images open in-site previews', async ({ page }) => {
  await enterDemo(page)
  const webImage = page.locator('.image-open-button').first()
  await expect(webImage).toBeVisible()
  await webImage.click()
  await expect(page.locator('.pin-detail-dialog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View source' })).toBeVisible()
  await page.getByRole('button', { name: 'Close image details' }).click()

  await page.goto('/explore')
  const publicPin = page.locator('.public-pin-image').first()
  await expect(publicPin).toBeVisible()
  await publicPin.click()
  await expect(page.locator('.public-pin-detail-dialog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open full pin' })).toBeVisible()
  await page.getByRole('button', { name: 'Close pin preview' }).click()

  await page.locator('.explore-web-section').scrollIntoViewIfNeeded()
  const webFilterButton = page.locator('.explore-web-section').getByRole('button', { name: /Web image filters/ })
  await expect(webFilterButton).toBeVisible()
  await webFilterButton.click()
  const webFilters = page.getByRole('group', { name: 'Web image filters' })
  await webFilters.getByLabel('Image orientation').selectOption('landscape')
  await expect(webFilters.getByLabel('Image orientation')).toHaveValue('landscape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('collection reorder controls persist pin order', async ({ page }) => {
  await enterDemo(page)
  const setup = await page.evaluate(async () => {
    const listResponse = await fetch('/api/collections')
    const list = await listResponse.json() as { collections: Array<{ id: number; item_count: number }> }
    const candidate = list.collections.find((collection) => collection.item_count >= 2)!
    const detailResponse = await fetch(`/api/collections/${candidate.id}`)
    const detail = await detailResponse.json() as { collection: { items: Array<{ id: number; title: string }> } }
    const pair = detail.collection.items.slice(0, 2)
    await fetch(`/api/collections/${candidate.id}/items/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'section', itemIds: pair.map((item) => item.id), sectionId: null }),
    })
    const refreshedResponse = await fetch(`/api/collections/${candidate.id}`)
    const refreshed = await refreshedResponse.json() as { collection: { items: Array<{ id: number; title: string; section_id: number | null }> } }
    const unsorted = refreshed.collection.items.filter((item) => item.section_id === null)
    return { collectionId: candidate.id, first: unsorted[0], second: unsorted[1] }
  })
  expect(setup.first).toBeTruthy()
  expect(setup.second).toBeTruthy()

  await page.goto(`/collections/${setup.collectionId}`)
  await page.getByRole('button', { name: `Move ${setup.first.title} later` }).click()
  await expect.poll(async () => page.evaluate(async ({ collectionId }) => {
    const response = await fetch(`/api/collections/${collectionId}`)
    const body = await response.json() as { collection: { items: Array<{ id: number; section_id: number | null }> } }
    return body.collection.items.filter((item) => item.section_id === null).slice(0, 2).map((item) => item.id)
  }, { collectionId: setup.collectionId })).toEqual([setup.second.id, setup.first.id])
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: `Move ${setup.first.title} earlier` })).toBeVisible()
  await expect(page.getByRole('button', { name: `Drag ${setup.first.title} to reorder` })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('reporting, public copies and owner share analytics stay usable on mobile', async ({ page, browser }) => {
  await enterDemo(page)
  const setup = await page.evaluate(async () => {
    const created = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Mobile share audit ${Date.now()}`, description: 'Finishing-feature audit.' }),
    }).then((response) => response.json()) as { collection: { id: number } }
    const saved = await fetch(`/api/collections/${created.collection.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: `mobile-audit-${Date.now()}`,
        imageUrl: 'https://example.com/mobile-audit.jpg',
        sourcePage: 'https://example.com/mobile-audit',
        sourceCreator: 'Mosaic audit',
        title: 'Mobile audit pin',
      }),
    }).then((response) => response.json()) as { item: { id: number } }
    const shared = await fetch(`/api/collections/${created.collection.id}/share`, { method: 'POST' }).then((response) => response.json()) as { token: string }
    return { collectionId: created.collection.id, pinId: saved.item.id, token: shared.token }
  })

  await page.goto(`/collections/${setup.collectionId}`)
  await expect(page.locator('.share-analytics')).toContainText(/0 views · 0 visitors · 0 copies/)

  const viewer = await browser.newContext()
  const viewerPage = await viewer.newPage()
  await viewerPage.goto('/')
  const registered = await viewerPage.evaluate(async () => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mobile Audit Viewer', email: `mobile-audit-${Date.now()}@example.test`, password: 'mobile-audit-password', ageConfirmed: true }),
    })
    return response.status
  })
  expect(registered).toBe(201)

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await viewerPage.setViewportSize(viewport)
    await viewerPage.goto(`/shared/${setup.token}`)
    await expect(viewerPage.getByRole('button', { name: 'Save a copy' })).toBeVisible()
    await expect.poll(() => viewerPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)

    await viewerPage.goto(`/pin/${setup.pinId}`)
    const actionButtons = viewerPage.locator('.pin-detail-actions button, .pin-detail-actions a')
    for (const control of await actionButtons.all()) {
      const box = await control.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    await viewerPage.getByRole('button', { name: 'Report', exact: true }).click()
    const dialog = viewerPage.getByRole('dialog', { name: 'Tell us what’s wrong' })
    await expect(dialog).toBeVisible()
    const bounds = await dialog.boundingBox()
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? viewport.width)).toBeLessThanOrEqual(viewport.width + 1)
    expect(await viewerPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await viewerPage.getByRole('button', { name: 'Close dialog' }).click()
  }

  await viewerPage.setViewportSize({ width: 390, height: 844 })
  await viewerPage.goto(`/pin/${setup.pinId}`)
  await viewerPage.getByRole('button', { name: 'Report', exact: true }).click()
  await viewerPage.getByLabel('Report reason').selectOption('spam')
  await viewerPage.getByLabel('Report details').fill('Mobile report submission audit.')
  await viewerPage.getByRole('button', { name: 'Submit report' }).click()
  await expect(viewerPage.getByText('Report submitted')).toBeVisible()

  await viewerPage.goto(`/shared/${setup.token}`)
  await viewerPage.getByRole('button', { name: 'Save a copy' }).click()
  await expect(viewerPage).toHaveURL(/\/collections\/\d+$/)
  await viewer.close()

  await page.reload()
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.share-analytics')).toContainText(/\d+ views · \d+ visitors · 1 copies/)
    await expect(page.locator('.collection-save-status')).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
})

test('reduced motion disables decorative interaction animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enterDemo(page)
  await expect(page.locator('.route-stage')).toBeVisible()
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const routeAnimation = await page.locator('.route-stage').evaluate((element) => ({
    duration: getComputedStyle(element).animationDuration,
    iterations: getComputedStyle(element).animationIterationCount,
  }))
  const durationMs = routeAnimation.duration.endsWith('ms')
    ? Number.parseFloat(routeAnimation.duration)
    : Number.parseFloat(routeAnimation.duration) * 1000
  expect(durationMs).toBeLessThanOrEqual(0.01)
  expect(routeAnimation.iterations).toBe('1')
})

test('search suggestions stay usable at 320px and 390px', async ({ page }) => {
  await page.route('**/api/search/recommendations?**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.trim() ?? ''
    const suggestions = query
      ? [`${query} night city`, `${query} street photography`, `${query} architecture`]
      : ['ceramics', 'architecture', 'street photography']
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ suggestions, pins: [], basedOn: query ? [] : ['ceramics'], aiEnhanced: false }),
    })
  })

  await enterDemo(page)
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/discover')
    const search = page.getByRole('combobox', { name: 'Search images' })
    const topicRow = page.locator('.topic-row')
    const filterButton = page.getByRole('button', { name: /Discovery filters/ })
    const topicBounds = await topicRow.boundingBox()
    const filterBounds = await filterButton.boundingBox()
    expect(Math.abs((filterBounds?.y ?? 0) - (topicBounds?.y ?? 0))).toBeLessThanOrEqual(6)
    const topicBefore = await topicRow.boundingBox()
    await search.fill('t')
    const listbox = page.getByRole('listbox', { name: 'Search suggestions' })
    await expect(listbox).toBeVisible()
    await search.fill('tokyo')
    await expect(listbox).toBeVisible()
    const topicAfter = await topicRow.boundingBox()
    expect(Math.abs((topicAfter?.y ?? 0) - (topicBefore?.y ?? 0))).toBeLessThanOrEqual(1)
    const firstSuggestion = listbox.getByRole('option').first()
    const bounds = await firstSuggestion.boundingBox()
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.getByRole('heading', { name: 'Save the good stuff.' }).click()
    await expect(listbox).toBeHidden()
    await search.focus()
    await expect(listbox).toBeVisible()
    await firstSuggestion.click()
    await expect(search).toHaveValue('tokyo night city')
  }
})

test('back to top stays reachable on desktop and above the mobile nav', async ({ page }) => {
  await enterDemo(page)
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.evaluate(() => {
      document.querySelector('[data-back-to-top-spacer]')?.remove()
      const spacer = document.createElement('div')
      spacer.dataset.backToTopSpacer = 'true'
      spacer.style.height = '1800px'
      spacer.style.pointerEvents = 'none'
      document.body.append(spacer)
      window.scrollTo(0, 0)
    })
    await expect(page.getByRole('button', { name: 'Back to top' })).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 900))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(640)
    const button = page.getByRole('button', { name: 'Back to top' })
    await expect(button).toBeVisible()
    const bounds = await button.boundingBox()
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width)
    if (viewport.width <= 700) {
      const nav = await page.locator('.mobile-nav').boundingBox()
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual((nav?.y ?? viewport.height) - 4)
    }
    await button.click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(20)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
})


test('skip links move keyboard focus to the main landmark', async ({ page }) => {
  await enterDemo(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  await page.goto('/privacy')
  const privacySkip = page.getByRole('link', { name: 'Skip to privacy policy' })
  await expect(privacySkip).toBeAttached()
  await page.keyboard.press('Tab')
  await expect(privacySkip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#privacy-content')).toBeFocused()
})
