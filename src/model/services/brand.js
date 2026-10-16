/** Zoot brand colours shared by JS-drawn things (passport canvas, 3D scenes, cover swatches). */
export const BRAND = {
  yellow: '#ffcc00',
  yellowSoft: '#ffe680',
  yellowPale: '#fff4c2',
  ink: '#111111',
  pink: '#f83878',
  orange: '#ff4d00'
}

/** Passport cover choices. Yellow is the default, as in the pitch deck. */
export const COVERS = ['#ffcc00', '#111111', '#f83878', '#fff4c2', '#ff4d00', '#ffffff']
export const DEFAULT_COVER = COVERS[0]

/** Ink or yellow, whichever reads on top of the given background. */
export function onColor(hex = DEFAULT_COVER) {
  const n = parseInt(hex.replace('#', ''), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.45 ? BRAND.ink : BRAND.yellow
}
