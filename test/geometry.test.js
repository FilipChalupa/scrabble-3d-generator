import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { opentype } from '../src/deps.js'
import { layoutTile, buildTile, fillContours, multiPolygonArea } from '../src/geometry.js'
import { placeTris, toSTL, to3MF } from '../src/export.js'
import { PRESETS, FONTS, parseTiles } from '../src/presets.js'

const fonts = Object.fromEntries(
	FONTS.map((f) => [f.id, opentype.parse(readFileSync(new URL(`../${f.url}`, import.meta.url)).buffer)]),
)

const PARAMS = {
	size: 19,
	thickness: 4,
	radius: 1.5,
	depth: 0.6,
	height: 0.6,
	letterSize: 0.45,
	letterMaxWidth: 0.58,
	letterOffsetX: 0,
	letterOffsetY: 0.03,
	valueSize: 0.19,
	valueMargin: 1.4,
	showValue: true,
	showZero: true,
	curveSegments: 4,
	edgeMargin: 0.5,
	markText: '',
	markSize: 0.3,
	markDepth: 0.4,
}

// Každá hrana musí být sdílena právě dvěma trojúhelníky v opačném směru
// a objem musí vyjít kladný (normály ven).
function analyze(tris) {
	const key = (i) => `${tris[i].toFixed(4)},${tris[i + 1].toFixed(4)},${tris[i + 2].toFixed(4)}`
	const edges = new Map()
	let volume = 0
	for (let i = 0; i < tris.length; i += 9) {
		const k = [key(i), key(i + 3), key(i + 6)]
		for (let e = 0; e < 3; e++) {
			const ek = `${k[e]}|${k[(e + 1) % 3]}`
			edges.set(ek, (edges.get(ek) || 0) + 1)
		}
		const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(i, i + 9)
		volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
	}
	let bad = 0
	for (const [ek, c] of edges) {
		const [a, b] = ek.split('|')
		if (c !== 1 || edges.get(`${b}|${a}`) !== 1) bad++
	}
	return { bad, volume }
}

function assertSolid(tris, label) {
	const { bad, volume } = analyze(Float32Array.from(tris))
	assert.equal(bad, 0, `${label}: ${bad} otevřených hran`)
	assert.ok(volume > 0, `${label}: objem ${volume}`)
	return volume
}

test('předvolby mají očekávaný počet kamenů', () => {
	const expected = { cs: 100, sk: 100, de: 102, pl: 100, en: 100 }
	for (const [id, n] of Object.entries(expected)) {
		const total = parseTiles(PRESETS[id].tiles).reduce((s, t) => s + t.count, 0)
		assert.equal(total, n, id)
	}
})

test('přibalené fonty obsahují všechna písmena předvoleb', () => {
	const chars = new Set(
		Object.values(PRESETS)
			.flatMap((p) => parseTiles(p.tiles))
			.flatMap((t) => [...t.letter])
			.filter((c) => c !== '_'),
	)
	for (const [id, font] of Object.entries(fonts)) {
		const missing = [...chars].filter((c) => !(font.charToGlyphIndex(c) > 0))
		assert.deepEqual(missing, [], id)
	}
})

test('všechny kameny všech předvoleb jsou uzavřená tělesa', () => {
	const letters = new Map()
	for (const p of Object.values(PRESETS)) for (const t of parseTiles(p.tiles)) letters.set(`${t.letter}|${t.value}`, t)
	for (const style of ['engraved', 'raised', 'inlay']) {
		const p = { ...PARAMS, style }
		for (const t of letters.values()) {
			const built = buildTile(layoutTile(fonts['dejavu-sans'], t.letter, t.value, p), p)
			const label = `${style} ${t.letter}`
			assertSolid(built.body.concat(built.accent), label)
			if (built.parts) {
				assertSolid(built.parts.body, `${label} (kámen)`)
				if (built.parts.letters.length) assertSolid(built.parts.letters, `${label} (písmena)`)
			}
		}
	}
})

test('ostatní fonty, značka na spodku a nula na žolíku', () => {
	for (const id of Object.keys(fonts)) {
		for (const style of ['engraved', 'raised', 'inlay']) {
			const p = { ...PARAMS, style, markText: 'FC' }
			for (const [letter, value] of [['Ř', 4], ['Q', 10], ['_', 0], ['W', 4], ['Ů', 4]]) {
				const built = buildTile(layoutTile(fonts[id], letter, value, p), p)
				assertSolid(built.body.concat(built.accent), `${id} ${style} ${letter}`)
			}
		}
	}
})

test('vyrytý kámen má menší objem než plný a vystouplý větší', () => {
	const solid = 19 * 19 * 4
	const vol = (style) => {
		const p = { ...PARAMS, style }
		const b = buildTile(layoutTile(fonts['dejavu-sans'], 'M', 3, p), p)
		return analyze(Float32Array.from(b.body.concat(b.accent))).volume
	}
	assert.ok(vol('engraved') < solid)
	assert.ok(vol('raised') > solid - 4) // zaoblené rohy ubírají ~2 mm³
})

test('překrývající se obrysy se sjednotí (nonzero)', () => {
	const sq = (x, y, s, ccw = true) => {
		const c = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
		return ccw ? c : c.reverse()
	}
	// Dva překrývající se čtverce ve stejném směru = sjednocení.
	assert.equal(Math.round(multiPolygonArea(fillContours([sq(0, 0, 10), sq(5, 0, 10)]))), 150)
	// Čtverec s dírou opačného směru.
	assert.equal(Math.round(multiPolygonArea(fillContours([sq(0, 0, 10), sq(2, 2, 6, false)]))), 64)
	// Ostrůvek uvnitř díry se zachová.
	assert.equal(Math.round(multiPolygonArea(fillContours([sq(0, 0, 10), sq(2, 2, 6, false), sq(4, 4, 2)]))), 68)
})

test('otočení lícem dolů zachová uzavřenost i objem', () => {
	const p = { ...PARAMS, style: 'inlay' }
	const b = buildTile(layoutTile(fonts['dejavu-sans'], 'Ž', 4, p), p)
	const tris = Float32Array.from(b.body.concat(b.accent))
	const before = analyze(tris).volume
	const flipped = placeTris(tris, 10, 20, p.thickness)
	const after = assertSolid(flipped, 'flip')
	assert.ok(Math.abs(before - after) < 1e-3)
})

test('STL a 3MF mají správnou strukturu', async () => {
	const { unzipSync, strFromU8 } = await import('fflate')
	const p = { ...PARAMS, style: 'raised' }
	const b = buildTile(layoutTile(fonts['dejavu-sans'], 'A', 1, p), p)
	const body = Float32Array.from(b.parts.body)
	const stl = toSTL(body)
	assert.equal(stl.length, 84 + (body.length / 9) * 50)
	assert.equal(new DataView(stl.buffer).getUint32(80, true), body.length / 9)

	const zip = unzipSync(
		to3MF([
			{ name: 'Kámen', color: '#ffffff', tris: body },
			{ name: 'Písmena', color: '#000000', tris: Float32Array.from(b.parts.letters) },
		]),
	)
	const model = strFromU8(zip['3D/3dmodel.model'])
	assert.ok(zip['[Content_Types].xml'] && zip['_rels/.rels'])
	assert.equal(model.match(/<object /g).length, 3)
	assert.equal(model.match(/<component /g).length, 2)
	assert.match(model, /displaycolor="#000000FF"/)
})
