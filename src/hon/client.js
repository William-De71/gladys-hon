// -----------------------------------------------------------------------------
// hOn cloud REST client: the requests of the hOn app, authenticated by the
// session (src/hon/auth.js).
//
//   appliances()            POST /unified-api/v1/view/appliance-list
//   context(appliance)      GET  /commands/v1/context      (status: shadow)
//   commands(appliance)     GET  /commands/v1/retrieve     (programs, settings)
//   send(appliance, ...)    POST /commands/v1/send
//
// A 401 / 403 renews the tokens once and retries (the id token lives about an
// hour). Endpoints and bodies come from pyhon-revived
// (`pyhon/connection/api.py`, MIT).
// -----------------------------------------------------------------------------

import { API_URL, APP_VERSION, DEVICE_MODEL, OS, OS_VERSION, USER_AGENT } from './constants.js';

const TIMEOUT_MS = 20 * 1000;

/** An answer of the hOn cloud that is not a success. */
export class ApiError extends Error {
  /**
   * @param {string} message - Message (English, for the logs).
   * @param {number} [status] - HTTP status.
   */
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * @description The mobile device the integration presents itself as.
 * @param {string} mobileId - Stable identifier of this installation.
 * @param {boolean} [mobile] - The variant of the command bodies (`mobileOs`).
 * @returns {object} The device object.
 */
export function deviceInfo(mobileId, mobile = false) {
  return {
    appVersion: APP_VERSION,
    mobileId,
    [mobile ? 'mobileOs' : 'os']: OS,
    osVersion: OS_VERSION,
    deviceModel: DEVICE_MODEL,
  };
}

/**
 * @description The `code` of an appliance (the serial prefix when missing).
 * @param {object} appliance - Appliance of the list.
 * @returns {string} The code.
 */
export function applianceCode(appliance) {
  if (appliance.code) {
    return String(appliance.code);
  }
  const serial = String(appliance.serialNumber ?? '');
  return serial.length < 18 ? serial.slice(0, 8) : serial.slice(0, 11);
}

/**
 * @description An ISO timestamp with milliseconds, like the app sends it.
 * @param {number} ms - Instant.
 * @returns {string} `2026-10-14T08:00:00.000Z`.
 */
const timestamp = (ms) => new Date(ms).toISOString();

/**
 * @description Create the client.
 * @param {object} deps - Dependencies.
 * @param {Function} deps.fetch - `fetch`.
 * @param {object} deps.session - src/hon/auth.js session.
 * @param {Function} deps.mobileId - `() => string`.
 * @param {Function} [deps.now] - Clock (ms).
 * @returns {object} The client.
 */
export function createClient({ fetch, session, mobileId, now = Date.now }) {
  let requests = 0;

  const request = async (method, path, { query, body } = {}, retried = false) => {
    const tokens = await session.tokens({ force: retried });
    const url = `${API_URL}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
    requests += 1;
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          'cognito-token': tokens.cognitoToken,
          'id-token': tokens.idToken,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ApiError(`hOn ${path}: ${error.cause?.code ?? error.message}`);
    }
    if ((response.status === 401 || response.status === 403) && !retried) {
      return request(method, path, { query, body }, true);
    }
    if (!response.ok) {
      throw new ApiError(`hOn ${path}: HTTP ${response.status}`, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError(`hOn ${path}: the answer is not JSON`, response.status);
    }
  };

  return {
    /** @returns {Promise<object[]>} The appliances of the account. */
    async appliances() {
      const answer = await request('POST', '/unified-api/v1/view/appliance-list', {
        body: { deviceId: mobileId() },
      });
      const list = answer?.modules?.applianceList?.payload?.appliances;
      if (!Array.isArray(list)) {
        throw new ApiError('hOn appliance list: unexpected answer');
      }
      return list.filter((appliance) => appliance?.macAddress && appliance.applianceTypeName);
    },

    /**
     * @description The status of an appliance.
     * @param {object} appliance - Appliance of the list.
     * @returns {Promise<object>} `{ shadow, activity, lastConnEvent, … }`.
     */
    async context(appliance) {
      const answer = await request('GET', '/commands/v1/context', {
        query: {
          macAddress: appliance.macAddress,
          applianceType: appliance.applianceTypeName,
          category: 'CYCLE',
        },
      });
      return answer?.payload ?? {};
    },

    /**
     * @description The commands (programs, settings) of an appliance.
     * @param {object} appliance - Appliance of the list.
     * @returns {Promise<object>} The `retrieve` payload, `{}` when none.
     */
    async commands(appliance) {
      const query = {
        applianceType: appliance.applianceTypeName,
        applianceModelId: String(appliance.applianceModelId ?? ''),
        macAddress: appliance.macAddress,
        os: OS,
        appVersion: APP_VERSION,
        code: applianceCode(appliance),
      };
      if (appliance.eepromId) {
        query.firmwareId = String(appliance.eepromId);
      }
      if (appliance.fwVersion) {
        query.fwVersion = String(appliance.fwVersion);
      }
      if (appliance.series) {
        query.series = String(appliance.series);
      }
      const answer = await request('GET', '/commands/v1/retrieve', { query });
      const payload = answer?.payload;
      if (!payload || String(payload.resultCode) !== '0') {
        return {};
      }
      const { resultCode, ...rest } = payload;
      void resultCode;
      return rest;
    },

    /**
     * @description Send a command.
     * @param {object} appliance - Appliance of the list.
     * @param {object} command - `{ name, parameters, ancillaryParameters, programName, options }`.
     * @returns {Promise<void>} Resolves when the cloud accepted it.
     */
    async send(appliance, command) {
      const at = timestamp(now());
      const body = {
        macAddress: appliance.macAddress,
        timestamp: at,
        commandName: command.name,
        transactionId: `${appliance.macAddress}_${at}`,
        applianceOptions: command.options ?? {},
        device: deviceInfo(mobileId(), true),
        attributes: { channel: 'mobileApp', origin: 'standardProgram', energyLabel: '0' },
        ancillaryParameters: command.ancillaryParameters ?? {},
        parameters: command.parameters ?? {},
        applianceType: appliance.applianceTypeName,
      };
      if (command.name === 'startProgram' && command.programName) {
        body.programName = command.programName.toUpperCase();
      }
      const answer = await request('POST', '/commands/v1/send', { body });
      if (String(answer?.payload?.resultCode) !== '0') {
        throw new ApiError(`hOn refused the command ${command.name}`);
      }
    },

    /** @returns {number} Requests sent since the start (widget, test button). */
    requestCount: () => requests,
  };
}
