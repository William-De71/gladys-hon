# hOn

## Presentación

Esta integración trae a Gladys los electrodomésticos Haier, Candy y Hoover de su app **hOn**: lavadoras, lavadoras secadoras, secadoras, lavavajillas, aires acondicionados, frigoríficos, congeladores, vinotecas y hornos. Sigue su estado, su fase y su tiempo restante en el panel, inicia un programa o pausa un ciclo desde Gladys, y sus escenas reaccionan cuando termina un ciclo, aparece un error o se acaba la sal.

Se comunica con la **nube hOn** con la cuenta de la app, mediante la misma interfaz no oficial que la app (Haier no publica ninguna API): sus electrodomésticos y sus estados pasan por los servidores de Haier, a través de Internet. Haier puede cambiar esta interfaz sin previo aviso.

## Requisitos

- Gladys Assistant 5.1.1 o posterior.
- Una cuenta hOn (correo electrónico y contraseña) donde sus electrodomésticos ya están añadidos y conectados, en la app hOn. Inicie sesión una vez en la app si acaba de crear la cuenta o de cambiar la contraseña (condiciones que aceptar).
- Las cuentas con verificación en dos pasos por correo no son compatibles.

## Configuración

### Cuenta

Introduzca el **correo electrónico** y la **contraseña** de su cuenta hOn y guarde. Gladys guarda la contraseña y solo la envía a la nube hOn; la integración conserva la sesión (nunca la contraseña) para que un reinicio no vuelva a iniciar sesión: la nube hOn bloquea las cuentas que inician sesión con demasiada frecuencia.

Pulse **Probar la conexión**: el mensaje lista sus electrodomésticos y su estado. Si hOn rechaza la cuenta, la integración espera 15 minutos (y luego más) antes de reintentar; corrija el correo o la contraseña para reintentar en el acto.

### Intervalo de actualización e idioma

- **Intervalo de actualización**: el estado de los electrodomésticos se lee cada 30 segundos, cada minuto (por defecto), cada 2 o 5 minutos.
- **Idioma de los textos de los dispositivos**: los nombres de las funciones y los estados de texto (estado de la máquina, fase) se escriben en este idioma, porque Gladys no envía el suyo con ellos.

### Control remoto

Como en la app hOn, una lavadora, secadora o lavavajillas solo acepta un inicio, una pausa o una parada si el **control remoto** está activado en su panel: cárguela, cierre la puerta y pulse su tecla de control remoto o Wi-Fi. La función **Control remoto** del dispositivo indica si está activado. Los hornos son de solo lectura: no se inician a distancia desde Gladys.

## Uso

### Dispositivos

Abra la pestaña **Descubrir** de la integración: cada electrodoméstico de la cuenta aparece con las funciones que comunica. Añada los que quiera.

- Lavadoras, lavadoras secadoras, secadoras, lavavajillas: **Estado** (en marcha, en pausa, terminado, inicio diferido…), **Fase** (lavado, aclarado, centrifugado, secado…), **Programa** (elija uno para iniciarlo), **Tiempo restante**, **Pausa**, **Puerta**, **Control remoto**, **Consumo de energía** y **Consumo de agua** (modelos que los comunican), **Error**, y en los lavavajillas **Reponer sal** y **Reponer abrillantador**.
- Aires acondicionados: **Encendido/apagado**, **Modo**, **Consigna**, **Velocidad del ventilador**, **Oscilación**, temperaturas interior y exterior.
- Frigoríficos, congeladores, vinotecas: temperatura y consigna de cada zona, puertas, superfrío, supercongelación, modos vacaciones y automático y una lista **Modo** (iniciados como en la app hOn), temperatura y humedad ambiente.
- Hornos y demás tipos: estado, temperaturas, tiempo restante, error.

Cada electrodoméstico lleva una insignia **nube**, o **inaccesible** cuando no está conectado a la nube hOn. Los nombres de programa son los de la nube hOn, en inglés.

### Widgets

![Los widgets «Electrodomésticos hOn» y «Electrodoméstico hOn»: estado, fase y tiempo restante de cada electrodoméstico, progreso de la lavadora con sus botones de pausa y parada (ilustración generada, no es una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-hon/main/docs/assets/widgets.es.png)

- **Electrodomésticos hOn**: cada electrodoméstico con su estado, su fase y su tiempo restante (o sus temperaturas), y un botón Actualizar. Ajuste: todos o solo los que están en marcha.
- **Electrodoméstico hOn**: un electrodoméstico (ajuste): estado, fase, programa, control remoto, progreso del ciclo, tiempo restante, temperaturas (las consignas de un frigorífico que no las informa) y los botones Pausa, Reanudar, Detener (con confirmación) o Encender / Apagar.

### Disparadores de escena

- **Empieza un ciclo hOn** y **Termina un ciclo hOn** (filtros: electrodoméstico, tipo): variables nombre, tipo, programa, minutos restantes o duración.
- **Un electrodoméstico hOn indica un error**: variable código de error.
- **Un electrodoméstico hOn necesita recarga**: sal, abrillantador, detergente o suavizante.
- **Un electrodoméstico hOn se desconecta** / **vuelve a conectarse**.
- **Se rechaza la cuenta hOn**: Gladys deja de recibir los estados.

Un ciclo iniciado o detenido por una acción de escena no activa estos disparadores (sin bucle).

### Acciones de escena

- **Iniciar un programa hOn**: electrodoméstico, nombre del programa (del botón **Listar los programas** de la configuración, p. ej. `cottons`), inicio diferido opcional en minutos. Salidas: programa, duración estimada.
- **Pausar, reanudar o detener un ciclo hOn**.
- **Leer el estado de un electrodoméstico hOn**: salidas estado de la máquina, fase, programa, minutos restantes, conectado, código de error, para una condición o un mensaje.

### Ejemplos de escenas

- Cuando **termina el ciclo de la lavadora** → enviar «La ropa está lista ({{triggerEvent.data.duration_minutes}} min)» a la familia.
- Cuando **el lavavajillas necesita sal** → añadir «sal» a la notificación de la lista de la compra.
- Cada día laborable a las 13 h, si la electricidad es barata → **Iniciar un programa hOn** `eco_40_60` en la lavadora cargada por la mañana (control remoto activado).

## Solución de problemas

- **«hOn rechazó el correo electrónico o la contraseña»**: compruébelos en la app hOn. El mismo mensaje aparece cuando la cuenta ha iniciado sesión demasiadas veces: espere, la integración reintenta sola. Las cuentas con verificación en dos pasos por correo no pueden iniciar sesión.
- **Ningún electrodoméstico**: añádalos primero en la app hOn y pulse **Probar la conexión**.
- **«El control remoto está desactivado»**: actívelo en el panel del electrodoméstico; en la mayoría de los modelos se desactiva al final del ciclo.
- **Una orden se acepta pero no pasa nada**: el electrodoméstico la aplica en unos segundos; se vuelve a leer 5 y 20 segundos después. Compruebe la puerta y el control remoto.
- **Falta una función**: las funciones siguen lo que el modelo comunica a la nube hOn; abra una issue con el tipo y el modelo.
- Registros: la pestaña Registros de la integración. Para un informe, pulse **Diagnóstico** en la configuración y copie las líneas que empiezan por `hOn diagnostic` (el correo, la dirección MAC, el número de serie y el apodo se omiten). Issues: https://github.com/William-De71/gladys-hon/issues
