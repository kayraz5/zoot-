import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  stubFetch,
  useCleanSlate,
} from './helpers/index.js'

useCleanSlate()

let getPlaceImages

beforeEach(async () => {
  vi.resetModules()
  ;({ getPlaceImages } = await import('../model/services/placeImages.js'))
})

const place = {
  id: 'test-place',
  name: 'Test Place',
  lat: 1.3008,
  lng: 103.8559,
}

const imageInfo = (name, { artist = '<a>Jane Doe</a>', description = '<b>A view</b>' } = {}) => ({
  thumburl: `https://commons.wikimedia.org/960px-${name}`,
  url: `https://commons.wikimedia.org/${name}`,
  width: 2400,
  height: 1600,
  extmetadata: {
    Artist: { value: artist },
    ImageDescription: { value: description },
    LicenseShortName: { value: '<span>CC BY-SA</span>' },
  },
  descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
})

const commonsPage = (name, index) => ({
  title: `File:${name}`,
  index,
  imageinfo: [imageInfo(name)],
})

describe('place images service', () => {
  it('returns no images and does not fetch when the place has no id', async () => {
    const fetchMock = stubFetch()

    await expect(getPlaceImages({ name: 'Unnamed place' })).resolves.toEqual([])

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns at most three Commons images with cleaned credits and caches them', async () => {
    const fetchMock = stubFetch([
      ['commons.wikimedia.org', () => jsonResponse({
        query: {
          pages: {
            one: commonsPage('one.jpg', 1),
            two: commonsPage('two.jpg', 2),
            three: commonsPage('three.jpg', 3),
            four: commonsPage('four.jpg', 4),
          },
        },
      })],
    ])

    const images = await getPlaceImages(place)

    expect(images).toHaveLength(3)
    expect(images.every((image) => !Object.hasOwn(image, 'file'))).toBe(true)
    expect(images[0]).toMatchObject({
      src: 'https://commons.wikimedia.org/960px-one.jpg',
      full: 'https://commons.wikimedia.org/1920px-one.jpg',
      alt: 'A view',
      credit: 'Jane Doe',
      license: 'CC BY-SA',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const cache = JSON.parse(localStorage.getItem('zoot.placeImages.v2'))
    expect(cache['test-place'].images).toEqual(images)
    expect(cache['test-place'].at).toEqual(expect.any(Number))
  })

  it('returns a fresh cached result without fetching Wikimedia', async () => {
    const cachedImages = [{
      src: 'https://example.test/cached.jpg',
      full: 'https://example.test/cached-full.jpg',
      alt: 'Cached image',
      credit: 'Cached author',
      license: 'CC BY',
      page: 'https://example.test/page',
    }]
    localStorage.setItem('zoot.placeImages.v2', JSON.stringify({
      'test-place': { at: Date.now(), images: cachedImages },
    }))
    const fetchMock = stubFetch()

    await expect(getPlaceImages(place)).resolves.toEqual(cachedImages)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns no images and leaves the cache empty when Commons fails', async () => {
    const fetchMock = stubFetch([
      ['commons.wikimedia.org', async () => {
        throw new Error('Commons unavailable')
      }],
    ])

    await expect(getPlaceImages(place)).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('zoot.placeImages.v2')).toBeNull()
  })

  it('uses a nearby Wikipedia lead image when Commons returns fewer than three images', async () => {
    const fetchMock = stubFetch([
      ['en.wikipedia.org', () => jsonResponse({
        query: {
          pages: {
            lead: {
              index: 1,
              pageimage: 'WikipediaLead.jpg',
              coordinates: [{ lat: place.lat, lon: place.lng }],
            },
          },
        },
      })],
      ['commons.wikimedia.org', (url) => {
        const params = new URL(url).searchParams
        if (params.has('generator')) {
          return jsonResponse({
            query: { pages: { commons: commonsPage('commons.jpg', 1) } },
          })
        }
        return jsonResponse({
          query: { pages: { lead: { imageinfo: [imageInfo('WikipediaLead.jpg')] } } },
        })
      }],
    ])

    const images = await getPlaceImages(place)

    expect(images).toHaveLength(2)
    expect(images[0]).toMatchObject({
      src: 'https://commons.wikimedia.org/960px-WikipediaLead.jpg',
      credit: 'Jane Doe',
    })
    expect(images[1].src).toBe('https://commons.wikimedia.org/960px-commons.jpg')
    expect(images.every((image) => !Object.hasOwn(image, 'file'))).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
