// The hOn client, unit by unit, against the fake hOn cloud of test/helpers.js:
// the CIAM login and its session, the REST requests, the command payloads,
// the status of the appliances.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  accountFingerprint,
  AuthError,
  createSession,
  jwtExpiry,
  pkcePair,
} from '../src/hon/auth.js';
import { applianceCode, createClient } from '../src/hon/client.js';
import {
  acceptValue,
  buildCommand,
  findProgram,
  formatNumber,
  parseCommands,
  programLabel,
} from '../src/hon/commands.js';
import {
  currentProgram,
  errorCode,
  machineState,
  parseContext,
  programPhase,
  remainingMinutes,
} from '../src/hon/status.js';
import { memoryStorage } from '../src/storage.js';
import { fakeClock, fakeHon, fixture, jwt, silentLogger } from './helpers.js';

const sessionOf = (cloud, { storage = memoryStorage(), clock = fakeClock() } = {}) => {
  const session = createSession({
    fetch: cloud.fetch,
    logger: silentLogger,
    now: clock.now,
    store: {
      load: () => storage.read('session.json'),
      save: (value) => storage.write('session.json', value),
    },
  });
  session.configure('user@example.com', 'secret password');
  return { session, storage, clock };
};

// --- Session ----------------------------------------------------------------------------

test('PKCE: an S256 challenge of a URL-safe verifier', () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{86}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

test('JWT expiry read from the payload, null when unreadable', () => {
  assert.equal(jwtExpiry(jwt(1_800_000_000_000)), 1_800_000_000_000);
  assert.equal(jwtExpiry('not a token'), null);
});

test('login: credentials in the query of /ciam/authorize, verifier sent to /ciam/token', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ fixtures: [], now: clock.now });
  const { session, storage } = sessionOf(cloud, { clock });
  const tokens = await session.tokens();
  assert.equal(cloud.logins, 1);
  const [authorize, token] = cloud.calls;
  assert.equal(authorize.path, '/ciam/authorize');
  assert.equal(authorize.query.username, 'user@example.com');
  assert.equal(authorize.query.password, 'secret password');
  assert.ok(authorize.headers['x-api-key']);
  assert.equal(token.method, 'POST');
  assert.equal(
    createHash('sha256').update(token.body.code_verifier).digest('base64url'),
    authorize.query.code_challenge,
  );
  assert.ok(tokens.idToken && tokens.cognitoToken);
  // Saved for the next start, without the password.
  const saved = storage.files['session.json'];
  assert.equal(saved.account, accountFingerprint('USER@example.com '));
  assert.ok(!JSON.stringify(saved).includes('secret password'));
});

test('session: reused while valid, renewed by replay before expiry, saved session reused', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ fixtures: [], now: clock.now });
  const { session, storage } = sessionOf(cloud, { clock });
  const first = await session.tokens();
  assert.equal((await session.tokens()).idToken, first.idToken);
  clock.advance(56 * 60 * 1000); // 4 min before the expiry of the id token
  const renewed = await session.tokens();
  assert.notEqual(renewed.idToken, first.idToken);
  assert.equal(cloud.logins, 1, 'no new login');
  assert.equal(cloud.replays, 1);

  // A restart reads the session from /data: no login.
  const again = sessionOf(cloud, { storage, clock });
  assert.equal((await again.session.tokens()).idToken, renewed.idToken);
  assert.equal(cloud.logins, 1);
});

test('session: a refused replay falls back to a full login', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ fixtures: [], now: clock.now });
  const { session } = sessionOf(cloud, { clock });
  await session.tokens();
  cloud.refuseReplay = true;
  await session.tokens({ force: true });
  assert.equal(cloud.logins, 2);
});

test('session: a refused login pauses the next attempts (15 min, doubling)', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ fixtures: [], now: clock.now });
  cloud.refuseLogin = true;
  const { session } = sessionOf(cloud, { clock });
  const error = await session.tokens().catch((e) => e);
  assert.ok(error instanceof AuthError);
  assert.equal(error.code, 'AUTH-INV-PARAM');
  assert.equal(error.retryAt, clock.now() + 15 * 60 * 1000);
  const attempts = cloud.calls.length;
  await assert.rejects(session.tokens(), AuthError);
  assert.equal(cloud.calls.length, attempts, 'no request while paused');
  clock.advance(15 * 60 * 1000);
  const second = await session.tokens().catch((e) => e);
  assert.equal(second.retryAt, clock.now() + 30 * 60 * 1000);
  // A new password lifts the pause.
  cloud.refuseLogin = false;
  session.configure('user@example.com', 'new password');
  assert.ok((await session.tokens()).idToken);
});

test('session: another account does not reuse the saved session', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ fixtures: [], now: clock.now });
  const { storage } = sessionOf(cloud, { clock });
  await sessionOf(cloud, { storage, clock }).session.tokens();
  const other = createSession({
    fetch: cloud.fetch,
    logger: silentLogger,
    now: clock.now,
    store: { load: () => storage.read('session.json'), save: () => {} },
  });
  other.configure('other@example.com', 'x');
  await other.tokens();
  assert.equal(cloud.logins, 2);
});

// --- Client -------------------------------------------------------------------------------

const clientOf = (cloud, clock = fakeClock()) => {
  const { session } = sessionOf(cloud, { clock });
  return createClient({
    fetch: cloud.fetch,
    session,
    mobileId: () => '0123456789abcdef',
    now: clock.now,
  });
};

test('client: appliance list, context, commands, with the tokens in the headers', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  const client = clientOf(cloud, clock);
  const appliances = await client.appliances();
  assert.equal(appliances.length, 6);
  const list = cloud.calls.find((call) => call.path.endsWith('appliance-list'));
  assert.deepEqual(list.body, { deviceId: '0123456789abcdef' });
  assert.ok(list.headers['cognito-token'] && list.headers['id-token']);

  const washer = appliances.find((appliance) => appliance.applianceTypeName === 'WM');
  const context = await client.context(washer);
  assert.equal(context.shadow.parameters.machMode.parNewVal, '7');
  const call = cloud.calls.at(-1);
  assert.deepEqual(call.query, {
    macAddress: washer.macAddress,
    applianceType: 'WM',
    category: 'CYCLE',
  });

  const commands = await client.commands(washer);
  assert.ok(commands.startProgram);
  assert.equal(commands.resultCode, undefined);
  const retrieve = cloud.calls.at(-1).query;
  assert.equal(retrieve.applianceModelId, '1301');
  assert.equal(retrieve.os, 'android');
  assert.equal(retrieve.series, 'h-wash700Pro');
});

test('client: an expired token is renewed once and the request retried', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  const client = clientOf(cloud, clock);
  await client.appliances();
  cloud.validIdTokens.clear(); // the cloud revokes every token
  assert.equal((await client.appliances()).length, 6);
  assert.equal(cloud.replays, 1);
});

test('client: the send body of the hOn app', async () => {
  const clock = fakeClock();
  const cloud = fakeHon({ now: clock.now });
  const client = clientOf(cloud, clock);
  const [washer] = await client.appliances();
  await client.send(washer, {
    name: 'startProgram',
    parameters: { onOffStatus: '1' },
    ancillaryParameters: { remoteActionable: '1' },
    programName: 'PROGRAMS.WM_WD.cottons',
    options: { opt1: 'extraRinse1' },
  });
  const [body] = cloud.sent;
  assert.equal(body.macAddress, washer.macAddress);
  assert.equal(body.commandName, 'startProgram');
  assert.equal(body.programName, 'PROGRAMS.WM_WD.COTTONS');
  assert.equal(body.timestamp, '2026-10-15T08:00:00.000Z');
  assert.equal(body.transactionId, `${washer.macAddress}_2026-10-15T08:00:00.000Z`);
  assert.equal(body.applianceType, 'WM');
  assert.deepEqual(body.attributes, {
    channel: 'mobileApp',
    origin: 'standardProgram',
    energyLabel: '0',
  });
  assert.equal(body.device.mobileOs, 'android');
  assert.equal(body.device.mobileId, '0123456789abcdef');
  assert.deepEqual(body.applianceOptions, { opt1: 'extraRinse1' });
});

test('client: the appliance code falls back on the serial number', () => {
  assert.equal(applianceCode({ code: 'ABC' }), 'ABC');
  assert.equal(applianceCode({ serialNumber: '12345678901234' }), '12345678');
  assert.equal(applianceCode({ serialNumber: '123456789012345678901' }), '12345678901');
});

// --- Commands ------------------------------------------------------------------------------

test('commands: programs, settings, stop / pause / resume from a retrieve payload', () => {
  const washer = parseCommands(fixture('wm_1301').commands);
  assert.ok(washer.stop && washer.pause && washer.resume);
  assert.ok(washer.programs.length >= 4);
  const cottons = findProgram(washer.programs, 'cottons');
  assert.equal(cottons.category, 'PROGRAMS.WM_WD.COTTONS');
  assert.equal(findProgram(washer.programs, 'PROGRAMS.WM_WD.COTTONS'), cottons);
  assert.equal(findProgram(washer.programs, 'Cottons'), cottons);
  assert.equal(findProgram(washer.programs, 'unknown'), null);

  const oven = parseCommands(fixture('ov_577').commands);
  assert.ok(
    oven.programs.every((program) => !/iot_(recipe|guided)/.test(program.key)),
    'guided programs need the app',
  );
  const ac = parseCommands(fixture('ac_1263').commands);
  assert.equal(ac.settings.category, 'setParameters');
  assert.deepEqual(ac.settings.parameters.windSpeed.values, ['1', '2', '3', '5']);
});

test('commands: every parameter sent as a string, current values kept, overrides checked', () => {
  const ac = parseCommands(fixture('ac_1263').commands);
  const { parameters, ancillaryParameters } = buildCommand(ac.settings, {
    current: { tempSel: '27.00', windSpeed: '5', machMode: '2', onOffStatus: '0' },
    values: { tempSel: 24 },
  });
  assert.equal(parameters.tempSel, '24');
  assert.equal(parameters.windSpeed, '5');
  assert.equal(parameters.machMode, '2');
  // A fixed parameter keeps its value: settings always turns the unit on.
  assert.equal(parameters.onOffStatus, '1');
  assert.equal(parameters.operationName, 'grSetDAC');
  assert.ok(Object.values(parameters).every((value) => typeof value === 'string'));
  assert.equal(ancillaryParameters.programRules, undefined);
  assert.throws(() => buildCommand(ac.settings, { values: { tempSel: 35 } }), RangeError);
  assert.throws(() => buildCommand(ac.settings, { values: { windSpeed: 4 } }), RangeError);
});

test('commands: a program start carries prStr and the program name', () => {
  const dishwasher = parseCommands(fixture('dw_522').commands);
  const eco = findProgram(dishwasher.programs, 'eco_bldc');
  const parts = buildCommand(eco.command, { values: { delayTime: 60 } });
  assert.equal(parts.parameters.prStr, 'PROGRAMS.DW.ECO_BLDC');
  assert.equal(parts.parameters.prCode, '8');
  assert.equal(parts.parameters.delayTime, '60');
  assert.equal(parts.programName, 'PROGRAMS.DW.ECO_BLDC');
  assert.equal(eco.minutes, 179);
  assert.throws(() => buildCommand(eco.command, { values: { delayTime: 45 } }), RangeError);
});

test('commands: number format and value checks', () => {
  assert.equal(formatNumber(22), '22');
  assert.equal(formatNumber(22.5), '22.5');
  const range = { typology: 'range', min: 16, max: 30, step: 0.5 };
  assert.equal(acceptValue(range, '22.50'), '22.5');
  assert.equal(acceptValue(range, 22.25), null);
  assert.equal(acceptValue({ typology: 'enum', values: ['1', '2'] }, '1.00'), '1');
  assert.equal(programLabel('iot_wash_dark'), 'Wash dark');
  assert.equal(programLabel('hqd_cotton'), 'Cotton');
});

// --- Status ---------------------------------------------------------------------------------

test('status: machine state, phase, remaining time and errors', () => {
  const washer = parseContext(fixture('wm_1301').context);
  assert.equal(machineState('WM', washer), 'finished');
  assert.equal(programPhase('WM', washer), 'ready');
  assert.equal(remainingMinutes('WM', washer), 0, 'no cycle: nothing left');
  const running = { ...washer, params: { ...washer.params, machMode: '2', prPhase: '3' } };
  assert.equal(machineState('WM', running), 'running');
  assert.equal(programPhase('WM', running), 'spin');
  assert.equal(remainingMinutes('WM', running), 83);
  assert.equal(machineState('WM', { ...running, connected: false }), 'offline');
  assert.equal(errorCode(washer), null);
  assert.equal(errorCode({ params: { errors: 'E21' } }), 'E21');

  const oven = parseContext(fixture('ov_577').context);
  assert.equal(machineState('OV', oven), 'off');
  const ac = parseContext(fixture('ac_1263').context);
  assert.equal(machineState('AC', ac), 'on');
  assert.equal(programPhase('AC', ac), null);
});

test('status: the current program from its code, the dial program first', () => {
  const dryer = fixture('td_1014');
  const status = parseContext(dryer.context);
  const program = currentProgram(status, parseCommands(dryer.commands).programs);
  assert.ok(program, 'prCode 62 is a program of the fixture');
  assert.ok(!program.key.startsWith('iot_'));
});
