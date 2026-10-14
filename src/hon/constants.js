// -----------------------------------------------------------------------------
// hOn cloud constants and code tables.
//
// hOn (Haier, Candy, Hoover) has no public API: these values are those of the
// hOn mobile app, as the community library pyhOn found them (MIT, Andre
// Basche) and its maintained fork pyhon-revived ported them to the CIAM login
// Haier introduced in June 2026 (mmalolepszy and contributors). They change
// with the app: when the cloud refuses everything, compare them with
// pyhon-revived (`pyhon/const.py`) first.
// -----------------------------------------------------------------------------

export const API_URL = 'https://api-iot.he.services';

// The key the hOn app sends with its login requests (public, embedded in the
// app and in every hOn library): it identifies the app, not the user.
export const API_KEY = 'GRCqFhC6Gk@ikWXm1RmnSmX1cm,MxY-configuration';

export const APP_VERSION = '2.27.9';
export const OS = 'android';
export const OS_VERSION = 34;
export const DEVICE_MODEL = 'gladys';
export const USER_AGENT = 'Chrome/999.999.999.999';

// The appliance types of the hOn cloud (`applianceTypeName`).
export const TYPES = {
  WM: 'washing_machine',
  WD: 'washer_dryer',
  TD: 'tumble_dryer',
  DW: 'dishwasher',
  OV: 'oven',
  AC: 'air_conditioner',
  REF: 'fridge',
  FRE: 'freezer',
  WC: 'wine_cellar',
  WH: 'water_heater',
  AP: 'air_purifier',
  HO: 'hood',
  IH: 'induction_hob',
  MW: 'microwave',
};

/** Types that run cycles (programs with a start, a remaining time and an end). */
export const CYCLE_TYPES = new Set(['WM', 'WD', 'TD', 'DW']);

/** Types whose programs may be started remotely by this integration. */
export const STARTABLE_TYPES = new Set(['WM', 'WD', 'TD', 'DW']);

// `machMode` of the washers, dryers and dishwashers.
export const MACHINE_MODES = {
  0: 'ready',
  1: 'selected',
  2: 'running',
  3: 'paused',
  4: 'scheduled',
  5: 'scheduled',
  6: 'error',
  7: 'finished',
  8: 'test',
  9: 'stopping',
};

/** Machine states in which a cycle is in progress. */
export const ACTIVE_STATES = new Set(['running', 'paused', 'scheduled', 'stopping']);

// `prPhase` per appliance type (washer dryers use the washer table).
const WASHER_PHASES = {
  0: 'ready',
  1: 'washing',
  2: 'washing',
  3: 'spin',
  4: 'rinse',
  5: 'rinse',
  6: 'rinse',
  7: 'drying',
  8: 'drying',
  9: 'steam',
  10: 'ready',
  11: 'spin',
  12: 'weighing',
  13: 'weighing',
  14: 'washing',
  15: 'washing',
  16: 'washing',
  17: 'rinse',
  18: 'rinse',
  19: 'scheduled',
  20: 'tumbling',
  24: 'refresh',
  25: 'washing',
  26: 'heating',
  27: 'washing',
};

export const PHASES = {
  WM: WASHER_PHASES,
  WD: WASHER_PHASES,
  TD: {
    0: 'ready',
    1: 'heating',
    2: 'drying',
    3: 'cooldown',
    11: 'ready',
    13: 'cooldown',
    14: 'heating',
    15: 'heating',
    16: 'cooldown',
    18: 'tumbling',
    19: 'drying',
    20: 'drying',
  },
  DW: {
    0: 'ready',
    1: 'prewash',
    2: 'washing',
    3: 'rinse',
    4: 'drying',
    5: 'ready',
    6: 'hot_rinse',
  },
};

// Programs whose name says they need a guided recipe or a step in the app:
// never offered for a remote start (pyhOn filters them the same way).
export const HIDDEN_PROGRAMS = ['iot_recipe', 'iot_guided'];

// Things to refill, with the parameter that flags them (`1` = to refill).
export const REFILLS = {
  salt: 'saltStatus',
  rinse_aid: 'rinseAidStatus',
  detergent: 'detWarn',
  softener: 'softWarn',
};
