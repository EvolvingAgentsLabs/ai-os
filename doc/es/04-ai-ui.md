# 04 · ai-ui — el canvas inteligente

<img src="../assets/04-ai-ui.jpg" alt="" width="100%">

<sub>Un stream reordenado como mapa.</sub>


> **El inglés es canónico.** Traducción de [`doc/04-ai-ui.md`](../04-ai-ui.md).
>
> **Estado: especificado, no implementado.**

## El problema

La web UI de QM es una buena aplicación de chat: dos sesiones concurrentes, una
barra lateral con archivos, crons, keychain, deploys, memoria y skills. Vite +
Lit, con `dockview-core` haciendo el layout de paneles
(`ai-base/plugins/web-ui/`).

Una transcripción es la forma correcta para una conversación y la equivocada para
el trabajo. Tres fallas concretas:

1. **El presente se va hacia arriba.** El estado actual del trabajo se deduce
   leyendo historia hacia atrás. En trabajo que dura semanas, la respuesta a
   "dónde está esto" no está en el último mensaje.
2. **Los artefactos se mencionan, no se sostienen.** Un archivo, una app, un
   borrador, una decisión — cada uno aparece como un mensaje *sobre* él, y después
   se aleja al mismo ritmo que una charla trivial.
3. **Los paneles son un menú fijo.** Archivos, crons, keychain, skills — los
   mismos paneles sin importar qué estés haciendo. La interfaz no tiene opinión
   sobre el trabajo.

## La afirmación

> La interfaz debería ser una **proyección del estado del trabajo**, espacial y
> viva, generada por el sistema — no un log de lo que se dijo.

## Qué significa "canvas inteligente"

Con precisión, para que no degenere en "un canvas con IA adentro":

**Espacial.** Los objetos tienen posición y persisten. Un flow, sus pasos, sus
artefactos, sus agentes y sus preguntas abiertas son cosas que acomodás y a las
que volvés, no mensajes que dejás atrás. La posición significa algo y se guarda.

**Vivo.** Los objetos reflejan el estado actual sin que haya que volver a
preguntar. Un paso corriendo se ve corriendo. Un artefacto que cambió un agente
se actualiza en el lugar.

**Generado.** Esta es la palabra que carga el peso. El canvas lo *compone el
sistema a partir del estado del flow* — la forma de un `Fan-out` sobre 40 hilos no
es la de una `Deliberation` sobre tres arquitecturas, y el usuario no debería
estar armando ninguna de las dos a mano. El sistema propone la disposición; el
usuario la sobreescribe; **la sobreescritura se recuerda** y le gana a la
propuesta de ahí en adelante.

**Dirigible.** La manipulación directa es una entrada de primera clase, a la par
del texto. Mover un paso, partir un artefacto, marcar una rama como muerta — todo
eso son instrucciones, no sólo cambios de vista.

El modo de falla contra el que hay que diseñar: un layout generado que se
reacomoda bajo las manos del usuario. **Regla: el sistema propone cuando cambia el
estado; nunca reacomoda lo que el usuario tocó.**

## La metáfora: un escritorio, no un dashboard — decidido 2026-08-09

Las cuatro palabras de arriba dicen qué *hace* el canvas. No dicen nada de cómo
tiene que verse, y lo primero que se construyó a partir de ellas — un documento
plano y oscuro — se ganó exactamente una queja: **era poco claro.** Todo pesaba
lo mismo, así que nada te decía qué clase de cosa estabas mirando.

La respuesta es una metáfora lo bastante vieja como para haber sido probada con
gente que nunca había usado una computadora: **el escritorio de System 7 y
Windows 3.1.**

- **Una ventana es un borde.** Una barra de título y un marco te dicen dónde
  termina una cosa y empieza la siguiente, antes de leer ninguna de las dos.
- **Un biselado es una superficie.** Levantado es una cosa; hundido es un
  recipiente que contiene cosas. Es una pista de profundidad que no necesita
  leyenda.
- **Un bloque de color es un tipo.** Un color por rol de scope, por agente y por
  estado de paso, que no se usa para nada más — el progreso de un flow pasa a ser
  una tira de cubitos que se cuenta desde el otro lado de la sala, y *dónde* se
  frenó se ve sin leer.
- **Un documento es un documento.** Un flow es una hoja con la esquina doblada,
  porque eso es lo que es: una cosa con título que alguien tiene que retomar.
- **Las bandejas sostienen trabajo.** Bandeja de entrada para lo que se sigue
  moviendo, de salida para lo que ya se asentó. No es decoración — "dónde está
  esto y hay alguien sosteniéndolo" es la pregunta para la que existe el canvas,
  así que debería ser la primera que contesta el layout.

Esto ya está **[ran]**: el explorador sólo-lectura de `ai-flows/src/view.ts` se
reconstruyó así, y sus capturas están en [el manual](manual.md). El canvas hereda
el vocabulario en lugar de inventar un segundo.

Lo que el canvas agrega encima es exactamente las cuatro propiedades de arriba:
posición que persiste, estado que se actualiza en su lugar, disposición compuesta
a partir de la forma del flow, y manipulación directa como entrada. El explorador
no tiene ninguna **a propósito**, que es lo que lo vuelve el brazo de control: ver
§ Cómo se falsifica esto.

Una cosa sobre la que la época *no* vota. Geneva de nueve puntos en una pantalla
de 640×480 era una restricción, no un objetivo, y reproducirla sería resignar
justo la claridad por la que se adoptó la metáfora. **Cromo de época, tipografía
de hoy.**

## Por qué una proyección y no un transcripto — la razón de muestreo

La afirmación de arriba se lee como gusto personal. No lo es, y vale la pena
decir por qué, porque convierte una estética en una restricción.

Una persona mira un flow a cierta tasa — realistamente una o dos veces por día.
El flow produce intentos a su propia tasa, que puede ser de varios por hora. **Un
observador que muestrea a $f_s$ solo puede observar fielmente cambios más lentos
que $f_s/2$.** Todo lo más rápido no desaparece: *aliasea*, y vuelve disfrazado
de tendencia lenta que no existe. Tres reversiones no relacionadas dentro de un
día, muestreadas una vez, se leen como una dirección.

Un transcripto es el stream crudo a tasa completa entregado a un observador que
muestrea muy por debajo. No es apenas verboso — como señal está **mal**, y mal en
la dirección específica de fabricar narrativa falsa.

Dos consecuencias para v1, ambas baratas:

1. **Una proyección declara la tasa de cambio que representa.** "Estado de las
   últimas 6 horas" es un objeto distinto de "estado ahora", y un canvas que no
   dice cuál está mostrando está invitando al lector a inferir una tendencia a
   partir de ruido.
2. **El cambio más rápido que el muestreo se agrega, nunca se descarta.**
   Descartar es lo que produce aliasing; resumir es lo que lo evita. Quince
   intentos desde la última vez que miraste son un objeto que dice *quince
   intentos, acá quedó* — no el último, y no los quince.

Esto no agrega mecanismo. Le da una razón y una regla testeable a un compromiso
que ya estaba tomado, y es el mismo argumento que hace
[10-observabilidad](10-observability.md) un nivel más abajo, donde el instrumento
muestreado es el flow mismo.

## Relación con la web-ui existente

`ai-ui` es un **quinto plugin**, construido contra el mismo chassis que `web-ui`,
`admin`, `portal` y `auth`. No bifurca ni reemplaza a `web-ui`, por dos razones:
`web-ui` es la superficie que todo el upstream mantiene funcionando, y correr las
dos permite compararlas sobre trabajo real en vez de afirmar que el canvas es
mejor.

**Vive en `ai-base/deploy/layers/evolvingagents/plugins/`** — la ubicación
sancionada por QM para las imágenes de servicio propias de una organización
(`ai-base/deploy/layers/README.md`). Es el único pilar que no necesita ninguna
divergencia del core: es exactamente la personalización para la que upstream
diseñó el límite de layers. El código fuente vive en `ai-ui/`; el layer contiene
su imagen de deploy y su configuración.

Cuando el canvas necesite datos que la API de QM no expone, la solución es una
ruta en `ai-flows`, no un canal especial hacia el core.

### El contrato del chassis, verificado

`ai-base/plugins/chassis/package.json` — *"firma de source-auth, los helpers
firmados de cliente del core, helpers chicos de request/response de `node:http`,
helpers de error, y el bloque común de env `CORE_*`… nunca importa el core."*

Consecuencias que aceptamos:

- `ai-ui` habla con el core **sólo por HTTP firmado**. Sin proceso compartido, sin
  acceso directo a los stores.
- Auth, identidad y scope vienen del core. El canvas renderiza lo que el scope de
  quien llama permite, y nunca lo amplía.
- El chassis es sólo-fuente y no se publica; las imágenes Docker copian
  `plugins/chassis` junto a cada plugin. `ai-ui` sigue el mismo empaquetado.

## Tecnología

Arrancar de lo que upstream ya corre, y divergir sólo donde el canvas lo exija:

| Aspecto | Elección | Por qué |
|---|---|---|
| Render | Lit | Lo que usa `web-ui`; no un segundo framework en un mismo repo |
| Layout | `dockview-core`, y después reevaluar | Ya es dependencia; los paneles acoplables son un canvas débil pero un punto de partida real |
| Transporte | HTTP firmado del chassis + el streaming existente del core | No inventar un segundo protocolo |
| Superficie de canvas | **Abierta** | Los paneles acoplables podrían no sobrevivir al contacto con un canvas espacial. Decidir después de renderizar el primer flow real, no ahora |

Esa última fila queda deliberadamente sin resolver. Elegir un motor de canvas
antes de haber renderizado un flow real es el tipo de decisión que esta
organización ya tomó demasiado temprano.

## Alcance del v1

**Adentro:** renderizar un flow corriendo — pasos, estados, artefactos, el agente
activo; actualizaciones en vivo; manipulación directa del estado de un paso;
layout persistido por scope; disposición propuesta por el sistema según la forma
del flow, sobreescribible y pegajosa.

**Afuera:** reemplazar `web-ui`; Slack (esa superficie queda como upstream la
entrega); **edición simultánea del canvas por varios usuarios**; una herramienta
de diagramación general.

> La exclusión de la edición simultánea es la que hay que decir en voz alta, dado
> que el problema que enmarca el proyecto es
> [multijugador](../../README.es.md#el-problema-la-ia-sigue-siendo-de-un-solo-jugador).
> ai-os apunta a **multijugador asincrónico** — varias personas actuando sobre un
> objeto durable a lo largo de días — no a co-presencia en tiempo real. Es una
> afirmación más angosta, y hay que sostenerla en vez de dejar que se lea como la
> otra.

## Construido, y qué quiere decir acá "construido" — 2026-08-09 [ran]

<img src="../assets/manual/09-desk.jpg" alt="" width="100%">

<sub>Dos flows como documentos, cada uno con sus cubitos de agentes apilados encima, el estante a la izquierda con los agentes sin trabajo, y la leyenda. De una instancia viva. <code>AnomalyScanner</code> está tachado y no se puede arrastrar: está declarado en <code>DataQualityAgent.md</code> sin archivo detrás.</sub>

`ai-ui` existe. Es un paquete — modelo de disposición, store, render y servidor —
que le habla a `ai-flows` por la costura firmada y no es dueño de nada salvo la
disposición.

Las cuatro propiedades, y cómo se salda cada una:

| | |
|---|---|
| **Espacial** | Arrastrás un documento; sigue ahí después de recargar, desde `ui_desk_layout` con clave por scope. **[ran]** |
| **Vivo** | El escritorio relee el estado cada cinco segundos, y el agente de un paso corriendo es lo único que se anima |
| **Generado** | `propose()` acomoda los documentos en grilla y apila el cubito de cada agente sobre el flow cuyos pasos lo nombran |
| **Dirigible** | Soltar un cubito sobre un documento agrega un paso de delegación — la misma instrucción que escribe `compose.ts`, verificada byte a byte por un test |

**La parte que sostiene todo no es el dibujo.** Es `layout.ts`, y puntualmente qué
le pasa a la disposición que armó una persona cuando el sistema quiere proponer
otra. Cada ubicación lleva un bit `pinned` que se prende en el momento en que un
humano la arrastra, y `propose()` esquiva lo fijado en vez de pisarlo. Un canvas
que se equivoca acá tira el trabajo del usuario cada vez que termina un paso —
que es justo cuando lo está mirando. Esa regla es una propiedad de una función
pura acá, y ocho tests la sostienen contra los eventos que la romperían: un flow
que termina, uno que aparece, uno que se borra.

Un caso vale nombrarlo porque es el que muerde. Soltás `ReviewAgent` sobre un
documento; el escritorio re-propone desde el estado del flow; `ReviewAgent`
*todavía* no está en los pasos, porque el paso que acaba de crear no corrió. Re-
derivar haría volver el cubito de un salto y desharía la asignación delante de
quien la hizo. Así que un cubito fijado se queda en su documento.

### Lo que a propósito NO hace

**Leer el escritorio nunca gasta una llamada al modelo.** `POST /assign` escribe
un paso y `POST /advance` corre uno; todo lo demás es lectura. El escritorio se
consulta solo, así que un canvas donde dibujar pudiera disparar trabajo gastaría
plata porque alguien dejó una pestaña abierta. Avanzar es un click, con el costo
dicho en el panel antes de apretarlo.

**Sin build.** El cliente es un string de JS plano. Este pilar es el que más
riesgo tiene de costar un trimestre de infraestructura antes de haberlo ganado, y
un bundler es la primera cuota de esa cuenta. Si el cronómetro de abajo dice que
el canvas gana, agregar un build es barato y va a estar pagado.

## Cómo se falsifica

**La medición:** una persona, y un flow que no corrió ella, de tres días atrás.
Tiempo hasta responder: *cuál es el estado, qué está bloqueado, qué produjo*.
Canvas contra la transcripción de `web-ui`.

**La afirmación:** el canvas es más rápido, y la brecha se agranda con la edad del
flow.

**Si no es más rápido, ai-ui es decoración.** Es el pilar más vulnerable a ser
lindo e inútil, así que la medición es un cronómetro sobre una tarea real y no una
opinión sobre cómo se ve.
