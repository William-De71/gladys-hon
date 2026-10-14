// -----------------------------------------------------------------------------
// The commands of an appliance, read from its `commands/v1/retrieve` payload.
//
// The payload has one entry per command name (`startProgram`, `settings`,
// `stopProgram`, `pauseProgram`, `resumeProgram`…). An entry is either a
// command (it has `description` and `protocolType`) or a set of categories of
// that command: the programs of `startProgram` (`PROGRAMS.WM_WD.COTTONS`…),
// `setParameters` / `setConfig` for `settings`.
//
// Each command has two groups of parameters, `parameters` and
// `ancillaryParameters`, each parameter a `typology`: `fixed` (fixedValue),
// `range` (minimumValue, maximumValue, incrementValue, defaultValue) or
// `enum` (enumValues, defaultValue). The cloud wants every parameter of the
// `parameters` group, values as strings — the logic of pyhOn's HonCommand
// (`pyhon/commands.py`, `pyhon/parameter/*.py`, MIT).
// -----------------------------------------------------------------------------

import { HIDDEN_PROGRAMS } from './constants.js';

const isCommand = (data) =>
  Boolean(data && typeof data === 'object' && 'description' in data && 'protocolType' in data);

/**
 * @description A number as the hOn cloud writes it: "22", "0.5", "-18".
 * @param {number} value - The number.
 * @returns {string} The text.
 */
export function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

const toNumber = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

/**
 * @description Normalize one parameter definition.
 * @param {object} data - Raw definition.
 * @returns {object|null} `{ typology, mandatory, fixed, min, max, step, values, default }`.
 */
function parameterOf(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  switch (data.typology) {
    case 'fixed':
      return { typology: 'fixed', mandatory: Number(data.mandatory) === 1, fixed: data.fixedValue };
    case 'range': {
      const min = toNumber(data.minimumValue) ?? 0;
      const max = toNumber(data.maximumValue) ?? 0;
      const step = toNumber(data.incrementValue) || 1;
      return {
        typology: 'range',
        mandatory: Number(data.mandatory) === 1,
        min,
        max,
        step,
        default: toNumber(data.defaultValue) ?? min,
      };
    }
    case 'enum':
      return {
        typology: 'enum',
        mandatory: Number(data.mandatory) === 1,
        values: (data.enumValues ?? []).map(String),
        default: data.defaultValue === undefined ? undefined : String(data.defaultValue),
      };
    default:
      return null;
  }
}

/**
 * @description The value a parameter is sent with when nothing sets it.
 * @param {object} parameter - Normalized parameter.
 * @returns {string|object} The value.
 */
function initialValue(parameter) {
  if (parameter.typology === 'fixed') {
    // A fixed value may be an object (programRules), sent as is.
    return parameter.fixed === undefined || parameter.fixed === '' ? '0' : parameter.fixed;
  }
  if (parameter.typology === 'range') {
    return formatNumber(parameter.default);
  }
  return parameter.default ?? parameter.values[0] ?? '0';
}

/**
 * @description Whether a value is acceptable for a parameter.
 * @param {object} parameter - Normalized parameter.
 * @param {string|number} value - Candidate.
 * @returns {string|null} The value to send, or null when refused.
 */
export function acceptValue(parameter, value) {
  if (parameter.typology === 'range') {
    const number = toNumber(value);
    if (number === null || number < parameter.min || number > parameter.max) {
      return null;
    }
    const steps = (number - parameter.min) / parameter.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) {
      return null;
    }
    return formatNumber(number);
  }
  if (parameter.typology === 'enum') {
    const text = String(value);
    if (parameter.values.includes(text)) {
      return text;
    }
    // "1.00" for an enum of "1": compare as numbers.
    const number = toNumber(text);
    const match = parameter.values.find((candidate) => toNumber(candidate) === number);
    return number !== null && match !== undefined ? match : null;
  }
  return String(value);
}

/**
 * @description Parse one command.
 * @param {string} name - Command name (`startProgram`…).
 * @param {object} data - Raw command.
 * @param {string} [category] - Category name (`PROGRAMS.WM_WD.COTTONS`).
 * @returns {object} `{ name, category, parameters, ancillary }`.
 */
function commandOf(name, data, category = '') {
  const group = (raw) =>
    Object.fromEntries(
      Object.entries(raw ?? {})
        .map(([key, value]) => [key, parameterOf(value)])
        .filter(([, parameter]) => parameter),
    );
  return {
    name,
    category,
    parameters: group(data.parameters),
    ancillary: group(data.ancillaryParameters),
  };
}

/**
 * @description The display name of a program key: "eco_40_60" -> "Eco 40 60" (without
 * the "iot_" / "hqd_" prefixes of the app).
 * @param {string} key - Program key.
 * @returns {string} The name.
 */
export function programLabel(key) {
  const words = String(key)
    .replace(/^(iot|hqd)_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const text = words.join(' ');
  return text ? text[0].toUpperCase() + text.slice(1) : String(key);
}

/**
 * @description Parse a `retrieve` payload.
 * @param {object} payload - The payload (without resultCode).
 * @returns {object} `{ options, programs, settings, stop, pause, resume, commands }`.
 */
export function parseCommands(payload = {}) {
  const commands = {};
  const programs = [];
  for (const [name, data] of Object.entries(payload ?? {})) {
    if (!data || typeof data !== 'object' || ['applianceModel', 'options'].includes(name)) {
      continue;
    }
    if (isCommand(data)) {
      commands[name] = commandOf(name, data);
      continue;
    }
    const categories = Object.entries(data).filter(([, value]) => isCommand(value));
    if (categories.length === 0) {
      continue;
    }
    if (name === 'startProgram') {
      for (const [category, value] of categories) {
        const key = category.split('.').pop().toLowerCase();
        if (HIDDEN_PROGRAMS.some((hidden) => key.includes(hidden))) {
          continue;
        }
        const command = commandOf(name, value, category);
        const prCode = command.parameters.prCode;
        const remaining = command.ancillary.remainingTime;
        programs.push({
          key,
          category,
          label: programLabel(key),
          code: prCode?.typology === 'fixed' ? String(prCode.fixed) : null,
          minutes: remaining?.typology === 'fixed' ? (toNumber(remaining.fixed) ?? null) : null,
          command,
        });
      }
      commands.startProgram = programs[0]?.command ?? null;
      continue;
    }
    const preferred =
      categories.find(([category]) => category === 'setParameters') ?? categories[0];
    commands[name] = commandOf(name, preferred[1], preferred[0]);
  }
  programs.sort((a, b) => a.label.localeCompare(b.label));
  return {
    options: payload?.options && typeof payload.options === 'object' ? payload.options : {},
    programs,
    settings: commands.settings ?? null,
    stop: commands.stopProgram ?? null,
    pause: commands.pauseProgram ?? null,
    resume: commands.resumeProgram ?? null,
    commands,
  };
}

/**
 * @description Find a program from what a user typed: its key ("cottons"),
 * its full name ("PROGRAMS.WM_WD.COTTONS") or its label ("Cottons").
 * @param {object[]} programs - Parsed programs.
 * @param {string} query - What the user typed.
 * @returns {object|null} The program.
 */
export function findProgram(programs, query) {
  const wanted = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) {
    return null;
  }
  return (
    programs.find(
      (program) =>
        program.key === wanted ||
        program.category.toLowerCase() === wanted ||
        program.label.toLowerCase() === wanted,
    ) ?? null
  );
}

/**
 * @description The body parts of a command to send.
 * @param {object} command - Parsed command.
 * @param {object} [options] - Values.
 * @param {object} [options.current] - Current shadow values (`settings`: the
 * appliance keeps what is not sent, or falls back to defaults).
 * @param {object} [options.values] - Values to set (validated).
 * @returns {{ parameters: object, ancillaryParameters: object, programName: string }} The parts.
 * @throws {RangeError} A value the parameter refuses (`error.parameter`).
 */
export function buildCommand(command, { current = {}, values = {} } = {}) {
  const parameters = {};
  for (const [key, parameter] of Object.entries(command.parameters)) {
    let value = initialValue(parameter);
    if (current[key] !== undefined && current[key] !== '' && parameter.typology !== 'fixed') {
      value = acceptValue(parameter, current[key]) ?? value;
    }
    if (values[key] !== undefined) {
      const accepted =
        parameter.typology === 'fixed' ? String(values[key]) : acceptValue(parameter, values[key]);
      if (accepted === null) {
        const error = new RangeError(`${key}: ${values[key]} refused`);
        error.parameter = key;
        throw error;
      }
      value = accepted;
    }
    parameters[key] = typeof value === 'string' ? value : String(value);
  }
  if ('prStr' in parameters) {
    parameters.prStr = command.category.toUpperCase();
  }
  const ancillaryParameters = {};
  for (const [key, parameter] of Object.entries(command.ancillary)) {
    if (key !== 'programRules') {
      ancillaryParameters[key] = initialValue(parameter);
    }
  }
  return { parameters, ancillaryParameters, programName: command.category };
}
