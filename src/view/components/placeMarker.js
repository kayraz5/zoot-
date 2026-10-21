// This file is the bridge between your Vue component (PlacePin.vue) and
// MapLibre, which knows nothing about Vue — it only understands plain
// HTMLElements. createPlaceMarker() renders PlacePin into a real DOM element
// and hands that element to a MapLibre Marker. removePlaceMarker() reverses
// the process so neither side leaks memory when a pin is taken off the map.

import { createApp } from 'vue'
import { Marker } from 'maplibre-gl'
import PlacePin from './PlacePin.vue'

export function createPlaceMarker(place, props = {}) {
    // place will be one entry from places.sg.json (has .name, .lat, .lng).
    // props = {} is an optional second argument for extra props to hand the
    // pin (like stamped: true), defaulting to an empty object so callers don't
    // have to pass it.

    const container = document.createElement("div") // empty <div>, nothing rendered into it yet

    // createApp() spins up a standalone Vue app whose only job is rendering
    // PlacePin. mount() is what actually draws it into `container` — before
    // this line container is still blank.
    const app = createApp(PlacePin, { label: place.name, ...props })
    app.mount(container)

    // Wrap the now-populated div in a MapLibre Marker and place it at the
    // location's real-world coordinates. anchor: 'bottom' plants the pin's
    // tip on the coordinate, not its center.
    const marker = new Marker({ element: container, anchor: 'bottom' })
      .setLngLat([place.lng, place.lat])

    // MapLibre's Marker and Vue's app have no built-in connection — nothing
    // will clean up `app` automatically when the marker is removed. Stashing
    // it here just gives removePlaceMarker a way to find it again later.
    marker._vueApp = app
    return marker
}

export function removePlaceMarker(marker) {
  marker._vueApp?.unmount() // tears down the Vue side (stops PlacePin's reactivity)
  marker.remove()           // tears down the MapLibre side (removes the pin from the map)
}