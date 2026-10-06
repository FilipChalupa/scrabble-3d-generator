// Vygeneruje ukázkové screenshoty do docs/ (README a manifest PWA): npm run screenshots
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = 4175
const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { cwd: root, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 500))

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function shot(file, { locale = 'cs-CZ', viewport = { width: 1280, height: 800 }, scale = 1.5, setup }) {
	const page = await browser.newPage({ locale, viewport, deviceScaleFactor: scale, colorScheme: 'light' })
	await page.goto(`http://localhost:${port}/`)
	await page.locator('#hint li').first().waitFor()
	await setup?.(page)
	await page.evaluate(() => {
		window.scrollTo(0, 0)
		document.querySelector('.panel').scrollTop = 0
	})
	await page.waitForTimeout(1500) // dokreslení náhledu
	await page.screenshot({ path: `${root}docs/${file}` })
	await page.close()
	console.log(`docs/${file}`)
}

const pick = (page, letter) => page.locator('.chip', { hasText: letter }).first().click()

await shot('screenshot-cs.png', {
	setup: async (page) => {
		await page.selectOption('[name=style]', 'inlay')
		await pick(page, 'Ř')
	},
})
await shot('screenshot-plate.png', {
	setup: async (page) => {
		await page.selectOption('[name=style]', 'raised')
		await page.fill('[name=letterColor]', '#b5562b')
		await page.click('[data-view=plate]')
	},
})
await shot('screenshot-en.png', {
	locale: 'en-US',
	setup: async (page) => {
		await page.selectOption('[name=style]', 'raised')
		await pick(page, 'Q')
	},
})
await shot('screenshot-bottom.png', {
	setup: async (page) => {
		await page
			.locator('details.group', { has: page.locator('[name=markText]') })
			.locator('summary')
			.click()
		await page.fill('[name=markText]', 'FC★')
		await page.click('#flip')
	},
})
await shot('screenshot-mobile.png', {
	viewport: { width: 390, height: 844 },
	scale: 2,
	setup: (page) => pick(page, 'Ž'),
})

await browser.close()
server.kill()
