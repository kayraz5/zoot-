import { test, expect } from './harness.js'

/**
 * Draft scenarios are disabled by default and reported as fixme with a reason.
 * Enable them by setting E2E_DRAFTS=1 before running Playwright.
 */
export const draftsEnabled = process.env.E2E_DRAFTS === '1'

/**
 * Keep a scenario gated unless E2E_DRAFTS=1. Call it from the spec file itself, at file or
 * `test.describe` scope (gates every test there before any fixture runs) or inside a test body.
 * Specs call `test()` directly, so Playwright attributes each test to its own file and line.
 * @param {typeof test} t      the spec's `test` object
 * @param {string} reason      names the missing feature or blocker; never an env value
 */
export const gatedDraft = (t, reason) => t.fixme(!draftsEnabled, reason)

export { test, expect }
