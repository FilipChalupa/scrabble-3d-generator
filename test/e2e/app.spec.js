import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'

// Pole může být ve sbalené skupině „Další nastavení“ – nejdřív ji otevřeme.
async function field(page, name) {
	const input = page.locator(`[name="${name}"]`)
	const details = page.locator('details.group', { has: input })
	if ((await details.count()) && !(await details.evaluate((d) => d.open))) await details.locator('summary').click()
	return input
}

async function setNumber(page, name, value) {
	const input = await field(page, name)
	await input.fill(String(value))
	await input.press('Tab')
}

async function openApp(page) {
	const errors = []
	page.on('pageerror', (e) => errors.push(e.message))
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
	await page.goto('/')
	await expect(page.locator('#hint li').first()).toBeVisible()
	return errors
}

async function downloadZip(page, button) {
	const [download] = await Promise.all([page.waitForEvent('download'), page.click(button)])
	return { name: download.suggestedFilename(), files: unzipSync(new Uint8Array(await readFile(await download.path()))) }
}

const warnings = (page) => page.locator('#hint li.warn')

test('načte se bez chyb a ukáže kámen i podložku', async ({ page }) => {
	const errors = await openApp(page)
	await expect(page.locator('#summary')).toHaveText('100 kamenů · 1 podložka')
	await expect(page.locator('.chip')).toHaveCount(40)
	await expect(warnings(page)).toHaveCount(0)
	await page.click('[data-view=plate]')
	await expect(page.locator('#status')).toHaveText('')
	expect(errors).toEqual([])
})

test('číselné pole ukáže skutečně použitou hodnotu a přesah se ohlásí', async ({ page }) => {
	await openApp(page)
	await setNumber(page, 'letterSize', 120)
	await expect(page.locator('[name=letterSize]')).toHaveValue('80')
	await expect(warnings(page).filter({ hasText: 'Přesahuje okraj' })).toHaveCount(1)
})

test('upozorní na znak, který font neobsahuje', async ({ page }) => {
	await openApp(page)
	await page.selectOption('[name=font]', 'liberation-sans')
	await (await field(page, 'markText')).fill('★')
	await expect(warnings(page).filter({ hasText: '★' })).toHaveCount(1)
})

test('export celé sady obsahuje správné soubory pro všechna provedení', async ({ page }) => {
	await openApp(page)
	const expected = {
		engraved: ['podlozka-01.stl', 'podlozka-01.3mf'],
		inlay: ['podlozka-01.3mf', 'podlozka-01-kamen.stl', 'podlozka-01-pismena.stl'],
		raised: ['podlozka-01.stl', 'podlozka-01.3mf', 'podlozka-01-kamen.stl', 'podlozka-01-pismena.stl'],
	}
	for (const [style, files] of Object.entries(expected)) {
		await page.selectOption('[name=style]', style)
		const zip = await downloadZip(page, '#dl-set')
		expect(zip.name).toBe('scrabble-sada.zip')
		expect(Object.keys(zip.files).sort()).toEqual([...files, 'README.txt'].sort())
		const model = strFromU8(unzipSync(zip.files['podlozka-01.3mf'])['3D/3dmodel.model'])
		expect(model.match(/<item /g)).toHaveLength(100)
	}
})

test('tisk jen vybraných kamenů se pamatuje', async ({ page }) => {
	await openApp(page)
	await page.selectOption('[name=printMode]', 'selection')
	await expect(page.locator('#dl-set')).toBeDisabled()
	await page.click('[data-step="Ř|4|plus"]')
	await page.click('[data-step="Ř|4|plus"]')
	await page.click('[data-step="E|1|plus"]')
	await expect(page.locator('#summary')).toHaveText('vybráno 3 kameny · 1 podložka')
	const zip = await downloadZip(page, '#dl-set')
	expect(strFromU8(zip.files['README.txt'])).toContain('podlozka-01: 3 kameny – E Ř Ř')
	await page.reload()
	await expect(page.locator('#summary')).toHaveText('vybráno 3 kameny · 1 podložka')
})

test('sdílený odkaz přenese nastavení', async ({ page, browser }) => {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
	await openApp(page)
	await page.selectOption('[name=preset]', 'de')
	await page.selectOption('[name=style]', 'raised')
	await page.click('#share')
	await expect(page.locator('#status')).toContainText('ve schránce')
	const url = await page.evaluate(() => navigator.clipboard.readText())
	expect(url.length).toBeLessThan(150)

	const other = await (await browser.newContext({ locale: 'cs-CZ' })).newPage()
	await other.goto(url)
	await expect(other.locator('#status')).toContainText('sdíleného odkazu')
	await expect(other.locator('[name=preset]')).toHaveValue('de')
	await expect(other.locator('[name=style]')).toHaveValue('raised')
	expect(new URL(other.url()).hash).toBe('')
})

test('přepnutí jazyka', async ({ page }) => {
	await openApp(page)
	await page.selectOption('#lang', 'en')
	await expect(page.locator('#summary')).toHaveText('100 tiles · 1 plate')
	await expect(page.locator('legend').first()).toHaveText('Set')
	await page.reload()
	await expect(page.locator('#lang')).toHaveValue('en')
})

test.describe('anglický prohlížeč', () => {
	test.use({ locale: 'en-US' })
	test('dostane anglické rozhraní i sadu', async ({ page }) => {
		await openApp(page)
		await expect(page.locator('#lang')).toHaveValue('en')
		await expect(page.locator('[name=preset]')).toHaveValue('en')
		const zip = await downloadZip(page, '#dl-set')
		expect(zip.name).toBe('scrabble-set.zip')
	})
})

test('vlastní font se zapamatuje', async ({ page }) => {
	await openApp(page)
	await page.setInputFiles('[name=fontFile]', 'fonts/DejaVuSerif-Bold.ttf')
	await expect(page.locator('[name=font]')).toHaveValue('custom')
	await page.reload()
	await expect(page.locator('[name=font] option[value=custom]')).toHaveText('Vlastní: DejaVuSerif-Bold.ttf')
	await expect(page.locator('[name=font]')).toHaveValue('custom')
})

test('otočení náhledu a tisk lícem dolů', async ({ page }) => {
	await openApp(page)
	await page.click('#flip')
	await expect(page.locator('#view-note')).toHaveText('Pohled na spodek')
	await page.click('#flip')
	await page.check('[name=faceDown]')
	await page.click('[data-view=plate]')
	await expect(page.locator('#view-note')).toHaveText('Lícem dolů, jak se tiskne')
})

test('bez internetu se ukáže omluvná stránka', async ({ page, context }) => {
	await openApp(page)
	await page.evaluate(() => navigator.serviceWorker.ready)
	await page.reload() // service worker teď stránku ovládá
	await context.setOffline(true)
	await page.reload()
	await expect(page.locator('h1')).toHaveText('Omlouváme se, jste offline')
})

test('manifest PWA je platný a aplikace jde nainstalovat', async ({ page }) => {
	await openApp(page)
	await page.evaluate(() => navigator.serviceWorker.ready)
	const cdp = await page.context().newCDPSession(page)
	const { errors } = await cdp.send('Page.getAppManifest')
	expect(errors).toEqual([])
	const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
	expect(installabilityErrors).toEqual([])
})
