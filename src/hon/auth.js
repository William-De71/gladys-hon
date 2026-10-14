// -----------------------------------------------------------------------------
// hOn account session: the CIAM login of the hOn app (June 2026 onwards).
//
//   1. GET  /ciam/authorize?username&password&code_challenge -> { session_id }
//   2. POST /ciam/token { session_id, code_verifier }        -> { tokens }
//
// `tokens` carries the `id_token` and the `cognito_token` every other request
// needs. There is no refresh grant: replaying step 2 with the same session id
// and PKCE verifier mints fresh tokens without sending the password again
// (pyhon-revived, `pyhon/connection/auth.py`). So:
//
//   - the session (never the password) is kept in /data, and reused after a
//     restart: the hOn cloud answers "Invalid username or password" to an
//     account that logs in too often, even with the right password;
//   - tokens are renewed a few minutes before the `exp` of the id token, by
//     replay first, by a full login only when the replay is refused;
//   - a refused login pauses every new attempt (15 min, doubling up to 4 h):
//     a wrong password retried every minute would lock the account.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { API_KEY, API_URL, USER_AGENT } from './constants.js';

const RENEW_BEFORE_MS = 5 * 60 * 1000;
const DEFAULT_LIFETIME_MS = 60 * 60 * 1000;
const PAUSE_MIN_MS = 15 * 60 * 1000;
const PAUSE_MAX_MS = 4 * 60 * 60 * 1000;
const TIMEOUT_MS = 20 * 1000;

/** The hOn cloud refused the e-mail address or the password. */
export class AuthError extends Error {
  /**
   * @param {string} message - Message (English, for the logs).
   * @param {object} [details] - `{ status, code, retryAt }`.
   */
  constructor(message, { status, code, retryAt } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

/**
 * @description A PKCE verifier and its S256 challenge, like the hOn app.
 * @returns {{ verifier: string, challenge: string }} The pair.
 */
export function pkcePair() {
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * @description The expiry of a JWT (its `exp` claim), without checking it.
 * @param {string} token - The JWT.
 * @returns {number|null} The expiry (ms), or null when unreadable.
 */
export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * @description A short, stable fingerprint of the account (the session file
 * is only reused for the same e-mail address).
 * @param {string} email - E-mail address.
 * @returns {string} The fingerprint.
 */
export function accountFingerprint(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * @description Create the session of one hOn account.
 * @param {object} deps - Dependencies.
 * @param {Function} deps.fetch - `fetch` (injected by the tests).
 * @param {object} deps.store - `{ load(): Promise<object|null>, save(object|null): Promise }`.
 * @param {object} deps.logger - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @returns {object} The session.
 */
export function createSession({ fetch, store, logger, now = Date.now }) {
  let email = '';
  let password = '';
  let state = null; // { account, sessionId, codeVerifier, idToken, cognitoToken, expiresAt }
  let pausedUntil = 0;
  let pauseMs = PAUSE_MIN_MS;
  let pending = null;
  let loaded = false;

  const headers = { 'user-agent': USER_AGENT, 'x-api-key': API_KEY };

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const tokenRequest = async (sessionId, codeVerifier) => {
    const response = await fetch(`${API_URL}/ciam/token`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, code_verifier: codeVerifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson(response);
    const tokens = body?.tokens ?? {};
    if (!response.ok || !tokens.id_token || !tokens.cognito_token) {
      return null;
    }
    return {
      sessionId,
      codeVerifier,
      idToken: tokens.id_token,
      cognitoToken: tokens.cognito_token,
      expiresAt: jwtExpiry(tokens.id_token) ?? now() + DEFAULT_LIFETIME_MS,
    };
  };

  const pause = (message, details) => {
    pausedUntil = now() + pauseMs;
    const retryAt = pausedUntil;
    pauseMs = Math.min(PAUSE_MAX_MS, pauseMs * 2);
    return new AuthError(message, { ...details, retryAt });
  };

  const login = async () => {
    if (now() < pausedUntil) {
      throw new AuthError('hOn login paused after a refusal', { retryAt: pausedUntil });
    }
    const { verifier, challenge } = pkcePair();
    const query = new URLSearchParams({ username: email, password, code_challenge: challenge });
    // The credentials travel in the query string (that is how the app does
    // it): never log this URL.
    const response = await fetch(`${API_URL}/ciam/authorize?${query}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson(response);
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      throw pause('hOn refused the e-mail address or the password', {
        status: response.status,
        code: body?.code,
      });
    }
    if (!response.ok) {
      const error = new Error(`hOn login failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!body?.session_id) {
      throw pause('hOn login answered without a session', { status: response.status });
    }
    const next = await tokenRequest(body.session_id, verifier);
    if (!next) {
      throw pause('hOn login answered without tokens', { status: response.status });
    }
    pauseMs = PAUSE_MIN_MS;
    logger.info('hOn: logged in');
    return next;
  };

  const persist = async () => {
    try {
      await store.save(state);
    } catch (error) {
      logger.warn(`hOn: the session could not be saved in /data: ${error.message}`);
    }
  };

  const renew = async () => {
    if (state?.sessionId) {
      try {
        const replayed = await tokenRequest(state.sessionId, state.codeVerifier);
        if (replayed) {
          state = { ...replayed, account: state.account };
          logger.debug('hOn: tokens renewed');
          await persist();
          return state;
        }
      } catch (error) {
        logger.debug(`hOn: token renewal failed: ${error.message}`);
      }
    }
    state = { ...(await login()), account: accountFingerprint(email) };
    await persist();
    return state;
  };

  const single = (task) => {
    if (!pending) {
      pending = task().finally(() => {
        pending = null;
      });
    }
    return pending;
  };

  return {
    /**
     * @description Set the account. A new e-mail address drops the session.
     * @param {string} nextEmail - E-mail address.
     * @param {string} nextPassword - Password.
     */
    configure(nextEmail, nextPassword) {
      const changed = nextEmail !== email || nextPassword !== password;
      email = nextEmail;
      password = nextPassword;
      if (changed) {
        pausedUntil = 0;
        pauseMs = PAUSE_MIN_MS;
        if (state && state.account !== accountFingerprint(email)) {
          state = null;
        }
      }
    },

    /** @returns {boolean} Whether an account is configured. */
    isConfigured: () => Boolean(email && password),

    /**
     * @description Valid tokens: the saved session, renewed, or a new login.
     * @param {object} [options] - `{ force }`: renew even if still valid.
     * @returns {Promise<{ idToken: string, cognitoToken: string }>} The tokens.
     */
    async tokens({ force = false } = {}) {
      if (!loaded) {
        loaded = true;
        try {
          const saved = await store.load();
          if (saved?.account === accountFingerprint(email) && saved.idToken) {
            state = saved;
          }
        } catch (error) {
          logger.debug(`hOn: no saved session (${error.message})`);
        }
      }
      if (!force && state?.idToken && state.expiresAt - RENEW_BEFORE_MS > now()) {
        return state;
      }
      return single(renew);
    },

    /** Forget the session (logout, account changed). */
    async clear() {
      state = null;
      await persist();
    },

    /** @returns {number} Instant until which logins are paused (0: none). */
    pausedUntil: () => (now() < pausedUntil ? pausedUntil : 0),
  };
}
