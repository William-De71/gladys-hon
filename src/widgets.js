// -----------------------------------------------------------------------------
// Dashboard widgets.
//
//   appliances   every appliance of the account: state, phase, time left
//   appliance    one appliance (setting `device`): state, progress of the
//                cycle, temperatures, and its pause / resume / stop or
//                on / off buttons
//
// Pure: the build functions turn a snapshot into a content, so the tests and
// docs/illustrations/gen.mjs use the exact code Gladys gets. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { LANGUAGES, t, text, truncate, truncateAll } from './i18n.js';

export const WIDGETS = { OVERVIEW: 'appliances', APPLIANCE: 'appliance' };
export const WIDGET_ACTIONS = {
  REFRESH: 'refresh',
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop',
  POWER_ON: 'power_on',
  POWER_OFF: 'power_off',
};
export const TTL_SECONDS = 60;

/** Badge / status colour of each machine state. */
export const STATE_COLORS = {
  running: 'primary',
  paused: 'warning',
  scheduled: 'info',
  stopping: 'warning',
  finished: 'success',
  error: 'danger',
  offline: 'neutral',
  ready: 'neutral',
  selected: 'info',
  test: 'info',
  on: 'success',
  off: 'neutral',
  preheating: 'warning',
  online: 'success',
  cooking: 'primary',
  unknown: 'neutral',
};

/**
 * @description The subtitle of an appliance in the list (the only line the
 * list display shows besides the title and the badge): phase and time left
 * while a cycle runs, temperatures of a climate appliance, the type otherwise.
 * @param {object} view - Appliance view.
 * @returns {object} Multi-language text (60 characters at most).
 */
function subtitle(view) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const parts = [];
      if (view.active) {
        // "Ready" is the phase of a delayed start: the badge says it better.
        if (view.phase && view.phase !== 'ready') {
          parts.push(text(`phase_${view.phase}`, language));
        }
        if (Number.isFinite(view.remaining)) {
          parts.push(text('minutesLeft', language, { minutes: view.remaining }));
        }
      } else if (view.temperatures?.length > 0 && view.connected) {
        parts.push(
          ...view.temperatures
            .slice(0, 2)
            .map((temperature) => `${formatNumber(temperature.value, language)} °C`),
        );
      }
      if (parts.length === 0) {
        parts.push(text(`type_${view.typeKey}`, language));
      }
      return [language, truncate(parts.join(' · '), 60)];
    }),
  );
}

/**
 * @description The details of an appliance, shown when its line is opened.
 * @param {object} view - Appliance view.
 * @returns {object} Multi-language text.
 */
function describe(view) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const parts = [text(`type_${view.typeKey}`, language)];
      if (view.programLabel) {
        parts.push(view.programLabel);
      }
      for (const temperature of view.temperatures ?? []) {
        parts.push(
          `${text(temperature.label, language)} ${formatNumber(temperature.value, language)} °C`,
        );
      }
      if (view.error) {
        parts.push(text('errorCodeValue', language, { code: view.error }));
      }
      return [language, truncate(parts.join(' · '), 300)];
    }),
  );
}

const formatNumber = (value, language) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);

/**
 * @description The account line of the widgets.
 * @param {object} account - `{ configured, connected, paused }`.
 * @returns {object} A status item.
 */
function accountItem(account) {
  if (!account.configured) {
    return { label: t('widgetAccount'), value: t('widgetNotConfigured'), color: 'warning' };
  }
  if (account.connected) {
    return { label: t('widgetAccount'), value: t('widgetConnected'), color: 'success' };
  }
  return {
    label: t('widgetAccount'),
    value: account.refused ? t('widgetRefused') : t('widgetDisconnected'),
    color: 'danger',
  };
}

/**
 * @description The `appliances` widget.
 * @param {object} snapshot - `{ account, appliances: [view] }`.
 * @param {object} [settings] - `{ show: 'all' | 'active' }`.
 * @returns {object} The widget content.
 */
export function buildOverviewWidget(snapshot, settings = {}) {
  const onlyActive = settings.show === 'active';
  const appliances = (snapshot.appliances ?? []).filter((view) => !onlyActive || view.active);
  const running = (snapshot.appliances ?? []).filter((view) => view.active).length;
  const components = [
    { type: 'status', items: [accountItem(snapshot.account)] },
    {
      type: 'value',
      value: running,
      label: t('widgetRunning'),
      icon: 'activity',
      color: running > 0 ? 'primary' : 'neutral',
    },
    {
      type: 'value',
      value: (snapshot.appliances ?? []).length,
      label: t('widgetAppliances'),
      icon: 'cpu',
    },
  ];
  if (appliances.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: appliances.slice(0, 8).map((view) => {
        return {
          title: truncate(view.name, 60),
          subtitle: subtitle(view),
          description: describe(view),
          badge: {
            text: truncateAll(t(`state_${view.state}`), 16),
            color: STATE_COLORS[view.state] ?? 'neutral',
          },
        };
      }),
    });
  } else {
    components.push({
      type: 'text',
      text: snapshot.account.configured
        ? onlyActive
          ? t('widgetNothingRunning')
          : t('widgetNoAppliance')
        : t('widgetConfigure'),
      variant: 'caption',
    });
  }
  components.push({
    type: 'button',
    label: t('widgetRefresh'),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });
  return { version: 1, ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The `appliance` widget.
 * @param {object|null} view - Appliance view, null when the setting points
 * nowhere (no device chosen, device not an hOn appliance any more).
 * @param {object} account - `{ configured, connected }`.
 * @returns {object} The widget content.
 */
export function buildApplianceWidget(view, account) {
  if (!view) {
    return {
      version: 1,
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'status', items: [accountItem(account)] },
        { type: 'text', text: t('widgetChooseAppliance'), variant: 'caption' },
      ],
    };
  }
  const items = [
    {
      label: t('widgetState'),
      value: t(`state_${view.state}`),
      color: STATE_COLORS[view.state] ?? 'neutral',
    },
  ];
  if (view.active && view.phase && view.phase !== 'ready') {
    items.push({ label: t('widgetPhase'), value: t(`phase_${view.phase}`) });
  }
  if (view.programLabel) {
    items.push({ label: t('widgetProgram'), value: truncate(view.programLabel, 40) });
  }
  if (view.remote !== null && view.remote !== undefined) {
    items.push({
      label: t('widgetRemote'),
      value: view.remote ? t('widgetRemoteOn') : t('widgetRemoteOff'),
      color: view.remote ? 'success' : 'warning',
    });
  }
  if (view.error) {
    items.push({ label: t('widgetError'), value: truncate(view.error, 40), color: 'danger' });
  }

  const components = [
    { type: 'text', text: truncate(view.name, 40), variant: 'heading' },
    { type: 'status', items },
  ];

  if (view.cycle && view.active && Number.isFinite(view.progress)) {
    components.push({
      type: 'gauge',
      value: view.progress,
      min: 0,
      max: 100,
      unit: '%',
      label: t('widgetProgress'),
      color: STATE_COLORS[view.state] ?? 'primary',
    });
  }
  if (view.cycle && Number.isFinite(view.remaining)) {
    components.push({
      type: 'value',
      value: view.remaining,
      unit: 'min',
      label: t('widgetRemaining'),
      icon: 'clock',
      color: view.active ? 'primary' : 'neutral',
    });
  }
  for (const temperature of (view.temperatures ?? []).slice(0, 3)) {
    components.push({
      type: 'value',
      value: temperature.value,
      unit: '°C',
      label: truncateAll(t(temperature.label), 24),
      icon: 'thermometer',
    });
  }

  const buttons = [];
  const device = { device: view.deviceId };
  if (view.connected) {
    if (view.canPause && view.state === 'running') {
      buttons.push({ key: WIDGET_ACTIONS.PAUSE, label: 'widgetPause', icon: 'pause' });
    }
    if (view.canResume && view.state === 'paused') {
      buttons.push({ key: WIDGET_ACTIONS.RESUME, label: 'widgetResume', icon: 'play' });
    }
    if (view.canStop && view.cycle && view.active) {
      buttons.push({
        key: WIDGET_ACTIONS.STOP,
        label: 'widgetStop',
        icon: 'square',
        confirm: true,
        style: 'danger',
      });
    }
    if (view.canPower && view.state === 'off') {
      buttons.push({ key: WIDGET_ACTIONS.POWER_ON, label: 'widgetPowerOn', icon: 'power' });
    }
    if (view.canPower && view.state === 'on') {
      buttons.push({ key: WIDGET_ACTIONS.POWER_OFF, label: 'widgetPowerOff', icon: 'power' });
    }
  }
  if (!view.connected) {
    components.push({ type: 'text', text: t('widgetOffline'), variant: 'caption' });
  }
  for (const button of buttons.slice(0, 3)) {
    components.push({
      type: 'button',
      label: t(button.label),
      icon: button.icon,
      style: button.style ?? 'secondary',
      action: { key: button.key, params: device, ...(button.confirm ? { confirm: true } : {}) },
    });
  }
  components.push({
    type: 'button',
    label: t('widgetRefresh'),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH, params: device },
  });
  return { version: 1, ttl_seconds: TTL_SECONDS, components: components.slice(0, 8) };
}
