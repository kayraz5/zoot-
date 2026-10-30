import { CITY } from './config.js'

// ---------------------------------------------------------------
// 1. Turning weather codes into words and icons
// ---------------------------------------------------------------

const WEATHER_CODES = {
	0: ['Clear', 'bi-sun'], 1: ['Mostly clear', 'bi-sun'], 2: ['Partly cloudy', 'bi-cloud-sun'], 3: ['Overcast', 'bi-cloud'],
	45: ['Fog', 'bi-cloud-fog'], 48: ['Fog', 'bi-cloud-fog'], 51: ['Drizzle', 'bi-cloud-drizzle'], 53: ['Drizzle', 'bi-cloud-drizzle'],
	55: ['Drizzle', 'bi-cloud-drizzle'], 61: ['Rain', 'bi-cloud-rain'], 63: ['Rain', 'bi-cloud-rain'], 65: ['Heavy rain', 'bi-cloud-rain-heavy'],
	80: ['Showers', 'bi-cloud-rain'], 81: ['Showers', 'bi-cloud-rain-heavy'], 82: ['Violent showers', 'bi-cloud-rain-heavy'],
	95: ['Thunderstorm', 'bi-cloud-lightning-rain'], 96: ['Thunderstorm', 'bi-cloud-lightning-rain'], 99: ['Thunderstorm', 'bi-cloud-lightning-rain']
};

// For unknown codes
const UNKNOWN_WEATHER = { label: '-', icon: 'bi-cloud' };

// Takes in a code, returns a { label, icon }
export function describeCode(code) {
	const entry = WEATHER_CODES[code]; // [label, icon]
	return entry ? { label: entry[0], icon: entry[1] } : UNKNOWN_WEATHER;
}

// ---------------------------------------------------------------
// 2. Fetching the forecast
// ---------------------------------------------------------------

const CACHE_MINUTES = 15;

// The cache is a Map: key -> { savedAt, data }
const forecastCache = new Map();

// Reads the hourly lists from the API response and builds one easy-to-use object per hour
function buildHourlyList(hourly) {
	const hours = [];

	for (let i = 0; i < hourly.time.length; i++) {
		hours.push({
			ms: Date.parse(hourly.time[i] + 'Z'),
			prob: hourly.precipitation_probability[i] ?? 0, // chance of rain: 0-100
			mm: hourly.precipitation[i] ?? 0, // rainfall in mm
			temp: hourly.temperature_2m[i], // temperature in °C
			code: hourly.weather_code[i] // see WEATHER_CODES
		});
	};
	return hours;
}

// Gets the forecast for a location. Defaults to the city set in config.js
// Returns { current: { temp, code, mm }, hours: [ { ms, prob, mm, temp, code }, ... ] }
export async function fetchForecast(lat = CITY.lat, lng = CITY.lng) {
	// Check the cache. Nearby coordinates share 1 entry because of rounding to 2dp
	const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
	const cached = forecastCache.get(cacheKey);

	if (cached) {
		const ageInMinutes = (Date.now() - cached.savedAt) / 60000;
		if (ageInMinutes < CACHE_MINUTES) {
			return cached.data;
		}
	}

	// Build the request URL with the options we want
	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.search = new URLSearchParams({
		latitude: lat,
		longitude: lng,
		timezone: 'UTC',
		forecast_days: 2,
		hourly: 'precipitation_probability,precipitation,temperature_2m,weather_code',
		current: 'temperature_2m,weather_code,precipitation'
	});

	// Call the API and stop with an error if it failed
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Open-Meteo ${response.status}`);
	}
	const json = await response.json();

	// Reshape the response into the format the app uses
	const data = {
		current: {
			temp: json.current.temperature_2m,
			code: json.current.weather_code,
			mm: json.current.precipitation
		},
		hours: buildHourlyList(json.hourly)
	};

	// Save it in the cache for next time, then return it
	forecastCache.set(cacheKey, { savedAt: Date.now(), data });
	return data;
}

// ---------------------------------------------------------------
// 3. Looking up the chance of rain at a given time
// ---------------------------------------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;
const DOWNPOUR_CHANCE = 90 // used by dev panel to fake heavy rain

export function rainLookup(forecast, force = false) {
	// Dev-forced rain
	if (force) {
		return () => DOWNPOUR_CHANCE;
	}

	// No forecast available, assume dry
	if (!forecast || !forecast.hours || forecast.hours.length === 0) {
		return () => 0;
	}

	// Normal mode: find the hour that contains the requested time
	return (ms) => {
		const matchingHour = forecast.hours.find((hour) => {
			return ms >= hour.ms && ms < hour.ms + ONE_HOUR_MS;
		})

		// Time outside forecast, assume dry
		return matchingHour ? matchingHour.prob : 0;
	}
}

// ---------------------------------------------------------------
// 4. Haze (PSI) from NEA via data.gov.sg
// ---------------------------------------------------------------

// Official PSI bands. Returns a label and a colour for a PSI number.
export function describePsi(psi) {
	if (psi == null) return { label: '—', level: 'unknown' }
	if (psi <= 50) return { label: 'Good', level: 'good' }
	if (psi <= 100) return { label: 'Moderate', level: 'moderate' }
	if (psi <= 200) return { label: 'Unhealthy', level: 'unhealthy' }
	if (psi <= 300) return { label: 'Very unhealthy', level: 'very-unhealthy' }
	return { label: 'Hazardous', level: 'hazardous' }
}

// Picks which of the 5 regions is closest to a point.
// The region centres come from the API itself (regionMetadata).
function nearestRegion(regions, lat, lng) {
	let best = regions[0]
	let bestDistance = Infinity
	for (const region of regions) {
		const dLat = region.labelLocation.latitude - lat
		const dLng = region.labelLocation.longitude - lng
		const distance = dLat * dLat + dLng * dLng   // fine for comparing short distances
		if (distance < bestDistance) {
			best = region
			bestDistance = distance
		}
	}
	return best.name
}

let hazeCache = null   // { savedAt, data }

export async function fetchHaze(lat = CITY.lat, lng = CITY.lng) {
	// PSI updates hourly, so a 15-minute cache is plenty.
	if (hazeCache && Date.now() - hazeCache.savedAt < 15 * 60000) return hazeCache.data

	const res = await fetch('https://api-open.data.gov.sg/v2/real-time/api/psi')
	if (!res.ok) throw new Error(`PSI ${res.status}`)
	const json = await res.json()

	const item = json.data.items[0]
	const region = nearestRegion(json.data.regionMetadata, lat, lng)

	const data = {
		region,                                                    // e.g. 'central'
		psi: item.readings.psi_twenty_four_hourly[region],         // e.g. 111
		pm25: item.readings.pm25_twenty_four_hourly[region],       // e.g. 65
		updatedAt: item.updatedTimestamp
	}
	hazeCache = { savedAt: Date.now(), data }
	return data
}

// ---------------------------------------------------------------
// 5. Lightning from NEA via data.gov.sg
// ---------------------------------------------------------------

// Distance in km between two points on Earth (haversine formula).
function distanceKm(lat1, lng1, lat2, lng2) {
	const toRad = (deg) => (deg * Math.PI) / 180
	const dLat = toRad(lat2 - lat1)
	const dLng = toRad(lng2 - lng1)
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
	return 6371 * 2 * Math.asin(Math.sqrt(a))
}

const NEAR_KM = 15   // a strike within this distance counts as "nearby"
let lightningCache = null

export async function fetchLightning(lat = CITY.lat, lng = CITY.lng) {
	// Lightning changes quickly, so only cache for 2 minutes.
	if (lightningCache && Date.now() - lightningCache.savedAt < 2 * 60000) return lightningCache.data

	const res = await fetch('https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning')
	if (!res.ok) throw new Error(`Lightning ${res.status}`)
	const json = await res.json()

	// No strikes at all? The readings list may be missing, so default to [].
	const strikes = json.data?.records?.[0]?.item?.readings ?? []

	let nearestKm = null
	for (const strike of strikes) {
		// The API gives coordinates as strings, so convert with Number().
		const km = distanceKm(lat, lng, Number(strike.location.latitude), Number(strike.location.longitude))
		if (nearestKm === null || km < nearestKm) nearestKm = km
	}

	const data = {
		count: strikes.length,
		nearestKm: nearestKm === null ? null : Math.round(nearestKm),
		nearby: nearestKm !== null && nearestKm <= NEAR_KM
	}
	lightningCache = { savedAt: Date.now(), data }
	return data
}