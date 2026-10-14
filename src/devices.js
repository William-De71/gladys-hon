// -----------------------------------------------------------------------------
// hOn appliances -> Gladys devices and features.
//
// One Gladys device per appliance (external id from its MAC address). A
// feature exists when the appliance reports its parameter (its status
// `shadow`) or has the command behind it (its `retrieve` payload), like the
// Home Assistant integration does: hOn models differ a lot within a type.
//
// Each FEATURES entry:
//   key        forever: part of the feature external id
//   present    (entry) -> boolean     entry = { appliance, type, status, commands }
//   value      (entry, language) -> number | { text } | null
//   write      (entry, value) -> { command, values, sync }   (writable features)
//   bounds     (entry) -> { min, max, step }                  (when they depend on the model)
//   options    (entry, language) -> supported_options          (selects, AC modes)
//
// Gladys has no washing-machine category: the machine state, the phase and
// the program are `text` features, the remaining time a `duration`.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { CYCLE_TYPES, STARTABLE_TYPES } from './hon/constants.js';
import { findProgram } from './hon/commands.js';
import {
  currentProgram,
  errorCode,
  machineState,
  programPhase,
  remainingMinutes,
} from './hon/status.js';
import { featureName, text } from './i18n.js';

/** A command Gladys asked for that cannot be sent (an i18n key for the user). */
export class CommandError extends Error {
  /**
   * @param {string} key - i18n key.
   * @param {object} [params] - Placeholder values.
   */
  constructor(key, params = {}) {
    super(key);
    this.name = 'CommandError';
    this.key = key;
    this.params = params;
  }
}

// Values of the Gladys core (server/utils/constants.js: AC_MODE,
// AC_FAN_SPEED, AC_SWING_*), not exported by the SDK.
const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
const AC_FAN = { AUTO: 0, LOW: 1, MID: 3, HIGH: 5 };
const SWING = { OFF: 0, ON: 1 };

// hOn `machMode` of an air conditioner -> Gladys mode (the Home Assistant
// integration maps them the same way).
const HON_AC_MODES = {
  0: AC_MODE.AUTO,
  1: AC_MODE.COOLING,
  2: AC_MODE.DRYING,
  3: AC_MODE.DRYING,
  4: AC_MODE.HEATING,
  5: AC_MODE.FAN,
  6: AC_MODE.FAN,
};
const AC_MODE_LABELS = {
  [AC_MODE.AUTO]: 'acAuto',
  [AC_MODE.COOLING]: 'acCooling',
  [AC_MODE.HEATING]: 'acHeating',
  [AC_MODE.DRYING]: 'acDrying',
  [AC_MODE.FAN]: 'acFan',
};
// hOn `windSpeed` -> Gladys fan speed.
const HON_FAN = { 1: AC_FAN.HIGH, 2: AC_FAN.MID, 3: AC_FAN.LOW, 4: AC_FAN.AUTO, 5: AC_FAN.AUTO };
const FAN_LABELS = {
  [AC_FAN.AUTO]: 'fanAuto',
  [AC_FAN.LOW]: 'fanLow',
  [AC_FAN.MID]: 'fanMid',
  [AC_FAN.HIGH]: 'fanHigh',
};
// Swing positions: the vertical vane sweeps at 8, the horizontal one at 7.
const SWING_VERTICAL = '8';
const SWING_HORIZONTAL = '7';

const ENERGY_MAX = 1000000;

// --- Helpers ----------------------------------------------------------------------

const has = (entry, param) => entry.status?.params?.[param] !== undefined;
const param = (entry, name) => entry.status?.params?.[name];
const num = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed;
};
const setting = (entry, name) => entry.commands?.settings?.parameters?.[name] ?? null;
const canSet = (entry, name) => {
  const definition = setting(entry, name);
  return Boolean(definition && definition.typology !== 'fixed');
};
const isType =
  (...types) =>
  (entry) =>
    types.includes(entry.type);
const isCycle = (entry) => CYCLE_TYPES.has(entry.type);

/** Gladys opening sensors: 1 = closed. hOn door status: 1 = open. */
const doorValue = (raw) => (raw === undefined ? null : raw === '1' ? 0 : 1);

/**
 * @description The commands need the appliance to accept remote control
 * ("Remote control" on its panel, depending on the model).
 * @param {object} entry - Appliance entry.
 */
export function checkRemote(entry) {
  if (entry.status && !entry.status.connected) {
    throw new CommandError('errorOffline', { name: entry.name });
  }
  if (has(entry, 'remoteCtrValid') && param(entry, 'remoteCtrValid') !== '1') {
    throw new CommandError('errorRemoteControl', { name: entry.name });
  }
}

const settings = (entry, values) => {
  if (!entry.commands?.settings) {
    throw new CommandError('errorReadOnly');
  }
  return { command: entry.commands.settings, values, sync: true };
};

const enumValues = (entry, name) => {
  const definition = setting(entry, name);
  return definition?.typology === 'enum' ? definition.values : [];
};

const rangeBounds = (entry, name, fallback) => {
  const definition = setting(entry, name);
  if (definition?.typology === 'range') {
    return { min: definition.min, max: definition.max, step: definition.step };
  }
  return fallback;
};

// --- Feature catalog -------------------------------------------------------------------

const textFeature = { category: CATEGORIES.TEXT, type: TYPES.TEXT.TEXT, min: 0, max: 0 };
const readOnly = { read_only: true, has_feedback: false };
const writable = { read_only: false, has_feedback: true };

const temperatureSensor = (key, source, present = (entry) => has(entry, source)) => ({
  key,
  category: CATEGORIES.TEMPERATURE_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.CELSIUS,
  min: -60,
  max: 300,
  ...readOnly,
  present,
  value: (entry) => num(param(entry, source)),
});

// --- Fridge modes ------------------------------------------------------------------
//
// Fridges and freezers switch their modes with programs of `startProgram`
// (PROGRAMS.REF.AUTO_SET sets intelligenceMode to 1…), not with `settings`:
// the hOn app does the same (command histories of hon-test-data).
// `stopProgram` sets every mode flag back to 0.

// Mode flags, in the order pyhOn picks the current mode (appliances/ref.py).
const MODE_FLAGS = ['holidayMode', 'intelligenceMode', 'quickModeZ1', 'quickModeZ2'];
const MODE_LABELS = {
  holidayMode: 'holiday_mode',
  intelligenceMode: 'auto_set',
  quickModeZ1: 'super_cool',
  quickModeZ2: 'super_freeze',
};

/** The flag a program sets on, when it only does that (rule values left out). */
const modeFlag = (program) => {
  const entries = Object.entries(program.command?.parameters ?? {});
  if (entries.length !== 1) {
    return null;
  }
  const [[name, parameter]] = entries;
  return MODE_FLAGS.includes(name) &&
    parameter.typology === 'fixed' &&
    String(parameter.fixed) === '1'
    ? name
    : null;
};

const modePrograms = (entry) =>
  isType('REF', 'FRE')(entry)
    ? (entry.commands?.programs ?? [])
        .filter(modeFlag)
        .sort((a, b) => MODE_FLAGS.indexOf(modeFlag(a)) - MODE_FLAGS.indexOf(modeFlag(b)))
    : [];

const modeProgram = (entry, flag) =>
  modePrograms(entry).find((program) => modeFlag(program) === flag) ?? null;

/** `stopProgram` limited to one flag: its parameters are optional (mandatory 0). */
const stopOne = (entry, flag) => {
  const stop = entry.commands?.stop;
  const parameter = stop?.parameters?.[flag];
  const others = Object.entries(stop?.parameters ?? {}).filter(([name]) => name !== flag);
  if (!parameter || others.some(([, other]) => other.mandatory)) {
    throw new CommandError('errorReadOnly');
  }
  return { ...stop, parameters: { [flag]: parameter } };
};

const onOffSwitch = (key, source, types) => ({
  key,
  category: CATEGORIES.SWITCH,
  type: TYPES.SWITCH.BINARY,
  min: 0,
  max: 1,
  ...writable,
  present: (entry) => types.includes(entry.type) && (has(entry, source) || canSet(entry, source)),
  writableWhen: (entry) => canSet(entry, source) || Boolean(modeProgram(entry, source)),
  value: (entry) => (has(entry, source) ? (param(entry, source) === '1' ? 1 : 0) : null),
  write: (entry, value) => {
    const on = Number(value) === 1;
    const definition = setting(entry, source);
    if (definition && definition.typology !== 'fixed') {
      const target =
        definition.typology === 'range' ? (on ? definition.max : definition.min) : on ? '1' : '0';
      return settings(entry, { [source]: target });
    }
    const program = modeProgram(entry, source);
    if (!program) {
      throw new CommandError('errorReadOnly');
    }
    return { command: on ? program.command : stopOne(entry, source), values: {}, sync: false };
  },
});

export const FEATURES = [
  // --- Washers, dryers, dishwashers, ovens and the others ---------------------
  {
    key: 'machine_state',
    ...textFeature,
    ...readOnly,
    present: (entry) =>
      !['AC', 'REF', 'FRE', 'WC'].includes(entry.type) &&
      (isCycle(entry) || entry.type === 'OV' || has(entry, 'onOffStatus')),
    value: (entry, language) => ({
      text: text(`state_${machineState(entry.type, entry.status)}`, language),
    }),
  },
  {
    key: 'program_phase',
    ...textFeature,
    ...readOnly,
    present: (entry) => isCycle(entry) && has(entry, 'prPhase'),
    value: (entry, language) => {
      const phase = programPhase(entry.type, entry.status);
      return phase ? { text: text(`phase_${phase}`, language) } : null;
    },
  },
  {
    key: 'program',
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    min: 0,
    max: 0,
    ...writable,
    present: (entry) => STARTABLE_TYPES.has(entry.type) && entry.commands?.programs?.length > 0,
    options: (entry) =>
      entry.commands.programs.map((program, index) => ({
        value: program.key,
        label: program.label,
        sort_order: index,
      })),
    value: (entry) => {
      const program = currentProgram(entry.status, entry.commands?.programs);
      return program ? { text: program.key } : null;
    },
    write: (entry, value) => {
      const program = findProgram(entry.commands?.programs ?? [], value);
      if (!program) {
        throw new CommandError('errorUnknownProgram', { program: value });
      }
      return { command: program.command, values: {}, sync: false, start: true };
    },
  },
  {
    key: 'remaining_time',
    category: CATEGORIES.DURATION,
    type: TYPES.DURATION.INTEGER,
    unit: UNITS.MINUTES,
    min: 0,
    max: 1440,
    ...readOnly,
    present: (entry) => has(entry, 'remainingTimeMM'),
    value: (entry) => remainingMinutes(entry.type, entry.status),
  },
  {
    key: 'pause',
    category: CATEGORIES.SWITCH,
    type: TYPES.SWITCH.BINARY,
    min: 0,
    max: 1,
    ...writable,
    present: (entry) => isCycle(entry) && Boolean(entry.commands?.pause && entry.commands?.resume),
    value: (entry) => (machineState(entry.type, entry.status) === 'paused' ? 1 : 0),
    write: (entry, value) => ({
      command: Number(value) === 1 ? entry.commands.pause : entry.commands.resume,
      values: {},
      sync: false,
    }),
  },
  {
    key: 'door',
    category: CATEGORIES.OPENING_SENSOR,
    type: TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    ...readOnly,
    present: (entry) => has(entry, 'doorStatus'),
    value: (entry) => doorValue(param(entry, 'doorStatus')),
  },
  {
    key: 'remote_control',
    category: CATEGORIES.UNKNOWN,
    type: TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    ...readOnly,
    present: (entry) => has(entry, 'remoteCtrValid'),
    value: (entry) => (param(entry, 'remoteCtrValid') === '1' ? 1 : 0),
  },
  {
    key: 'salt_refill',
    category: CATEGORIES.UNKNOWN,
    type: TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    ...readOnly,
    present: (entry) => entry.type === 'DW' && has(entry, 'saltStatus'),
    value: (entry) => (param(entry, 'saltStatus') === '1' ? 1 : 0),
  },
  {
    key: 'rinse_aid_refill',
    category: CATEGORIES.UNKNOWN,
    type: TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    ...readOnly,
    present: (entry) => entry.type === 'DW' && has(entry, 'rinseAidStatus'),
    value: (entry) => (param(entry, 'rinseAidStatus') === '1' ? 1 : 0),
  },

  // --- Air conditioners ----------------------------------------------------------------
  {
    key: 'ac_power',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.BINARY,
    min: 0,
    max: 1,
    ...writable,
    present: (entry) => entry.type === 'AC' && has(entry, 'onOffStatus'),
    value: (entry) => (param(entry, 'onOffStatus') === '1' ? 1 : 0),
    write: (entry, value) => {
      if (Number(value) === 1) {
        return settings(entry, { onOffStatus: '1' });
      }
      if (entry.commands?.stop) {
        return { command: entry.commands.stop, values: {}, sync: false };
      }
      return settings(entry, { onOffStatus: '0' });
    },
  },
  {
    key: 'ac_mode',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.MODE,
    min: 0,
    max: 4,
    ...writable,
    present: (entry) => entry.type === 'AC' && enumValues(entry, 'machMode').length > 0,
    options: (entry, language) => {
      const modes = [
        ...new Set(enumValues(entry, 'machMode').map((value) => HON_AC_MODES[value])),
      ].filter((mode) => mode !== undefined);
      return modes.map((mode, index) => ({
        value: mode,
        label: text(AC_MODE_LABELS[mode], language),
        sort_order: index,
      }));
    },
    value: (entry) => HON_AC_MODES[num(param(entry, 'machMode'))] ?? null,
    write: (entry, value) => {
      const honMode = enumValues(entry, 'machMode').find(
        (candidate) => HON_AC_MODES[candidate] === Number(value),
      );
      if (honMode === undefined) {
        throw new CommandError('errorUnsupportedValue', { value });
      }
      // Always send the mode with the power: the unit falls back to Auto
      // otherwise (Home Assistant integration, issue #14).
      return settings(entry, { machMode: honMode, onOffStatus: '1' });
    },
  },
  {
    key: 'ac_target_temperature',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    ...writable,
    bounds: (entry) => rangeBounds(entry, 'tempSel', { min: 16, max: 30, step: 1 }),
    present: (entry) => entry.type === 'AC' && (has(entry, 'tempSel') || canSet(entry, 'tempSel')),
    writableWhen: (entry) => canSet(entry, 'tempSel'),
    value: (entry) => num(param(entry, 'tempSel')),
    write: (entry, value) => settings(entry, { tempSel: Number(value) }),
  },
  {
    key: 'ac_fan_speed',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.FAN_SPEED,
    min: 0,
    max: 7,
    ...writable,
    present: (entry) => entry.type === 'AC' && enumValues(entry, 'windSpeed').length > 0,
    options: (entry, language) => {
      const speeds = [
        ...new Set(enumValues(entry, 'windSpeed').map((value) => HON_FAN[value])),
      ].filter((speed) => speed !== undefined);
      return speeds
        .sort((a, b) => a - b)
        .map((speed, index) => ({
          value: speed,
          label: text(FAN_LABELS[speed], language),
          sort_order: index,
        }));
    },
    value: (entry) => HON_FAN[num(param(entry, 'windSpeed'))] ?? null,
    write: (entry, value) => {
      const honSpeed = enumValues(entry, 'windSpeed').find(
        (candidate) => HON_FAN[candidate] === Number(value),
      );
      if (honSpeed === undefined) {
        throw new CommandError('errorUnsupportedValue', { value });
      }
      return settings(entry, { windSpeed: honSpeed });
    },
  },
  {
    key: 'ac_swing_vertical',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.SWING_VERTICAL,
    min: 0,
    max: 1,
    ...writable,
    present: (entry) =>
      entry.type === 'AC' && enumValues(entry, 'windDirectionVertical').includes(SWING_VERTICAL),
    options: (entry, language) => [
      { value: SWING.OFF, label: text('swingOff', language), sort_order: 0 },
      { value: SWING.ON, label: text('swingOn', language), sort_order: 1 },
    ],
    value: (entry) => (param(entry, 'windDirectionVertical') === SWING_VERTICAL ? 1 : 0),
    write: (entry, value) => {
      const values = enumValues(entry, 'windDirectionVertical');
      const fixed = setting(entry, 'windDirectionVertical')?.default;
      const off =
        values.includes(fixed) && fixed !== SWING_VERTICAL
          ? fixed
          : values.find((v) => v !== SWING_VERTICAL);
      return settings(entry, { windDirectionVertical: Number(value) === 1 ? SWING_VERTICAL : off });
    },
  },
  {
    key: 'ac_swing_horizontal',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.SWING_HORIZONTAL,
    min: 0,
    max: 1,
    ...writable,
    present: (entry) =>
      entry.type === 'AC' &&
      enumValues(entry, 'windDirectionHorizontal').includes(SWING_HORIZONTAL),
    options: (entry, language) => [
      { value: SWING.OFF, label: text('swingOff', language), sort_order: 0 },
      { value: SWING.ON, label: text('swingOn', language), sort_order: 1 },
    ],
    value: (entry) => (param(entry, 'windDirectionHorizontal') === SWING_HORIZONTAL ? 1 : 0),
    write: (entry, value) => {
      const values = enumValues(entry, 'windDirectionHorizontal');
      const off = values.includes('0') ? '0' : values.find((v) => v !== SWING_HORIZONTAL);
      return settings(entry, {
        windDirectionHorizontal: Number(value) === 1 ? SWING_HORIZONTAL : off,
      });
    },
  },
  temperatureSensor(
    'indoor_temperature',
    'tempIndoor',
    (entry) => entry.type === 'AC' && has(entry, 'tempIndoor'),
  ),
  temperatureSensor(
    'outdoor_temperature',
    'tempOutdoor',
    (entry) => entry.type === 'AC' && has(entry, 'tempOutdoor'),
  ),

  // --- Fridges, freezers, wine cellars ------------------------------------------------
  temperatureSensor(
    'zone1_temperature',
    'tempZ1',
    (entry) => isType('REF', 'FRE', 'WC')(entry) && has(entry, 'tempZ1'),
  ),
  temperatureSensor(
    'zone2_temperature',
    'tempZ2',
    (entry) => isType('REF', 'FRE', 'WC')(entry) && has(entry, 'tempZ2'),
  ),
  ...[
    ['zone1_setpoint', 'tempSelZ1', { min: 1, max: 9, step: 1 }],
    ['zone2_setpoint', 'tempSelZ2', { min: -24, max: -14, step: 1 }],
  ].map(([key, source, fallback]) => ({
    key,
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    ...writable,
    bounds: (entry) => rangeBounds(entry, source, fallback),
    present: (entry) =>
      isType('REF', 'FRE', 'WC')(entry) && (has(entry, source) || canSet(entry, source)),
    writableWhen: (entry) => canSet(entry, source),
    value: (entry) => num(param(entry, source)),
    write: (entry, value) => settings(entry, { [source]: Number(value) }),
  })),
  onOffSwitch('super_cool', 'quickModeZ1', ['REF', 'FRE']),
  onOffSwitch('super_freeze', 'quickModeZ2', ['REF', 'FRE']),
  onOffSwitch('holiday_mode', 'holidayMode', ['REF', 'FRE']),
  onOffSwitch('auto_set', 'intelligenceMode', ['REF', 'FRE']),
  {
    key: 'fridge_mode',
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    min: 0,
    max: 0,
    ...writable,
    present: (entry) => modePrograms(entry).length > 0,
    options: (entry, language) => [
      { value: 'none', label: text('modeNone', language), sort_order: 0 },
      ...modePrograms(entry).map((program, index) => ({
        value: program.key,
        label: text(MODE_LABELS[modeFlag(program)], language),
        sort_order: index + 1,
      })),
    ],
    value: (entry) => {
      if (!MODE_FLAGS.some((flag) => has(entry, flag))) {
        return null;
      }
      const flag = MODE_FLAGS.find(
        (name) => param(entry, name) === '1' && modeProgram(entry, name),
      );
      return { text: flag ? modeProgram(entry, flag).key : 'none' };
    },
    write: (entry, value) => {
      if (String(value) === 'none') {
        if (!entry.commands?.stop) {
          throw new CommandError('errorReadOnly');
        }
        return { command: entry.commands.stop, values: {}, sync: false };
      }
      const program = modePrograms(entry).find((candidate) => candidate.key === String(value));
      if (!program) {
        throw new CommandError('errorUnknownProgram', { program: value });
      }
      return { command: program.command, values: {}, sync: false };
    },
  },
  ...[
    ['zone1_door', 'doorStatusZ1'],
    ['zone2_door', 'doorStatusZ2'],
  ].map(([key, source]) => ({
    key,
    category: CATEGORIES.OPENING_SENSOR,
    type: TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    ...readOnly,
    present: (entry) => isType('REF', 'FRE', 'WC')(entry) && has(entry, source),
    value: (entry) => doorValue(param(entry, source)),
  })),
  temperatureSensor(
    'room_temperature',
    'tempEnv',
    (entry) => isType('REF', 'FRE', 'WC')(entry) && has(entry, 'tempEnv'),
  ),
  {
    key: 'room_humidity',
    category: CATEGORIES.HUMIDITY_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    ...readOnly,
    present: (entry) => isType('REF', 'FRE', 'WC')(entry) && has(entry, 'humidityEnv'),
    value: (entry) => num(param(entry, 'humidityEnv')),
  },

  // --- Ovens and the others: temperatures ------------------------------------------------
  temperatureSensor(
    'temperature',
    'temp',
    (entry) => !isCycle(entry) && !isType('AC', 'REF', 'FRE', 'WC')(entry) && has(entry, 'temp'),
  ),
  temperatureSensor(
    'selected_temperature',
    'tempSel',
    (entry) => entry.type === 'OV' && has(entry, 'tempSel'),
  ),

  // --- Every type: consumption and errors -------------------------------------------------
  {
    key: 'energy',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.INDEX,
    unit: UNITS.KILOWATT_HOUR,
    min: 0,
    max: ENERGY_MAX,
    ...readOnly,
    present: (entry) => has(entry, 'totalElectricityUsed'),
    value: (entry) => num(param(entry, 'totalElectricityUsed')),
  },
  {
    key: 'water',
    category: CATEGORIES.VOLUME_SENSOR,
    type: TYPES.VOLUME_SENSOR.DECIMAL,
    unit: UNITS.LITER,
    min: 0,
    max: ENERGY_MAX,
    ...readOnly,
    present: (entry) => has(entry, 'totalWaterUsed'),
    value: (entry) => num(param(entry, 'totalWaterUsed')),
  },
  {
    key: 'error',
    ...textFeature,
    ...readOnly,
    present: (entry) => has(entry, 'errors'),
    value: (entry, language) => {
      const code = errorCode(entry.status);
      return {
        text: code ? text('errorCodeValue', language, { code }) : text('noError', language),
      };
    },
  },
];

/**
 * @description The features an appliance has.
 * @param {object} entry - `{ type, status, commands }`.
 * @returns {object[]} The FEATURES entries.
 */
export function featuresOf(entry) {
  return FEATURES.filter((spec) => {
    try {
      // Once seen, a feature stays: a parameter missing from one answer must
      // not make Gladys offer to "update" the device.
      return Boolean(spec.present(entry)) || Boolean(entry.featureKeys?.has(spec.key));
    } catch {
      return false;
    }
  });
}

/**
 * @description The Gladys feature fields of a spec for an appliance.
 * @param {object} spec - FEATURES entry.
 * @param {object} entry - Appliance entry.
 * @returns {object} `{ min, max, step, read_only, has_feedback }`.
 */
export function featureFields(spec, entry) {
  const bounds = spec.bounds ? spec.bounds(entry) : {};
  const canWrite = Boolean(spec.write) && (spec.writableWhen ? spec.writableWhen(entry) : true);
  return {
    min: bounds.min ?? spec.min,
    max: bounds.max ?? spec.max,
    step: bounds.step ?? spec.step,
    read_only: spec.read_only === false ? !canWrite : true,
    has_feedback: spec.read_only === false ? canWrite : false,
  };
}

/**
 * @description The platform id of an appliance: its MAC address.
 * @param {object} appliance - Appliance of the hOn list.
 * @returns {string} `a1b2c3d4e5f6`.
 */
export const applianceId = (appliance) =>
  String(appliance.macAddress)
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');

/**
 * @description The name of an appliance: its nickname in the hOn app, or its
 * brand and model.
 * @param {object} appliance - Appliance of the hOn list.
 * @returns {string} The name.
 */
export function applianceName(appliance) {
  const nick = String(appliance.nickName ?? '').trim();
  if (nick) {
    return nick.slice(0, 100);
  }
  const brand = String(appliance.brand ?? '').trim();
  const model = String(appliance.modelName ?? '').trim();
  const name = [brand && brand[0].toUpperCase() + brand.slice(1), model].filter(Boolean).join(' ');
  return (name || String(appliance.applianceTypeName)).slice(0, 100);
}

/**
 * @description Build the Gladys device of an appliance.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} entry - `{ appliance, type, status, commands, name }`.
 * @param {string} language - Language of the feature names and labels.
 * @returns {object} The device.
 */
export function buildDevice(gladys, entry, language) {
  const ids = gladys.externalIds('appliance', applianceId(entry.appliance));
  const features = featuresOf(entry).map((spec) => {
    const fields = featureFields(spec, entry);
    const feature = {
      name: `${entry.name} - ${featureName(spec.key, language, entry.type)}`,
      external_id: ids.feature(spec.key),
      category: spec.category,
      type: spec.type,
      min: fields.min,
      max: fields.max,
      read_only: fields.read_only,
      has_feedback: fields.has_feedback,
      keep_history: spec.category !== CATEGORIES.TEXT,
    };
    if (spec.unit) {
      feature.unit = spec.unit;
    }
    if (fields.step) {
      feature.step = fields.step;
    }
    if (spec.options) {
      feature.supported_options = spec.options(entry, language);
    }
    return feature;
  });
  const appliance = entry.appliance;
  return {
    name: entry.name,
    external_id: ids.device,
    // The integration polls the hOn cloud itself, at the pace of the
    // configuration (Gladys polls at 60 s at most, and a quota-bound cloud
    // must not be asked per feature).
    should_poll: false,
    features,
    params: [
      { name: 'HON_MAC', value: String(appliance.macAddress) },
      { name: 'HON_TYPE', value: String(appliance.applianceTypeName) },
      { name: 'HON_MODEL', value: String(appliance.modelName ?? '') },
      { name: 'HON_BRAND', value: String(appliance.brand ?? '') },
    ],
  };
}

/**
 * @description The current value of every feature of an appliance.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} entry - Appliance entry.
 * @param {string} language - Language of the text values.
 * @returns {Array<[string, number|{text: string}]>} `[featureExternalId, value]`.
 */
export function featureValues(gladys, entry, language) {
  const ids = gladys.externalIds('appliance', applianceId(entry.appliance));
  const values = [];
  for (const spec of featuresOf(entry)) {
    let value;
    try {
      value = spec.value(entry, language);
    } catch {
      value = null;
    }
    if (
      value !== null &&
      value !== undefined &&
      (typeof value === 'object' || Number.isFinite(value))
    ) {
      values.push([ids.feature(spec.key), value]);
    }
  }
  return values;
}
