import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: 'test/e2e',
	timeout: 60_000,
	expect: { timeout: 20_000 }, // stavba sady ve swiftshaderu při paralelních testech chvíli trvá
	fullyParallel: true,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173/',
		locale: 'cs-CZ',
		viewport: { width: 1300, height: 1000 },
		acceptDownloads: true,
		launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
	},
	webServer: { command: 'node scripts/serve.mjs 4173', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
})
