// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
//   hOn cloud ── appliances() every 30 min ──> entries (one per appliance)
//             ── commands()  once a day    ──> programs, settings
//             ── context()   every poll    ──> status ──> states.js (features)
//                                                     ├─> scene triggers
//                                                     └─> widgets
//   Gladys command / scene action / widget button ──> devices.js ──> send()
//
// Statuses are polled (30 s to 5 min, configuration): the hOn cloud also has
// an MQTT push channel, not used here (see the README, "Limits"). After a
// command, the appliance is read again 5 and 20 s later.
//
// The tests drive it with the fake Gladys of the SDK and a fake hOn cloud
// (test/app.test.js).
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { DEVICE_TRANSPORTS, logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, sameAccount } from './config.js';
import {
  applianceId,
  applianceName,
  buildDevice,
  checkRemote,
  CommandError,
  FEATURES,
  featureFields,
  featuresOf,
  featureValues,
} from './devices.js';
import { AuthError, createSession } from './hon/auth.js';
import { ApiError, createClient } from './hon/client.js';
import { acceptValue, buildCommand, findProgram, parseCommands } from './hon/commands.js';
import { CYCLE_TYPES, STARTABLE_TYPES } from './hon/constants.js';
import {
  currentProgram,
  errorCode,
  isActive,
  machineState,
  mergeStatus,
  parseContext,
  programPhase,
  remainingMinutes,
} from './hon/status.js';
import { t, text, truncateAll } from './i18n.js';
import {
  CONTROL_COMMANDS,
  createEventLimiter,
  detectEvents,
  SCENE_ACTIONS,
  statusOutputs,
  TRIGGERS,
  typeKey,
} from './scenes.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { buildApplianceWidget, buildOverviewWidget, WIDGET_ACTIONS, WIDGETS } from './widgets.js';

export const ACTIONS = {
  TEST: 'test_connection',
  PROGRAMS: 'list_programs',
  DIAGNOSTIC: 'diagnostic',
};

const MINUTE = 60 * 1000;
const LIST_EVERY_MS = 30 * MINUTE;
const COMMANDS_EVERY_MS = 24 * 60 * MINUTE;
const RETRY_MS = 5 * MINUTE;
const AFTER_COMMAND_MS = [5000, 20000];
const MUTE_MS = 10 * MINUTE;
const MANUAL_REFRESH_SPACING_MS = 20 * 1000;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
const MAX_MESSAGE = 1800;
const DIAGNOSTIC_CHUNK = 3000;

// What a diagnostic keeps of an appliance of the list: the model, never what
// identifies the user or the unit (MAC address, serial number, nickname).
const DIAGNOSTIC_FIELDS = [
  'applianceTypeName',
  'applianceTypeId',
  'applianceModelId',
  'brand',
  'modelName',
  'series',
  'fwVersion',
  'connectivity',
  'eepromId',
];
const PRIVATE_PARAM = /mac|serial|ssid|token|password|^ip/i;

/** A parameter definition in a few characters: "=1", "1..9/1", "[0|1]". */
const compactParameter = (parameter) => {
  if (parameter.typology === 'fixed') {
    const value = parameter.fixed;
    return `=${value && typeof value === 'object' ? JSON.stringify(value) : value}`;
  }
  if (parameter.typology === 'range') {
    return `${parameter.min}..${parameter.max}/${parameter.step}`;
  }
  return `[${parameter.values.join('|')}]`;
};

const compactCommand = (command) => ({
  name: command.category || command.name,
  parameters: Object.fromEntries(
    Object.entries(command.parameters).map(([key, value]) => [key, compactParameter(value)]),
  ),
  ancillary: Object.fromEntries(
    Object.entries(command.ancillary).map(([key, value]) => [key, compactParameter(value)]),
  ),
});

/**
 * @description What a report needs to map a model: its status parameters and
 * its command definitions, split in parts small enough for a log line.
 * @param {object} entry - Appliance entry.
 * @returns {object} `{ appliance, status, commands, programs }`.
 */
export function diagnosticOf(entry) {
  const appliance = Object.fromEntries(
    DIAGNOSTIC_FIELDS.filter((field) => entry.appliance?.[field] !== undefined).map((field) => [
      field,
      entry.appliance[field],
    ]),
  );
  const params = Object.fromEntries(
    Object.entries(entry.status?.params ?? {}).filter(([name]) => !PRIVATE_PARAM.test(name)),
  );
  const commands = Object.entries(entry.commands?.commands ?? {})
    .filter(([name]) => name !== 'startProgram')
    .map(([, command]) => compactCommand(command));
  return {
    appliance,
    status: { connected: entry.status?.connected ?? null, params },
    commands,
    programs: (entry.commands?.programs ?? []).map((program) => compactCommand(program.command)),
  };
}

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies.
 * @param {Function} [deps.fetch] - `fetch` (the fake hOn cloud in the tests).
 * @param {object} [deps.storage] - src/storage.js storage.
 * @param {object} [deps.logger] - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @param {number[]} [deps.afterCommandMs] - Delays of the reads after a command.
 * @returns {object} `{ start, stop, poll, … }`.
 */
export function createApp(
  gladys,
  {
    fetch: fetchImpl = globalThis.fetch,
    storage = createStorage(),
    logger = sdkLogger,
    now = Date.now,
    afterCommandMs = AFTER_COMMAND_MS,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let mobileId = '';
  let pollTimer = null;
  let retryTimer = null;
  let listedAt = 0;
  let manualRefreshAt = 0;
  let stopped = false;
  let polling = null;
  const account = { connected: false, refused: false, error: '' };
  const entries = new Map(); // device external id -> entry
  const created = new Set();
  const transports = new Map();
  const widgetRefresh = new Map(); // widget key -> { at, timer }
  const afterCommandTimers = new Set();

  const limiter = createEventLimiter({ now, logger });
  const states = createStatePublisher(gladys, {
    logger,
    now,
    isCreated: (externalId) => created.has(externalId),
  });
  const session = createSession({
    fetch: fetchImpl,
    logger,
    now,
    store: {
      load: () => storage.read('session.json'),
      save: (value) => storage.write('session.json', value),
    },
  });
  const client = createClient({ fetch: fetchImpl, session, mobileId: () => mobileId, now });

  const safely = (task, what) =>
    Promise.resolve()
      .then(task)
      .catch((error) => logger.warn(`hOn: ${what} failed: ${error?.message ?? error}`));

  const lang = () => config.language;

  // --- Status, widgets, transports ----------------------------------------------------

  const publishStatus = (connected, message) =>
    safely(() => gladys.setConnectionStatus(connected, truncateAll(message, 500)), 'status');

  const refreshWidget = (key) => {
    const slot = widgetRefresh.get(key) ?? { at: 0, timer: null };
    widgetRefresh.set(key, slot);
    const wait = slot.at + WIDGET_REFRESH_SPACING_MS - now();
    if (wait <= 0) {
      slot.at = now();
      safely(() => gladys.requestWidgetRefresh(key), 'widget refresh');
    } else if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        refreshWidget(key);
      }, wait);
      slot.timer.unref?.();
    }
  };
  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  const publishTransport = (entry, force = false) => {
    if (!created.has(entry.deviceId)) {
      return;
    }
    const transport =
      account.connected && entry.status?.connected
        ? DEVICE_TRANSPORTS.CLOUD
        : DEVICE_TRANSPORTS.UNREACHABLE;
    if (!force && transports.get(entry.deviceId) === transport) {
      return;
    }
    transports.set(entry.deviceId, transport);
    safely(
      () => gladys.publishTransports([{ external_id: entry.deviceId, transport }]),
      'transport badge',
    );
  };

  // --- Entries ---------------------------------------------------------------------------

  const entryOf = (appliance) => {
    const ids = gladys.externalIds('appliance', applianceId(appliance));
    const existing = entries.get(ids.device);
    if (existing) {
      existing.appliance = appliance;
      existing.name = applianceName(appliance);
      return existing;
    }
    const entry = {
      appliance,
      type: String(appliance.applianceTypeName).toUpperCase(),
      name: applianceName(appliance),
      deviceId: ids.device,
      status: null,
      commands: null,
      commandsAt: 0,
      featureKeys: new Set(),
      startedAt: null,
      initialRemaining: null,
      mute: null,
    };
    entries.set(ids.device, entry);
    return entry;
  };

  const programOf = (entry) => currentProgram(entry.status, entry.commands?.programs);

  const discovered = () =>
    [...entries.values()]
      .filter((entry) => entry.status)
      .map((entry) => buildDevice(gladys, entry, lang()));

  const publishDiscovered = () =>
    safely(() => gladys.publishDiscoveredDevices(discovered()), 'discovery');

  const pushStates = (entry) => {
    for (const [featureId, value] of featureValues(gladys, entry, lang())) {
      states.push(featureId, value);
    }
  };

  /** Track the cycle (start instant, first remaining time) for the progress. */
  const trackCycle = (entry, before) => {
    const state = machineState(entry.type, entry.status);
    const remaining = remainingMinutes(entry.type, entry.status);
    if (!isActive(state)) {
      entry.startedAt = null;
      entry.initialRemaining = null;
      return;
    }
    const was = before ? machineState(entry.type, before) : null;
    if (was !== null && !isActive(was) && state === 'running') {
      entry.startedAt = now();
      entry.initialRemaining = remaining;
    } else if (entry.initialRemaining === null || (remaining ?? 0) > entry.initialRemaining) {
      // Seen mid-cycle (after a start of the integration), or a program that
      // got longer: the progress starts from here.
      entry.initialRemaining = remaining;
    }
  };

  const fireEvents = (entry, before) => {
    const program = programOf(entry)?.key ?? '';
    const events = detectEvents(entry, before, entry.status, { now: now(), program });
    for (const event of events) {
      if (!created.has(entry.deviceId)) {
        continue;
      }
      if (entry.mute && entry.mute.key === event.key && now() < entry.mute.until) {
        // The consequence of a scene action: never a trigger (loop risk).
        entry.mute = null;
        continue;
      }
      if (limiter.allow()) {
        safely(() => gladys.publishSceneEvent(event.key, event.data), 'scene event');
      }
    }
  };

  /** Apply a new status to an entry. */
  const applyStatus = (entry, status) => {
    const before = entry.status;
    entry.status = mergeStatus(before, status);
    let grown = false;
    for (const spec of featuresOf(entry)) {
      if (!entry.featureKeys.has(spec.key)) {
        entry.featureKeys.add(spec.key);
        grown = true;
      }
    }
    // Events first: cycle_finished reads the start instant trackCycle clears.
    fireEvents(entry, before);
    trackCycle(entry, before);
    pushStates(entry);
    publishTransport(entry);
    const changed =
      !before ||
      before.connected !== entry.status.connected ||
      machineState(entry.type, before) !== machineState(entry.type, entry.status) ||
      remainingMinutes(entry.type, before) !== remainingMinutes(entry.type, entry.status) ||
      programPhase(entry.type, before) !== programPhase(entry.type, entry.status);
    return { grown: grown && before !== null, first: before === null, changed };
  };

  const loadCommands = async (entry) => {
    if (entry.commands && now() - entry.commandsAt < COMMANDS_EVERY_MS) {
      return false;
    }
    try {
      entry.commands = parseCommands(await client.commands(entry.appliance));
      entry.commandsAt = now();
      return true;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      logger.warn(`hOn: commands of ${entry.name} not read: ${error.message}`);
      entry.commands ??= parseCommands({});
      return false;
    }
  };

  const readEntry = async (entry) => {
    const status = parseContext(await client.context(entry.appliance));
    return applyStatus(entry, status);
  };

  // --- Polling ------------------------------------------------------------------------------

  const accountProblem = async (error) => {
    account.connected = false;
    if (error instanceof AuthError) {
      const firstRefusal = !account.refused;
      account.refused = true;
      account.error = error.message;
      const retry = error.retryAt ? new Date(error.retryAt).toISOString().slice(11, 16) : '';
      publishStatus(false, t('statusRefused', { retry: retry ? `${retry} UTC` : '…' }));
      if (firstRefusal && limiter.allow()) {
        safely(
          () => gladys.publishSceneEvent(TRIGGERS.ACCOUNT, { reason: 'credentials_refused' }),
          'scene event',
        );
      }
      scheduleRetry(Math.max(RETRY_MS, (error.retryAt ?? 0) - now()));
    } else {
      account.error = error.message;
      publishStatus(false, t('statusCloudError', { error: error.message.slice(0, 200) }));
    }
    entries.forEach((entry) => publishTransport(entry));
    refreshWidgets();
  };

  const accountOk = (count) => {
    const was = account.connected;
    account.connected = true;
    account.refused = false;
    account.error = '';
    if (!was) {
      publishStatus(true, t('statusConnected', { count }));
      entries.forEach((entry) => publishTransport(entry));
    }
  };

  const listAppliances = async () => {
    const list = await client.appliances();
    listedAt = now();
    const seen = new Set();
    for (const appliance of list) {
      seen.add(entryOf(appliance).deviceId);
    }
    for (const id of [...entries.keys()]) {
      if (!seen.has(id)) {
        // Removed from the hOn account: no more statuses. The Gladys device
        // stays until the user deletes it.
        entries.delete(id);
      }
    }
    return list.length;
  };

  /**
   * @description One poll: the appliance list when due, then the status of
   * every appliance, one after the other.
   * @param {object} [options] - `{ forceList }`.
   * @returns {Promise<void>} Resolves when done.
   */
  const pollOnce = async ({ forceList = false } = {}) => {
    if (!config.configured || stopped) {
      return;
    }
    let republish = false;
    try {
      if (forceList || now() - listedAt >= LIST_EVERY_MS || entries.size === 0) {
        const before = entries.size;
        const count = await listAppliances();
        republish = republish || count !== before;
      }
      let failures = 0;
      for (const entry of entries.values()) {
        try {
          if (await loadCommands(entry)) {
            republish = true;
          }
          const result = await readEntry(entry);
          republish = republish || result.first || result.grown;
          if (result.changed) {
            refreshWidgets();
          }
        } catch (error) {
          if (error instanceof AuthError) {
            throw error;
          }
          failures += 1;
          logger.warn(`hOn: status of ${entry.name} not read: ${error.message}`);
        }
      }
      if (failures > 0 && failures === entries.size) {
        throw new ApiError('no appliance answered');
      }
      accountOk(entries.size);
    } catch (error) {
      await accountProblem(error);
    }
    if (republish) {
      await publishDiscovered();
    }
  };

  const poll = (options) => {
    if (!polling) {
      polling = pollOnce(options).finally(() => {
        polling = null;
      });
    }
    return polling;
  };

  const schedulePoll = () => {
    clearInterval(pollTimer);
    pollTimer = null;
    if (config.configured && !stopped) {
      pollTimer = setInterval(() => {
        if (!account.refused) {
          safely(() => poll(), 'poll');
        }
      }, config.pollMs);
      pollTimer.unref?.();
    }
  };

  function scheduleRetry(delay) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      account.refused = false;
      safely(() => poll({ forceList: true }), 'retry');
    }, delay);
    retryTimer.unref?.();
  }

  const connect = async () => {
    clearTimeout(retryTimer);
    retryTimer = null;
    session.configure(config.email, config.password);
    if (!config.configured) {
      clearInterval(pollTimer);
      pollTimer = null;
      account.connected = false;
      publishStatus(false, t('statusNotConfigured'));
      refreshWidgets();
      return;
    }
    publishStatus(false, t('statusConnecting'));
    await poll({ forceList: true });
    schedulePoll();
  };

  /** Read one appliance again after a command (the cloud applies it in a few seconds). */
  const readSoon = (entry) => {
    for (const delay of afterCommandMs) {
      const timer = setTimeout(() => {
        afterCommandTimers.delete(timer);
        safely(async () => {
          const result = await readEntry(entry);
          if (result.changed) {
            refreshWidgets();
          }
        }, `status of ${entry.name}`);
      }, delay);
      timer.unref?.();
      afterCommandTimers.add(timer);
    }
  };

  // --- Commands -------------------------------------------------------------------------------

  const needsRemote = (entry) => CYCLE_TYPES.has(entry.type) || entry.type === 'OV';

  /**
   * @description Send a command built by a feature or an action.
   * @param {object} entry - Appliance entry.
   * @param {object} plan - `{ command, values, sync }`.
   */
  const sendPlan = async (entry, plan) => {
    if (!account.connected && account.refused) {
      throw new CommandError('errorNotConnected');
    }
    if (needsRemote(entry) || plan.start) {
      checkRemote(entry);
    } else if (entry.status && !entry.status.connected) {
      throw new CommandError('errorOffline', { name: entry.name });
    }
    if (!plan.command) {
      throw new CommandError('errorReadOnly');
    }
    let parts;
    try {
      parts = buildCommand(plan.command, {
        current: plan.sync ? (entry.status?.params ?? {}) : {},
        values: plan.values ?? {},
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new CommandError('errorUnsupportedValue', { value: error.message });
      }
      throw error;
    }
    try {
      await client.send(entry.appliance, {
        name: plan.command.name,
        parameters: parts.parameters,
        ancillaryParameters: parts.ancillaryParameters,
        programName: parts.programName,
        options: entry.commands?.options,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        await accountProblem(error);
        throw new CommandError('errorNotConnected');
      }
      throw new CommandError('errorCommandRefused', { error: error.message });
    }
    readSoon(entry);
  };

  const errorText = (error) =>
    error instanceof CommandError ? text(error.key, lang(), error.params) : error.message;

  const asUserError = (error) => new Error(errorText(error), { cause: error });

  const entryFor = (externalId) => {
    const deviceId = String(externalId ?? '');
    const entry =
      entries.get(deviceId) ??
      [...entries.values()].find((candidate) => deviceId.startsWith(`${candidate.deviceId}:`));
    if (!entry) {
      throw new CommandError('errorUnknownDevice');
    }
    return entry;
  };

  gladys.onSetValue(async (device, feature, value) => {
    try {
      const entry = entryFor(device.external_id);
      const key = String(feature.external_id).split(':').pop();
      const spec = FEATURES.find((candidate) => candidate.key === key);
      if (!spec?.write || featureFields(spec, entry).read_only) {
        throw new CommandError('errorReadOnly');
      }
      await sendPlan(entry, spec.write(entry, value));
    } catch (error) {
      throw asUserError(error);
    }
  });

  // --- Device events ------------------------------------------------------------------------------

  const deviceEvent = (handler) => async (device) => {
    if (device?.external_id) {
      handler(device.external_id);
    }
  };

  gladys.onDeviceCreated(
    deviceEvent((externalId) => {
      created.add(externalId);
      states.republish(externalId);
      const entry = entries.get(externalId);
      if (entry) {
        pushStates(entry);
        publishTransport(entry, true);
      }
      refreshWidgets();
    }),
  );
  gladys.onDeviceUpdated(
    deviceEvent((externalId) => {
      created.add(externalId);
      states.republish(externalId);
    }),
  );
  gladys.onDeviceDeleted(
    deviceEvent((externalId) => {
      created.delete(externalId);
      transports.delete(externalId);
      states.forget(externalId);
      refreshWidgets();
    }),
  );

  gladys.onScanRequest(async () => {
    if (config.configured) {
      await poll({ forceList: true });
    }
    await gladys.publishDiscoveredDevices(discovered());
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw ?? {});
    if (previous.language !== config.language) {
      await publishDiscovered();
      entries.forEach((entry) => entry.status && pushStates(entry));
    }
    if (!sameAccount(previous, config)) {
      if (previous.email.toLowerCase() !== config.email.toLowerCase()) {
        entries.clear();
        await session.clear();
      }
      await connect();
    } else if (previous.pollMs !== config.pollMs) {
      schedulePoll();
    }
  });

  // --- Configuration buttons ----------------------------------------------------------------------

  const stateLine = (entry, language) =>
    `${entry.name} (${text(`type_${typeKey(entry.type)}`, language)}, ${text(
      `state_${machineState(entry.type, entry.status)}`,
      language,
    )})`;

  const accountMessage = () =>
    account.refused
      ? t('statusRefused', { retry: '…' })
      : t('statusCloudError', { error: account.error || '…' });

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!config.configured) {
      return t('statusNotConfigured');
    }
    await poll({ forceList: true });
    if (!account.connected) {
      return accountMessage();
    }
    if (entries.size === 0) {
      return t('testNoAppliance');
    }
    const message = {};
    for (const language of ['en', 'fr', 'de', 'es']) {
      const list = [...entries.values()].map((entry) => stateLine(entry, language)).join(' ; ');
      message[language] = text('testOk', language, { count: entries.size, list });
    }
    return truncateAll(message, MAX_MESSAGE);
  });

  gladys.onAction(ACTIONS.PROGRAMS, async (fields = {}) => {
    if (!config.configured) {
      return t('statusNotConfigured');
    }
    if (entries.size === 0) {
      await poll({ forceList: true });
    }
    let targets = [...entries.values()].filter((entry) => STARTABLE_TYPES.has(entry.type));
    if (fields.device) {
      targets = targets.filter((entry) => entry.deviceId === fields.device);
    }
    const lines = targets
      .filter((entry) => entry.commands?.programs?.length > 0)
      .map(
        (entry) =>
          `${entry.name}: ${entry.commands.programs.map((program) => program.key).join(', ')}`,
      );
    if (lines.length === 0) {
      return t('programsNone');
    }
    return truncateAll(t('programsList', { list: lines.join(' — ') }), MAX_MESSAGE);
  });

  // Gladys gives no way to set DEBUG or LOG_LEVEL on the container: the
  // diagnostic goes to the Logs tab at the info level, on demand.
  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    if (!config.configured) {
      return t('statusNotConfigured');
    }
    await poll({ forceList: entries.size === 0 });
    if (!account.connected) {
      return accountMessage();
    }
    if (entries.size === 0) {
      return t('testNoAppliance');
    }
    const list = [...entries.values()];
    list.forEach((entry, index) => {
      const label = ['hOn diagnostic', `${index + 1}/${list.length}`, entry.type]
        .concat(entry.appliance.modelName ? [entry.appliance.modelName] : [])
        .join(' ');
      for (const [part, value] of Object.entries(diagnosticOf(entry))) {
        const json = JSON.stringify(value);
        const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
        for (let chunk = 0; chunk < count; chunk += 1) {
          const suffix = count > 1 ? ` (${chunk + 1}/${count})` : '';
          logger.info(
            `${label} ${part}${suffix}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
          );
        }
      }
    });
    const models = list
      .map((entry) => [entry.type, entry.appliance.modelName].filter(Boolean).join(' '))
      .join(', ');
    return truncateAll(t('diagnosticDone', { count: list.length, list: models }), MAX_MESSAGE);
  });

  // --- Scene actions ---------------------------------------------------------------------------------

  const sceneEntry = (fields) => {
    try {
      return entryFor(fields?.device);
    } catch (error) {
      throw asUserError(error);
    }
  };

  gladys.onSceneAction(SCENE_ACTIONS.START, async (fields = {}) => {
    const entry = sceneEntry(fields);
    try {
      if (!STARTABLE_TYPES.has(entry.type)) {
        throw new CommandError('errorNoProgram', { name: entry.name });
      }
      const program = findProgram(entry.commands?.programs ?? [], fields.program);
      if (!program) {
        throw new CommandError('errorUnknownProgram', { program: fields.program ?? '' });
      }
      const values = {};
      const delay = Number(fields.delay_minutes ?? 0);
      if (Number.isFinite(delay) && delay > 0) {
        const definition = program.command.parameters.delayTime;
        if (!definition || acceptValue(definition, delay) === null) {
          throw new CommandError('errorDelay', { minutes: delay });
        }
        values.delayTime = delay;
      }
      entry.mute = { key: TRIGGERS.STARTED, until: now() + MUTE_MS };
      await sendPlan(entry, { command: program.command, values, sync: false, start: true });
      return { program: program.key, estimated_minutes: program.minutes ?? 0 };
    } catch (error) {
      entry.mute = null;
      throw asUserError(error);
    }
  });

  gladys.onSceneAction(SCENE_ACTIONS.CONTROL, async (fields = {}) => {
    const entry = sceneEntry(fields);
    try {
      const name = String(fields.command ?? '');
      if (!CONTROL_COMMANDS.includes(name)) {
        throw new CommandError('errorUnsupportedValue', { value: name });
      }
      const command = entry.commands?.[name];
      if (!command) {
        throw new CommandError('errorNoCommand', { name: entry.name, command: name });
      }
      if (name === 'stop') {
        entry.mute = { key: TRIGGERS.FINISHED, until: now() + MUTE_MS };
      }
      await sendPlan(entry, { command, values: {}, sync: false });
      return undefined;
    } catch (error) {
      entry.mute = null;
      throw asUserError(error);
    }
  });

  gladys.onSceneAction(SCENE_ACTIONS.REFRESH, async (fields = {}) => {
    const entry = sceneEntry(fields);
    try {
      await readEntry(entry);
    } catch (error) {
      throw asUserError(error instanceof AuthError ? new CommandError('errorNotConnected') : error);
    }
    return statusOutputs(entry, programOf(entry)?.key ?? '');
  });

  // --- Widgets ---------------------------------------------------------------------------------------

  const TEMPERATURE_KEYS = {
    AC: [
      ['indoor_temperature', 'tempIndoor'],
      ['outdoor_temperature', 'tempOutdoor'],
    ],
    REF: [
      ['zone1_temperature_REF', 'tempZ1'],
      ['zone2_temperature_REF', 'tempZ2'],
    ],
    FRE: [['zone1_temperature_FRE', 'tempZ1']],
    WC: [
      ['zone1_temperature', 'tempZ1'],
      ['zone2_temperature', 'tempZ2'],
    ],
    OV: [['temperature', 'temp']],
  };
  // Many fridges report no measured temperature (tempZ1 / tempZ2), only
  // their setpoints: the widget shows these instead of nothing.
  const SETPOINT_KEYS = {
    REF: [
      ['zone1_setpoint_REF', 'tempSelZ1'],
      ['zone2_setpoint_REF', 'tempSelZ2'],
    ],
    FRE: [['zone1_setpoint_FRE', 'tempSelZ1']],
    WC: [
      ['zone1_setpoint', 'tempSelZ1'],
      ['zone2_setpoint', 'tempSelZ2'],
    ],
  };

  const temperaturesOf = (status, keys = []) =>
    keys
      .filter(([, param]) => (status?.params?.[param] ?? '') !== '')
      .map(([label, param]) => ({ label, value: Number(status.params[param]) }))
      .filter((temperature) => Number.isFinite(temperature.value));

  /** What the widgets show of an appliance. */
  const viewOf = (entry) => {
    const status = entry.status;
    const state = machineState(entry.type, status);
    const remaining = remainingMinutes(entry.type, status);
    const program = programOf(entry);
    const cycle = CYCLE_TYPES.has(entry.type);
    let progress = null;
    if (cycle && isActive(state) && entry.initialRemaining > 0 && Number.isFinite(remaining)) {
      progress = Math.round(
        Math.min(
          100,
          Math.max(0, ((entry.initialRemaining - remaining) / entry.initialRemaining) * 100),
        ),
      );
    }
    let temperatures = temperaturesOf(status, TEMPERATURE_KEYS[entry.type]);
    if (temperatures.length === 0) {
      temperatures = temperaturesOf(status, SETPOINT_KEYS[entry.type]);
    }
    return {
      deviceId: entry.deviceId,
      name: entry.name,
      typeKey: typeKey(entry.type),
      state,
      phase: programPhase(entry.type, status),
      active: isActive(state),
      remaining,
      progress,
      programLabel: program?.label ?? '',
      connected: Boolean(status?.connected),
      remote:
        status?.params?.remoteCtrValid === undefined ? null : status.params.remoteCtrValid === '1',
      error: errorCode(status),
      cycle,
      temperatures: entry.type === 'OV' && state === 'off' ? [] : temperatures,
      canPause: Boolean(entry.commands?.pause),
      canResume: Boolean(entry.commands?.resume),
      canStop: Boolean(entry.commands?.stop),
      canPower: entry.type === 'AC' && Boolean(entry.commands?.settings),
    };
  };

  const accountView = () => ({
    configured: config.configured,
    connected: account.connected,
    refused: account.refused,
  });

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ settings } = {}) =>
    buildOverviewWidget(
      {
        account: accountView(),
        appliances: [...entries.values()].filter((entry) => entry.status).map(viewOf),
      },
      settings ?? {},
    ),
  );

  gladys.onWidgetGet(WIDGETS.APPLIANCE, async ({ settings } = {}) => {
    const entry = entries.get(String(settings?.device ?? ''));
    return buildApplianceWidget(entry?.status ? viewOf(entry) : null, accountView());
  });

  const manualRefresh = async () => {
    if (now() - manualRefreshAt < MANUAL_REFRESH_SPACING_MS) {
      return t('widgetRefreshTooSoon');
    }
    manualRefreshAt = now();
    await poll();
    refreshWidgets();
    return account.connected ? t('widgetRefreshed') : t('errorNotConnected');
  };

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      return manualRefresh();
    }
    return undefined;
  });

  gladys.onWidgetAction(WIDGETS.APPLIANCE, async (actionKey, params, { settings } = {}) => {
    const deviceId = String(settings?.device ?? params?.device ?? '');
    const entry = entries.get(deviceId);
    if (!entry) {
      return t('errorUnknownDevice');
    }
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      if (now() - manualRefreshAt < MANUAL_REFRESH_SPACING_MS) {
        return t('widgetRefreshTooSoon');
      }
      manualRefreshAt = now();
      try {
        await readEntry(entry);
      } catch (error) {
        return t('commandFailed', { error: error.message.slice(0, 150) });
      }
      refreshWidgets();
      return t('widgetRefreshed');
    }
    const plans = {
      [WIDGET_ACTIONS.PAUSE]: () => ({ command: entry.commands?.pause, values: {}, sync: false }),
      [WIDGET_ACTIONS.RESUME]: () => ({ command: entry.commands?.resume, values: {}, sync: false }),
      [WIDGET_ACTIONS.STOP]: () => ({ command: entry.commands?.stop, values: {}, sync: false }),
      [WIDGET_ACTIONS.POWER_ON]: () =>
        FEATURES.find((spec) => spec.key === 'ac_power').write(entry, 1),
      [WIDGET_ACTIONS.POWER_OFF]: () =>
        FEATURES.find((spec) => spec.key === 'ac_power').write(entry, 0),
    };
    if (!plans[actionKey]) {
      return undefined;
    }
    try {
      await sendPlan(entry, plans[actionKey]());
      return t('commandSent', { name: entry.name });
    } catch (error) {
      if (error instanceof CommandError) {
        return truncateAll(t(error.key, error.params), 200);
      }
      return truncateAll(t('commandFailed', { error: error.message.slice(0, 150) }), 200);
    }
  });

  // --- Lifecycle -------------------------------------------------------------------------------------

  const loadMobileId = async () => {
    const saved = await storage.read('device.json');
    if (typeof saved?.mobileId === 'string' && /^[0-9a-f]{16}$/.test(saved.mobileId)) {
      return saved.mobileId;
    }
    const id = randomBytes(8).toString('hex');
    try {
      await storage.write('device.json', { mobileId: id });
    } catch (error) {
      logger.warn(`hOn: /data is not writable (${error.message}): a new mobile id at each start`);
    }
    return id;
  };

  return {
    /** Read the configuration, log in and read the appliances. */
    async start() {
      stopped = false;
      config = normalizeConfig(gladys.config ?? {});
      mobileId = await loadMobileId();
      created.clear();
      (gladys.devices ?? []).forEach((device) => created.add(device.external_id));
      await connect();
    },

    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearTimeout(retryTimer);
      afterCommandTimers.forEach((timer) => clearTimeout(timer));
      afterCommandTimers.clear();
      widgetRefresh.forEach((slot) => clearTimeout(slot.timer));
      states.stop();
      await polling?.catch(() => {});
    },

    poll,
    flushStates: () => states.flush(),
    entries,
    account,
  };
}
