# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for hOn appliances (Haier, Candy,
Hoover): a Node.js service (Node 22+, ESM, no build step, no dependency but
the SDK) in its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the **hOn cloud** (`api-iot.he.services`) with the account of the hOn
app. Cloud only (`transports: ["cloud"]`).

A **device integration** (`type: "device"`, Gladys 5.3.0+). The hOn API is
not public: `src/hon/` ports the login, requests and command logic of
[pyhOn](https://github.com/Andre0512/pyhOn) and its maintained fork
[pyhon-revived](https://github.com/mmalolepszy/pyhon-revived) (MIT, credited
in NOTICE and `licenses/`). When hOn changes something, compare with
pyhon-revived first.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
node --test --test-name-pattern "scene"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check
docs/illustrations/render.sh              # widget illustrations (Chrome, ImageMagick, Pillow)
scripts/build-cover.sh                    # cover.jpg from cover.svg (Inkscape, ImageMagick)
```

## Architecture

```
index.js                     SDK wiring only: createApp(gladys) + connect + start
src/app.js                   every handler: poll, discovery, commands, scenes, widgets, buttons
src/config.js                config_schema -> { email, password, language, pollMs }
src/devices.js               FEATURES catalog: appliance entry -> Gladys features, values, command plans
src/states.js                state publication: created devices only, coalesced, 240/min, 429 pause
src/scenes.js                trigger / action keys, transitions -> events, event limiter
src/widgets.js               the `appliances` and `appliance` widgets (pure, reused by docs/illustrations)
src/i18n.js                  runtime texts in en / fr / de / es
src/storage.js               JSON files in /data (session.json, device.json)
src/hon/constants.js         API constants of the hOn app, type and code tables
src/hon/auth.js              CIAM login (PKCE), token renewal by replay, refusal pause
src/hon/client.js            REST: appliance list, context, retrieve, send
src/hon/commands.js          retrieve payload -> programs, settings, stop/pause/resume; send bodies
src/hon/status.js            context payload -> connected, params; machine state, phase, time left
.github/scripts/release.mjs  version, changelog, version files, PR title checks
```

## Rules

- **External ids are forever**: `ext:<selector>:appliance:<MAC without
dashes>` and `…:<feature key>` (`FEATURES[].key`). Config, action, field,
  widget, trigger, variable and output keys too, and the `appliance_type`
  words (`TYPES` in src/hon/constants.js) used by scene filters.
- **Feature fields** compared by the Discover tab "Update" (category, type,
  unit, min, max, step, features added or removed): changing them forces users
  to delete and recreate their devices. `test/fixtures/discovery.baseline.json`
  pins them; update it only on purpose, with a migration note. `min`, `max`,
  `read_only` and `has_feedback` on EVERY feature (test/devices.test.js).
- **A feature seen once stays** (`entry.featureKeys`): a parameter missing
  from one answer must not remove it.
- **Never log in more than needed**: the hOn cloud answers "Invalid username
  or password" to an account that logs in too often. The session lives in
  `/data/session.json` (never the password), tokens are renewed by replaying
  the session, and a refused login pauses (15 min doubling to 4 h). The login
  URL carries the credentials: never log it.
- **Commands** of washers, dryers, dishwashers and ovens need remote control
  enabled on the appliance (`remoteCtrValid`); `settings` sends every
  parameter, the current values for the ones not changed. Ovens are never
  started remotely.
- **States**: only for the devices the user created, through
  `src/states.js` (300 states a minute at most on the Gladys side). Republish
  everything known in `onDeviceCreated`.
- **Scene events** on transitions only (never the first status seen), flat
  scalar data, at most 250 a minute; never for a command sent by a scene
  action (`entry.mute`).
- **The container rootfs is read-only**: the only writable folder is /data.
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images. The list display of a `card-list` shows the title,
  the subtitle and the badge only: what matters goes in the subtitle.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`. `test/i18n.test.js` checks it. Use the words of
  the Gladys UI (Discover / Découverte / Entdecken / Descubrir…).
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, `package-lock.json` or the manifest, nor the `docker_image`
  tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (fake hOn cloud in
  test/helpers.js, fixtures from hon-test-data, MIT).

## Pitfalls

- Since June 2026 the hOn app logs in through `/ciam/authorize` +
  `/ciam/token` and lists appliances through
  `/unified-api/v1/view/appliance-list`; `/commands/v1/appliance` returns an
  empty list.
- `doorStatus` 1 = open; Gladys opening sensors: 1 = closed.
- Air conditioners: the `settings` command has `onOffStatus` fixed at 1 (it
  turns the unit on); turn it off with `stopProgram`. Always resend the mode
  with any change, or the unit falls back to Auto.
- `remainingTimeMM` keeps the last program length when idle: it is 0 in
  Gladys outside a cycle.
- Several programs share a `prCode` (an `iot_` twin of a dial program): the
  dial one is the current program.
- Gladys does not send the user's language with a scan or a command: text
  states and feature names use the `language` setting.
