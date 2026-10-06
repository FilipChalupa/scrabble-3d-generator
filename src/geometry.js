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

// Vyčistí uzavřený obrys: odstraní body bližší než tol (včetně zopakovaného
// počátečního bodu) a s collinear: true i body na přímce a nulově široké výběžky,
// které občas zůstanou po booleovských operacích.
function cleanRing(ring, { tol = EPS, collinear = false } = {}) {
	let r = ring
	let changed = true
	while (changed && r.length >= 3) {
		changed = false
		const out = []
		for (let i = 0; i < r.length; i++) {
			const prev = out.length ? out[out.length - 1] : r[r.length - 1]
			const p = r[i]
			const next = r[(i + 1) % r.length]
			const ux = p[0] - prev[0],
				uy = p[1] - prev[1]
			const vx = next[0] - p[0],
				vy = next[1] - p[1]
			const lu = Math.hypot(ux, uy),
				lv = Math.hypot(vx, vy)
			const straight = collinear && Math.abs(ux * vy - uy * vx) < 1e-7 * lu * lv
			if (lu < tol || (collinear && lv < tol) || straight) {
				changed = true
				continue
			}
			out.push(p)
		}
		r = out
	}
	return r
}

export function bounds(contours) {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity
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
				const x1 = cmd.x1,
					y1 = -cmd.y1,
					x2 = cmd.x,
					y2 = -cmd.y
				for (let i = 1; i <= curveSegments; i++) {
					const t = i / curveSegments
					const u = 1 - t
					push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2])
				}
				break
			}
			case 'C': {
				const [x0, y0] = last
				const x1 = cmd.x1,
					y1 = -cmd.y1,
					x2 = cmd.x2,
					y2 = -cmd.y2,
					x3 = cmd.x,
					y3 = -cmd.y
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
	return contours.map((c) => cleanRing(c)).filter((c) => c.length >= 3 && Math.abs(signedArea(c)) > EPS)
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
	if (r < 0.01)
		return [
			[-h, -h],
			[h, -h],
			[h, h],
			[-h, h],
		]
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
	return cleanRing(pts)
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
const openRing = (r) => cleanRing(r.slice(0, -1), { tol: 1e-3, collinear: true })

// Plné oblasti písmen a jejich doplněk v rámci obrysu kamene.
// Glyfy se nejdřív sjednotí (překryvy písmene a hodnoty, diakritiky…) a oříznou
// o kousek menším obrysem, aby se nedotýkaly hrany kamene.
// Vyplnění glyfu podle pravidla nonzero, jak to dělají fonty: obrysy se zpracují
// od největšího, obrysy ve směru vnějšího obrysu se přičtou, opačné odečtou.
// Zvládne i překrývající se tahy (typické pro proměnné fonty).
export function fillContours(contours) {
	if (!contours.length) return []
	const sorted = contours.map((c) => ({ c, a: signedArea(c) })).sort((x, y) => Math.abs(y.a) - Math.abs(x.a))
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
			const i = t[e],
				j = t[(e + 1) % 3],
				k = t[(e + 2) % 3]
			const [ax, ay] = pts[i]
			const [bx, by] = pts[j]
			const dx = bx - ax,
				dy = by - ay
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
				const pa = all[a],
					pb = all[b],
					pc = all[c]
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

// Šikmý pás mezi dvěma obrysy se stejným počtem bodů (zkosení hrany).
function band(out, lower, upper, z0, z1) {
	for (let i = 0; i < lower.length; i++) {
		const j = (i + 1) % lower.length
		const [ax, ay] = lower[i],
			[bx, by] = lower[j]
		const [cx, cy] = upper[j],
			[dx, dy] = upper[i]
		out.push(ax, ay, z0, bx, by, z0, cx, cy, z1)
		out.push(ax, ay, z0, cx, cy, z1, dx, dy, z1)
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

// ---------- Tenké tahy ----------

// Délka obrysu, kde je tvar užší než width. Z bodů na hranách (nejvýš po 0,25 mm)
// se vede paprsek kolmo dovnitř tvaru (plný materiál leží vlevo od směru obrysu)
// a hledá se protější hrana. Počítají se jen hrany zhruba rovnoběžné – tedy skutečné
// úzké tahy či mezery, ne ostré rohy a klínové zářezy, které slicer stejně dotáhne.
export function thinLength(polys, width) {
	const edges = []
	for (const p of polys) {
		for (const r of [p.outer, ...p.holes]) {
			for (let i = 0; i < r.length; i++) {
				const [ax, ay] = r[i]
				const [bx, by] = r[(i + 1) % r.length]
				const len = Math.hypot(bx - ax, by - ay)
				if (len < EPS) continue
				edges.push({ ax, ay, bx, by, len, nx: -(by - ay) / len, ny: (bx - ax) / len })
			}
		}
	}
	// Mřížka hran, aby se pro každý bod procházely jen hrany v okolí.
	const cell = Math.max(width, 0.5)
	const grid = new Map()
	for (const e of edges) {
		for (let i = Math.floor(Math.min(e.ax, e.bx) / cell); i <= Math.floor(Math.max(e.ax, e.bx) / cell); i++) {
			for (let j = Math.floor(Math.min(e.ay, e.by) / cell); j <= Math.floor(Math.max(e.ay, e.by) / cell); j++) {
				const k = `${i},${j}`
				if (!grid.has(k)) grid.set(k, [])
				grid.get(k).push(e)
			}
		}
	}
	const near = (x, y) => {
		const found = new Set()
		for (let i = Math.floor((x - width) / cell); i <= Math.floor((x + width) / cell); i++) {
			for (let j = Math.floor((y - width) / cell); j <= Math.floor((y + width) / cell); j++) {
				for (const e of grid.get(`${i},${j}`) ?? []) found.add(e)
			}
		}
		return found
	}

	let thin = 0
	for (const e of edges) {
		const samples = Math.max(1, Math.ceil(e.len / 0.25))
		for (let k = 0; k < samples; k++) {
			const u = (k + 0.5) / samples
			const ox = e.ax + (e.bx - e.ax) * u
			const oy = e.ay + (e.by - e.ay) * u
			for (const f of near(ox, oy)) {
				if (f === e || e.nx * f.nx + e.ny * f.ny > -0.94) continue // jen protilehlé hrany
				// průsečík paprsku o + t·n s úsečkou f
				const ex = f.bx - f.ax,
					ey = f.by - f.ay
				const den = e.nx * ey - e.ny * ex
				if (Math.abs(den) < 1e-12) continue
				const wx = f.ax - ox,
					wy = f.ay - oy
				const t = (wx * ey - wy * ex) / den
				const v = (wx * e.ny - wy * e.nx) / den
				if (t > 1e-6 && t < width && v >= 0 && v <= 1) {
					thin += e.len / samples
					break
				}
			}
		}
	}
	return thin
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
	// Zkosení horní hrany: horní plocha je o c menší a s obrysem ji spojuje šikmý pás.
	// Oba obrysy mají stejný počet bodů, aby šly propojit bod po bodu.
	const c = Math.max(0, Math.min(p.chamfer ?? 0, T - d - 0.4, p.size / 4))
	const r = Math.min(p.radius, p.size / 2 - 0.01)
	const top = c > 0 ? oriented(roundedRect(p.size - 2 * c, r >= 0.01 ? Math.max(r - c, 0.05) : 0), true) : outline
	const margin = Math.max(p.edgeMargin, c + 0.3)
	const clip = roundedRect(p.size - 2 * margin, Math.max(0, p.radius - margin))
	const { letters, rest } = regions(top, layout, clip)
	// Úzké tahy písmen a úzké mezery mezi nimi (jen když je zadaná šířka extruze).
	const thin = p.lineWidth ? { strokes: thinLength(letters, p.lineWidth), gaps: thinLength(rest, p.lineWidth) } : null
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

	// Boční plášť včetně případného zkosení.
	const sides = (out) => {
		walls(out, outline, 0, T - c)
		if (c > 0) band(out, outline, top, T - c, T)
	}

	const body = []
	const accent = []
	bottom(body)
	sides(body)
	cap(body, rest, T, true)

	if (p.style === 'raised') {
		polyWalls(accent, letters, T, T + p.height)
		cap(accent, letters, T + p.height, true)
		const slab = []
		bottom(slab)
		sides(slab)
		cap(slab, [{ outer: top, holes: [] }], T, true)
		return {
			body,
			accent,
			height: letters.length ? T + p.height : T,
			thin,
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
		thin,
		parts: p.style === 'inlay' ? { body: body.concat(accent), letters: letters.length ? extrude(letters, T - d, T) : [] } : null,
	}
}
