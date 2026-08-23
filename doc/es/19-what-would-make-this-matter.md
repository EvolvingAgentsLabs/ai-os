# 19 · Qué haría que esto importe

<img src="../assets/19-what-would-make-this-matter.jpg" alt="" width="100%">

<sub>Un recinto con una docena de marcas ordinarias, una afirmación ámbar adentro, y el campo de 135 del que esa afirmación habla — sin nada dibujado alrededor.</sub>

> **Proyecto.** Una lectura del repositorio completo el 2026-08-23: qué corre,
> para quién es, qué es genuinamente distinto, qué lo mataría, y qué hacer
> después. **Nada acá es una medición nueva.** Cada número está citado de un
> documento que lo registró o **[read]** de un artefacto en disco, y los dos
> lugares donde esa distinción muerde están marcados en §1. El único número que
> este documento cambió es el conteo de gates publicado, y ahora tiene un check.

## La versión corta

1. **Tres de los cuatro pilares corren; uno no existe.** `ai-flows` y `ai-ui` son
   reales y están testeados. `ai-storage` son 0 líneas de código y 1
   especificación.
2. **La evidencia más fuerte del repositorio es la parte que CI nunca corre.** No
   hay Python en ningún lado de `.github/workflows/ci.yml` **[read]**, así que
   `projects/coclea-sr` — 28 gates, 135 chequeos — y `projects/hemo-verified`
   quedan fuera de toda guarda automática que el repositorio tiene.
3. **Y ya se había podrido.** <!-- gate-count: superseded --> Trece lugares con la afirmación, en siete
   archivos, decían *26 gates / 125 chequeos* mientras los reportes en disco tenían
   **28 / 135**. Es exactamente la falla que `scripts/check-test-count.sh` fue
   escrito para frenar, aplicada a un número y no al siguiente.
4. **Lo distinto no es el motor de flows.** Es la regla de que la verdad la tiene
   que generar algo que no puede importar el código bajo prueba, más un ledger
   que hace un resultado reproducible por un extraño, más el hábito de publicar
   las mediciones que volvieron en contra del diseño.
5. **No hay usuario.** Dos estrellas, un autor, 54 commits en diecinueve días. El
   plan de §6 está ordenado por ese hecho y no por el roadmap.

## 1 · El estado, leído y no supuesto

| | tamaño **[read]** | qué existe | ¿en CI? |
|---|---:|---|---|
| `ai-base/` | 236.904 líneas | QM, vendorizado byte a byte, traído semanalmente | sí — más un job de ledger que falla un PR que lo toca sin una línea en `AI-OS-PATCHES.md` |
| `ai-flows/` | 16.867 líneas | motor de flows (`Open`), composición, gates, conformación, base de conocimiento, agentes de sistema | sí, en los dos backends |
| `ai-ui/` | 12.160 líneas | el escritorio, la cara de traza, la cara de gate, el generador del demo | sí |
| `ai-memory/` | 1.116 líneas | seis agentes de memoria como un árbol que corre como árbol | vía `ai-flows` |
| `ai-storage/` | **0 líneas** | [05](05-ai-storage.md), y nada más | — |
| `projects/coclea-sr/` | 14.433 líneas Python | 28 gates / 135 chequeos, todos `passed: true` **[leído de los artefactos de reporte, no re-corrido acá]** | **no** |
| `projects/hemo-verified/` | 918 líneas Python | H0 sobrevive: AUC 0.906 contra un umbral de muerte de 0.80 | **no** |

**Cadencia:** 54 commits, el primero `2026-08-04`, el último `2026-08-22`, un
autor. Diecinueve días. Ese número es la entrada más importante de §6 y es fácil
pasarlo de largo.

### Los tres números que habían derivado

| afirmación | dónde decía | qué dice el artefacto |
|---|---|---|
| gates / chequeos | <!-- gate-count: superseded --> **26 / 125**, en trece lugares de siete archivos | **28 / 135** en `projects/coclea-sr/gates/reports/` |
| tests propios | **605** en [18](18-from-a-hypothesis-to-a-therapeutic-surface.md), **626** en `README.md` | 626 — el README es el que CI chequea |
| el plan | `NEXT.md`, fechado 2026-08-09 en su propio encabezado, *"402 tests"* | tocado por última vez el 2026-08-11 y diecinueve pull requests atrás |

Nada de esto es descuido en el sentido corriente. `doc/PLAN.md` tenía **28 / 135**
bien el día que cambió; el conteo simplemente vive en trece lugares y un solo
número de este repositorio — el de tests — tenía un script mirándolo. **Una regla
aplicada a un número y no al siguiente es un hábito, no un check**, y un hábito es
justo lo que la regla de la casa 4 dice que no hay que usar.

Dos de los tres quedan cerrados en este cambio: `scripts/check-gate-count.py` lee
los reportes, escanea todo archivo markdown buscando un conteo publicado en
cualquiera de los dos idiomas, y falla ante una discrepancia, ante una afirmación
en un archivo que nadie listó, y ante un archivo listado que dejó de declararlo
**[ran]** — más un job de CI para que corra en cada PR. `NEXT.md` está reescrito.
El caso 605/626 *no* está cerrado: `check-test-count.sh` sigue mirando solo los
dos READMEs, y extenderlo es [P0](#p0--frenar-la-podredumbre-de-la-evidencia) abajo.

### La asimetría que más importa

`scripts/check-gate-count.py` verifica que el conteo publicado coincida con los
reportes. **No puede verificar que los reportes estén al día**, porque `make gates`
son nueve minutos y necesita numpy, scipy y sympy — que es precisamente por qué
nadie lo puso en CI, y precisamente por qué el conteo derivó.

Así que el repositorio está en esta posición: su evidencia más barata (tests
unitarios de TypeScript) está guardada por nueve jobs de CI, y su evidencia más cara
— aquello sobre lo que descansa toda afirmación externa, aquello sobre lo que está
escrito [18](18-from-a-hypothesis-to-a-therapeutic-surface.md) — está guardada por
que alguien se acuerde de correrla. FRICTION F3 y F8 son las dos instancias de esa
misma forma, encontradas a mano, después del hecho. La lámina de arriba es esa
frase dibujada.

## 2 · Para quién es esto, y por qué nadie lo usa

**Costo hasta el primer valor, hoy.** Postgres en Docker, una imagen de sandbox
`linux/amd64` de 1,31 GB (emulada, y por lo tanto minutos por cada llamada a
herramienta, en Apple Silicon), una clave de OpenRouter, Node ≥ 24.18, tres
procesos y un script de seed. El [manual](manual.md) es honesto y completo sobre
todo eso, lo que hace el costo legible en vez de menor. El único camino a costo
cero es [el demo en el navegador](https://evolvingagentslabs.github.io/demo/), y su
backend es simulado — muestra la interfaz, no el sistema.

**Distribución.** `ai-os` tiene 2 estrellas. La distribución real de la
organización es `evolving-agents` con 453, y está archivado bajo
[la política de congelado](07-freeze-policy.md). Todos los demás repositorios de
la organización también están archivados. Así que el proyecto nuevo hereda la
reputación y nada del tráfico.

**Por lo tanto la afirmación honesta es que el único usuario es el autor**, y el
primer milestone de §6 que no es una medición es *una segunda persona saca un
resultado gateado*.

Hay tres audiencias plausibles. No están igualmente sostenidas por lo que hay en
el repositorio:

**(a) Quien construye una plataforma de agentes** — quiere flows, canvas, handoff
multijugador. Es la audiencia de [00-vision](00-vision.md) y hoy es el encaje *más
débil*: corre una sola forma de flow, el merge no está construido y es
honestamente difícil, el canvas no fue falsado, y todo producto bien financiado de
la categoría se mueve sobre el mismo terreno. Competir acá por features es
competir donde ai-os tiene un autor.

**(b) Quien tiene una carga de trabajo con un oráculo externo** — física,
numérica, simulación, cualquier cosa donde exista una respuesta correcta fuera de
la opinión del modelo. `coclea-sr` y `hemo-verified` son dos instancias
trabajadas, y [16](16-a-workload-with-an-oracle.md) es la costura que las hizo
posibles. Acá el repositorio tiene prueba y no argumento.

**(c) Quien construye entornos de RL y evals** — alguien que necesita que la
recompensa la calcule algo que no sea un juez. `projects/coclea-sr/environments/coclea_sr/`
ya tiene forma de entorno, y `physics-verifiers` es el repositorio hermano que
midió el argumento.

**(b) y (c) son la misma persona con suficiente frecuencia como para ser una sola
audiencia**, y es la audiencia que la evidencia sostiene. Apuntar primero a (a) es
lo que hicieron los últimos cuatro repositorios archivados de esta organización.

## 3 · Qué es realmente distinto

Cinco candidatos, cada uno con lo que haría falta para descartarlo.

**1 · Verdad que el código bajo prueba no puede producir.** `truth/` no puede
importar `src/`. Formas cerradas en sympy y mpmath de un lado, el solver del otro,
y un gate comparándolos. Cuatro palabras de política, y son la razón por la que un
gate verde significa algo distinto de consistencia consigo mismo.
*Se descarta si:* se muestra que la misma disciplina es práctica estándar. Es
estándar en análisis numérico y **no** lo es en sistemas de agentes, que es toda
la afirmación.

**2 · El reporte de gate como costura de kernel neutral al lenguaje.** Un proceso
Python escribe JSON; `ai-flows/src/gates.ts` parsea, resume y decide, y no ejecuta
nada. Esa es la respuesta que un sistema operativo debería dar a *"¿en qué lenguaje
está escrito el trabajo?"* — **no es asunto del kernel**. Es también la razón por
la que por fin se pudo declarar una métrica para un paso, cuando toda carga previa
corría sobre prosa.
*Se descarta si:* aparece un sistema que gobierna trabajo entre lenguajes sin un
formato compartido. Nadie mostró uno; la alternativa en la práctica es un modelo
juez, que es el problema del candidato 5.

**3 · "No corrió" no es "pasó".** `freezeVerdict` devuelve `blockers` y `unknown`
como listas separadas y se niega ante cualquiera de las dos. Una decisión de
diseño, tres líneas de consecuencia, y es la diferencia entre un gate de freeze
que se abre más justo cuando la suite está rota y uno que no.
*Se descarta si:* nada — pero es chico, y solo es portante porque F3 y F8
dispararon exactamente en ese borde.

**4 · Reproducción como atestación, no como afirmación.** Directorios de corrida
direccionados por contenido, un `ledger.jsonl` encadenado por hash, ids de corrida
en la metadata de los propios PNG, `verify_ledger.py` solo con stdlib, y
`make reproduce` chequeando que cada re-corrida caiga en su directorio
**existente** — mismo contenido, mismo hash, mismo camino. Atrapó a su propio
almacén una vez, y por eso F4 dice "suficientemente bien" y no "resuelto".
*Se descarta si:* se muestra que es ceremonia. La contra-evidencia es F8: dos
`result.json` atestados estaban íntegros y no eran JSON válido, y
`verify_ledger.py` lo encontró negándose a confundir *íntegro* con *válido*.

**5 · Un ledger de resultados que volvieron en contra del diseño.** El benchmark
de M4 se saturó. `dream` empató. El estudio de review no encontró nada y el
hallazgo de su primer borrador fue un artefacto de un punto final. Los brazos de
E7 empataron todos en el techo. `evolving-memory` midió 80% contra 80% y publicó
igual. Y `physics-verifiers` **falsó el argumento habitual para los gates** — un
juez frontier atrapó doce fabricaciones flagrantes y nueve defectos numéricos
sutiles, dos veces.
*Se descarta si:* nadie, y este es el activo. Es también la razón por la que el
pitch de §4 tiene que ser el angosto.

**En qué no es distinto.** El objeto flow es real y es una sola forma; la unidad
de trabajo durable es un buen argumento ([00-vision](00-vision.md)) con la
evidencia de M2 detrás y todavía no un diferenciador que un usuario sienta. El
escritorio está construido y sin probar. La memoria con scopes no existe. Agentes
como archivos markdown es una convención que ya comparten varios sistemas.

## 4 · Por qué debería importarle a la industria — dicho angosto

El cuello de botella en sistemas de agentes no es producir salida. Es saber cuándo
la salida está mal a un costo menor que producirla de nuevo. Todo stack de evals
de uso amplio responde eso con un modelo, y este repositorio contiene un
experimento que dice que un modelo lo responde **bien** — que es el resultado
incómodo, y el que el pitch tiene que sobrevivir.

Así que la afirmación que vale la pena hacer afuera es la angosta, y es la que
[18 §8](18-from-a-hypothesis-to-a-therapeutic-surface.md) ya declara:

- **Un modelo puede juzgar una tarea; no puede generar una con respuesta
  conocida.** No se crea verdad afirmándola, por buena que sea la afirmación.
  `truth/` es un mecanismo para tener una respuesta que nadie argumentó.
- **Un juez que acierta siempre igual no te entrega ledger, ni freeze, ni comando
  de reproducción.** Detección no es el mismo producto que atestación. Lo segundo
  es lo que necesita un regulador, un revisor, o un colega seis meses después.
- **El kernel no necesita estar escrito en el lenguaje del trabajo.** Esa es la
  afirmación de sistema operativo, y es la que tiene una costura corriendo detrás.

Lo que no hay que afirmar: que los agentes hicieron ciencia, que alguna
declaración de acá fue comparada contra datos de pacientes, o que los gates le
ganan a los jueces en detección. Las tres están contradichas por mediciones de
este repositorio.

## 5 · Qué falsaría el proyecto

| riesgo | qué lo resolvería |
|---|---|
| **Un autor, diecinueve días** | treinta días sin que se mueva ningún ítem de P0–P4. Entonces la restricción es capacidad y no priorización, y el plan se reescribe alrededor de una persona |
| **La evidencia no está guardada** | un gate se pone rojo en `main` y nadie lo nota hasta que se escribe un documento a partir de él |
| **El escritorio es decoración** | el cronómetro (P1). Si un explorador plano responde igual de rápido, 12.160 líneas se re-argumentan en vez de pulirse |
| **`ai-storage` es innecesario** | el archivo plano ya saca 10.0 en seis fixtures y 3.0 en uno. Si un segundo fixture de horizonte largo escrito por otra mano también vuelve cerca del techo, el pilar se cae |
| **Los gates solo ordenan errores que imaginamos** | el límite que H0 declara de sí mismo: las corrupciones y los oráculos comparten autor. H1 (P3) es la prueba |
| **Deriva de upstream** | una afirmación `[ran]` sobre QM tiene fecha de vencimiento; una de ellas estaba citada en cuatro documentos cuando venció. La regla existe; nada la hace cumplir |
| **Nadie quiere un OS de agentes de un lab de uno** | ningún segundo usuario después de P4 |

## 6 · El plan

Ordenado por lo que está en el camino, no por el roadmap. Cada ítem dice qué
significa terminado y qué diría que el ítem era el equivocado.

| | ítem | costo | por qué acá |
|---|---|---|---|
| **P0** | Frenar la podredumbre de la evidencia | horas | es el único activo, y nada lo mira |
| **P1** | Correr el cronómetro de M5 | una persona, y tres días de espera | la deuda impaga más vieja; puede borrar un pilar |
| **P2** | coclea §7.5 ruta B, precondición | una corrida | sin cambios respecto de [PLAN](../PLAN.md); dice si hace falta la ruta A |
| **P3** | hemo H1 — los errores que nadie diseñó | un surrogate, después la suite | el experimento de mayor valor del repositorio |
| **P4** | Un usuario que no sea el autor | una máquina limpia y un cronómetro | no hay evidencia de que nada de esto sea usable por una segunda persona |
| **P5** | Decirlo una vez, angosto | un día de escritura | (b) y (c) de §2 no pueden encontrar esto |
| **P6** | `ai-storage`, contra 3.0 | un milestone | es trabajo real y está detrás de cinco cosas más baratas |

### P0 · Frenar la podredumbre de la evidencia

Parcialmente hecho en el cambio que trae este documento: el conteo de gates se
chequea contra los reportes y está cableado a CI **[ran]**. Lo que queda:

1. **Correr los gates de Python en un schedule.** No por PR — nueve minutos, tres
   dependencias científicas, y `projects/` cambia poco. Un job nocturno o semanal
   que corra `make gates` para los dos proyectos y falle fuerte alcanza, y es la
   diferencia entre que un gate rojo lo encuentre CI o lo encuentre un documento.
2. **Extender `check-test-count.sh` más allá de los dos READMEs**, ya que el doc 18
   traía 605 mientras los READMEs traían 626.
3. **Correr `gates/check_reports.py` en el mismo job**, porque un conteo fresco
   sobre reportes viejos es la falla de la que trata toda esta sección.

**Terminado significa:** un gate rojo, un reporte viejo y un número derivado hacen
fallar algo automáticamente. **Ítem equivocado si:** el job agendado resulta
demasiado flaky o lento para mantenerlo verde, en cuyo caso hay que decirlo y fijar
una corrida atestada mensual en vez de dejar un badge rojo que la gente aprende a
ignorar.

### P1 · Correr el cronómetro de M5

Sin cambios respecto de [04-ai-ui](04-ai-ui.md) y [NEXT](../../NEXT.md): una
persona, y un flow **que no corrió**, de tres días. Tiempo hasta responder *cuál es
el estado, qué está bloqueado, qué produjo* — el escritorio contra la transcripción
de `web-ui`.

El flow tiene que tener tres días, así que **se siembra primero y se mide después
en la semana**, y por eso va arriba de ítems que parecen más urgentes. Dos sujetos
es una señal sobre si el instrumento sirve, no evidencia; el reporte dice cuál.

**Terminado significa:** el número se publica salga como salga.
**Ítem equivocado si:** no se consigue una segunda persona para hacerlo — en cuyo
caso P4 es estrictamente previo, y el escritorio queda sin probar con eso dicho en
su propio documento en vez de quedar implícito.

### P2 · coclea §7.5, ruta B, la precondición

Sin cambios y sin reordenar. [PLAN](../PLAN.md) lo argumenta y el argumento se
sostiene: es una corrida, y una corrida que diga *la ruta B no llega a
criticalidad* ahorró un milestone. La falsación se registra antes de comprar el
barrido, la regresión con `|mu_H|` grande tiene que reproducir la curva pasiva, y
el runner devuelve distinto de cero si no lo hace.

Este documento no tiene autoridad para re-planificar la tesis. Está acá para que
el orden sea visible contra todo lo demás.

### P3 · hemo-verified H1 — los errores que nadie diseñó

`H0` sobrevive con AUC 0.906, y su propio README declara el límite que importa:
**las corrupciones y los oráculos fueron diseñados por el mismo autor.** H0 muestra
que el portafolio ordena errores que alguien pensó. H1 es si ordena los errores que
un surrogate entrenado realmente comete.

Es el experimento de mayor valor del repositorio, porque es el que puede
generalizar todo el argumento arquitectónico más allá de dos cargas hechas a mano
— y porque puede fallar de una manera que vale la pena publicar.

**Terminado significa:** un AUC sobre errores de surrogate, publicado salga como
salga, al lado del de H0.
**Ítem equivocado si:** entrenar un surrogate resulta ser el milestone en vez de la
precondición. Entonces la versión barata es tomar errores reales de un surrogate ya
publicado en vez de construir uno, y esa decisión se toma antes de comprar el
entrenamiento — F5, aplicada antes del trabajo.

### P4 · Un usuario que no sea el autor

Dos cosas concretas, y ninguna es un feature:

1. **`make up` desde un clon limpio en una máquina limpia, cronometrado**, por
   alguien que no vio el repositorio. Cada falla se vuelve una entrada de FRICTION,
   arreglada con el hack más corto que funcione. El objetivo es un número, no un
   adjetivo: tiempo hasta un primer resultado gateado.
2. **Una tercera carga de trabajo elegida por otra persona.** Los dos proyectos
   existentes los eligió quien construyó la costura, que es la misma crítica que H0
   se hace a sí mismo.

**Terminado significa:** una persona que no lo escribió saca un resultado gateado,
y se registra el tiempo transcurrido.
**Ítem equivocado si:** el tiempo hasta el primer valor se queda arriba de una hora
después de los arreglos obvios. Entonces esto es un instrumento de investigación
privado que publica sus hallazgos, que es una cosa legítima y mucho más chica de
ser — y los READMEs deberían decir eso en vez de decir "sistema operativo".

### P5 · Decirlo una vez, angosto

Un solo artefacto apuntado a la audiencia (b)+(c) de §2: la regla de que `truth/`
no puede importar `src/`, la costura JSON de gates, la cadena de atestación, y — de
manera prominente, no en una nota al pie — el resultado de `physics-verifiers` que
mató la versión fuerte del argumento. Un pitch que abre con su propia
contra-evidencia más fuerte es el único tipo que este repositorio tiene derecho a
hacer, y es también el más difícil de descartar.

**Terminado significa:** publicado, con las afirmaciones angostas de §4 y ninguna
de las anchas.
**Ítem equivocado si:** atrae atención antes de que P0 y P1 estén hechos, y el
primer lector serio encuentra un número viejo o un canvas sin probar. Esa es la
falla que la política de congelado existe para prevenir, llegando desde el otro
lado.

### P6 · `ai-storage`, contra 3.0

M4 procede — el gate se abrió con `long-horizon-eviction` — pero las dos salvedades
viajan con el número: un fixture no es un benchmark, y el juez es deepseek
corrigiendo al summariser de deepseek. Así que el primer movimiento sigue siendo el
que nombró [NEXT](../../NEXT.md): **un segundo fixture de horizonte largo escrito
con otra forma, por otra mano**, y la pregunta abierta contestada en papel contra
dos flows reales — *cuando dos notas dicen lo mismo, ¿cuál sobrevive?* — antes de
construir cualquier store.

Va último porque es un milestone y los cinco ítems de arriba son horas, una corrida
y una persona.

### Qué no hacer

Sin cambios respecto de [08-roadmap § Deliberadamente no planificado](08-roadmap.md),
más tres que se siguen de este documento:

- **Nada más de escritorio antes del cronómetro.** `gate-face.ts` se construyó
  mientras H9 seguía sin ejecutarse, y [PLAN](../PLAN.md) registra eso como el patrón
  que FRICTION.md existe para reemplazar.
- **Ningún tercer proyecto antes de un segundo usuario.** Una tercera carga elegida
  por el mismo autor es una tercera instancia del mismo fixture.
- **No repetir el argumento de los gates en su forma fuerte.** "El modelo no puede
  darse cuenta" está medido como falso, dos veces, por esta organización.

## Qué cambió este documento

- `scripts/check-gate-count.py`, y un job de CI que lo corre. **[ran]** — falló en
  trece lugares con la afirmación, y ahora pasa.
- <!-- gate-count: superseded --> **26 gates / 125 chequeos → 28 / 135** en `README.md`, `README.es.md`, `doc/16`,
  `doc/18`, sus espejos en español, y `projects/coclea-sr/README.md`. La fuente son
  los artefactos de reporte, **[read]**, no una re-corrida.
- **605 tests → 626** en `doc/18` y su espejo.
- `README.md` y su espejo nombran los dos proyectos; `hemo-verified` estaba
  mergeado y no figuraba en la tabla de layout.
- `plate_19()` en `doc/assets/make-illustrations.py`, para que la convención de
  ilustraciones cerrada en 18 §8 siga cerrada **[ran]**.
- `NEXT.md`, reescrito contra este plan.
- El conteo viejo sigue apareciendo en tres lugares a propósito — este
  repositorio supersede en vez de editar — y cada uno lleva un
  `<!-- gate-count: superseded -->` invisible para que el check distinga un
  registro de un número anterior de un número viejo sin corregir.

**Y qué no hizo:** no se re-corrió nada. Los gates se leyeron de 135 artefactos
JSON, no se ejecutaron — este entorno no tiene numpy — y P0 existe porque esa
distinción es hoy lo único que separa una afirmación verde de una suite roja.

---

**La falsación de este propio documento.** Si pasan treinta días y ningún ítem de
P0–P4 se movió, la restricción nunca fue la priorización y este plan era el
artefacto equivocado. Reescribirlo alrededor de una persona, con un solo ítem.
