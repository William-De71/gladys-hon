# hOn

## Présentation

Cette intégration amène dans Gladys les appareils Haier, Candy et Hoover de votre application **hOn** : lave-linge, lave-linge séchants, sèche-linge, lave-vaisselle, climatiseurs, réfrigérateurs, congélateurs, caves à vin et fours. Vous suivez leur état, leur phase et leur temps restant sur le tableau de bord, vous lancez un programme ou mettez un cycle en pause depuis Gladys, et vos scènes réagissent quand un cycle se termine, qu’une erreur apparaît ou qu’il manque du sel.

Elle dialogue avec le **cloud hOn** avec le compte de l’application, par la même interface non officielle que l’application (Haier ne publie pas d’API) : vos appareils et leurs états passent par les serveurs de Haier, via Internet. Haier peut modifier cette interface sans prévenir.

## Prérequis

- Gladys Assistant 5.1.1 ou plus récent.
- Un compte hOn (adresse e-mail et mot de passe) où vos appareils sont déjà ajoutés et connectés, dans l’application hOn. Connectez-vous une fois à l’application si vous venez de créer le compte ou de changer le mot de passe (conditions à accepter).
- Les comptes avec vérification en deux étapes par e-mail ne sont pas pris en charge.

## Configuration

### Compte

Saisissez l’**adresse e-mail** et le **mot de passe** de votre compte hOn, puis enregistrez. Le mot de passe est conservé par Gladys et envoyé uniquement au cloud hOn ; la session (jamais le mot de passe) est gardée par l’intégration pour qu’un redémarrage ne se reconnecte pas : le cloud hOn bloque les comptes qui se connectent trop souvent.

Appuyez sur **Tester la connexion** : le message liste vos appareils et leur état. Si hOn refuse le compte, l’intégration attend 15 minutes (puis plus) avant de réessayer ; corrigez l’adresse e-mail ou le mot de passe pour réessayer tout de suite.

### Intervalle d’actualisation et langue

- **Intervalle d’actualisation** : l’état des appareils est lu toutes les 30 secondes, 1 minute (par défaut), 2 ou 5 minutes.
- **Langue des textes des appareils** : les noms des fonctionnalités et les états texte (état de la machine, phase) sont écrits dans cette langue, car Gladys n’envoie pas la vôtre avec eux.

### Contrôle à distance

Comme dans l’application hOn, un lave-linge, un sèche-linge ou un lave-vaisselle n’accepte un démarrage, une pause ou un arrêt que si le **contrôle à distance** est activé sur son panneau : chargez-le, fermez la porte, puis appuyez sur sa touche contrôle à distance ou Wi-Fi. La fonctionnalité **Contrôle à distance** de l’appareil indique s’il est activé. Les fours sont en lecture seule : pas de démarrage à distance depuis Gladys.

## Utilisation

### Appareils

Ouvrez l’onglet **Découverte** de l’intégration : chaque appareil du compte y figure, avec les fonctionnalités qu’il remonte. Ajoutez ceux que vous voulez.

- Lave-linge, lave-linge séchants, sèche-linge, lave-vaisselle : **État** (en cours, en pause, terminé, départ différé…), **Phase** (lavage, rinçage, essorage, séchage…), **Programme** (choisissez-en un pour le lancer), **Temps restant**, **Pause**, **Porte**, **Contrôle à distance**, **Consommation d’énergie** et **Consommation d’eau** (modèles qui les remontent), **Erreur**, et pour les lave-vaisselle **Sel à remettre** et **Liquide de rinçage à remettre**.
- Climatiseurs : **Marche/arrêt**, **Mode**, **Consigne**, **Vitesse de ventilation**, **Oscillation**, températures intérieure et extérieure.
- Réfrigérateurs, congélateurs, caves à vin : température et consigne de chaque zone, portes, super froid, super congélation, modes vacances et auto (pilotables quand le modèle le permet), température et humidité ambiantes.
- Fours et autres types : état, températures, temps restant, erreur.

Chaque appareil porte un badge **cloud**, ou **injoignable** quand il n’est pas connecté au cloud hOn. Les noms de programmes sont ceux du cloud hOn, en anglais.

### Widgets

![Les widgets « Appareils hOn » et « Appareil hOn » : état, phase et temps restant de chaque appareil, avancement du lave-linge avec ses boutons pause et arrêt (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-hon/main/docs/assets/widgets.fr.png)

- **Appareils hOn** : chaque appareil avec son état, sa phase et son temps restant (ou ses températures), et un bouton Actualiser. Réglage : tous les appareils ou seulement ceux en fonctionnement.
- **Appareil hOn** : un appareil (réglage) : état, phase, programme, contrôle à distance, avancement du cycle, temps restant, températures, et les boutons Pause, Reprendre, Arrêter (avec confirmation) ou Allumer / Éteindre.

### Déclencheurs de scène

- **Un cycle hOn démarre** et **Un cycle hOn est terminé** (filtres : appareil, type) : variables nom de l’appareil, type, programme, minutes restantes ou durée.
- **Un appareil hOn signale une erreur** : variable code d’erreur.
- **Un appareil hOn doit être rempli** : sel, liquide de rinçage, lessive ou adoucissant.
- **Un appareil hOn se déconnecte** / **se reconnecte**.
- **Le compte hOn est refusé** : Gladys ne reçoit plus les états.

Un cycle lancé ou arrêté par une action de scène ne déclenche pas ces déclencheurs (pas de boucle).

### Actions de scène

- **Lancer un programme hOn** : appareil, nom du programme (donné par le bouton **Lister les programmes** de la configuration, par ex. `cottons`), départ différé facultatif en minutes. Sorties : programme, durée estimée.
- **Mettre en pause, reprendre ou arrêter un cycle hOn**.
- **Lire l’état d’un appareil hOn** : sorties état de la machine, phase, programme, minutes restantes, connecté, code d’erreur, pour une condition ou un message.

### Exemples de scènes

- Quand **le cycle du lave-linge est terminé** → envoyer « Le linge est prêt ({{triggerEvent.data.duration_minutes}} min) » à la famille.
- Quand **le lave-vaisselle doit être rempli** de sel → ajouter « sel » à la notification de liste de courses.
- Chaque jour de semaine à 13 h, si l’électricité est en heures creuses → **Lancer un programme hOn** `eco_40_60` sur le lave-linge chargé le matin (contrôle à distance activé).

## Dépannage

- **« hOn a refusé l’adresse e-mail ou le mot de passe »** : vérifiez-les dans l’application hOn. Le même message apparaît quand le compte s’est connecté trop souvent : patientez, l’intégration réessaie seule. Les comptes avec vérification en deux étapes par e-mail ne peuvent pas se connecter.
- **Aucun appareil** : ajoutez-les d’abord dans l’application hOn, puis appuyez sur **Tester la connexion**.
- **« Le contrôle à distance est désactivé »** : activez-le sur le panneau de l’appareil ; sur la plupart des modèles il se désactive à la fin du cycle.
- **Une commande est acceptée mais rien ne se passe** : l’appareil l’applique en quelques secondes ; il est relu 5 et 20 secondes plus tard. Vérifiez la porte et le contrôle à distance.
- **Une fonctionnalité manque** : les fonctionnalités suivent ce que le modèle remonte au cloud hOn ; ouvrez une issue avec le type et le modèle.
- Journaux : l’onglet Journaux de l’intégration, avec `DEBUG=gladys-integration-sdk` pour le détail. Issues : https://github.com/William-De71/gladys-hon/issues
