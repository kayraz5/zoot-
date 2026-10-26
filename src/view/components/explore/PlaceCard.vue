<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getPlaceImages } from '../../../model/services/placeImages.js'
import { formatDuration, isOpenDuringVisit } from '../../../model/services/hours.js'
import { now } from '../../../model/services/clock.js'
import PlaceArt from '../PlaceArt.vue'

/**
 * One place in the Explore list. The photo is fetched only once the card scrolls into view:
 * Wikimedia requests are queued and rate-limited, so 130 cards can't all load at once.
 * Until then (or if there's no photo) the illustrated poster shows instead.
 */
const props = defineProps({ place: { type: Object, required: true } })

const root = ref(null)
const photo = ref(null)
let observer = null

onMounted(() => {
	if (typeof IntersectionObserver === 'undefined') return load()
	observer = new IntersectionObserver((entries) => {
		if (entries.some((e) => e.isIntersecting)) {
			observer.disconnect()
			load()
		}
	}, { rootMargin: '300px' })
	// root is the RouterLink component; observe its DOM element, not the component instance.
	const el = root.value?.$el ?? root.value
	if (el instanceof Element) observer.observe(el)
	else load()
})
onBeforeUnmount(() => observer?.disconnect())

async function load() {
	const [first] = await getPlaceImages(props.place)
	photo.value = first || null
}

const price = computed(() => (props.place.cost_band ? '$'.repeat(props.place.cost_band) : 'Free'))
const openNow = computed(() => isOpenDuringVisit(props.place, now(), now() + 60000))
// Guessed hours (OSM had none) can't say "open now" honestly.
const hoursUnknown = computed(() => props.place.hours_verified === false)
</script>

<template>
	<RouterLink ref="root" :to="`/place/${place.id}`" class="card-link" :aria-label="`${place.name}, ${place.area}`">
		<article class="place-card">
			<div class="media">
				<img v-if="photo" :src="photo.src" :alt="photo.alt || place.name" loading="lazy" />
				<PlaceArt v-else :place="place" :height="150" :rounded="false" />
				<span v-if="hoursUnknown" class="badge-open unknown">Hours not confirmed</span>
				<span v-else class="badge-open" :class="{ closed: !openNow }">{{ openNow ? 'Open now' : 'Closed now' }}</span>
				<span v-if="photo?.credit" class="credit" :title="`${photo.credit}${photo.license ? ' · ' + photo.license : ''}`">© {{ photo.credit }}</span>
			</div>
			<div class="body">
				<h3 class="name">{{ place.name }}</h3>
				<div class="meta">
					<span><i class="bi bi-geo-alt"></i> {{ place.area }}</span>
					<span><i class="bi bi-hourglass-split"></i> {{ formatDuration(place.duration_min) }}</span>
					<span>{{ price }}</span>
					<span><i class="bi" :class="place.indoor ? 'bi-house' : 'bi-sun'"></i> {{ place.indoor ? 'Indoor' : 'Outdoor' }}</span>
				</div>
				<p class="blurb">{{ place.blurb }}</p>
			</div>
		</article>
	</RouterLink>
</template>

<style scoped>
.card-link { display: block; height: 100%; color: inherit; text-decoration: none; border-radius: var(--zt-radius); }
.card-link:focus-visible { outline: 3px solid var(--zt-yellow); outline-offset: 3px; }
.place-card {
	height: 100%; display: flex; flex-direction: column; overflow: hidden;
	background: var(--zt-card); border: var(--zt-bw) solid var(--zt-line); border-radius: var(--zt-radius);
	box-shadow: var(--zt-shadow-sm); transition: transform 0.12s, box-shadow 0.12s;
}
.card-link:hover .place-card { transform: translateY(-2px); box-shadow: var(--zt-shadow); }
.media { position: relative; height: 150px; background: var(--zt-yellow-pale); border-bottom: var(--zt-bw) solid var(--zt-line); }
.media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.badge-open {
	position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: 999px;
	font-size: 0.68rem; font-weight: 800; background: var(--zt-yellow); color: #111; border: 2px solid #111;
}
.badge-open.closed { background: #fff; color: #555; border-color: #555; }
.badge-open.unknown { background: #fff1d6; color: #7c2d12; border-color: #b45309; }
.credit {
	position: absolute; right: 6px; bottom: 6px; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	font-size: 0.58rem; color: #fff; background: rgba(0, 0, 0, 0.45); padding: 1px 6px; border-radius: 6px;
}
.body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.name { font-family: var(--zt-font-head); font-weight: 700; font-size: 1.02rem; line-height: 1.2; margin: 0; }
.meta { display: flex; flex-wrap: wrap; column-gap: 12px; row-gap: 2px; font-size: 0.74rem; font-weight: 700; color: var(--zt-muted); }
.meta > span { white-space: nowrap; }
.meta .bi { margin-right: 2px; }
.blurb {
	margin: 0; font-size: 0.82rem; color: var(--zt-muted);
	display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
</style>
