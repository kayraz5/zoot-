import { describe, expect, it } from 'vitest'
import {
  areaStampUrl,
  matchStampName,
  placeStampFile,
  placeStampUrl,
  stampKey
} from '../model/services/stampArt.js'
import places from '../model/data/places.sg.json'

describe('stampKey', () => {
  it('normalises punctuation, ampersands and apostrophes', () => {
    expect(stampKey('St Andrew’s Cathedral')).toBe('st andrews cathedral')
    expect(stampKey('Changi Chapel & Museum')).toBe('changi chapel and museum')
    expect(stampKey('Esplanade – Theatres on the Bay')).toBe('esplanade theatres on the bay')
    expect(stampKey('Pinnacle@Duxton')).toBe('pinnacle duxton')
  })
})

describe('matchStampName', () => {
  const files = [
    'Mount_Faber.png',
    'Sun_Yat_Sen_Memorial_Hall.png',
    'ArtScience_Museum.png'
  ]

  it('prefers an exact match', () => {
    expect(matchStampName('ArtScience Museum', files)).toBe('ArtScience_Museum.png')
  })

  it('matches when one name is a prefix of the other', () => {
    expect(matchStampName('Mount Faber Peak', files)).toBe('Mount_Faber.png')
  })

  it('matches when the meaningful words contain one another', () => {
    expect(matchStampName('Sun Yat Sen Nanyang Memorial Hall', files)).toBe(
      'Sun_Yat_Sen_Memorial_Hall.png'
    )
  })

  it('returns null when nothing is close', () => {
    expect(matchStampName('Jewel Rain Vortex', files)).toBeNull()
  })
})

describe('real stamp assets', () => {
  it('finds exact and punctuation-heavy place stamps', () => {
    expect(placeStampUrl('ArtScience Museum')).toBe('/stamps/ArtScience_Museum.png')
    expect(placeStampUrl('St Andrew’s Cathedral')).toBe('/stamps/St_Andrews_Cathedral.png')
    expect(placeStampUrl('CHIJMES')).toBe('/stamps/CHIJMES.png')
  })

  it('matches a place to a longer/suffixed filename', () => {
    expect(placeStampUrl('Mount Faber Peak')).toBe('/stamps/Mount_Faber.png')
    expect(placeStampUrl('East Coast Park (Marine Cove)')).toBe('/stamps/East_Coast_Park.png')
    expect(placeStampUrl('Pinnacle@Duxton Skybridge')).toBe('/stamps/Pinnacle_at_Duxton.png')
  })

  it('does not borrow an area stamp for a place', () => {
    expect(placeStampUrl('Chinatown Complex Food Centre')).toBeNull()
  })

  it('leaves places without art unmatched', () => {
    expect(placeStampUrl('Jewel Rain Vortex')).toBeNull()
  })

  it('uses exact area art, or "<Area> <place-type>" art, but not a venue', () => {
    expect(areaStampUrl('Chinatown')).toBe('/stamps/Chinatown.png')
    expect(areaStampUrl('Marina Bay')).toBe('/stamps/Marina_Bay.png')
    expect(areaStampUrl('Orchard')).toBe('/stamps/Orchard_Road.png')
    expect(areaStampUrl('Sentosa')).toBe('/stamps/Sentosa_Island.png')
    expect(areaStampUrl('East Coast')).toBe('/stamps/East_Coast_Park.png')
    expect(areaStampUrl('Changi')).toBeNull() // Changi_Museum is a venue, not the district
  })

  it('matches most catalog places and never borrows district art for one', () => {
    const matched = places.filter((place) => placeStampFile(place.name))
    expect(matched.length).toBeGreaterThan(50)

    const areaFiles = new Set([
      'Chinatown.png',
      'Marina_Bay.png',
      'Civic_District.png',
      'Kampong_Glam.png',
      'Little_India.png',
      'HarbourFront.png'
    ])
    for (const place of places) {
      expect(areaFiles.has(placeStampFile(place.name))).toBe(false)
    }
  })
})
