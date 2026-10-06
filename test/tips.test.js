import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLanguage, count, t } from '../src/i18n.js'
import { defaults } from '../src/settings.js'
import { slicerTips } from '../src/tips.js'

globalThis.document ??= { documentElement: {} }

const texts = (tips) => tips.map((x) => x.text)
const warnings = (tips) => tips.filter((x) => x.warn).map((x) => x.text)

test('vystouplá písmena: výměna filamentu na správné vrstvě', () => {
	setLanguage('cs')
	const tips = slicerTips({ ...defaults(), style: 'raised', thickness: 4, layerHeight: 0.2 })
	assert.ok(texts(tips).some((x) => x.includes('vrstvu 21') && x.includes('4,2 mm')))
	setLanguage('en')
	assert.ok(texts(slicerTips({ ...defaults(), style: 'raised' })).some((x) => x.includes('layer 21') && x.includes('4.2 mm')))
})

test('upozornění na hodnoty, které nejsou násobkem výšky vrstvy', () => {
	setLanguage('cs')
	assert.deepEqual(warnings(slicerTips(defaults())), [])
	const w = warnings(slicerTips({ ...defaults(), depth: 0.5 }))
	assert.equal(w.length, 1)
	assert.match(w[0], /0,6 mm/)
})

test('chybějící znaky a přesah', () => {
	setLanguage('cs')
	const built = [
		{ tile: { letter: 'Ŕ' }, info: { missing: ['Ŕ'], overflow: false } },
		{ tile: { letter: '_' }, info: { missing: [], overflow: true } },
	]
	const w = warnings(slicerTips(defaults(), built))
	assert.ok(w.some((x) => x.includes('Ŕ')))
	assert.ok(w.some((x) => x.includes(t('ui.blank'))))
})

test('skloňování', () => {
	setLanguage('cs')
	assert.deepEqual(
		[0, 1, 2, 4, 5, 22].map((n) => count(n, 'n.tiles')),
		['0 kamenů', '1 kámen', '2 kameny', '4 kameny', '5 kamenů', '22 kamenů'],
	)
	setLanguage('en')
	assert.deepEqual(
		[0, 1, 2].map((n) => count(n, 'n.plates')),
		['0 plates', '1 plate', '2 plates'],
	)
})
