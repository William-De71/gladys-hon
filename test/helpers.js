// Shared test doubles: a fake hOn cloud (a `fetch` that answers like
// api-iot.he.services), the fixtures, a clock moved by hand. Nothing here
// touches the network.
//
// The fixtures (test/fixtures/<type>_<model>/) come from hon-test-data
// (MIT, Andre Basche, see test/fixtures/LICENSE-hon-test-data), anonymized
// upstream; the MAC addresses and nicknames were replaced, the program lists
// shortened.

import { readFileSync } from 'node:fs';

export const FIXTURES = ['wm_1301', 'td_1014', 'dw_522', 'ac_1263', 'ref_10188', 'ov_577'];

/**
 * @description One fixture.
 * @param {string} name - Folder name.
 * @returns {{ appliance: object, context: object, commands: object }} The data.
 */
export function fixture(name) {
  const read = (file) =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}/${file}.json`, import.meta.url), 'utf8'));
  return { appliance: read('appliance'), context: read('context'), commands: read('commands') };
}

/**
 * @description A JWT whose payload only carries `exp` (the session reads it).
 * @param {number} expiresAtMs - Expiry.
 * @returns {string} The token.
 */
export function jwt(expiresAtMs) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(expiresAtMs / 1000) })}.sig`;
}

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/**
 * @description A fake hOn cloud.
 * @param {object} [options] - `{ fixtures, now }`.
 * @returns {object} `{ fetch, calls, contexts, sent, logins, refuseLogin, … }`.
 */
export function fakeHon({ fixtures = FIXTURES, now = () => Date.now() } = {}) {
  const cloud = {
    appliances: [],
    contexts: new Map(), // MAC -> context payload
    commands: new Map(), // MAC -> retrieve payload
    calls: [],
    sent: [],
    logins: 0,
    replays: 0,
    refuseLogin: false,
    refuseReplay: false,
    staleReplay: false, // the replay answers tokens the API refuses
    forbidAll: false, // every API request answers 403
    failContext: false,
    tokenLifetimeMs: 60 * 60 * 1000,
    validIdTokens: new Set(),
  };
  for (const name of fixtures) {
    const data = fixture(name);
    cloud.appliances.push(data.appliance);
    cloud.contexts.set(data.appliance.macAddress, data.context);
    cloud.commands.set(data.appliance.macAddress, data.commands);
  }

  /**
   * @description Change shadow parameters of an appliance.
   * @param {string} mac - MAC address.
   * @param {object} params - `{ name: value }`.
   */
  cloud.set = (mac, params) => {
    const context = cloud.contexts.get(mac);
    for (const [name, value] of Object.entries(params)) {
      context.shadow.parameters[name] = { parNewVal: String(value), lastUpdate: 'now' };
    }
  };

  /**
   * @param {string} mac - MAC address.
   * @param {boolean} connected - Connection to the hOn cloud.
   */
  cloud.setConnected = (mac, connected) => {
    cloud.contexts.get(mac).lastConnEvent.category = connected ? 'CONNECTED' : 'DISCONNECTED';
  };

  const tokens = (valid = true) => {
    const idToken =
      jwt(now() + cloud.tokenLifetimeMs) + cloud.validIdTokens.size + cloud.calls.length;
    if (valid) {
      cloud.validIdTokens.add(idToken);
    }
    return {
      id_token: idToken,
      cognito_token: `cognito-${cloud.validIdTokens.size}`,
      access_token: 'a',
      refresh_token: 'r',
    };
  };

  cloud.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const headers = init.headers ?? {};
    cloud.calls.push({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body,
    });

    if (url.pathname === '/ciam/authorize') {
      if (cloud.refuseLogin) {
        return response(401, { message: 'Invalid username or password', code: 'AUTH-INV-PARAM' });
      }
      cloud.logins += 1;
      cloud.challenge = url.searchParams.get('code_challenge');
      return response(200, { session_id: `session-${cloud.logins}` });
    }
    if (url.pathname === '/ciam/token') {
      if (body.session_id !== `session-${cloud.logins}` || !body.code_verifier) {
        return response(401, { message: 'unknown session' });
      }
      if (cloud.refuseReplay && cloud.issued === body.session_id) {
        return response(401, { message: 'expired session' });
      }
      const replay = cloud.issued === body.session_id;
      if (replay) {
        cloud.replays += 1;
      }
      cloud.issued = body.session_id;
      return response(200, { tokens: tokens(!(replay && cloud.staleReplay)) });
    }

    if (cloud.forbidAll) {
      return response(403, { message: 'Forbidden' });
    }
    if (!cloud.validIdTokens.has(headers['id-token']) || !headers['cognito-token']) {
      return response(401, { message: 'Unauthorized' });
    }
    if (url.pathname === '/unified-api/v1/view/appliance-list') {
      return response(200, {
        modules: { applianceList: { payload: { appliances: cloud.appliances } } },
        authInfo: {},
      });
    }
    if (url.pathname === '/commands/v1/context') {
      if (cloud.failContext) {
        return response(503, {});
      }
      const context = cloud.contexts.get(url.searchParams.get('macAddress'));
      return response(200, { payload: structuredClone(context ?? {}) });
    }
    if (url.pathname === '/commands/v1/retrieve') {
      const commands = cloud.commands.get(url.searchParams.get('macAddress'));
      return response(200, { payload: structuredClone(commands ?? { resultCode: '1' }) });
    }
    if (url.pathname === '/commands/v1/send') {
      cloud.sent.push(body);
      return response(200, { payload: { resultCode: '0' } });
    }
    return response(404, {});
  };

  return cloud;
}

/**
 * @description A clock moved by hand.
 * @param {number} [start] - Start instant (ms).
 * @returns {{ now: Function, advance: Function }} The clock.
 */
export function fakeClock(start = Date.parse('2026-10-15T08:00:00Z')) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

/** A no-op logger. */
export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

/** Wait for the pending promises and the timers of zero delay. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
