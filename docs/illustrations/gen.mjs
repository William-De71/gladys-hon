// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake hOn cloud of the tests (anonymized appliances of
// hon-test-data), on a made-up evening (Thursday 15 October 2026): the
// washing machine is spinning, the dishwasher waits for its delayed start,
// the air conditioner cools the living room.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { LANGUAGES } = await load('src/i18n.js');
const { memoryStorage } = await load('src/storage.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);
const { fakeHon } = await load('test/helpers.js');

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

const NAMES = {
  'a4-cf-12-00-00-01': {
    en: 'Washing machine',
    fr: 'Lave-linge',
    de: 'Waschmaschine',
    es: 'Lavadora',
  },
  'a4-cf-12-00-00-02': { en: 'Dryer', fr: 'Sèche-linge', de: 'Trockner', es: 'Secadora' },
  'a4-cf-12-00-00-03': {
    en: 'Dishwasher',
    fr: 'Lave-vaisselle',
    de: 'Geschirrspüler',
    es: 'Lavavajillas',
  },
  'a4-cf-12-00-00-04': {
    en: 'Living room AC',
    fr: 'Clim salon',
    de: 'Klima Wohnzimmer',
    es: 'Aire salón',
  },
  'a4-cf-12-00-00-05': {
    en: 'Kitchen fridge',
    fr: 'Frigo cuisine',
    de: 'Kühlschrank Küche',
    es: 'Nevera cocina',
  },
  'a4-cf-12-00-00-06': { en: 'Oven', fr: 'Four', de: 'Backofen', es: 'Horno' },
};
const WASHER = 'a4-cf-12-00-00-01';

/**
 * @description One language: the six appliances, the washer in its cycle.
 * @param {string} language - Language.
 * @returns {Promise<object>} The widget contents.
 */
async function contents(language) {
  let now = Date.parse('2026-10-15T17:00:00Z');
  const cloud = fakeHon({ now: () => now });
  for (const appliance of cloud.appliances) {
    appliance.nickName = NAMES[appliance.macAddress][language];
  }
  cloud.set(WASHER, { machMode: '1', prPhase: '0', remoteCtrValid: '1', prCode: '201' });
  cloud.set('a4-cf-12-00-00-02', { machMode: '7', prPhase: '0' });
  cloud.set('a4-cf-12-00-00-03', { machMode: '4', remainingTimeMM: '179', delayTime: '60' });
  cloud.set('a4-cf-12-00-00-04', {
    tempIndoor: '24.5',
    tempOutdoor: '19',
    tempSel: '22',
    machMode: '1',
  });
  cloud.set('a4-cf-12-00-00-05', { tempZ1: '4', tempZ2: '-18', tempEnv: '21' });

  const gladys = createFakeGladys({ config: { email: 'me@example.com', password: 'x', language } });
  const app = createApp(gladys, {
    fetch: cloud.fetch,
    storage: memoryStorage(),
    logger: silent,
    now: () => now,
    afterCommandMs: [],
  });
  await gladys.connect();
  await app.start();
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(structuredClone(device));
  }
  // The cycle starts (120 min), then the evening goes on: 38 min left.
  now += 60 * 1000;
  cloud.set(WASHER, { machMode: '2', prPhase: '1', remainingTimeMM: '120' });
  await app.poll();
  now += 82 * 60 * 1000;
  cloud.set(WASHER, { machMode: '2', prPhase: '3', remainingTimeMM: '38' });
  await app.poll();

  const washer = `ext:test-integration:appliance:${WASHER.replace(/-/g, '')}`;
  const get = async (key, settings) =>
    (await gladys.fake.widgetGet(key, { settings, language })).data.content;
  const result = {
    appliances: await get('appliances', { show: 'all' }),
    appliance: await get('appliance', { device: washer }),
  };
  await app.stop();
  return result;
}

const all = {};
for (const language of LANGUAGES) {
  all[language] = await contents(language);
}

const cards = Object.fromEntries(
  manifest.widgets.map((widget) => [widget.key, { icon: widget.icon, label: widget.label }]),
);
writeFileSync(out, JSON.stringify({ contents: all, images: {}, cards }));
