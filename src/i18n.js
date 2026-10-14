// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }`
// (configuration buttons, widgets, connection status); `text(key, language,
// vars)` returns one string (feature names, text states, scene action
// errors: Gladys does not send the language of the user with a scan, a
// command or a scene action, see `language` in config.js).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  // --- Feature names (`<appliance name> - <feature>`) ------------------------
  machine_state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  program_phase: { en: 'Phase', fr: 'Phase', de: 'Phase', es: 'Fase' },
  program: { en: 'Program', fr: 'Programme', de: 'Programm', es: 'Programa' },
  remaining_time: {
    en: 'Remaining time',
    fr: 'Temps restant',
    de: 'Restzeit',
    es: 'Tiempo restante',
  },
  pause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  door: { en: 'Door', fr: 'Porte', de: 'Tür', es: 'Puerta' },
  remote_control: {
    en: 'Remote control',
    fr: 'Contrôle à distance',
    de: 'Fernsteuerung',
    es: 'Control remoto',
  },
  salt_refill: {
    en: 'Salt to refill',
    fr: 'Sel à remettre',
    de: 'Salz nachfüllen',
    es: 'Reponer sal',
  },
  rinse_aid_refill: {
    en: 'Rinse aid to refill',
    fr: 'Liquide de rinçage à remettre',
    de: 'Klarspüler nachfüllen',
    es: 'Reponer abrillantador',
  },
  ac_power: { en: 'On/Off', fr: 'Marche/arrêt', de: 'Ein/Aus', es: 'Encendido/apagado' },
  ac_mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  ac_target_temperature: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  ac_fan_speed: {
    en: 'Fan speed',
    fr: 'Vitesse de ventilation',
    de: 'Lüfterstufe',
    es: 'Velocidad del ventilador',
  },
  ac_swing_vertical: {
    en: 'Vertical swing',
    fr: 'Oscillation verticale',
    de: 'Vertikale Schwenkung',
    es: 'Oscilación vertical',
  },
  ac_swing_horizontal: {
    en: 'Horizontal swing',
    fr: 'Oscillation horizontale',
    de: 'Horizontale Schwenkung',
    es: 'Oscilación horizontal',
  },
  indoor_temperature: {
    en: 'Indoor temperature',
    fr: 'Température intérieure',
    de: 'Innentemperatur',
    es: 'Temperatura interior',
  },
  outdoor_temperature: {
    en: 'Outdoor temperature',
    fr: 'Température extérieure',
    de: 'Außentemperatur',
    es: 'Temperatura exterior',
  },
  zone1_temperature: {
    en: 'Zone 1 temperature',
    fr: 'Température zone 1',
    de: 'Temperatur Zone 1',
    es: 'Temperatura zona 1',
  },
  zone1_temperature_REF: {
    en: 'Fridge temperature',
    fr: 'Température réfrigérateur',
    de: 'Temperatur Kühlteil',
    es: 'Temperatura frigorífico',
  },
  zone1_temperature_FRE: {
    en: 'Freezer temperature',
    fr: 'Température congélateur',
    de: 'Temperatur Gefrierteil',
    es: 'Temperatura congelador',
  },
  zone2_temperature: {
    en: 'Zone 2 temperature',
    fr: 'Température zone 2',
    de: 'Temperatur Zone 2',
    es: 'Temperatura zona 2',
  },
  zone2_temperature_REF: {
    en: 'Freezer temperature',
    fr: 'Température congélateur',
    de: 'Temperatur Gefrierteil',
    es: 'Temperatura congelador',
  },
  zone1_setpoint: {
    en: 'Zone 1 setpoint',
    fr: 'Consigne zone 1',
    de: 'Sollwert Zone 1',
    es: 'Consigna zona 1',
  },
  zone1_setpoint_REF: {
    en: 'Fridge setpoint',
    fr: 'Consigne réfrigérateur',
    de: 'Sollwert Kühlteil',
    es: 'Consigna frigorífico',
  },
  zone1_setpoint_FRE: {
    en: 'Freezer setpoint',
    fr: 'Consigne congélateur',
    de: 'Sollwert Gefrierteil',
    es: 'Consigna congelador',
  },
  zone2_setpoint: {
    en: 'Zone 2 setpoint',
    fr: 'Consigne zone 2',
    de: 'Sollwert Zone 2',
    es: 'Consigna zona 2',
  },
  zone2_setpoint_REF: {
    en: 'Freezer setpoint',
    fr: 'Consigne congélateur',
    de: 'Sollwert Gefrierteil',
    es: 'Consigna congelador',
  },
  super_cool: { en: 'Super cool', fr: 'Super froid', de: 'Superkühlen', es: 'Superfrío' },
  super_freeze: {
    en: 'Super freeze',
    fr: 'Super congélation',
    de: 'Supergefrieren',
    es: 'Supercongelación',
  },
  holiday_mode: {
    en: 'Holiday mode',
    fr: 'Mode vacances',
    de: 'Urlaubsmodus',
    es: 'Modo vacaciones',
  },
  auto_set: { en: 'Auto mode', fr: 'Mode auto', de: 'Automatikmodus', es: 'Modo automático' },
  zone1_door: { en: 'Zone 1 door', fr: 'Porte zone 1', de: 'Tür Zone 1', es: 'Puerta zona 1' },
  zone1_door_REF: {
    en: 'Fridge door',
    fr: 'Porte réfrigérateur',
    de: 'Tür Kühlteil',
    es: 'Puerta frigorífico',
  },
  zone1_door_FRE: {
    en: 'Freezer door',
    fr: 'Porte congélateur',
    de: 'Tür Gefrierteil',
    es: 'Puerta congelador',
  },
  zone2_door: { en: 'Zone 2 door', fr: 'Porte zone 2', de: 'Tür Zone 2', es: 'Puerta zona 2' },
  zone2_door_REF: {
    en: 'Freezer door',
    fr: 'Porte congélateur',
    de: 'Tür Gefrierteil',
    es: 'Puerta congelador',
  },
  room_temperature: {
    en: 'Room temperature',
    fr: 'Température ambiante',
    de: 'Raumtemperatur',
    es: 'Temperatura ambiente',
  },
  room_humidity: {
    en: 'Room humidity',
    fr: 'Humidité ambiante',
    de: 'Raumluftfeuchte',
    es: 'Humedad ambiente',
  },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  selected_temperature: {
    en: 'Selected temperature',
    fr: 'Température choisie',
    de: 'Gewählte Temperatur',
    es: 'Temperatura elegida',
  },
  energy: {
    en: 'Energy consumption',
    fr: 'Consommation d’énergie',
    de: 'Energieverbrauch',
    es: 'Consumo de energía',
  },
  water: {
    en: 'Water consumption',
    fr: 'Consommation d’eau',
    de: 'Wasserverbrauch',
    es: 'Consumo de agua',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },

  // --- Machine states (text feature, widget badges: 16 characters at most) --
  state_offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Desconectado' },
  state_ready: { en: 'Ready', fr: 'Prêt', de: 'Bereit', es: 'Listo' },
  state_selected: {
    en: 'Program selected',
    fr: 'Programme choisi',
    de: 'Programm gewählt',
    es: 'Programa elegido',
  },
  state_running: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En marcha' },
  state_paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  state_scheduled: {
    en: 'Delayed start',
    fr: 'Départ différé',
    de: 'Startzeitvorwahl',
    es: 'Inicio diferido',
  },
  state_error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  state_finished: { en: 'Finished', fr: 'Terminé', de: 'Beendet', es: 'Terminado' },
  state_test: { en: 'Test mode', fr: 'Mode test', de: 'Testmodus', es: 'Modo de prueba' },
  state_stopping: { en: 'Stopping', fr: 'Arrêt en cours', de: 'Wird gestoppt', es: 'Deteniéndose' },
  state_on: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
  state_off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  state_preheating: { en: 'Preheating', fr: 'Préchauffage', de: 'Vorheizen', es: 'Precalentando' },
  state_cooking: { en: 'Cooking', fr: 'Cuisson', de: 'Garen', es: 'Cocinando' },
  state_online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  state_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },

  // --- Program phases ----------------------------------------------------------
  phase_ready: { en: 'Ready', fr: 'Prêt', de: 'Bereit', es: 'Listo' },
  phase_washing: { en: 'Washing', fr: 'Lavage', de: 'Waschen', es: 'Lavado' },
  phase_spin: { en: 'Spin', fr: 'Essorage', de: 'Schleudern', es: 'Centrifugado' },
  phase_rinse: { en: 'Rinse', fr: 'Rinçage', de: 'Spülen', es: 'Aclarado' },
  phase_drying: { en: 'Drying', fr: 'Séchage', de: 'Trocknen', es: 'Secado' },
  phase_steam: { en: 'Steam', fr: 'Vapeur', de: 'Dampf', es: 'Vapor' },
  phase_weighing: { en: 'Weighing', fr: 'Pesée', de: 'Wiegen', es: 'Pesaje' },
  phase_scheduled: {
    en: 'Delayed start',
    fr: 'Départ différé',
    de: 'Startzeitvorwahl',
    es: 'Inicio diferido',
  },
  phase_tumbling: { en: 'Tumbling', fr: 'Brassage', de: 'Knitterschutz', es: 'Antiarrugas' },
  phase_refresh: { en: 'Refresh', fr: 'Rafraîchissement', de: 'Auffrischen', es: 'Refrescar' },
  phase_heating: { en: 'Heating', fr: 'Chauffe', de: 'Aufheizen', es: 'Calentamiento' },
  phase_cooldown: { en: 'Cooling down', fr: 'Refroidissement', de: 'Abkühlen', es: 'Enfriamiento' },
  phase_prewash: { en: 'Prewash', fr: 'Prélavage', de: 'Vorspülen', es: 'Prelavado' },
  phase_hot_rinse: {
    en: 'Hot rinse',
    fr: 'Rinçage chaud',
    de: 'Heißspülen',
    es: 'Aclarado caliente',
  },
  phase_unknown: { en: 'Unknown', fr: 'Inconnue', de: 'Unbekannt', es: 'Desconocida' },

  // --- Air conditioner options ---------------------------------------------------
  acAuto: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  acCooling: { en: 'Cooling', fr: 'Froid', de: 'Kühlen', es: 'Frío' },
  acHeating: { en: 'Heating', fr: 'Chaud', de: 'Heizen', es: 'Calor' },
  acDrying: { en: 'Dry', fr: 'Déshumidification', de: 'Entfeuchten', es: 'Deshumidificación' },
  acFan: { en: 'Fan only', fr: 'Ventilation', de: 'Nur Lüfter', es: 'Solo ventilador' },
  fanAuto: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  fanLow: { en: 'Low', fr: 'Faible', de: 'Niedrig', es: 'Baja' },
  fanMid: { en: 'Medium', fr: 'Moyenne', de: 'Mittel', es: 'Media' },
  fanHigh: { en: 'High', fr: 'Forte', de: 'Hoch', es: 'Alta' },
  swingOff: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  swingOn: { en: 'Swing', fr: 'Oscillation', de: 'Schwenken', es: 'Oscilación' },

  // --- Error feature -----------------------------------------------------------------
  noError: { en: 'No error', fr: 'Aucune erreur', de: 'Kein Fehler', es: 'Sin errores' },
  errorCodeValue: {
    en: 'Error {code}',
    fr: 'Erreur {code}',
    de: 'Fehler {code}',
    es: 'Error {code}',
  },

  // --- Appliance types ------------------------------------------------------------------
  type_washing_machine: {
    en: 'Washing machine',
    fr: 'Lave-linge',
    de: 'Waschmaschine',
    es: 'Lavadora',
  },
  type_washer_dryer: {
    en: 'Washer dryer',
    fr: 'Lave-linge séchant',
    de: 'Waschtrockner',
    es: 'Lavadora secadora',
  },
  type_tumble_dryer: {
    en: 'Tumble dryer',
    fr: 'Sèche-linge',
    de: 'Wäschetrockner',
    es: 'Secadora',
  },
  type_dishwasher: {
    en: 'Dishwasher',
    fr: 'Lave-vaisselle',
    de: 'Geschirrspüler',
    es: 'Lavavajillas',
  },
  type_oven: { en: 'Oven', fr: 'Four', de: 'Backofen', es: 'Horno' },
  type_air_conditioner: {
    en: 'Air conditioner',
    fr: 'Climatiseur',
    de: 'Klimaanlage',
    es: 'Aire acondicionado',
  },
  type_fridge: { en: 'Fridge', fr: 'Réfrigérateur', de: 'Kühlschrank', es: 'Frigorífico' },
  type_freezer: { en: 'Freezer', fr: 'Congélateur', de: 'Gefrierschrank', es: 'Congelador' },
  type_wine_cellar: { en: 'Wine cellar', fr: 'Cave à vin', de: 'Weinkühlschrank', es: 'Vinoteca' },
  type_water_heater: {
    en: 'Water heater',
    fr: 'Chauffe-eau',
    de: 'Warmwasserbereiter',
    es: 'Calentador de agua',
  },
  type_air_purifier: {
    en: 'Air purifier',
    fr: 'Purificateur d’air',
    de: 'Luftreiniger',
    es: 'Purificador de aire',
  },
  type_hood: { en: 'Cooker hood', fr: 'Hotte', de: 'Dunstabzugshaube', es: 'Campana extractora' },
  type_induction_hob: {
    en: 'Induction hob',
    fr: 'Plaque à induction',
    de: 'Induktionskochfeld',
    es: 'Placa de inducción',
  },
  type_microwave: { en: 'Microwave', fr: 'Micro-ondes', de: 'Mikrowelle', es: 'Microondas' },
  type_other: { en: 'Appliance', fr: 'Appareil', de: 'Gerät', es: 'Electrodoméstico' },

  // --- Connection status (Integrations page) -----------------------------------------
  statusConnected: {
    en: 'Connected to the hOn cloud: {count} appliance(s).',
    fr: 'Connecté au cloud hOn : {count} appareil(s).',
    de: 'Mit der hOn-Cloud verbunden: {count} Gerät(e).',
    es: 'Conectado a la nube hOn: {count} electrodoméstico(s).',
  },
  statusConnecting: {
    en: 'Connecting to the hOn cloud…',
    fr: 'Connexion au cloud hOn…',
    de: 'Verbindung mit der hOn-Cloud wird hergestellt…',
    es: 'Conectando con la nube hOn…',
  },
  statusNotConfigured: {
    en: 'Enter the e-mail address and the password of your hOn account in the configuration.',
    fr: 'Saisissez l’adresse e-mail et le mot de passe de votre compte hOn dans la configuration.',
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres hOn-Kontos in der Konfiguration ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta hOn en la configuración.',
  },
  statusRefused: {
    en: 'hOn refused the e-mail address or the password (or too many logins). Check them; next attempt at {retry}.',
    fr: 'hOn a refusé l’adresse e-mail ou le mot de passe (ou trop de connexions). Vérifiez-les ; prochain essai à {retry}.',
    de: 'hOn hat die E-Mail-Adresse oder das Passwort abgelehnt (oder zu viele Anmeldungen). Prüfen Sie sie; nächster Versuch um {retry}.',
    es: 'hOn rechazó el correo electrónico o la contraseña (o demasiados inicios de sesión). Compruébelos; próximo intento a las {retry}.',
  },
  statusCloudError: {
    en: 'The hOn cloud does not answer ({error}): new attempt at the next poll.',
    fr: 'Le cloud hOn ne répond pas ({error}) : nouvel essai à la prochaine interrogation.',
    de: 'Die hOn-Cloud antwortet nicht ({error}): neuer Versuch bei der nächsten Abfrage.',
    es: 'La nube hOn no responde ({error}): nuevo intento en la próxima consulta.',
  },

  // --- Configuration buttons ------------------------------------------------------------
  testOk: {
    en: 'Connected to the hOn cloud. {count} appliance(s): {list}',
    fr: 'Connecté au cloud hOn. {count} appareil(s) : {list}',
    de: 'Mit der hOn-Cloud verbunden. {count} Gerät(e): {list}',
    es: 'Conectado a la nube hOn. {count} electrodoméstico(s): {list}',
  },
  testNoAppliance: {
    en: 'Connected to the hOn cloud, but the account has no appliance: add them in the hOn app first.',
    fr: 'Connecté au cloud hOn, mais le compte n’a aucun appareil : ajoutez-les d’abord dans l’application hOn.',
    de: 'Mit der hOn-Cloud verbunden, aber das Konto hat kein Gerät: Fügen Sie sie zuerst in der hOn-App hinzu.',
    es: 'Conectado a la nube hOn, pero la cuenta no tiene electrodomésticos: añádalos primero en la app hOn.',
  },
  programsNone: {
    en: 'No appliance with remotely startable programs (washing machine, dryer, dishwasher).',
    fr: 'Aucun appareil avec des programmes démarrables à distance (lave-linge, sèche-linge, lave-vaisselle).',
    de: 'Kein Gerät mit fernstartbaren Programmen (Waschmaschine, Trockner, Geschirrspüler).',
    es: 'Ningún electrodoméstico con programas que se puedan iniciar a distancia (lavadora, secadora, lavavajillas).',
  },
  programsList: {
    en: 'Program names for the “Start a program” scene action: {list}',
    fr: 'Noms de programmes pour l’action de scène « Lancer un programme » : {list}',
    de: 'Programmnamen für die Szenenaktion „Programm starten“: {list}',
    es: 'Nombres de programa para la acción de escena «Iniciar un programa»: {list}',
  },

  // --- Command errors ------------------------------------------------------------------------
  errorOffline: {
    en: '{name} is not connected to the hOn cloud.',
    fr: '{name} n’est pas connecté au cloud hOn.',
    de: '{name} ist nicht mit der hOn-Cloud verbunden.',
    es: '{name} no está conectado a la nube hOn.',
  },
  errorRemoteControl: {
    en: 'Remote control is off on {name}: enable it on the appliance first.',
    fr: 'Le contrôle à distance est désactivé sur {name} : activez-le d’abord sur l’appareil.',
    de: 'Die Fernsteuerung ist an {name} deaktiviert: Aktivieren Sie sie zuerst am Gerät.',
    es: 'El control remoto está desactivado en {name}: actívelo primero en el electrodoméstico.',
  },
  errorReadOnly: {
    en: 'This feature cannot be controlled on this appliance.',
    fr: 'Cette fonctionnalité ne peut pas être pilotée sur cet appareil.',
    de: 'Diese Funktion lässt sich an diesem Gerät nicht steuern.',
    es: 'Esta función no se puede controlar en este electrodoméstico.',
  },
  errorUnknownProgram: {
    en: 'Unknown program “{program}”: use the “List the programs” button of the configuration.',
    fr: 'Programme « {program} » inconnu : utilisez le bouton « Lister les programmes » de la configuration.',
    de: 'Unbekanntes Programm „{program}“: Nutzen Sie die Schaltfläche „Programme auflisten“ der Konfiguration.',
    es: 'Programa «{program}» desconocido: use el botón «Listar los programas» de la configuración.',
  },
  errorUnsupportedValue: {
    en: 'Value not supported by this appliance ({value}).',
    fr: 'Valeur non prise en charge par cet appareil ({value}).',
    de: 'Wert wird von diesem Gerät nicht unterstützt ({value}).',
    es: 'Valor no admitido por este electrodoméstico ({value}).',
  },
  errorUnknownDevice: {
    en: 'This device is not an appliance of the hOn account (any more).',
    fr: 'Cet appareil n’est pas (ou plus) un appareil du compte hOn.',
    de: 'Dieses Gerät ist kein Gerät des hOn-Kontos (mehr).',
    es: 'Este dispositivo no es (o ya no es) un electrodoméstico de la cuenta hOn.',
  },
  errorNotConnected: {
    en: 'Not connected to the hOn cloud: check the configuration.',
    fr: 'Non connecté au cloud hOn : vérifiez la configuration.',
    de: 'Nicht mit der hOn-Cloud verbunden: Prüfen Sie die Konfiguration.',
    es: 'No conectado a la nube hOn: compruebe la configuración.',
  },
  errorCommandRefused: {
    en: 'The hOn cloud refused the command ({error}).',
    fr: 'Le cloud hOn a refusé la commande ({error}).',
    de: 'Die hOn-Cloud hat den Befehl abgelehnt ({error}).',
    es: 'La nube hOn rechazó la orden ({error}).',
  },
  errorNoProgram: {
    en: '{name} has no program this integration can start.',
    fr: '{name} n’a pas de programme que cette intégration peut lancer.',
    de: '{name} hat kein Programm, das diese Integration starten kann.',
    es: '{name} no tiene ningún programa que esta integración pueda iniciar.',
  },
  errorDelay: {
    en: 'This program does not accept a delayed start of {minutes} min.',
    fr: 'Ce programme n’accepte pas un départ différé de {minutes} min.',
    de: 'Dieses Programm akzeptiert keine Startzeitvorwahl von {minutes} Min.',
    es: 'Este programa no admite un inicio diferido de {minutes} min.',
  },
  errorNoCommand: {
    en: '{name} does not offer the “{command}” command.',
    fr: '{name} ne propose pas la commande « {command} ».',
    de: '{name} bietet den Befehl „{command}“ nicht an.',
    es: '{name} no ofrece la orden «{command}».',
  },
  commandSent: {
    en: 'Command sent to {name}.',
    fr: 'Commande envoyée à {name}.',
    de: 'Befehl an {name} gesendet.',
    es: 'Orden enviada a {name}.',
  },
  commandFailed: {
    en: 'Failed: {error}',
    fr: 'Échec : {error}',
    de: 'Fehlgeschlagen: {error}',
    es: 'Error: {error}',
  },

  // --- Widgets -----------------------------------------------------------------------------------
  minutesLeft: {
    en: '{minutes} min left',
    fr: '{minutes} min restantes',
    de: 'noch {minutes} Min.',
    es: 'quedan {minutes} min',
  },
  widgetAccount: { en: 'hOn account', fr: 'Compte hOn', de: 'hOn-Konto', es: 'Cuenta hOn' },
  widgetConnected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  widgetDisconnected: {
    en: 'Cloud unreachable',
    fr: 'Cloud injoignable',
    de: 'Cloud nicht erreichbar',
    es: 'Nube inaccesible',
  },
  widgetRefused: {
    en: 'Login refused',
    fr: 'Connexion refusée',
    de: 'Anmeldung abgelehnt',
    es: 'Inicio de sesión rechazado',
  },
  widgetNotConfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht konfiguriert',
    es: 'Sin configurar',
  },
  widgetRunning: { en: 'In progress', fr: 'En cours', de: 'Aktiv', es: 'En curso' },
  widgetAppliances: { en: 'Appliances', fr: 'Appareils', de: 'Geräte', es: 'Electrodomésticos' },
  widgetNothingRunning: {
    en: 'No appliance is running.',
    fr: 'Aucun appareil en fonctionnement.',
    de: 'Kein Gerät in Betrieb.',
    es: 'Ningún electrodoméstico en marcha.',
  },
  widgetNoAppliance: {
    en: 'No appliance in the hOn account yet.',
    fr: 'Aucun appareil dans le compte hOn pour l’instant.',
    de: 'Noch kein Gerät im hOn-Konto.',
    es: 'Todavía no hay electrodomésticos en la cuenta hOn.',
  },
  widgetConfigure: {
    en: 'Configure the hOn account in the integration settings.',
    fr: 'Configurez le compte hOn dans les réglages de l’intégration.',
    de: 'Konfigurieren Sie das hOn-Konto in den Einstellungen der Integration.',
    es: 'Configure la cuenta hOn en los ajustes de la integración.',
  },
  widgetRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  widgetRefreshed: {
    en: 'Statuses refreshed.',
    fr: 'États actualisés.',
    de: 'Zustände aktualisiert.',
    es: 'Estados actualizados.',
  },
  widgetRefreshTooSoon: {
    en: 'Already refreshed a few seconds ago.',
    fr: 'Déjà actualisé il y a quelques secondes.',
    de: 'Bereits vor wenigen Sekunden aktualisiert.',
    es: 'Ya se actualizó hace unos segundos.',
  },
  widgetChooseAppliance: {
    en: 'Choose an hOn appliance created in Gladys in the settings of this widget.',
    fr: 'Choisissez un appareil hOn créé dans Gladys dans les réglages de ce widget.',
    de: 'Wählen Sie in den Widget-Einstellungen ein in Gladys angelegtes hOn-Gerät.',
    es: 'Elija un electrodoméstico hOn creado en Gladys en los ajustes de este widget.',
  },
  widgetState: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  widgetPhase: { en: 'Phase', fr: 'Phase', de: 'Phase', es: 'Fase' },
  widgetProgram: { en: 'Program', fr: 'Programme', de: 'Programm', es: 'Programa' },
  widgetRemote: {
    en: 'Remote control',
    fr: 'Contrôle à distance',
    de: 'Fernsteuerung',
    es: 'Control remoto',
  },
  widgetRemoteOn: { en: 'Enabled', fr: 'Activé', de: 'Aktiviert', es: 'Activado' },
  widgetRemoteOff: { en: 'Disabled', fr: 'Désactivé', de: 'Deaktiviert', es: 'Desactivado' },
  widgetError: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  widgetProgress: { en: 'Progress', fr: 'Avancement', de: 'Fortschritt', es: 'Progreso' },
  widgetRemaining: { en: 'Time left', fr: 'Temps restant', de: 'Restzeit', es: 'Tiempo restante' },
  widgetPause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  widgetResume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  widgetStop: { en: 'Stop', fr: 'Arrêter', de: 'Stoppen', es: 'Detener' },
  widgetPowerOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  widgetPowerOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  widgetOffline: {
    en: 'The appliance is not connected to the hOn cloud: last known values.',
    fr: 'L’appareil n’est pas connecté au cloud hOn : dernières valeurs connues.',
    de: 'Das Gerät ist nicht mit der hOn-Cloud verbunden: zuletzt bekannte Werte.',
    es: 'El electrodoméstico no está conectado a la nube hOn: últimos valores conocidos.',
  },
};

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, text(key, language, vars)]));
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {string} The text.
 */
export function text(key, language, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description The name of a feature in one language.
 * @param {string} key - Feature key.
 * @param {string} language - Language code.
 * @param {string} [type] - Appliance type: `zone1_temperature_REF` before `zone1_temperature`.
 * @returns {string} The name.
 */
export function featureName(key, language, type) {
  if (type && MESSAGES[`${key}_${type}`]) {
    return text(`${key}_${type}`, language);
  }
  return MESSAGES[key] ? text(key, language) : key;
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;
