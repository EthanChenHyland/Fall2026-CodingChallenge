import { expect, test, type Page } from '@playwright/test'

let e2eIpSuffix = 10

test.beforeEach(async ({ context }) => {
  e2eIpSuffix += 1
  await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `203.0.113.${e2eIpSuffix}` })
})

async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill('demo@mosaic.local')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Save the good stuff.' })).toBeVisible()
}

test('sign in form is keyboard-friendly and exposes useful errors', async ({ page }) => {
  await page.goto('/')
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
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Delete UI')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
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
  for (const control of [
    page.getByRole('button', { name: 'Search ideas' }),
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
  const pinHref = await page.locator('.public-pin-image').first().getAttribute('href')
  const paths = ['/', '/explore', '/collections', `/collections/${collectionId}`, '/people/demo-curator', '/people/sam-rivera', '/messages', '/capture', '/privacy']
  if (pinHref) paths.push(pinHref)
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
})

test('profile collection covers fill their full frame', async ({ page }) => {
  await enterDemo(page)
  await page.goto('/people/demo-curator')

  const cover = page.locator('.profile-collection-card .collection-cover').first()
  const image = cover.locator('img')
  await expect(image).toBeVisible()

  const geometry = await cover.evaluate((element) => {
    const image = element.querySelector<HTMLImageElement>('img')!
    const coverBox = element.getBoundingClientRect()
    const imageBox = image.getBoundingClientRect()
    return {
      cover: [Math.round(coverBox.width), Math.round(coverBox.height)],
      image: [Math.round(imageBox.width), Math.round(imageBox.height)],
      objectFit: getComputedStyle(image).objectFit,
    }
  })

  expect(geometry.image).toEqual(geometry.cover)
  expect(geometry.objectFit).toBe('cover')
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
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Reviewer')
  await page.getByLabel('Email').fill(`reviewer-${Date.now()}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('reviewer-password')
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
  // Reload under the active worker before simulating a cold offline navigation.
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connect to Mosaic' })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Save something new.' })).toBeVisible()
})
