// Export trojúhelníkových sítí do STL a 3MF.

import { zipSync, strToU8 } from './deps.js'

// Posune (a volitelně otočí lícem dolů) pole trojúhelníků.
export function placeTris(tris, dx, dy, flipHeight = null) {
	const out = new Float32Array(tris.length)
	for (let i = 0; i < tris.length; i += 9) {
		for (let v = 0; v < 3; v++) {
			const src = i + v * 3
			const dst = src
			let x = tris[src], y = tris[src + 1], z = tris[src + 2]
			if (flipHeight !== null) {
				// Otočení o 180° kolem osy Y – zachová orientaci normál.
				x = -x
				z = flipHeight - z
			}
			out[dst] = x + dx
			out[dst + 1] = y + dy
			out[dst + 2] = z
		}
	}
	return out
}

export function concatTris(list) {
	const len = list.reduce((s, t) => s + t.length, 0)
	const out = new Float32Array(len)
	let o = 0
	for (const t of list) {
		out.set(t, o)
		o += t.length
	}
	return out
}

export function toSTL(tris, name = 'scrabble') {
	const n = tris.length / 9
	const buf = new ArrayBuffer(84 + n * 50)
	const view = new DataView(buf)
	const header = `binary STL ${name}`.slice(0, 80)
	for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f)
	view.setUint32(80, n, true)
	let o = 84
	for (let i = 0; i < tris.length; i += 9) {
		const ax = tris[i], ay = tris[i + 1], az = tris[i + 2]
		const ux = tris[i + 3] - ax, uy = tris[i + 4] - ay, uz = tris[i + 5] - az
		const vx = tris[i + 6] - ax, vy = tris[i + 7] - ay, vz = tris[i + 8] - az
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
		const l = Math.hypot(nx, ny, nz) || 1
		view.setFloat32(o, nx / l, true)
		view.setFloat32(o + 4, ny / l, true)
		view.setFloat32(o + 8, nz / l, true)
		o += 12
		for (let k = 0; k < 9; k++, o += 4) view.setFloat32(o, tris[i + k], true)
		o += 2
	}
	return new Uint8Array(buf)
}

function weld(tris) {
	const map = new Map()
	const verts = []
	const faces = []
	const key = (i) => `${tris[i].toFixed(4)},${tris[i + 1].toFixed(4)},${tris[i + 2].toFixed(4)}`
	for (let i = 0; i < tris.length; i += 9) {
		const f = []
		for (let v = 0; v < 3; v++) {
			const k = key(i + v * 3)
			let idx = map.get(k)
			if (idx === undefined) {
				idx = verts.length
				map.set(k, idx)
				verts.push(k)
			}
			f.push(idx)
		}
		if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f)
	}
	return { verts, faces }
}

function meshXML(tris) {
	const { verts, faces } = weld(tris)
	const parts = ['<mesh><vertices>']
	for (const v of verts) {
		const [x, y, z] = v.split(',')
		parts.push(`<vertex x="${x}" y="${y}" z="${z}"/>`)
	}
	parts.push('</vertices><triangles>')
	for (const [a, b, c] of faces) parts.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
	parts.push('</triangles></mesh>')
	return parts.join('')
}

const escapeXML = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

// Každý druh kamene je ve 3MF jeden objekt složený z dílů (kámen, písmena) a na
// podložce se objevuje jako jeho instance. Slicer (PrusaSlicer, Bambu Studio,
// OrcaSlicer) tak umí kameny jednotlivě mazat, posouvat a dílům přiřadit filamenty.
//   tiles: [{ name, parts: [{ name, color: '#rrggbb', tris }] }]
//   items: [{ tile: index do tiles, x, y, flipHeight: číslo | null }]
export function to3MF(tiles, items, name = 'Scrabble') {
	const materials = []
	const materialIndex = new Map()
	for (const t of tiles) {
		for (const part of t.parts) {
			if (!materialIndex.has(part.name)) {
				materialIndex.set(part.name, materials.length)
				materials.push(`<base name="${escapeXML(part.name)}" displaycolor="${part.color.toUpperCase()}FF"/>`)
			}
		}
	}

	let nextId = 2
	const objects = []
	const tileIds = tiles.map((t) => {
		const components = []
		for (const part of t.parts) {
			if (!part.tris.length) continue
			const id = nextId++
			objects.push(
				`<object id="${id}" name="${escapeXML(part.name)}" type="model" pid="1" pindex="${materialIndex.get(part.name)}">${meshXML(part.tris)}</object>`,
			)
			components.push(`<component objectid="${id}"/>`)
		}
		const id = nextId++
		objects.push(`<object id="${id}" name="${escapeXML(t.name)}" type="model"><components>${components.join('')}</components></object>`)
		return id
	})

	const fmt = (v) => +v.toFixed(4)
	const build = items
		.map(({ tile, x, y, flipHeight }) => {
			// Řádkový zápis matice 3×4; otočení lícem dolů = 180° kolem osy Y.
			const m = flipHeight == null ? `1 0 0 0 1 0 0 0 1 ${fmt(x)} ${fmt(y)} 0` : `-1 0 0 0 1 0 0 0 -1 ${fmt(x)} ${fmt(y)} ${fmt(flipHeight)}`
			return `<item objectid="${tileIds[tile]}" transform="${m}"/>`
		})
		.join('')

	const model =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<model unit="millimeter" xml:lang="cs-CZ" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
		`<metadata name="Title">${escapeXML(name)}</metadata>` +
		`<resources><basematerials id="1">${materials.join('')}</basematerials>${objects.join('')}</resources>` +
		`<build>${build}</build></model>`

	return zipSync({
		'[Content_Types].xml': strToU8(
			'<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
				'<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
		),
		'_rels/.rels': strToU8(
			'<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
				'<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
		),
		'3D/3dmodel.model': strToU8(model),
	})
}

export function zip(files) {
	return zipSync(files, { level: 6 })
}
