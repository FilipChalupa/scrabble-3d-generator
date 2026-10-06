import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaults, normalizeSettings, BED_MARGIN } from '../src/settings.js'
import { expandedTiles, plates, fileSafe, tileKey } from '../src/tiles.js'

test('celá sada a více sad', () => {
	assert.equal(expandedTiles(defaults()).length, 100)
	assert.equal(expandedTiles({ ...defaults(), sets: 3 }).length, 300)
})

test('jen vybrané kameny', () => {
	const s = normalizeSettings({ printMode: 'selection', selection: { 'Ř|4': 2, 'E|1': 1, 'NEEXISTUJE|1': 5 } })
	assert.deepEqual(expandedTiles(s).map(tileKey), ['E|1', 'Ř|4', 'Ř|4'])
	assert.equal(plates(s).length, 1)
})

test('kameny se vejdou na podložku a nepřekrývají se', () => {
	for (const bed of ['0', '1', '2', '3', '4', '5']) {
		const s = { ...defaults(), bed, sets: 2 }
		const ps = plates(s)
		assert.equal(ps.flat().length, 200)
		const b = { 0: [256, 256], 1: [180, 180], 2: [250, 210], 3: [180, 180], 4: [250, 220], 5: [220, 220] }[bed]
		for (const plate of ps) {
			for (const p of plate) {
				assert.ok(Math.abs(p.x) + s.size / 2 <= b[0] / 2 - BED_MARGIN + 1e-9, `x ${p.x} na ${bed}`)
				assert.ok(Math.abs(p.y) + s.size / 2 <= b[1] / 2 - BED_MARGIN + 1e-9, `y ${p.y} na ${bed}`)
			}
			const pos = new Set(plate.map((p) => `${p.x},${p.y}`))
			assert.equal(pos.size, plate.length)
		}
	}
})

test('neúplná poslední řada je vycentrovaná', () => {
	const s = normalizeSettings({ printMode: 'selection', selection: { 'A|1': 3 } })
	assert.deepEqual(
		plates(s)[0].map((p) => p.x),
		[-(s.size + s.gap), 0, s.size + s.gap],
	)
})

test('fileSafe', () => {
	assert.equal(fileSafe('Ř', 'zolik'), 'R')
	assert.equal(fileSafe('Ů', 'zolik'), 'U')
	assert.equal(fileSafe('_', 'zolik'), 'zolik')
	assert.equal(fileSafe('★', 'zolik'), 'x')
})
