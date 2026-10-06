import js from '@eslint/js'
import globals from 'globals'

export default [
	{ ignores: ['node_modules/', 'test-results/', 'playwright-report/'] },
	js.configs.recommended,
	{
		languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
		rules: {
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
			// Prázdný catch je u localStorage/IndexedDB záměr: bez úložiště aplikace funguje dál.
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
	{ files: ['src/worker.js'], languageOptions: { globals: { ...globals.worker } } },
	{ files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
	{ files: ['test/**', 'scripts/**', '*.config.js'], languageOptions: { globals: { ...globals.node } } },
]
