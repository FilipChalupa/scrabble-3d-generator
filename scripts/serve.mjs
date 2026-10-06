// Jednoduchý statický server pro vývoj a testy: node scripts/serve.mjs [port]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.argv[2] || process.env.PORT || 8000)
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8',
}

createServer(async (req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
	const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
	try {
		const body = await readFile(file)
		res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
		res.end(body)
	} catch {
		res.writeHead(404).end('Not found')
	}
}).listen(port, () => console.log(`http://localhost:${port}/`))
