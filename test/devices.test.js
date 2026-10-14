// Appliances -> Gladys devices, unit by unit, on the fixtures of every type.
// The Discover tab pitfalls of the Gladys core are checked here: a single
// invalid feature makes the whole discovery list refused, a missing
// min / max / read_only / has_feedback only fails when the user clicks "Add",
// and a category/type pair the front does not label shows "Device (undefined)".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';

import { normalizeConfig } from '../src/config.js';
import {
  applianceName,
  buildDevice,
  checkRemote,
  CommandError,
  FEATURES,
  featuresOf,
  featureValues,
} from '../src/devices.js';
import { parseCommands } from '../src/hon/commands.js';
import { parseContext } from '../src/hon/status.js';
import { createStatePublisher } from '../src/states.js';
import { FIXTURES, fakeClock, fixture, silentLogger } from './helpers.js';

// Category / type pairs labeled by the Gladys front (deviceFeatureCategory in
// front/src/config/i18n/en.json, checked on v5.1.1, v5.2.0 and master
// ff59ad8): a pair outside this list shows "Device (undefined)" and no icon.
const LABELED_PAIRS = new Set([
  'air-conditioning/binary',
  'air-conditioning/fan-speed',
  'air-conditioning/mode',
  'air-conditioning/swing-horizontal',
  'air-conditioning/swing-vertical',
  'air-conditioning/target-temperature',
  'duration/integer',
  'energy-sensor/index',
  'humidity-sensor/decimal',
  'opening-sensor/binary',
  'switch/binary',
  'temperature-sensor/decimal',
  'text/select',
  'text/text',
  'thermostat/target-temperature',
  'unknown/binary',
  'volume-sensor/decimal',
]);

/** The entry of a fixture, as src/app.js builds it. */
export function entryOf(name, { params = {}, connected = true } = {}) {
  const data = fixture(name);
  const status = parseContext(data.context);
  status.params = { ...status.params, ...params };
  status.connected = connected;
  return {
    appliance: data.appliance,
    type: data.appliance.applianceTypeName,
    name: applianceName(data.appliance),
    deviceId: `ext:test-integration:appliance:${data.appliance.macAddress.replace(/-/g, '')}`,
    status,
    commands: parseCommands(data.commands),
    featureKeys: new Set(),
  };
}

const featureOf = (key) => FEATURES.find((spec) => spec.key === key);

test('every feature of every type: labeled pair, bounds, read_only, has_feedback, unit', () => {
  const gladys = createFakeGladys();
  const units = new Set(Object.values(DEVICE_FEATURE_UNITS));
  for (const name of FIXTURES) {
    const entry = entryOf(name);
    const device = buildDevice(gladys, entry, 'en');
    assert.equal(device.should_poll, false, 'the integration polls the cloud itself');
    assert.equal(device.poll_frequency, undefined);
    assert.ok(device.features.length >= 5, `${name}: ${device.features.length} features`);
    for (const feature of device.features) {
      const where = `${name} ${feature.external_id}`;
      assert.ok(LABELED_PAIRS.has(`${feature.category}/${feature.type}`), where);
      for (const key of ['min', 'max']) {
        assert.equal(typeof feature[key], 'number', `${where} ${key}`);
      }
      assert.ok(feature.min <= feature.max, where);
      if (feature.category !== 'text') {
        assert.ok(feature.min < feature.max, where);
      }
      assert.equal(typeof feature.read_only, 'boolean', `${where} read_only`);
      assert.equal(typeof feature.has_feedback, 'boolean', `${where} has_feedback`);
      if (feature.unit !== undefined) {
        assert.ok(units.has(feature.unit), `${where} unit ${feature.unit}`);
      }
      assert.ok(feature.name.startsWith(`${entry.name} - `), 'distinguishable by the device name');
    }
  }
});

test('supported options follow the core rules (labels, integers except text/select)', () => {
  const gladys = createFakeGladys();
  for (const name of FIXTURES) {
    for (const feature of buildDevice(gladys, entryOf(name), 'fr').features) {
      if (!feature.supported_options) {
        continue;
      }
      assert.ok(feature.supported_options.length > 0, feature.external_id);
      const values = new Set();
      for (const option of feature.supported_options) {
        assert.equal(typeof option.label, 'string');
        assert.ok(option.label.trim().length > 0, feature.external_id);
        if (feature.category === 'text' && feature.type === 'select') {
          assert.ok(typeof option.value === 'string' && option.value.trim().length > 0);
        } else {
          assert.ok(Number.isInteger(option.value), `${feature.external_id} ${option.value}`);
          assert.ok(option.value >= feature.min && option.value <= feature.max);
        }
        assert.ok(!values.has(option.value), 'no duplicate');
        values.add(option.value);
      }
    }
  }
});

test('the whole discovery list is accepted by the fake Gladys, in every language', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const devices = FIXTURES.map((name) => buildDevice(gladys, entryOf(name), language));
    const result = await gladys.publishDiscoveredDevices(devices);
    assert.equal(result.count, devices.length);
  }
});

test('discovery baseline (0.1.0): external ids and compared fields never change', () => {
  // Changing a feature key, category, type, unit, min, max or step forces
  // users to delete and recreate their devices: update the baseline only on
  // purpose, with a migration note in the docs.
  const baseline = JSON.parse(
    readFileSync(new URL('./fixtures/discovery.baseline.json', import.meta.url), 'utf8'),
  );
  const gladys = createFakeGladys();
  const current = Object.fromEntries(
    FIXTURES.map((name) => [
      name,
      buildDevice(gladys, entryOf(name), 'en').features.map((feature) => ({
        external_id: feature.external_id,
        category: feature.category,
        type: feature.type,
        unit: feature.unit ?? null,
        min: feature.min,
        max: feature.max,
        step: feature.step ?? null,
        read_only: feature.read_only,
      })),
    ]),
  );
  assert.deepEqual(current, baseline);
});

test('values: states of the washer fixture, text states in the configured language', () => {
  const gladys = createFakeGladys();
  const entry = entryOf('wm_1301');
  const values = Object.fromEntries(
    featureValues(gladys, entry, 'fr').map(([id, value]) => [id.split(':').pop(), value]),
  );
  assert.deepEqual(values.machine_state, { text: 'Terminé' });
  assert.deepEqual(values.program_phase, { text: 'Prêt' });
  assert.equal(values.remaining_time, 0);
  assert.equal(values.door, 1, 'doorStatus 0 (closed) -> Gladys 1');
  assert.equal(values.remote_control, 0);
  assert.equal(values.energy, 33.34);
  assert.equal(values.water, 2571);
  assert.deepEqual(values.error, { text: 'Aucune erreur' });

  const running = entryOf('wm_1301', { params: { machMode: '2', prPhase: '4', doorStatus: '1' } });
  const live = Object.fromEntries(
    featureValues(gladys, running, 'de').map(([id, value]) => [id.split(':').pop(), value]),
  );
  assert.deepEqual(live.machine_state, { text: 'Läuft' });
  assert.deepEqual(live.program_phase, { text: 'Spülen' });
  assert.equal(live.remaining_time, 83);
  assert.equal(live.door, 0, 'open');
});

test('values: air conditioner mode, fan and swing in the Gladys vocabulary', () => {
  const gladys = createFakeGladys();
  const entry = entryOf('ac_1263');
  const values = Object.fromEntries(
    featureValues(gladys, entry, 'en').map(([id, value]) => [id.split(':').pop(), value]),
  );
  assert.equal(values.ac_power, 1);
  assert.equal(values.ac_mode, 3, 'hOn 2 (dry) -> Gladys DRYING');
  assert.equal(values.ac_target_temperature, 27);
  assert.equal(values.ac_fan_speed, 0, 'hOn 5 -> Gladys AUTO');
  assert.equal(values.ac_swing_vertical, 0);
  assert.equal(values.indoor_temperature, 28.5);
});

test('writes: the command plan of each writable feature', () => {
  const ac = entryOf('ac_1263');
  const mode = featureOf('ac_mode').write(ac, 2); // Gladys HEATING
  assert.equal(mode.command.name, 'settings');
  assert.deepEqual(mode.values, { machMode: '4', onOffStatus: '1' });
  assert.equal(mode.sync, true);
  assert.deepEqual(featureOf('ac_fan_speed').write(ac, 5).values, { windSpeed: '1' });
  assert.deepEqual(featureOf('ac_swing_vertical').write(ac, 1).values, {
    windDirectionVertical: '8',
  });
  assert.deepEqual(featureOf('ac_swing_vertical').write(ac, 0).values, {
    windDirectionVertical: '5',
  });
  assert.equal(featureOf('ac_power').write(ac, 0).command.name, 'stopProgram');
  assert.throws(() => featureOf('ac_fan_speed').write(ac, 2), CommandError);

  const washer = entryOf('wm_1301');
  const start = featureOf('program').write(washer, 'cottons');
  assert.equal(start.command.category, 'PROGRAMS.WM_WD.COTTONS');
  assert.equal(start.start, true);
  assert.throws(() => featureOf('program').write(washer, 'nope'), CommandError);
  assert.equal(featureOf('pause').write(washer, 1).command.name, 'pauseProgram');
  assert.equal(featureOf('pause').write(washer, 0).command.name, 'resumeProgram');

  const fridge = entryOf('ref_10188');
  assert.deepEqual(featureOf('zone1_setpoint').write(fridge, 4).values, { tempSelZ1: 4 });
  // Fridge modes are programs of startProgram, not settings.
  assert.equal(
    featureOf('super_cool').write(fridge, 1).command.category,
    'PROGRAMS.REF.SUPER_COOL',
  );
  const off = featureOf('super_cool').write(fridge, 0).command;
  assert.equal(off.name, 'stopProgram');
  assert.deepEqual(Object.keys(off.parameters), ['quickModeZ1'], 'the other modes stay');
  const fridgeMode = featureOf('fridge_mode');
  assert.equal(fridgeMode.write(fridge, 'holiday').command.category, 'PROGRAMS.REF.HOLIDAY');
  assert.deepEqual(Object.keys(fridgeMode.write(fridge, 'none').command.parameters).sort(), [
    'holidayMode',
    'intelligenceMode',
    'quickModeZ1',
    'quickModeZ2',
  ]);
  assert.throws(() => fridgeMode.write(fridge, 'nope'), CommandError);
});

test('fridge mode: the options of the model, the current mode in pyhOn order', () => {
  const mode = featureOf('fridge_mode');
  const fridge = entryOf('ref_10188');
  assert.deepEqual(
    mode.options(fridge, 'fr').map((option) => [option.value, option.label]),
    [
      ['none', 'Aucun mode'],
      ['holiday', 'Mode vacances'],
      ['auto_set', 'Mode auto'],
      ['super_cool', 'Super froid'],
      ['super_freeze', 'Super congélation'],
    ],
  );
  assert.deepEqual(mode.value(fridge), { text: 'auto_set' });
  const both = entryOf('ref_10188', { params: { holidayMode: '1' } });
  assert.deepEqual(mode.value(both), { text: 'holiday' });
  const idle = entryOf('ref_10188', { params: { intelligenceMode: '0' } });
  assert.deepEqual(mode.value(idle), { text: 'none' });
  assert.equal(mode.present(entryOf('wm_1301')), false);
});

test('remote control: commands refused when disabled or offline', () => {
  assert.throws(
    () => checkRemote(entryOf('wm_1301')),
    (error) => error.key === 'errorRemoteControl',
  );
  assert.doesNotThrow(() => checkRemote(entryOf('wm_1301', { params: { remoteCtrValid: '1' } })));
  assert.throws(
    () => checkRemote(entryOf('dw_522', { connected: false })),
    (error) => error.key === 'errorOffline',
  );
});

test('features: a feature seen once stays (no "Update" for a missing parameter)', () => {
  const entry = entryOf('dw_522');
  for (const spec of featuresOf(entry)) {
    entry.featureKeys.add(spec.key);
  }
  delete entry.status.params.saltStatus;
  assert.ok(featuresOf(entry).some((spec) => spec.key === 'salt_refill'));
});

test('names: nickname first, brand and model otherwise', () => {
  assert.equal(applianceName({ nickName: ' Laundry ', applianceTypeName: 'WM' }), 'Laundry');
  assert.equal(
    applianceName({ brand: 'candy', modelName: 'CS 1410', applianceTypeName: 'WM' }),
    'Candy CS 1410',
  );
  assert.equal(applianceName({ applianceTypeName: 'WM' }), 'WM');
});

test('configuration: defaults and bounds', () => {
  assert.deepEqual(normalizeConfig({}), {
    email: '',
    password: '',
    language: 'en',
    pollMs: 60000,
    configured: false,
  });
  const config = normalizeConfig({
    email: ' me@example.com ',
    password: ' pw ',
    language: 'es',
    poll_interval: '30',
  });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' pw ', 'a password is kept as typed');
  assert.equal(config.pollMs, 30000);
  assert.equal(config.configured, true);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollMs, 60000);
});

test('state publication: coalesced, text states, only created devices, paused on a 429', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const clock = fakeClock();
  const device = 'ext:test-integration:appliance:a1';
  const created = new Set([device]);
  const states = createStatePublisher(gladys, {
    logger: silentLogger,
    now: clock.now,
    isCreated: (id) => created.has(id),
  });
  states.push(`${device}:remaining_time`, 20);
  states.push(`${device}:remaining_time`, 19);
  states.push(`${device}:machine_state`, { text: 'Running' });
  states.push('ext:test-integration:appliance:a2:remaining_time', 5);
  assert.equal(states.pendingCount(), 2, 'newest value only, created devices only');
  assert.equal(await states.flush(), 2);
  assert.equal(gladys.fake.lastState(`${device}:remaining_time`), 19);
  assert.equal(gladys.fake.lastState(`${device}:machine_state`), 'Running');

  const original = gladys.publishChangedStates.bind(gladys);
  gladys.publishChangedStates = async () => {
    const error = new Error('Too many requests');
    error.status = 429;
    throw error;
  };
  states.push(`${device}:remaining_time`, 18);
  assert.equal(await states.flush(), 0);
  gladys.publishChangedStates = original;
  assert.equal(await states.flush(), 0, 'paused');
  clock.advance(31000);
  assert.equal(await states.flush(), 1, 'sent after the pause');

  created.add('ext:test-integration:appliance:a2');
  states.republish('ext:test-integration:appliance:a2');
  assert.equal(await states.flush(), 1, 'the value known before the creation');
  states.stop();
});
