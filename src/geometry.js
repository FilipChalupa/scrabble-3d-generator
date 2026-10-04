// Geometrie kamene: převod glyfů z fontu na 2D obrysy a jejich vytažení do 3D.
// Výstupem jsou pole trojúhelníků [x,y,z, x,y,z, x,y,z, ...] v milimetrech,
// kámen leží středem v počátku XY a spodní stranou na z = 0.

import { earcut, clipping } from './deps.js'

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

// Rozmístí písmeno a bodovou hodnotu na plochu kamene. Vrací obrysy v mm
// a obdélník kolem hodnoty, o který se písmeno ořízne, aby se nedotýkaly.
export function layoutTile(font, letter, value, p) {
	const s = p.size
	const cap = capHeight(font)
	const out = { letter: [], value: [], knockout: null }

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
			out.letter = transform(c, k, p.letterOffsetX * s - cx, baseline)
		}
	}

	if (p.showValue && (value > 0 || p.showZero)) {
		const fontSize = (p.valueSize * s) / cap
		const c = textContours(font, String(value), fontSize, p.curveSegments)
		if (c.length) {
			const bb = bounds(c)
			const m = p.valueMargin
			out.value = transform(c, 1, s / 2 - m - bb.maxX, -s / 2 + m)
			const vb = bounds(out.value)
			const g = p.valueGap ?? 0.6
			out.knockout = [
				[vb.minX - g, vb.minY - g],
				[s, vb.minY - g],
				[s, vb.maxY + g],
				[vb.minX - g, vb.maxY + g],
			]
		}
	}

	// Značka na spodku – zrcadlená, aby se při pohledu zespodu četla správně.
	const mark = (p.markText || '').trim()
	if (mark) {
		const c = textContours(font, mark, (p.markSize * s) / cap, p.curveSegments)
		if (c.length) {
			const bb = bounds(c)
			const k = Math.min(1, (0.8 * s) / (bb.maxX - bb.minX))
			const cx = ((bb.minX + bb.maxX) / 2) * k
			const cy = ((bb.minY + bb.maxY) / 2) * k
			out.mark = c.map((ring) => ring.map(([x, y]) => [-(x * k - cx), y * k - cy]))
		}
	}

	// Zasahuje něco do okraje kamene? Takové části se při stavbě oříznou.
	const limit = s / 2 - (p.edgeMargin ?? 0)
	const overflows = (c) => {
		if (!c?.length) return false
		const b = bounds(c)
		return Math.max(-b.minX, b.maxX, -b.minY, b.maxY) > limit + 1e-6
	}
	out.overflow = overflows(out.letter) || overflows(out.value) || overflows(out.mark)

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
const openRing = (r) => simplifyRing(r.slice(0, -1))

// Odstraní téměř totožné body, body na přímce a nulově široké výběžky,
// které po booleovských operacích občas zůstanou.
function simplifyRing(ring, tol = 1e-3) {
	let r = ring
	let changed = true
	while (changed && r.length >= 3) {
		changed = false
		const out = []
		for (let i = 0; i < r.length; i++) {
			const prev = out.length ? out[out.length - 1] : r[r.length - 1]
			const p = r[i]
			const next = r[(i + 1) % r.length]
			const ux = p[0] - prev[0], uy = p[1] - prev[1]
			const vx = next[0] - p[0], vy = next[1] - p[1]
			const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
			if (lu < tol || lv < tol || Math.abs(ux * vy - uy * vx) < 1e-7 * lu * lv) {
				changed = true
				continue
			}
			out.push(p)
		}
		r = out
	}
	return r
}

// Plné oblasti písmen a jejich doplněk v rámci obrysu kamene.
// Glyfy se nejdřív sjednotí (překryvy písmene a hodnoty, diakritiky…) a oříznou
// o kousek menším obrysem, aby se nedotýkaly hrany kamene.
// Vyplnění glyfu podle pravidla nonzero, jak to dělají fonty: obrysy se zpracují
// od největšího, obrysy ve směru vnějšího obrysu se přičtou, opačné odečtou.
// Zvládne i překrývající se tahy (typické pro proměnné fonty).
export function fillContours(contours) {
	if (!contours.length) return []
	const sorted = contours
		.map((c) => ({ c, a: signedArea(c) }))
		.sort((x, y) => Math.abs(y.a) - Math.abs(x.a))
	const outerSign = Math.sign(sorted[0].a)
	let result = []
	for (const { c, a } of sorted) {
		const poly = [[closeRing(c)]]
		if (Math.sign(a) === outerSign) result = result.length ? clipping.union(result, poly) : clipping.union(poly)
		else if (result.length) result = clipping.difference(result, poly)
	}
	return result
}

export function multiPolygonArea(mp) {
	return mp.reduce((s, poly) => s + poly.reduce((t, ring, i) => t + (i ? -1 : 1) * Math.abs(signedArea(ring)), 0), 0)
}

// Plné oblasti písmen a jejich doplněk v rámci obrysu kamene.
// Písmeno se ořízne kolem bodové hodnoty a vše se ořízne o kousek menším
// obrysem, aby se nic nedotýkalo hrany kamene.
export function regions(outline, layout, clip) {
	let letter = fillContours(layout.letter)
	const value = fillContours(layout.value)
	if (letter.length && layout.knockout) letter = clipping.difference(letter, [[closeRing(layout.knockout)]])
	let rings = []
	if (letter.length || value.length) {
		const glyphs = letter.length && value.length ? clipping.union(letter, value) : letter.length ? letter : value
		const merged = clipping.intersection(glyphs, [[closeRing(clip)]])
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

// Earcut občas vede hranu trojúhelníku přes vrchol, který leží přesně na ní
// (např. kolineární spodky teček u Ä). Takový trojúhelník rozdělíme, jinak by
// v síti vznikl T-spoj a těleso by nebylo uzavřené.
function splitOnVertices(tri, pts) {
	const out = []
	const stack = [tri]
	while (stack.length) {
		const t = stack.pop()
		let split = false
		for (let e = 0; e < 3 && !split; e++) {
			const i = t[e], j = t[(e + 1) % 3], k = t[(e + 2) % 3]
			const [ax, ay] = pts[i]
			const [bx, by] = pts[j]
			const dx = bx - ax, dy = by - ay
			const len2 = dx * dx + dy * dy
			if (len2 < EPS * EPS) continue
			for (let v = 0; v < pts.length; v++) {
				const [px, py] = pts[v]
				if (px < Math.min(ax, bx) - EPS || px > Math.max(ax, bx) + EPS) continue
				if (py < Math.min(ay, by) - EPS || py > Math.max(ay, by) + EPS) continue
				const u = ((px - ax) * dx + (py - ay) * dy) / len2
				if (u <= 1e-9 || u >= 1 - 1e-9) continue
				if (Math.abs((px - ax) * dy - (py - ay) * dx) / Math.sqrt(len2) > 1e-7) continue
				stack.push([i, v, k], [v, j, k])
				split = true
				break
			}
		}
		if (!split) out.push(t)
	}
	return out
}

function cap(out, polys, z, up) {
	for (const { outer, holes } of polys) {
		const all = outer.concat(...holes)
		const holeIndices = []
		let n = outer.length
		for (const h of holes) {
			holeIndices.push(n)
			n += h.length
		}
		const idx = earcut(all.flat(), holeIndices)
		for (let i = 0; i < idx.length; i += 3) {
			for (let [a, b, c] of splitOnVertices([idx[i], idx[i + 1], idx[i + 2]], all)) {
				const pa = all[a], pb = all[b], pc = all[c]
				const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
				if (cross > 0 !== up) [b, c] = [c, b]
				for (const v of [a, b, c]) out.push(all[v][0], all[v][1], z)
			}
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
export function buildTile(layout, p) {
	const T = p.thickness
	const d = Math.min(p.depth, T - 0.2)
	const outline = oriented(roundedRect(p.size, p.radius), true)
	const clip = roundedRect(p.size - 2 * p.edgeMargin, Math.max(0, p.radius - p.edgeMargin))
	const { letters, rest } = regions(outline, layout, clip)
	const outlinePoly = [{ outer: outline, holes: [] }]
	const markDepth = Math.min(p.markDepth ?? 0.4, (p.style === 'raised' ? T : T - d) - 0.6)
	const mark = layout.mark?.length && markDepth > 0.05 ? regions(outline, { letter: layout.mark, value: [] }, clip) : null

	// Spodní strana kamene, případně s vyrytou značkou.
	const bottom = (out) => {
		if (!mark) return cap(out, outlinePoly, 0, false)
		cap(out, mark.rest, 0, false)
		mark.rest.forEach((r, i) => {
			if (i > 0) walls(out, r.outer, 0, markDepth)
			for (const h of r.holes) walls(out, h, 0, markDepth)
		})
		cap(out, mark.letters, markDepth, false)
	}
	// První oblast doplňku je samotný obrys kamene – jeho stěny tvoří vnější plášť.
	const restInner = rest.map((r, i) => (i === 0 ? { outer: null, holes: r.holes } : r))

	const body = []
	const accent = []
	bottom(body)
	walls(body, outline, 0, T)
	cap(body, rest, T, true)

	if (p.style === 'raised') {
		polyWalls(accent, letters, T, T + p.height)
		cap(accent, letters, T + p.height, true)
		const slab = []
		bottom(slab)
		walls(slab, outline, 0, T)
		cap(slab, outlinePoly, T, true)
		return {
			body,
			accent,
			height: letters.length ? T + p.height : T,
			parts: { body: slab, letters: letters.length ? extrude(letters, T, T + p.height) : [] },
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
