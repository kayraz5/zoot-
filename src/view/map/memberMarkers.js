import { Marker } from 'maplibre-gl'
import { DEFAULT_COVER, onColor } from '../../model/services/brand.js'

/**
 * Other quest members' live positions as small avatar pins (cover colour + initial + name).
 * `markers` is a Map(user_id → Marker) the caller keeps; members not in the list are removed.
 * members: [{ user_id, lat, lng, display_name, cover_color, stale }]
 */
export function syncMemberMarkers(map, markers, members) {
  const seen = new Set()
  for (const m of members) {
    seen.add(m.user_id)
    let marker = markers.get(m.user_id)
    if (!marker) {
      marker = new Marker({ element: memberPin(m), anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map)
      markers.set(m.user_id, marker)
    }
    marker.setLngLat([m.lng, m.lat])
    marker.getElement().classList.toggle('stale', !!m.stale)
  }
  for (const [id, marker] of markers) {
    if (!seen.has(id)) {
      marker.remove()
      markers.delete(id)
    }
  }
}

export function clearMemberMarkers(markers) {
  markers.forEach((m) => m.remove())
  markers.clear()
}

function memberPin(m) {
  const cover = m.cover_color || DEFAULT_COVER
  const el = document.createElement('div')
  el.className = 'zt-member-marker'
  const face = document.createElement('span')
  face.className = 'face'
  face.style.background = cover
  face.style.color = onColor(cover)
  face.textContent = (m.display_name || '?').trim().charAt(0).toUpperCase()
  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = m.display_name || 'Traveller'
  el.append(face, name)
  el.title = `${m.display_name || 'Traveller'} (live)`
  return el
}
