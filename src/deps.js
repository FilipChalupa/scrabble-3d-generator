// Externí knihovny pro geometrii a export. Plné URL (bez import mapy),
// aby šly načíst i ve Web Workeru; testy v Node je mapují na balíčky z npm.

export { default as earcut } from 'https://cdn.jsdelivr.net/npm/earcut@3.0.2/+esm'
export { default as clipping } from 'https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm'
export { default as opentype } from 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js'
export { zipSync, strToU8 } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js'
