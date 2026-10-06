import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS } from '../src/presets.js'
import {
	STORAGE_KEY,
	defaults,
	normalizeSettings,
	encodeShare,
	decodeShare,
	shareDiff,
	shareHash,
	loadSettings,
	geometryParams,
	bedSize,
	effectiveFaceDown,
} from '../src/settings.js'

const memoryStorage = (data = {}) => ({
	getItem: (k) => (k in data ? data[k] : null),
	setItem: (k, v) => (data[k] = v),
})

test('normalizeSettings ořízne čísla, zahodí neznámé volby a špatné typy', () => {
	const s = normalizeSettings({ size: 500, thickness: 'x', style: 'nonsense', bed: 'custom', selection: { 'A|1': 3, 'B|3': -1, 'C|3': 1.5 }, foo: 1 })
	assert.equal(s.size, 50)
	assert.equal(s.thickness, defaults().thickness)
	assert.equal(s.style, 'engraved')
	assert.equal(s.bed, 'custom')
	assert.deepEqual(s.selection, { 'A|1': 3 })
	assert.ok(!('foo' in s))
})

test('předvolba určuje seznam kamenů, vlastní seznam se zachová', () => {
	assert.equal(normalizeSettings({ preset: 'de', tiles: 'X 1 1' }).tiles, PRESETS.de.tiles.trim())
	assert.equal(normalizeSettings({ preset: 'custom', tiles: 'X 1 1' }).tiles, 'X 1 1')
})

test('sdílený odkaz: kódování tam a zpět včetně diakritiky a symbolů', () => {
	const obj = { markText: 'Ž★', preset: 'sk', selection: { 'Ř|4': 2 } }
	assert.deepEqual(decodeShare(encodeShare(obj)), obj)
	assert.match(encodeShare(obj), /^[\w-]+$/)
})

test('shareDiff obsahuje jen změny a vynechá seznam kamenů u předvolby i vlastní font', () => {
	const s = { ...defaults(), preset: 'de', tiles: PRESETS.de.tiles.trim(), style: 'raised', font: 'custom' }
	assert.deepEqual(shareDiff(s), { preset: 'de', style: 'raised' })
	assert.equal(shareHash(defaults()), '')
	const selection = { ...defaults(), printMode: 'selection', selection: { 'A|1': 2 } }
	assert.deepEqual(shareDiff(selection).selection, { 'A|1': 2 })
})

test('loadSettings: první návštěva v angličtině dostane anglickou sadu', () => {
	const { settings, fromLink } = loadSettings(memoryStorage(), '', 'en')
	assert.equal(fromLink, false)
	assert.equal(settings.lang, 'en')
	assert.equal(settings.preset, 'en')
})

test('loadSettings: odkaz má přednost před uloženým nastavením, jazyk zůstane uložený', () => {
	const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ style: 'inlay', lang: 'cs' }) })
	const { settings, fromLink } = loadSettings(storage, shareHash({ ...defaults(), style: 'raised' }), 'en')
	assert.equal(fromLink, true)
	assert.equal(settings.style, 'raised')
	assert.equal(settings.lang, 'cs')
})

test('loadSettings přežije poškozená data', () => {
	const { settings } = loadSettings(memoryStorage({ [STORAGE_KEY]: '{nope' }), '#s=@@@', 'cs')
	assert.equal(settings.size, defaults().size)
})

test('odvozené hodnoty', () => {
	const s = { ...defaults(), letterSize: 50, bed: 'custom', bedX: 300, bedY: 200 }
	assert.equal(geometryParams(s).letterSize, 0.5)
	assert.deepEqual(bedSize(s), { x: 300, y: 200 })
	assert.equal(effectiveFaceDown({ ...s, faceDown: true, style: 'raised' }), false)
	assert.equal(effectiveFaceDown({ ...s, faceDown: true, style: 'inlay' }), true)
})
