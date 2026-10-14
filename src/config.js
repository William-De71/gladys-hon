// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const POLL_INTERVALS = [30, 60, 120, 300];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  language: 'en',
  poll_interval: '60',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ email: string, password: string, language: string, pollMs: number, configured: boolean }}
 * The configuration.
 */
export function normalizeConfig(raw = {}) {
  const email = text(raw.email);
  // A password may legitimately start or end with a space: keep it as typed.
  const password = typeof raw.password === 'string' ? raw.password : '';
  const language = LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language;
  const seconds = Number(raw.poll_interval ?? DEFAULTS.poll_interval);
  const pollSeconds = POLL_INTERVALS.includes(seconds) ? seconds : Number(DEFAULTS.poll_interval);
  return {
    email,
    password,
    language,
    pollMs: pollSeconds * 1000,
    configured: Boolean(email && password),
  };
}

/**
 * @description Whether two configurations use the same account.
 * @param {object} a - Normalized configuration.
 * @param {object} b - Normalized configuration.
 * @returns {boolean} True when the same.
 */
export const sameAccount = (a, b) =>
  a.email.toLowerCase() === b.email.toLowerCase() && a.password === b.password;
