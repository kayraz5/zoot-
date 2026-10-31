// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { entryStatus } from '../model/services/immigration.js'
import {
  stubFetch,
  textResponse,
  useCleanSlate,
} from './helpers/index.js'
import {
  fetchIcaSlugs,
  fetchIndexRules,
  fetchIso3Codes,
} from '../../api/_lib/immigration.js'

useCleanSlate()

const INDEX_URL = 'passport-index-tidy-iso2.csv'
const ISO2_URL = 'passport-index-matrix-iso2.csv'
const ISO3_URL = 'passport-index-matrix-iso3.csv'

const csv = (rows) => [
  'passport,destination,requirement',
  ...rows.map(([passport, destination = 'SG', requirement = '30']) => (
    `${passport},${destination},${requirement}`
  )),
].join('\n')

const matrixCsv = (codes) => [
  'passport',
  ...codes,
].join('\n')

const sufficientRules = () => csv([
  ['IN', 'SG', 'e-visa'],
  ...Array.from({ length: 149 }, (_, index) => [`X${String(index).padStart(2, '0')}`]),
])

const sufficientCodes = () => Array.from(
  { length: 150 },
  (_, index) => `C${String(index).padStart(2, '0')}`,
)

describe('api/_lib/immigration', () => {
  describe('fetchIcaSlugs', () => {
    it('returns ICA slugs sorted and without duplicates', async () => {
      const expected = [
        'india',
        ...Array.from({ length: 24 }, (_, index) => `country-${String(index).padStart(2, '0')}`),
      ].sort()
      const html = [...expected, 'india']
        .map((slug) => `<a href="/visa-detail-page/${slug}">${slug}</a>`)
        .join('\n')
      stubFetch([['ica.gov.sg', () => textResponse(html)]])

      await expect(fetchIcaSlugs()).resolves.toEqual(expected)
    })

    it('rejects an ICA response with a suspiciously short slug list', async () => {
      const html = Array.from({ length: 5 }, (_, index) => (
        `<a href="/visa-detail-page/country-${index}">country</a>`
      )).join('\n')
      stubFetch([['ica.gov.sg', () => textResponse(html)]])

      await expect(fetchIcaSlugs()).rejects.toThrow('ICA list looks wrong (5 countries)')
    })

    it('rejects an unsuccessful ICA response with its HTTP status', async () => {
      stubFetch([['ica.gov.sg', () => textResponse('upstream failure', 500)]])

      await expect(fetchIcaSlugs()).rejects.toThrow('ICA 500')
    })
  })

  describe('fetchIndexRules', () => {
    it('returns Singapore passport rules when the CSV has enough rows', async () => {
      stubFetch([[INDEX_URL, () => textResponse(sufficientRules())]])

      const rules = await fetchIndexRules()

      expect(Object.keys(rules)).toHaveLength(150)
      expect(rules.IN).toBe('e-visa')
      expect(rules.X148).toBe('30')
    })

    it('rejects an incomplete Singapore rules CSV', async () => {
      stubFetch([[INDEX_URL, () => textResponse(csv([
        ['IN', 'SG', 'e-visa'],
        ...Array.from({ length: 8 }, (_, index) => [`X${index}`]),
      ]))]])

      await expect(fetchIndexRules()).rejects.toThrow(/Passport Index data looks incomplete/)
    })
  })

  describe('fetchIso3Codes', () => {
    it('pairs ISO2 and ISO3 columns by row', async () => {
      const iso2 = ['IN', 'US', ...sufficientCodes().slice(2)]
      const iso3 = ['IND', 'USA', ...sufficientCodes().slice(2).map((code) => `Z${code}`)]
      stubFetch([
        [ISO2_URL, () => textResponse(matrixCsv(iso2))],
        [ISO3_URL, () => textResponse(matrixCsv(iso3))],
      ])

      const codes = await fetchIso3Codes()

      expect(codes).toMatchObject({ IN: 'IND', US: 'USA', C149: 'ZC149' })
      expect(Object.keys(codes)).toHaveLength(150)
    })

    it('rejects ISO columns with mismatched lengths', async () => {
      const codes = sufficientCodes()
      stubFetch([
        [ISO2_URL, () => textResponse(matrixCsv(codes))],
        [ISO3_URL, () => textResponse(matrixCsv(codes.slice(0, -1)))],
      ])

      await expect(fetchIso3Codes()).rejects.toThrow('Passport Index code lists do not line up')
    })
  })

  describe('entryStatus with parsed live data', () => {
    it('classifies known IN and unknown ZZ from parsed results', async () => {
      const icaSlugs = ['india', 'japan']
      const icaHtml = icaSlugs
        .concat('india', ...Array.from({ length: 23 }, (_, index) => `country-${index}`))
        .map((slug) => `<a href="/visa-detail-page/${slug}">${slug}</a>`)
        .join('\n')
      const rulesCsv = sufficientRules()
      stubFetch([
        ['ica.gov.sg', () => textResponse(icaHtml)],
        [INDEX_URL, () => textResponse(rulesCsv)],
      ])

      const [parsedSlugs, parsedRules] = await Promise.all([
        fetchIcaSlugs(),
        fetchIndexRules(),
      ])

      expect(entryStatus('IN', {
        icaSlugs: parsedSlugs,
        indexRule: parsedRules.IN,
      })).toBe('vftf-visa')
      // ZZ is absent from the parsed rules and ICA list, so it follows the free fallback.
      expect(entryStatus('ZZ', {
        icaSlugs: parsedSlugs,
        indexRule: parsedRules.ZZ,
      })).toBe('free')
    })
  })
})
