// Mapuje CDN URL ze src/deps.js na balíčky z node_modules.
import { register } from 'node:module'

register(
	'data:text/javascript,' +
		encodeURIComponent(`
export async function resolve(specifier, context, next) {
	const m = specifier.match(/^https:\\/\\/cdn\\.jsdelivr\\.net\\/npm\\/((?:@[^/]+\\/)?[^@/]+)@/)
	return next(m ? m[1] : specifier, context)
}`),
)
