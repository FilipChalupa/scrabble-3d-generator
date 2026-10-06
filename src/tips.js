// Tipy pro tisk a upozornění podle nastavení a vygenerovaných kamenů (čisté funkce).

import { t, getLanguage } from './i18n.js'
import { effectiveFaceDown, hasMark } from './settings.js'

export const mm = (v) => `${(+v.toFixed(2)).toLocaleString(getLanguage())} mm`

export const letterName = (tile) => (tile.letter === '_' ? t('ui.blank') : tile.letter)

// built: [{ tile, info: { missing: [], overflow: bool } }] pro kameny, které už worker postavil.
export function slicerTips(s, built = []) {
	const lh = s.layerHeight
	const T = s.thickness
	const faceDown = effectiveFaceDown(s)
	const tips = []
	const warn = (text) => tips.push({ text, warn: true })
	const tip = (text) => tips.push({ text })

	const missing = [...new Set(built.flatMap((b) => b.info.missing))]
	if (missing.length) warn(t('tip.missing', { chars: missing.join(' ') }))
	const overflow = built.filter((b) => b.info.overflow).map((b) => letterName(b.tile))
	if (overflow.length) warn(t('tip.overflow', { list: overflow.join(', ') }))

	if (s.style === 'engraved') tip(t('tip.engraved'))
	else if (s.style === 'inlay') tip(t('tip.inlay'))
	else tip(t('tip.raised', { layer: Math.round(T / lh) + 1, z: mm(T + lh), t: mm(T) }))

	if (faceDown) tip(t('tip.faceDown'))
	else if (s.style !== 'raised') tip(t('tip.faceUp'))

	const checks = [[t('check.thickness'), T]]
	if (s.style === 'raised') checks.push([t('check.height'), s.height])
	else checks.push([t('check.depth'), s.depth])
	if (hasMark(s)) checks.push([t('check.mark'), s.markDepth])
	for (const [label, v] of checks) {
		const layers = v / lh
		if (Math.abs(layers - Math.round(layers)) > 0.01) {
			warn(t('tip.layers', { label, v: mm(v), lh: mm(lh), rec: mm(Math.max(1, Math.round(layers)) * lh) }))
		}
	}

	if (hasMark(s) && !faceDown) tip(t('tip.mark'))
	return tips
}
