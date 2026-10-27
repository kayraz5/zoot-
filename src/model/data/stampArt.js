// Stamp artwork in src/assets/stamps/, named <place id>.png or area-<area>.png (e.g. area-civic-district.png).
// Add a file with the right name and it shows up; anything without one keeps the drawn chop.
const files = import.meta.glob('../../assets/stamps/*.png', { eager: true, query: '?url', import: 'default' })
const urls = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop().slice(0, -4), url]))

export const placeStamp = (placeId) => urls[placeId] || null
export const areaStamp = (areaId) => urls[`area-${areaId.toLowerCase().replace(/\s+/g, '-')}`] || null
