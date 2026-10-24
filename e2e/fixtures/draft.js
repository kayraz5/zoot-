import { test, expect } from './harness.js'

/**
 * Draft specs are disabled by default and report each draft as skipped.
 * Enable them by setting E2E_DRAFTS=1 before running Playwright.
 */
export const draftsEnabled = process.env.E2E_DRAFTS === '1'

/** Register an enabled draft, or mark it fixme while drafts are disabled. */
export function draft(title, body) {
  return draftsEnabled ? test(title, body) : test.fixme(title, body)
}

export { test, expect }
