// The manifest and the code agree: every declared action, trigger, widget and
// configuration key has its code, every version says the same thing, and the
// manifest respects what the store and the Gladys core expect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ACTIONS } from '../src/app.js';
import { DEFAULTS, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { REFILLS } from '../src/hon/constants.js';
import { CONTROL_COMMANDS, SCENE_ACTIONS, statusOutputs, TRIGGERS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]));

test('one version everywhere, image of this repository', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-hon:${pkg.version}`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/William-De71\/gladys-hon\/main\/cover\.jpg$/,
  );
});

test('store rules: type, Gladys version, transports, categories, permissions', () => {
  assert.equal(manifest.type, 'device');
  // widgets and scene_* need 5.1.0, 5.1.1 fixes the widget card dates;
  // the catalog keywords need 5.3.0.
  assert.equal(manifest.gladys_version, '>=5.3.0');
  // Everything goes through the hOn cloud: no local channel.
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['appliances', 'climate']);
  assert.equal(manifest.name, 'hOn');
  // No permission: the hOn cloud is reached over the Internet.
  for (const key of ['location', 'network_wake', 'containers', 'webhooks', 'network_discovery']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('configuration: keys, defaults and choices of the code', () => {
  const fields = byKey(manifest.config_schema);
  const values = (field) => field.options.map((option) => option.value);
  assert.deepEqual(values(fields.language), LANGUAGES);
  assert.deepEqual(values(fields.poll_interval), POLL_INTERVALS.map(String));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  assert.equal(fields.email.type, 'string');
  assert.equal(fields.password.type, 'secret');
  // `text` / `password` are refused by the store.
  for (const field of manifest.config_schema) {
    assert.ok(['string', 'select', 'secret', 'section'].includes(field.type), field.key);
  }
  assert.equal(fields.GLADYS_PREFER_LOCAL, undefined, 'one transport: no local preference');
});

test('configuration buttons: the keys of the code', () => {
  assert.deepEqual(
    manifest.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
  const programs = byKey(manifest.actions).list_programs;
  assert.equal(programs.fields[0].source, 'devices');
});

test('scene triggers: the keys the code fires, their filters in the event data', () => {
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(Object.keys(triggers).sort(), Object.values(TRIGGERS).sort());
  const base = ['device_name', 'appliance_type'];
  const variables = {
    cycle_started: [...base, 'program', 'remaining_minutes'],
    cycle_finished: [...base, 'program', 'duration_minutes'],
    appliance_error: [...base, 'error_code'],
    refill_needed: [...base, 'item'],
    appliance_offline: base,
    appliance_online: base,
    account_error: ['reason'],
  };
  for (const [key, keys] of Object.entries(variables)) {
    assert.deepEqual(
      triggers[key].variables.map((variable) => variable.key),
      keys,
      `${key} variables`,
    );
    for (const field of triggers[key].fields ?? []) {
      // The device filter compares with the `device` key of the event data.
      assert.ok(['device', ...keys].includes(field.key), `${key} filter ${field.key}`);
      assert.ok(field.type !== 'boolean', 'a trigger filter is never a boolean');
    }
  }
  const items = triggers.refill_needed.fields.find((field) => field.key === 'item');
  assert.deepEqual(
    items.options.map((option) => option.value),
    Object.keys(REFILLS),
  );
});

test('scene actions: keys, fields and outputs of the code', () => {
  const actions = byKey(manifest.scene_actions);
  assert.deepEqual(Object.keys(actions).sort(), Object.values(SCENE_ACTIONS).sort());
  assert.deepEqual(
    actions.start_program.outputs.map((output) => output.key),
    ['program', 'estimated_minutes'],
  );
  assert.deepEqual(
    actions.control_cycle.fields
      .find((field) => field.key === 'command')
      .options.map((option) => option.value),
    CONTROL_COMMANDS,
  );
  assert.deepEqual(
    actions.refresh_status.outputs.map((output) => output.key),
    Object.keys(statusOutputs({ type: 'WM', status: null }, '')),
  );
  for (const action of manifest.scene_actions) {
    const device = action.fields.find((field) => field.key === 'device');
    assert.equal(device.source, 'devices');
    assert.equal(device.required, true);
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120);
  }
});

test('widgets: the keys of the code, settings without secrets', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    Object.values(WIDGETS),
  );
  const widgets = byKey(manifest.widgets);
  assert.equal(widgets.appliance.settings[0].source, 'devices');
  assert.deepEqual(
    widgets.appliances.settings[0].options.map((option) => option.value),
    ['all', 'active'],
  );
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds, countries', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
  assert.equal(manifest.countries, undefined, 'worldwide: no countries');
});
