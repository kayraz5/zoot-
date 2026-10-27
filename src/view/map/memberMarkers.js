import { Marker } from 'maplibre-gl'
import { DEFAULT_COVER, onColor } from '../../model/services/brand.js'

/**
 * Live positions of other quest members, drawn as small avatar pins (cover colour,
 * initial and name).
 *
 * `markers` is a caller-owned Map(user_id → Marker). Members not present in the new
 * list are removed, so this is a full sync: pass the current list every time.
 *
 * @param {Map} markers
 * @param {{ user_id: string, lat: number, lng: number, display_name?: string, cover_color?: string, stale?: boolean }[]} members
 */
export function syncMemberMarkers(map, markers, members) {
  const seen = new Set()

  for (const member of members) {
    seen.add(member.user_id)

    let marker = markers.get(member.user_id)
    if (!marker) {
      marker = new Marker({ element: memberPin(member), anchor: 'bottom' })
        .setLngLat([member.lng, member.lat])
        .addTo(map)
      markers.set(member.user_id, marker)
    }

    marker.setLngLat([member.lng, member.lat])
    marker.getElement().classList.toggle('stale', !!member.stale)
  }

  for (const [userId, marker] of markers) {
    if (seen.has(userId)) continue
    marker.remove()
    markers.delete(userId)
  }
}

/** Remove every member pin (e.g. on leaving the quest or unmounting the HUD). */
export function clearMemberMarkers(markers) {
  markers.forEach((marker) => marker.remove())
  markers.clear()
}

/** Build the DOM element for one member: coloured initial + name label. */
function memberPin(member) {
  const cover = member.cover_color || DEFAULT_COVER
  const element = document.createElement('div')
  element.className = 'zt-member-marker'

  const face = document.createElement('span')
  face.className = 'face'
  face.style.background = cover
  face.style.color = onColor(cover)
  face.textContent = (member.display_name || '?').trim().charAt(0).toUpperCase()

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = member.display_name || 'Traveller'

  element.append(face, name)
  element.title = `${member.display_name || 'Traveller'} (live)`
  return element
}

/** A "Meet here" pin for a quest's meeting point (opened from the quest page). Returns the Marker. */
export function meetingMarker(map, { lat, lng, label }) {
  const element = document.createElement('div')
  element.className = 'zt-meet-marker'
  const icon = document.createElement('span')
  icon.className = 'pin'
  icon.innerHTML = '<i class="bi bi-geo-alt-fill" aria-hidden="true"></i>'
  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = label ? `Meet here · ${label}` : 'Meet here'
  element.append(name, icon)
  element.title = name.textContent
  return new Marker({ element, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
}
