// Can a traveller leave Changi on a layover? Singapore's entry rule for each passport (ISO 3166 alpha-2 code).
// ICA's own visa list wins; the Passport Index dataset (MIT) covers every other passport.
// Used by /api/entry-rule (live data) and by the app (saved copy, when the API can't be reached).

export const ICA_VISA_PAGE = 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements'
export const ICA_VFTF_PAGE = 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa-free-transit-facility'
export const ICA_ARRIVAL_CARD_PAGE = 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card'
export const icaCountryPage = (slug) => `${ICA_VISA_PAGE}/visa-detail-page/${slug}`

// 96-hour Visa Free Transit Facility, from ICA's VFTF page (updated 1 Aug 2025, checked 24 Oct 2026)
export const VFTF = {
  // Onward ticket within 96 h, plus a valid visa or long-term pass for one of VFTF_VISA_COUNTRIES
  withVisa: ['IN'],
  // Onward air ticket within 96 h is enough (CIS, Georgia, Turkmenistan, Ukraine)
  ticketOnly: ['AM', 'AZ', 'BY', 'KZ', 'KG', 'MD', 'RU', 'TJ', 'UZ', 'GE', 'TM', 'UA'],
  checkedOn: '2026-10-24'
}
export const VFTF_VISA_COUNTRIES = ['Australia', 'Canada', 'Germany', 'Japan', 'New Zealand', 'Switzerland', 'United Kingdom', 'United States']

// ICA link names that don't follow the country's English name
const ICA_SLUG_ALIASES = { KP: 'democratic-people' }

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
export const countryName = (code) => regionNames.of(code)

const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const icaSlug = (code) => ICA_SLUG_ALIASES[code] || slugify(countryName(code))

/**
 * status, for a layover of under a day:
 *   home      Singapore passport
 *   free      can leave the airport (visa-free, ETA or visa on arrival)
 *   vftf      needs a visa, but the 96 h transit facility only asks for an onward air ticket
 *   vftf-visa needs a visa, unless they also hold a visa for one of VFTF_VISA_COUNTRIES
 *   visa      needs a Singapore visa to leave the airport
 *   none      not admitted
 * `icaSlugs` is ICA's list of visa-required countries; `indexRule` is the Passport Index value for this passport.
 */
export function entryStatus(code, { icaSlugs, indexRule }) {
  if (code === 'SG') return 'home'
  if (icaSlugs.includes(icaSlug(code))) {
    if (VFTF.withVisa.includes(code)) return 'vftf-visa'
    if (VFTF.ticketOnly.includes(code)) return 'vftf'
    return 'visa'
  }
  if (indexRule === 'no admission') return 'none'
  if (indexRule === 'e-visa' || indexRule === 'visa required') return 'visa'
  return 'free'
}

/** Settles 'vftf-visa' with the traveller's answer: 'vftf' or 'visa', or 'ask' while they haven't answered. */
export function withTransitVisa(status, transitVisa) {
  if (status !== 'vftf-visa') return status
  if (transitVisa === true) return 'vftf'
  if (transitVisa === false) return 'visa'
  return 'ask'
}

// Statuses that let the traveller out of the airport
export const CAN_LEAVE = ['home', 'free', 'vftf']

/** Link to ICA's page for this passport: its own visa page if ICA lists it, otherwise the general one. */
export function icaLink(code, icaSlugs) {
  const slug = icaSlug(code)
  return icaSlugs.includes(slug) ? icaCountryPage(slug) : ICA_VISA_PAGE
}
