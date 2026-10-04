// Geometrie kamene: převod glyfů z fontu na 2D obrysy a jejich vytažení do 3D.
// Výstupem jsou pole trojúhelníků [x,y,z, x,y,z, x,y,z, ...] v milimetrech,
// kámen leží středem v počátku XY a spodní stranou na z = 0.

import { ShapeUtils, Vector2 } from 'three'
import clipping from 'polygon-clipping'

const EPS = 1e-6

// ---------- 2D pomocné funkce ----------

export function signedArea(c) {
	let a = 0
	for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
		a += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1])
	}
	return a / 2
}

function oriented(c, ccw) {
	return signedArea(c) > 0 === ccw ? c : c.slice().reverse()
}

function pointInPolygon(p, poly) {
	let inside = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i]
		const [xj, yj] = poly[j]
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
			inside = !inside
		}
	}
	return inside
}

function cleanContour(c) {
	const out = []
	for (const p of c) {
		const last = out[out.length - 1]
		if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPS) out.push(p)
	}
	while (out.length > 1) {
		const a = out[0]
		const b = out[out.length - 1]
		if (Math.hypot(a[0] - b[0], a[1] - b[1]) > EPS) break
		out.pop()
	}
	return out
}

export function bounds(contours) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	for (const c of contours) {
		for (const [x, y] of c) {
			if (x < minX) minX = x
			if (y < minY) minY = y
			if (x > maxX) maxX = x
			if (y > maxY) maxY = y
		}
	}
	return { minX, minY, maxX, maxY }
}

function transform(contours, scale, dx, dy) {
	return contours.map((c) => c.map(([x, y]) => [x * scale + dx, y * scale + dy]))
}

// ---------- Font → obrysy ----------

// Vrací obrysy textu s účařím na y = 0 (osa y míří nahoru).
export function textContours(font, text, size, curveSegments = 6) {
	const path = font.getPath(text, 0, 0, size)
	const contours = []
	let cur = null
	let last = [0, 0]
	const push = (p) => {
		cur.push(p)
		last = p
	}
	for (const cmd of path.commands) {
		switch (cmd.type) {
			case 'M':
				cur = []
				contours.push(cur)
				push([cmd.x, -cmd.y])
				break
			case 'L':
				push([cmd.x, -cmd.y])
				break
			case 'Q': {
				const [x0, y0] = last
				const x1 = cmd.x1, y1 = -cmd.y1, x2 = cmd.x, y2 = -cmd.y
				for (let i = 1; i <= curveSegments; i++) {
					const t = i / curveSegments
					const u = 1 - t
					push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2])
				}
				break
			}
			case 'C': {
				const [x0, y0] = last
				const x1 = cmd.x1, y1 = -cmd.y1, x2 = cmd.x2, y2 = -cmd.y2, x3 = cmd.x, y3 = -cmd.y
				const n = Math.ceil(curveSegments * 1.5)
				for (let i = 1; i <= n; i++) {
					const t = i / n
					const u = 1 - t
					push([
						u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
						u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
					])
				}
				break
			}
			case 'Z':
				cur = null
				break
		}
	}
	return contours.map(cleanContour).filter((c) => c.length >= 3 && Math.abs(signedArea(c)) > EPS)
}

function capHeight(font) {
	const os2 = font.tables.os2
	if (os2 && os2.sCapHeight) return os2.sCapHeight / font.unitsPerEm
	const bb = font.charToGlyph('H').getBoundingBox()
	return bb.y2 / font.unitsPerEm
}

export function roundedRect(size, radius, segments = 8) {
	const h = size / 2
	const r = Math.max(0, Math.min(radius, h - 0.01))
	if (r < 0.01) return [[-h, -h], [h, -h], [h, h], [-h, h]]
	const pts = []
	const corners = [
		[h - r, -h + r, -Math.PI / 2],
		[h - r, h - r, 0],
		[-h + r, h - r, Math.PI / 2],
		[-h + r, -h + r, Math.PI],
	]
	for (const [cx, cy, a0] of corners) {
		for (let i = 0; i <= segments; i++) {
			const a = a0 + (i / segments) * (Math.PI / 2)
			pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
		}
	}
	return cleanContour(pts)
}

// Rozmístí písmeno a bodovou hodnotu na plochu kamene. Vrací obrysy v mm.
export function layoutTile(font, letter, value, p) {
	const s = p.size
	const cap = capHeight(font)
	const out = []

	if (letter && letter !== '_') {
		const capTarget = p.letterSize * s
		const fontSize = capTarget / cap
		let c = textContours(font, letter, fontSize, p.curveSegments)
		if (c.length) {
			const bb = bounds(c)
			const maxW = p.letterMaxWidth * s
			const k = Math.min(1, maxW / (bb.maxX - bb.minX))
			const capH = capTarget * k
			const cx = ((bb.minX + bb.maxX) / 2) * k
			const baseline = p.letterOffsetY * s - capH / 2
			out.push(...transform(c, k, p.letterOffsetX * s - cx, baseline))
		}
	}

	if (p.showValue && value > 0) {
		const fontSize = (p.valueSize * s) / cap
		const c = textContours(font, String(value), fontSize, p.curveSegments)
		if (c.length) {
			const bb = bounds(c)
			const m = p.valueMargin
			out.push(...transform(c, 1, s / 2 - m - bb.maxX, -s / 2 + m))
		}
	}

	return out
}

// ---------- Vnoření obrysů (písmeno / díra / ostrůvek) ----------

function nest(contours) {
	const info = contours.map((c) => ({ c, area: Math.abs(signedArea(c)), depth: 0, parent: -1 }))
	for (let i = 0; i < info.length; i++) {
		const pt = info[i].c[0]
		for (let j = 0; j < info.length; j++) {
			if (i === j || info[j].area <= info[i].area) continue
			if (pointInPolygon(pt, info[j].c)) {
				info[i].depth++
				if (info[i].parent === -1 || info[j].area < info[info[i].parent].area) info[i].parent = j
			}
		}
	}
	return info
}

// Polygony s dírami, kde parita hloubky určuje, co je plné.
function polygonsByParity(info, parity) {
	const polys = []
	info.forEach((n, i) => {
		if (n.depth % 2 !== parity) return
		polys.push({
			outer: oriented(n.c, true),
			holes: info.filter((m) => m.parent === i).map((m) => oriented(m.c, false)),
		})
	})
	return polys
}

const closeRing = (c) => [...c, c[0]]
const openRing = (r) => cleanContour(r.slice(0, -1))

// Plné oblasti písmen a jejich doplněk v rámci obrysu kamene.
// Glyfy se nejdřív sjednotí (překryvy písmene a hodnoty, diakritiky…) a oříznou
// o kousek menším obrysem, aby se nedotýkaly hrany kamene.
export function regions(outline, contours, clip) {
	const glyphs = polygonsByParity(nest(contours), 0).map((p) => [[closeRing(p.outer), ...p.holes.map(closeRing)]])
	let rings = []
	if (glyphs.length) {
		const merged = clipping.intersection(clipping.union(...glyphs), [[closeRing(clip)]])
		rings = merged
			.flat()
			.map(openRing)
			.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > EPS)
	}
	const info = nest(rings)
	return {
		letters: polygonsByParity(info, 0),
		rest: [
			{
				outer: outline,
				holes: info.filter((n) => n.depth === 0).map((n) => oriented(n.c, false)),
			},
			...polygonsByParity(info, 1),
		],
	}
}

// ---------- 3D sestavení ----------

const v2 = (p) => new Vector2(p[0], p[1])

function cap(out, polys, z, up) {
	for (const { outer, holes } of polys) {
		const all = outer.concat(...holes)
		const faces = ShapeUtils.triangulateShape(outer.map(v2), holes.map((h) => h.map(v2)))
		for (let [a, b, c] of faces) {
			const pa = all[a], pb = all[b], pc = all[c]
			const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
			if (cross > 0 !== up) [b, c] = [c, b]
			for (const i of [a, b, c]) out.push(all[i][0], all[i][1], z)
		}
	}
}

// Stěny podél obrysu; plný materiál leží vlevo od směru obrysu.
function walls(out, contour, z0, z1) {
	for (let i = 0; i < contour.length; i++) {
		const [ax, ay] = contour[i]
		const [bx, by] = contour[(i + 1) % contour.length]
		out.push(ax, ay, z0, bx, by, z0, bx, by, z1)
		out.push(ax, ay, z0, bx, by, z1, ax, ay, z1)
	}
}

function polyWalls(out, polys, z0, z1) {
	for (const { outer, holes } of polys) {
		walls(out, outer, z0, z1)
		for (const h of holes) walls(out, h, z0, z1)
	}
}

export function extrude(polys, z0, z1) {
	const out = []
	cap(out, polys, z0, false)
	cap(out, polys, z1, true)
	polyWalls(out, polys, z0, z1)
	return out
}

// Hlavní funkce: z obrysů písmen postaví kámen podle zvoleného stylu.
//  - engraved: písmena vyrytá do kamene (jeden díl)
//  - raised:   písmena vystupují nad kámen
//  - inlay:    písmena zapuštěná v rovině povrchu (dvoubarevný tisk)
// Vrací { body, accent, parts } – body+accent tvoří jednu uzavřenou síť,
// parts jsou samostatné díly pro vícebarevný tisk (nebo null).
export function buildTile(contours, p) {
	const T = p.thickness
	const d = Math.min(p.depth, T - 0.2)
	const outline = oriented(roundedRect(p.size, p.radius), true)
	const clip = roundedRect(p.size - 2 * p.edgeMargin, Math.max(0, p.radius - p.edgeMargin))
	const { letters, rest } = regions(outline, contours, clip)
	const outlinePoly = [{ outer: outline, holes: [] }]
	// První oblast doplňku je samotný obrys kamene – jeho stěny tvoří vnější plášť.
	const restInner = rest.map((r, i) => (i === 0 ? { outer: null, holes: r.holes } : r))

	const body = []
	const accent = []
	cap(body, outlinePoly, 0, false)
	walls(body, outline, 0, T)
	cap(body, rest, T, true)

	if (p.style === 'raised') {
		polyWalls(accent, letters, T, T + p.height)
		cap(accent, letters, T + p.height, true)
		return {
			body,
			accent,
			height: letters.length ? T + p.height : T,
			parts: { body: extrude(outlinePoly, 0, T), letters: letters.length ? extrude(letters, T, T + p.height) : [] },
		}
	}

	for (const r of restInner) {
		if (r.outer) walls(accent, r.outer, T - d, T)
		for (const h of r.holes) walls(accent, h, T - d, T)
	}
	cap(accent, letters, T - d, true)

	return {
		body,
		accent,
		height: T,
		parts:
			p.style === 'inlay'
				? { body: body.concat(accent), letters: letters.length ? extrude(letters, T - d, T) : [] }
				: null,
	}
}
