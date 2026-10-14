// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and a fake hOn cloud
// (test/helpers.js): login, discovery, states, commands, scene triggers and
// actions, widgets, refused account.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { memoryStorage } from '../src/storage.js';
import { fakeClock, fakeHon, flush, silentLogger } from './helpers.js';

const CONFIG = { email: 'user@example.com', password: 'secret', language: 'fr' };
const MAC = {
  washer: 'a4-cf-12-00-00-01',
  dryer: 'a4-cf-12-00-00-02',
  dishwasher: 'a4-cf-12-00-00-03',
  ac: 'a4-cf-12-00-00-04',
  fridge: 'a4-cf-12-00-00-05',
  oven: 'a4-cf-12-00-00-06',
};
const id = (mac) => `ext:test-integration:appliance:${mac.replace(/-/g, '')}`;

/**
 * @description An integration wired to the fake Gladys and the fake cloud.
 * @param {object} [options] - `{ config, create, cloud }`.
 * @returns {Promise<object>} `{ gladys, fake, app, cloud, clock }`.
 */
async function setup({ config = CONFIG, create = true, cloud: given } = {}) {
  const clock = fakeClock();
  const cloud = given ?? fakeHon({ now: clock.now });
  const gladys = createFakeGladys({ config: structuredClone(config) });
  const app = createApp(gladys, {
    fetch: cloud.fetch,
    storage: memoryStorage(),
    logger: silentLogger,
    now: clock.now,
    afterCommandMs: [],
  });
  await gladys.connect();
  await app.start();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(structuredClone(device));
    }
    await app.flushStates();
  }
  return { gladys, fake: gladys.fake, app, cloud, clock };
}

const ok = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data;
};
const msg = (ack) => ok(ack).message;
const deviceOf = (fake, mac) =>
  structuredClone(fake.devices.find((device) => device.external_id === id(mac)));
const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`));
const events = (fake) => fake.sceneEvents.map((event) => [event.key, event.data]);

test('start: login, every appliance in the Discover tab, states only once created', async () => {
  const { gladys, fake, app, cloud } = await setup({ create: false });
  try {
    assert.equal(cloud.logins, 1);
    assert.equal(fake.connectionStatus.connected, true);
    assert.match(fake.connectionStatus.message.fr, /6 appareil/);
    assert.equal(fake.discoveredDevices.length, 6);
    await app.flushStates();
    assert.equal(fake.states.length, 0, 'nothing before the user adds a device');

    await fake.deviceCreated(structuredClone(fake.discoveredDevices[0]));
    await app.flushStates();
    assert.equal(fake.lastState(`${id(MAC.washer)}:machine_state`), 'Terminé');
    assert.equal(fake.lastState(`${id(MAC.washer)}:energy`), 33.34);
    assert.deepEqual(
      fake.transports.map((entry) => [entry.device_external_id, entry.transport]),
      [[id(MAC.washer), 'cloud']],
    );
    assert.equal(fake.widgetRefreshes.length > 0, true);
  } finally {
    await app.stop();
    await gladys.disconnect();
  }
});

test('not configured: a clear status, no request to hOn', async () => {
  const { fake, app, cloud } = await setup({ config: {}, create: false });
  try {
    assert.equal(cloud.calls.length, 0);
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(fake.connectionStatus.message.en, /e-mail address and the password/);
    assert.match(msg(await fake.action('test_connection')).fr, /adresse e-mail/);
  } finally {
    await app.stop();
  }
});

test('commands: a program start needs remote control, then reaches hOn', async () => {
  const { fake, app, cloud } = await setup();
  try {
    const washer = deviceOf(fake, MAC.washer);
    const refused = await fake.setValue(washer, featureOf(washer, 'program'), 'cottons');
    assert.equal(refused.success, false);
    assert.match(refused.error, /contrôle à distance est désactivé/);
    assert.equal(cloud.sent.length, 0);

    cloud.set(MAC.washer, { remoteCtrValid: '1' });
    await app.poll();
    ok(await fake.setValue(washer, featureOf(washer, 'program'), 'cottons'));
    const [body] = cloud.sent;
    assert.equal(body.commandName, 'startProgram');
    assert.equal(body.programName, 'PROGRAMS.WM_WD.COTTONS');
    assert.equal(body.parameters.prCode, '201', 'the code of the Cottons program');
    assert.equal(body.parameters.spinSpeed !== undefined, true, 'every parameter of the program');

    ok(await fake.setValue(washer, featureOf(washer, 'pause'), 1));
    assert.equal(cloud.sent.at(-1).commandName, 'pauseProgram');
    const readOnly = await fake.setValue(washer, featureOf(washer, 'door'), 1);
    assert.equal(readOnly.success, false);
  } finally {
    await app.stop();
  }
});

test('commands: an air conditioner setting keeps the current values', async () => {
  const { fake, app, cloud } = await setup();
  try {
    const ac = deviceOf(fake, MAC.ac);
    ok(await fake.setValue(ac, featureOf(ac, 'ac_mode'), 2)); // HEATING
    const body = cloud.sent.at(-1);
    assert.equal(body.commandName, 'settings');
    assert.equal(body.parameters.machMode, '4');
    assert.equal(body.parameters.onOffStatus, '1');
    assert.equal(body.parameters.tempSel, '27', 'the current setpoint, not the default');
    assert.equal(body.parameters.windSpeed, '5');

    ok(await fake.setValue(ac, featureOf(ac, 'ac_target_temperature'), 21));
    assert.equal(cloud.sent.at(-1).parameters.tempSel, '21');
    const outOfRange = await fake.setValue(ac, featureOf(ac, 'ac_target_temperature'), 35);
    assert.equal(outOfRange.success, false);
    ok(await fake.setValue(ac, featureOf(ac, 'ac_power'), 0));
    assert.equal(cloud.sent.at(-1).commandName, 'stopProgram');
  } finally {
    await app.stop();
  }
});

test('scene triggers: started, finished with its duration, error, refill, offline, online', async () => {
  const { fake, app, cloud, clock } = await setup();
  try {
    assert.deepEqual(events(fake), [], 'no event for the first status seen');
    cloud.set(MAC.washer, { machMode: '2', prPhase: '1', prCode: '1', remainingTimeMM: '120' });
    await app.poll();
    clock.advance(95 * 60 * 1000);
    cloud.set(MAC.washer, { machMode: '7', prPhase: '10', remainingTimeMM: '0' });
    cloud.set(MAC.dishwasher, { saltStatus: '1', errors: 'E4' });
    await app.poll();
    cloud.setConnected(MAC.oven, false);
    await app.poll();
    cloud.setConnected(MAC.oven, true);
    await app.poll();

    const list = events(fake);
    const started = list.find(([key]) => key === 'cycle_started');
    assert.equal(started[1].device, id(MAC.washer));
    assert.equal(started[1].appliance_type, 'washing_machine');
    assert.equal(started[1].remaining_minutes, 120);
    const finished = list.find(([key]) => key === 'cycle_finished');
    assert.equal(finished[1].duration_minutes, 95);
    assert.equal(finished[1].device_name, 'Washing machine');
    assert.deepEqual(list.find(([key]) => key === 'refill_needed')[1], {
      device: id(MAC.dishwasher),
      device_name: 'Dishwasher',
      appliance_type: 'dishwasher',
      item: 'salt',
    });
    assert.equal(list.find(([key]) => key === 'appliance_error')[1].error_code, 'E4');
    assert.deepEqual(
      list
        .filter(([key]) => key.startsWith('appliance_o'))
        .map(([key, data]) => [key, data.device]),
      [
        ['appliance_offline', id(MAC.oven)],
        ['appliance_online', id(MAC.oven)],
      ],
    );
    for (const [, data] of list) {
      for (const value of Object.values(data)) {
        assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
      }
    }
    assert.equal(
      fake.transports
        .filter((entry) => entry.device_external_id === id(MAC.oven))
        .map((e) => e.transport)
        .join(),
      'cloud,unreachable,cloud',
    );
  } finally {
    await app.stop();
  }
});

test('scene actions: start (never echoed as a trigger), control, refresh', async () => {
  const { fake, app, cloud } = await setup();
  try {
    cloud.set(MAC.dishwasher, { machMode: '1' });
    const started = ok(
      await fake.sceneAction('start_program', {
        device: id(MAC.dishwasher),
        program: 'eco_bldc',
        delay_minutes: 60,
      }),
    );
    assert.deepEqual(started.outputs ?? started, { program: 'eco_bldc', estimated_minutes: 179 });
    assert.equal(cloud.sent.at(-1).parameters.delayTime, '60');

    cloud.set(MAC.dishwasher, { machMode: '2' });
    await app.poll();
    assert.equal(
      events(fake).filter(([key]) => key === 'cycle_started').length,
      0,
      'the start asked by a scene is not a trigger',
    );

    const badDelay = await fake.sceneAction('start_program', {
      device: id(MAC.dishwasher),
      program: 'eco_bldc',
      delay_minutes: 45,
    });
    assert.equal(badDelay.success, false);
    assert.match(badDelay.error, /départ différé de 45 min/);
    const unknown = await fake.sceneAction('start_program', {
      device: id(MAC.dishwasher),
      program: 'nothing',
    });
    assert.match(unknown.error, /Programme « nothing » inconnu/);

    ok(await fake.sceneAction('control_cycle', { device: id(MAC.dishwasher), command: 'stop' }));
    assert.equal(cloud.sent.at(-1).commandName, 'stopProgram');
    cloud.set(MAC.dishwasher, { machMode: '7' });
    await app.poll();
    assert.equal(events(fake).filter(([key]) => key === 'cycle_finished').length, 0);
    const noPause = await fake.sceneAction('control_cycle', {
      device: id(MAC.dishwasher),
      command: 'pause',
    });
    assert.match(noPause.error, /ne propose pas la commande « pause »/);

    const status = ok(await fake.sceneAction('refresh_status', { device: id(MAC.washer) }));
    assert.deepEqual(status.outputs ?? status, {
      machine_state: 'finished',
      program_phase: 'ready',
      program: '',
      remaining_minutes: 0,
      connected: true,
      error_code: '',
    });
  } finally {
    await app.stop();
  }
});

test('widgets: valid content in every language, appliance buttons', async () => {
  const { fake, app, cloud } = await setup();
  try {
    cloud.set(MAC.washer, {
      machMode: '2',
      prPhase: '3',
      prCode: '1',
      remainingTimeMM: '40',
      remoteCtrValid: '1',
    });
    await app.poll();
    for (const language of ['en', 'fr', 'de', 'es']) {
      for (const settings of [{}, { show: 'active' }]) {
        const { content } = ok(await fake.widgetGet('appliances', { settings, language }));
        assert.deepEqual(validateWidgetContent(content), [], `${language} ${settings.show}`);
      }
      for (const mac of Object.values(MAC)) {
        const { content } = ok(
          await fake.widgetGet('appliance', { settings: { device: id(mac) }, language }),
        );
        assert.deepEqual(validateWidgetContent(content), [], `${mac} ${language}`);
      }
    }
    const { content: active } = ok(
      await fake.widgetGet('appliances', { settings: { show: 'active' } }),
    );
    const cards = active.components.find((component) => component.type === 'card-list');
    assert.deepEqual(
      cards.items.map((item) => item.title),
      ['Washing machine'],
    );
    assert.equal(cards.items[0].subtitle.fr, 'Essorage · 40 min restantes');

    const { content } = ok(
      await fake.widgetGet('appliance', { settings: { device: id(MAC.washer) } }),
    );
    const buttons = content.components.filter((component) => component.type === 'button');
    assert.deepEqual(
      buttons.map((button) => button.action.key),
      ['pause', 'stop', 'refresh'],
    );
    const toast = msg(
      await fake.widgetAction('appliance', 'pause', buttons[0].action.params, {
        settings: { device: id(MAC.washer) },
      }),
    );
    assert.match(toast.en, /Command sent to Washing machine/);
    assert.equal(cloud.sent.at(-1).commandName, 'pauseProgram');

    const missing = ok(await fake.widgetGet('appliance', { settings: {} }));
    assert.deepEqual(validateWidgetContent(missing.content), []);
  } finally {
    await app.stop();
  }
});

test('refused account: clear status, one account_error event, no login storm', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  cloud.refuseLogin = true;
  const { fake, app } = await setup({ cloud, create: false });
  try {
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(fake.connectionStatus.message.fr, /refusé l’adresse e-mail ou le mot de passe/);
    await app.poll();
    await app.poll();
    assert.equal(
      cloud.calls.filter((call) => call.path === '/ciam/authorize').length,
      1,
      'paused after the refusal',
    );
    assert.deepEqual(events(fake), [['account_error', { reason: 'credentials_refused' }]]);

    // A new password from the configuration: logged in again.
    cloud.refuseLogin = false;
    await fake.configUpdated({ ...CONFIG, password: 'right' });
    await flush();
    assert.equal(fake.connectionStatus.connected, true);
  } finally {
    await app.stop();
  }
});

test('configuration buttons: test the connection, list the programs', async () => {
  const { fake, app } = await setup();
  try {
    const test = msg(await fake.action('test_connection'));
    assert.match(
      test.fr,
      /Connecté au cloud hOn\. 6 appareil\(s\) : Washing machine \(Lave-linge, Terminé\)/,
    );
    const programs = msg(await fake.action('list_programs', { device: id(MAC.washer) }));
    assert.match(programs.en, /Washing machine: .*cottons/);
    assert.doesNotMatch(programs.en, /Dishwasher/);
  } finally {
    await app.stop();
  }
});

test('fridge: the mode list starts a program, the widget falls back to the setpoints', async () => {
  const cloud = fakeHon();
  // Many fridges report their setpoints only (hon-test-data ref_10009, ref_10138).
  delete cloud.contexts.get(MAC.fridge).shadow.parameters.tempZ1;
  delete cloud.contexts.get(MAC.fridge).shadow.parameters.tempZ2;
  const { fake, app } = await setup({ cloud });
  try {
    const fridge = deviceOf(fake, MAC.fridge);
    assert.equal(featureOf(fridge, 'super_cool').read_only, false);
    assert.equal(fake.lastState(`${id(MAC.fridge)}:fridge_mode`), 'auto_set');
    ok(await fake.setValue(fridge, featureOf(fridge, 'fridge_mode'), 'super_freeze'));
    assert.equal(cloud.sent.at(-1).commandName, 'startProgram');
    assert.equal(cloud.sent.at(-1).programName, 'PROGRAMS.REF.SUPER_FREEZE');
    assert.deepEqual(cloud.sent.at(-1).parameters, { quickModeZ2: '1' });
    ok(await fake.setValue(fridge, featureOf(fridge, 'auto_set'), 0));
    assert.equal(cloud.sent.at(-1).commandName, 'stopProgram');
    assert.deepEqual(cloud.sent.at(-1).parameters, { intelligenceMode: '0' });

    const { content } = ok(
      await fake.widgetGet('appliance', { settings: { device: id(MAC.fridge) } }),
    );
    assert.deepEqual(
      content.components
        .filter((component) => component.type === 'value')
        .map((component) => [component.label.fr, component.value]),
      [
        ['Consigne réfrigérateur', 5],
        ['Consigne congélateur', -19],
      ],
    );
  } finally {
    await app.stop();
  }
});

test('diagnostic: the Logs tab gets states and commands, never what identifies the user', async () => {
  const lines = [];
  const logger = { ...silentLogger, info: (line) => lines.push(line) };
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  const gladys = createFakeGladys({ config: structuredClone(CONFIG) });
  const app = createApp(gladys, {
    fetch: cloud.fetch,
    storage: memoryStorage(),
    logger,
    now: clock.now,
    afterCommandMs: [],
  });
  await gladys.connect();
  await app.start();
  try {
    lines.length = 0;
    const message = msg(await gladys.fake.action('diagnostic'));
    assert.match(message.fr, /Diagnostic de 6 appareil\(s\).*REF HSW59F18EIPT/);
    const fridge = lines.filter((line) => line.startsWith('hOn diagnostic 5/6 REF HSW59F18EIPT'));
    assert.deepEqual(
      fridge.map((line) => line.split(':')[0].split(' ').pop()),
      ['appliance', 'status', 'commands', 'programs'],
    );
    const all = lines.join('\n');
    assert.match(all, /"intelligenceMode":"1"/);
    assert.match(all, /PROGRAMS\.REF\.AUTO_SET/);
    assert.match(all, /"tempSelZ1":"1\.\.9\/1"|"tempSelZ1":"[-0-9.]+\.\.[-0-9.]+\/[0-9.]+"/);
    for (const secret of [
      'a4-cf-12',
      'a4cf12',
      'XX11X1X1111',
      'Kitchen fridge',
      'user@example.com',
    ]) {
      assert.equal(all.includes(secret), false, secret);
    }
  } finally {
    await app.stop();
    await gladys.disconnect();
  }
});

test('language change: feature names and text states in the new language', async () => {
  const { fake, app } = await setup();
  try {
    await fake.configUpdated({ ...CONFIG, language: 'de' });
    await app.flushStates();
    assert.equal(fake.lastState(`${id(MAC.washer)}:machine_state`), 'Beendet');
    const washer = fake.discoveredDevices.find((device) => device.external_id === id(MAC.washer));
    assert.equal(featureOf(washer, 'remaining_time').name, 'Washing machine - Restzeit');
  } finally {
    await app.stop();
  }
});

test('the session survives a restart: no second login', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  const storage = memoryStorage();
  for (let run = 0; run < 2; run += 1) {
    const gladys = createFakeGladys({ config: structuredClone(CONFIG) });
    const app = createApp(gladys, {
      fetch: cloud.fetch,
      storage,
      logger: silentLogger,
      now: clock.now,
    });
    await gladys.connect();
    await app.start();
    await app.stop();
  }
  assert.equal(cloud.logins, 1);
  assert.match(storage.files['device.json'].mobileId, /^[0-9a-f]{16}$/);
});
