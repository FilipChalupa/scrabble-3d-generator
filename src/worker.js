// Web Worker: stavba kamenů a export běží mimo hlavní vlákno, aby stránka nezamrzala.
// Zprávy: { id, type, payload } → { id, result } | { id, error } | { id, progress }

import { opentype } from './deps.js'
import { layoutTile, buildTile } from './geometry.js'
import { placeTris, concatTris, toSTL, to3MF, zip } from './export.js'

let font = null
let fontKey = ''
let cache = new Map()
let cacheKey = ''

function missingChars(text) {
	return [...text].filter((ch) => ch.trim() && !(font.charToGlyphIndex(ch) > 0))
}

function getTile(params, letter, value) {
	const key = JSON.stringify(params) + fontKey
	if (key !== cacheKey) {
		cache = new Map()
		cacheKey = key
	}
	const k = `${letter}|${value}`
	let t = cache.get(k)
	if (!t) {
		const layout = layoutTile(font, letter, value, params)
		const built = buildTile(layout, params)
		const f = (a) => Float32Array.from(a)
		t = {
			height: built.height,
			overflow: layout.overflow,
			missing: missingChars(
				(letter === '_' ? '' : letter) +
					(params.showValue && (value > 0 || params.showZero) ? String(value) : '') +
					(params.markText || ''),
			),
			body: f(built.body),
			accent: f(built.accent),
			parts: built.parts && { body: f(built.parts.body), letters: f(built.parts.letters) },
		}
		t.single = concatTris([t.body, t.accent])
		// Zapuštěná písmena v náhledu vyplňují prohlubně, jako po vícebarevném tisku.
		t.preview = params.style === 'inlay' ? { body: t.parts.body, accent: t.parts.letters } : { body: t.body, accent: t.accent }
		cache.set(k, t)
	}
	return t
}

// Soubory pro skupinu kamenů rozmístěných na pozicích x, y.
function filesFor(prefix, placed, o) {
	const gather = (pick) => concatTris(placed.map((p) => placeTris(pick(getTile(o.params, p.letter, p.value)), p.x, p.y, o.flip)))
	const files = {}
	const style = o.params.style
	if (style !== 'inlay') files[`${prefix}.stl`] = toSTL(gather((t) => t.single), prefix)
	if (style !== 'engraved') {
		const body = gather((t) => t.parts.body)
		const letters = gather((t) => t.parts.letters)
		files[`${prefix}${style === 'raised' ? '-vicebarevne' : ''}.3mf`] = to3MF(
			[
				{ name: 'Kámen', color: o.colors.body, tris: body },
				{ name: 'Písmena', color: o.colors.letters, tris: letters },
			],
			prefix,
		)
		files[`${prefix}-kamen.stl`] = toSTL(body, `${prefix}-kamen`)
		files[`${prefix}-pismena.stl`] = toSTL(letters, `${prefix}-pismena`)
	}
	return files
}

const handlers = {
	async font({ url, buffer, key }) {
		const buf = buffer ?? (await (await fetch(url)).arrayBuffer())
		font = opentype.parse(buf)
		fontKey = key
		return { name: font.names.fullName?.en || font.names.fontFamily?.en || '' }
	},

	// Vrací náhledové sítě (kopie, aby se daly předat bez kopírování zpět).
	tiles({ params, items }) {
		return items.map(({ letter, value }) => {
			const t = getTile(params, letter, value)
			return {
				letter,
				value,
				height: t.height,
				overflow: t.overflow,
				missing: t.missing,
				body: t.preview.body.slice(),
				accent: t.preview.accent.slice(),
			}
		})
	},

	// groups: [{ prefix, placed: [{ letter, value, x, y }] }]
	export({ groups, params, flip, colors, readme, zipName }, progress) {
		const files = {}
		groups.forEach((g, i) => {
			if (groups.length > 1) progress(`Generuji podložku ${i + 1} / ${groups.length}…`)
			Object.assign(files, filesFor(g.prefix, g.placed, { params, flip, colors }))
		})
		const names = Object.keys(files)
		if (!readme && names.length === 1) return { name: names[0], data: files[names[0]] }
		if (readme) files['README.txt'] = new TextEncoder().encode(readme)
		progress('Balím ZIP…')
		return { name: zipName, data: zip(files) }
	},
}

function transferables(result) {
	if (Array.isArray(result)) return result.flatMap((r) => [r.body.buffer, r.accent.buffer])
	if (result?.data) return [result.data.buffer]
	return []
}

self.onmessage = async ({ data: { id, type, payload } }) => {
	try {
		const progress = (text) => self.postMessage({ id, progress: text })
		const result = await handlers[type](payload, progress)
		self.postMessage({ id, result }, transferables(result))
	} catch (err) {
		self.postMessage({ id, error: err?.message || String(err) })
	}
}
