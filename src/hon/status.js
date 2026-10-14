// -----------------------------------------------------------------------------
// The status of an appliance, read from its `commands/v1/context` payload.
//
// `shadow.parameters` holds the last values the appliance reported, as
// strings (`{ machMode: { parNewVal: '2', lastUpdate }, … }`), `lastConnEvent`
// whether it is connected to the hOn cloud. Disconnected, the shadow keeps the
// last values: a washer seen running before a power cut must not stay
// "running", so the machine state is "offline" first (pyhOn does the same).
// -----------------------------------------------------------------------------

import { ACTIVE_STATES, CYCLE_TYPES, MACHINE_MODES, PHASES } from './constants.js';

/**
 * @description Normalize a context payload.
 * @param {object} context - The payload.
 * @returns {{ connected: boolean, params: Object<string, string>, active: boolean }} The status.
 */
export function parseContext(context = {}) {
  const params = {};
  for (const [name, value] of Object.entries(context?.shadow?.parameters ?? {})) {
    const raw = value && typeof value === 'object' ? value.parNewVal : value;
    if (raw !== undefined && raw !== null) {
      params[name] = String(raw);
    }
  }
  const category = context?.lastConnEvent?.category;
  const activity = context?.activity;
  return {
    connected: category !== 'DISCONNECTED',
    params,
    active: Boolean(activity && typeof activity === 'object' && Object.keys(activity).length > 0),
  };
}

/**
 * @description Merge the parameters a context lists into a known status: an
 * answer that only carries some of them keeps the others.
 * @param {object|null} previous - Previous status.
 * @param {object} next - New status.
 * @returns {object} The status.
 */
export function mergeStatus(previous, next) {
  return { ...next, params: { ...(previous?.params ?? {}), ...next.params } };
}

const number = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * @description The state of an appliance in one word (an i18n key suffix):
 * offline, ready, selected, running, paused, scheduled, error, finished,
 * test, stopping, on, off, preheating, cooking, online, unknown.
 * @param {string} type - `applianceTypeName`.
 * @param {object} status - Parsed status.
 * @returns {string} The state.
 */
export function machineState(type, status) {
  if (!status) {
    return 'unknown';
  }
  if (!status.connected) {
    return 'offline';
  }
  const { params } = status;
  if (CYCLE_TYPES.has(type)) {
    return MACHINE_MODES[number(params.machMode)] ?? 'unknown';
  }
  if (type === 'OV') {
    if (params.onOffStatus === '0') {
      return 'off';
    }
    return params.preheatStatus === '1' ? 'preheating' : 'cooking';
  }
  if (params.onOffStatus !== undefined) {
    return params.onOffStatus === '1' ? 'on' : 'off';
  }
  // Fridges, freezers, wine cellars: always on, nothing to say but "online".
  return 'online';
}

/**
 * @description Whether a cycle is in progress (running, paused, delayed).
 * @param {string} state - Machine state.
 * @returns {boolean} True when active.
 */
export const isActive = (state) => ACTIVE_STATES.has(state);

/**
 * @description The phase of the program in one word (an i18n key suffix).
 * @param {string} type - `applianceTypeName`.
 * @param {object} status - Parsed status.
 * @returns {string|null} The phase, null when the type has no phases.
 */
export function programPhase(type, status) {
  const table = PHASES[type];
  if (!table || status?.params?.prPhase === undefined) {
    return null;
  }
  if (!status.connected) {
    return 'ready';
  }
  return table[number(status.params.prPhase)] ?? 'unknown';
}

/**
 * @description Minutes left in the cycle (0 when no cycle is in progress).
 * @param {string} type - `applianceTypeName`.
 * @param {object} status - Parsed status.
 * @returns {number|null} Minutes, null when unknown.
 */
export function remainingMinutes(type, status) {
  const minutes = number(status?.params?.remainingTimeMM);
  if (minutes === null) {
    return null;
  }
  const state = machineState(type, status);
  if (CYCLE_TYPES.has(type) && !isActive(state)) {
    return 0;
  }
  if (type === 'OV' && (state === 'off' || state === 'offline')) {
    return 0;
  }
  return Math.max(0, Math.round(minutes));
}

/**
 * @description The error code an appliance reports, null when none.
 * @param {object} status - Parsed status.
 * @returns {string|null} The code.
 */
export function errorCode(status) {
  const raw = String(status?.params?.errors ?? '').trim();
  if (!raw || /^0+$/.test(raw)) {
    return null;
  }
  return raw.slice(0, 40);
}

/**
 * @description The program running (or last run), from its `prCode`.
 * @param {object} status - Parsed status.
 * @param {object[]} programs - Parsed programs (src/hon/commands.js).
 * @returns {object|null} The program.
 */
export function currentProgram(status, programs = []) {
  const code = status?.params?.prCode;
  if (code === undefined || code === '0') {
    return null;
  }
  // Several programs may share a code (an "iot_" variant of a dial program):
  // the dial one is what the appliance shows.
  const matches = programs.filter((program) => program.code === code);
  return matches.find((program) => !program.key.startsWith('iot_')) ?? matches[0] ?? null;
}
