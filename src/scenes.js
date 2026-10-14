// -----------------------------------------------------------------------------
// Scene triggers and actions (manifest `scene_triggers` / `scene_actions`).
//
// Triggers fire on what HAPPENS to an appliance, found by comparing two
// successive statuses (never a periodic snapshot, never at the first status
// seen after a start):
//   cycle_started / cycle_finished   a washer, dryer or dishwasher cycle
//   appliance_error                  an error code appears
//   refill_needed                    salt, rinse aid, detergent, softener
//   appliance_offline / _online      the appliance leaves / joins the hOn cloud
//   account_error                    hOn refuses the account
// A command sent by a scene action never fires a trigger (loop risk): the
// transition it causes is muted for that appliance (`mute` in app.js: the
// next cycle_started after start_program, the next cycle_finished after a
// stop). A command from the dashboard or the appliance panel fires them.
// -----------------------------------------------------------------------------

import { REFILLS, TYPES } from './hon/constants.js';
import { errorCode, isActive, machineState, programPhase, remainingMinutes } from './hon/status.js';

export const TRIGGERS = {
  STARTED: 'cycle_started',
  FINISHED: 'cycle_finished',
  ERROR: 'appliance_error',
  REFILL: 'refill_needed',
  OFFLINE: 'appliance_offline',
  ONLINE: 'appliance_online',
  ACCOUNT: 'account_error',
};

export const SCENE_ACTIONS = {
  START: 'start_program',
  CONTROL: 'control_cycle',
  REFRESH: 'refresh_status',
};

export const CONTROL_COMMANDS = ['pause', 'resume', 'stop'];

// Gladys accepts 300 scene events a minute per integration.
const EVENTS_PER_MINUTE = 250;
const FINISHED_FROM = new Set(['running', 'paused', 'stopping']);
const FINISHED_TO = new Set(['finished', 'ready', 'selected']);

/**
 * @description The type of an appliance as a stable word (trigger filters,
 * variables, i18n keys): washing_machine, tumble_dryer…, `other` for a type
 * this integration does not know.
 * @param {string} type - `applianceTypeName`.
 * @returns {string} The word.
 */
export const typeKey = (type) => TYPES[type] ?? 'other';

/**
 * @description The scene events between two statuses of an appliance.
 * @param {object} entry - `{ type, name, deviceId, commands, startedAt }`.
 * @param {object|null} before - Previous status (null: first one, no event).
 * @param {object} after - New status.
 * @param {object} [context] - `{ now, program }` (program key of `after`).
 * @returns {Array<{ key: string, data: object }>} The events.
 */
export function detectEvents(entry, before, after, { now = Date.now(), program = '' } = {}) {
  if (!before || !after) {
    return [];
  }
  const base = {
    device: entry.deviceId,
    device_name: entry.name,
    appliance_type: typeKey(entry.type),
  };
  const events = [];

  if (before.connected && !after.connected) {
    events.push({ key: TRIGGERS.OFFLINE, data: base });
    return events;
  }
  if (!before.connected && after.connected) {
    // An appliance seen again after an outage: its cycle may have ended
    // meanwhile, but nothing says when.
    events.push({ key: TRIGGERS.ONLINE, data: base });
    // A status right after a reconnection is not a transition of the cycle.
    return events;
  }
  if (!after.connected) {
    return events;
  }

  const was = machineState(entry.type, before);
  const is = machineState(entry.type, after);
  if (!isActive(was) && is === 'running') {
    events.push({
      key: TRIGGERS.STARTED,
      data: {
        ...base,
        program,
        remaining_minutes: remainingMinutes(entry.type, after),
      },
    });
  }
  if (FINISHED_FROM.has(was) && FINISHED_TO.has(is)) {
    events.push({
      key: TRIGGERS.FINISHED,
      data: {
        ...base,
        program,
        duration_minutes: entry.startedAt
          ? Math.max(0, Math.round((now - entry.startedAt) / 60000))
          : null,
      },
    });
  }

  const previousError = errorCode(before);
  const error = errorCode(after);
  if (error && error !== previousError) {
    events.push({ key: TRIGGERS.ERROR, data: { ...base, error_code: error } });
  }

  for (const [item, param] of Object.entries(REFILLS)) {
    if (before.params[param] === '0' && after.params[param] === '1') {
      events.push({ key: TRIGGERS.REFILL, data: { ...base, item } });
    }
  }
  return events;
}

/**
 * @description The outputs of the refresh_status scene action.
 * @param {object} entry - Appliance entry.
 * @param {string} program - Program key, or ''.
 * @returns {object} The outputs.
 */
export function statusOutputs(entry, program) {
  const status = entry.status;
  return {
    machine_state: machineState(entry.type, status),
    program_phase: programPhase(entry.type, status) ?? '',
    program,
    remaining_minutes: remainingMinutes(entry.type, status) ?? 0,
    connected: Boolean(status?.connected),
    error_code: errorCode(status) ?? '',
  };
}

/**
 * @description A sliding one-minute window counter: the scene events beyond
 * the budget are dropped (and logged once per minute) rather than refused by
 * Gladys.
 * @param {object} deps - `{ now, logger }`.
 * @returns {{ allow: Function }} The limiter.
 */
export function createEventLimiter({ now = Date.now, logger }) {
  const stamps = [];
  let warnedAt = 0;
  return {
    allow() {
      const current = now();
      while (stamps.length > 0 && stamps[0] <= current - 60000) {
        stamps.shift();
      }
      if (stamps.length >= EVENTS_PER_MINUTE) {
        if (current - warnedAt > 60000) {
          warnedAt = current;
          logger?.warn('hOn: more than 250 scene events in a minute, the next ones are dropped');
        }
        return false;
      }
      stamps.push(current);
      return true;
    },
  };
}
