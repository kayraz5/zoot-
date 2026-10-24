import { describe, expect, it } from 'vitest'
import snapshot from '../model/data/sgEntrySnapshot.js'
import {
  ICA_VISA_PAGE,
  countryName,
  entryStatus,
  icaCountryPage,
  icaLink,
  icaSlug,
} from '../model/services/immigration.js'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

const { slugs: bundledSlugs } = snapshot.ica
const bundledRules = snapshot.index.rules

const ruleFor = (code) => ({
  icaSlugs: bundledSlugs,
  indexRule: bundledRules[code],
})

describe('immigration service', () => {
  describe('entryStatus', () => {
    it('identifies Singapore passport holders as home', () => {
      expect(entryStatus('SG', ruleFor('SG'))).toBe('home')
    })

    it('identifies India as requiring a visa for the visa-free transit facility', () => {
      expect(entryStatus('IN', ruleFor('IN'))).toBe('vftf-visa')
    })

    it('identifies Russia as eligible for the ticket-only transit facility', () => {
      expect(entryStatus('RU', ruleFor('RU'))).toBe('vftf')
    })

    it('identifies another bundled ICA-listed country as requiring a visa', () => {
      expect(entryStatus('AF', ruleFor('AF'))).toBe('visa')
    })

    it('reports no admission when the index rule says no admission', () => {
      expect(entryStatus('US', { icaSlugs: [], indexRule: 'no admission' })).toBe('none')
    })

    it('reports visa status for an unlisted e-visa rule', () => {
      expect(entryStatus('US', { icaSlugs: [], indexRule: 'e-visa' })).toBe('visa')
    })

    it('reports visa status for an unlisted visa-required rule', () => {
      expect(entryStatus('US', { icaSlugs: [], indexRule: 'visa required' })).toBe('visa')
    })

    it('reports free entry for bundled numeric admission rules', () => {
      expect(entryStatus('US', ruleFor('US'))).toBe('free')
      expect(entryStatus('DE', ruleFor('DE'))).toBe('free')
      expect(bundledRules.US).toBe('30')
      expect(bundledRules.DE).toBe('90')
    })
  })

  describe('ICA country links and names', () => {
    it('uses the ICA alias for North Korea', () => {
      expect(icaSlug('KP')).toBe('democratic-people')
    })

    it('uses a country-specific ICA page for a listed country', () => {
      expect(icaLink('KP', bundledSlugs)).toBe(icaCountryPage('democratic-people'))
    })

    it('uses the general ICA visa page for an unlisted country', () => {
      expect(icaLink('US', bundledSlugs)).toBe(ICA_VISA_PAGE)
    })

    it('returns the English country name for the United States', () => {
      expect(countryName('US')).toBe('United States')
    })

    it('builds the ICA country page from a slug', () => {
      expect(icaCountryPage('united-states')).toBe(
        `${ICA_VISA_PAGE}/visa-detail-page/united-states`,
      )
    })
  })
})
