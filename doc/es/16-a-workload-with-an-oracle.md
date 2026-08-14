# 16 · Una carga de trabajo con oráculo

> **Referencia para la costura, especificación para la forma.**
> `ai-flows/src/gates.ts` corre y está testeado contra reportes de gate que
> produjo Python — 18 tests, seis de ellos leyendo los archivos reales del disco.
> La flow shape `Gated` que argumenta **no está construida**: `FLOW_SHAPES` sigue
> teniendo una sola entrada.
>
> La carga de trabajo que describe, [`projects/coclea-sr/`](../../projects/coclea-sr/),
> sí corre: 45 gates en verde **[ran]**, una hipótesis falsada por su propio
> brazo de control **[ran]**.
>
> El inglés es canónico. Cuando no coincidan, el inglés tiene razón.

## El agujero que esto tapa, citado del código que lo dejó

[`ai-flows/src/types.ts`](../../ai-flows/src/types.ts) define qué observó un
intento, y después explica por qué la mitad está siempre vacía:

> `value` — *"Present only where the shape declares a metric. `null` for
> `open`."* … *"defined only where a shape declares a metric, and today no shape
> does."*

[`engine.ts`](../../ai-flows/src/engine.ts) se niega a completarlo, y hace bien:

> *"`value` is null because `open` declares no metric; inventing a score here is
> how a shape acquires a number nobody defined."*

La razón por la que ninguna shape declaró una métrica nunca fue que faltara
código. **Toda carga de trabajo que tuvo este repositorio corría sobre prosa.**
Para la prosa, "¿este paso tuvo éxito?" no tiene respuesta fuera del criterio de
alguien, y [13-degradation](13-degradation.md) es el registro de qué pasa cuando
igual se deriva un número: `contribution.ts`, construido y falsado el mismo día,
porque sin noción de respuesta correcta no hay nada sobre lo cual estar en lo
cierto o equivocado.

Lo que faltaba no era un campo. Era **una carga de trabajo con un oráculo
externo**.

## Qué tiene una cóclea que no tiene una propuesta de migración

Los autovalores de una cuerda fija-libre tienen forma cerrada. GATE-A01 no es una
opinión sobre si los números se ven bien:

    |w_numérico − w_analítico| / w_analítico < 1e-4

donde el valor analítico lo produce un módulo *al que le está prohibido importar
el código bajo prueba* — la regla §6.4.4 de la especificación del proyecto,
impuesta por la estructura de directorios. La tolerancia se escribió antes que el
solver, por alguien que no era el solver. Eso es una métrica declarada en el
sentido en que `types.ts` lo decía.

El valor medido, para que quede: **9.2784e-6**, un factor diez adentro del límite.

## Tres cosas que esta carga de trabajo le enseñó al sistema operativo

### 1. Verde no es correcto, y una *suite* verde tampoco

El [laboratorio de señal](../../ai-ui/src/dsp-demo.ts) ya argumentaba que un paso
puede correr, asentarse, reportar y no haber llevado nada. La cóclea argumenta un
nivel más arriba, sobre un *resultado*, y lo hace con un defecto mantenido en el
solver a propósito.

El nodo del ápex de la membrana posee **media celda** de masa. Dale una entera y
todos los autovalores quedan mal en `O(dx)`. Medido, en la misma corrida:

| gate | qué verifica | veredicto sobre el defecto |
|---|---|---|
| A02 | ortogonalidad con peso `mu` | **verde** |
| A03 | el modo `n` tiene `n−1` ceros interiores | **verde** |
| A11 | rigidez simétrica, masa positiva | **verde** |
| A01 | autovalores contra la forma cerrada | rojo — `2.5921e-4` vs `1.0e-4` |
| A12 | orden de convergencia | rojo — **0.9996** en vez de 2 |

Tres de cinco gates aprueban un solver equivocado en cada número que reporta. El
chequeo obvio sobre una matriz de masa — *¿integra a la masa del continuo?* —
**prefiere el defecto**, que suma exactamente 1.0 mientras el ensamblado correcto
suma `1 − dx/2`.

Y los dos gates que sí lo atrapan dicen cosas distintas. A01 dice *cuán lejos*.
A12 dice *dónde*: orden uno es un error de borde, y el extremo libre es el
helicotrema. **El gate que se dispara primero no es el que localiza.**

La lección general para `ai-flows`: una suite de gates verdes es evidencia solo
si se sabe cuáles de ellos pueden ponerse en rojo. `gates.ts` exporta
`nonDiscriminating()` exactamente para esto, y el proyecto mantiene un artefacto
conocidamente incorrecto para que la pregunta tenga respuesta y no supuesto.

### 2. "No corrió" no es "pasó"

`freezeVerdict` devuelve `blockers` y `unknown` como listas separadas y se niega
ante cualquiera de las dos. Fusionarlas significa que la compuerta de freeze se
abre más ancha justo cuando la suite está más rota — la corrida que no llegó a
arrancar es indistinguible de la corrida en la que nada objetó. Es la misma
distinción que `attest.py` impone del lado productor: un gate sin reporte está
ausente del mapa de estado, nunca supuesto verde.

### 3. El piso del propio instrumento se mueve

GATE-A12 ajusta un orden de convergencia a través de grillas. El error de un
esquema de segundo orden cae como `N^-2` mientras la norma de la matriz — y por
lo tanto el piso de precisión del eigensolver — sube como `N^2`. **Todo estudio
de convergencia termina midiendo el solver en vez de la discretización.**

Medido sobre el fundamental: razones de error de 4.000, 3.997, 4.017, y después
**4.423** en el último refinamiento, donde el error (5.8e-9) apenas duplica el
piso (2.9e-9). El orden ajustado dio 2.0306 en vez de 2.0000 — *dentro de la
banda del gate*, con buena pinta, y sobre la cosa equivocada.

Se detectó porque dos implementaciones independientes discrepaban: el solver
TypeScript del demo reportaba 1.9841 para la misma cantidad. Las dos estaban
dentro de la banda. Ninguna medía lo que decía. El gate ahora computa su propio
piso y descarta los puntos contaminados, **nombrando cuáles** — un ajuste truncado
en silencio se lee como cobertura completa.

## La costura, y la cuestión del lenguaje

`projects/coclea-sr/` es Python. `ai-os` es TypeScript. Eso no es un problema a
resolver; es la cosa a demostrar.

**Un sistema operativo no exige que sus cargas de trabajo estén escritas en su
propio lenguaje.** Si lo hiciera, sería una biblioteca. Acá el kernel es
TypeScript, el trabajo es numpy y mpmath, y lo cargan tres costuras — ninguna de
ellas un port:

1. **Los agentes son markdown**, así que ya eran agnósticos del lenguaje.
   `VERIFICADOR-MATH` es un archivo con una línea `tools:`; el Python es lo que
   *corre*, no lo que *es*.
2. **El reporte de gate es el formato de intercambio.** Python escribe JSON,
   TypeScript lo lee como una `Observation` con un `value` real. `gates.ts` es
   puro — parsear, resumir, decidir — sin filesystem, sin reloj y sin ejecución,
   porque la costura que importa es el formato, no el transporte.
3. **`ai-base` ya tiene la primitiva de ejecución.** `sandbox/local-sandbox.ts`
   lanza `docker exec`; `aws-sandbox.ts` y `sprites-sandbox.ts` están al lado. Un
   proceso Python bajo ese sandbox *es* el sistema operativo corriendo un
   proceso. Recompilar la carga de trabajo a WebAssembly agregaría un segundo
   sustrato de ejecución al lado del que el kernel ya tiene y CI ya prueba:
   superficie nueva donde la respuesta ya existe.

### El desacuerdo que la costura encontró

Los digests se toman sobre **los bytes del artefacto**, nunca sobre una
re-serialización. Python y JavaScript no coinciden en flotantes:

    python  {"gate":"A01","max_relative_error":9.278e-06,"passed":true}
    node    {"gate":"A01","max_relative_error":0.000009278,"passed":true}

Mismo valor, bytes distintos: los dos runtimes pasan a notación exponencial en
`1e-5` y `1e-7` respectivamente, y las mediciones de gate viven en esa banda.
`1e+21` y `0.30000000000000004` sí coinciden, lo que lo vuelve el peor tipo de
desajuste — invisible para cualquier número con el que alguien probaría. Un
digest que discrepara cruzando la frontera reportaría "este artefacto cambió" en
todo lo que la cruzara, y una alarma que se equivoca siempre es una alarma que se
apaga.

## La corrida sobre una instancia viva, 2026-08-14 — [ran]

`ai-flows/scripts/seed-cochlea.ts` siembra los mismos ocho agentes como markdown
en un scope de proyecto real y corre un flow de tres pasos sobre los **reportes
de gate reales**. Nueve archivos escritos a través de un turn y releídos del
store; tres pasos avanzados contra DeepSeek V4 Flash por el core en ejecución.

**Qué es real y qué no.** El proyecto, el scope, los archivos de agente, los
datos de gate, el flow y las llamadas al modelo son reales. Los agentes **no**
corren pytest: `execute` llega al workspace del sandbox, que no es el checkout
donde vive el proyecto, así que los números entran como datos y no se producen
dentro del loop. Montar el proyecto en el sandbox es el paso siguiente y no está
hecho.

### La primera corrida se contradijo a sí misma, y la culpa fue del seed

`VERIFICADOR-MATH` leyó el resumen, encontró un valor medido para un gate y
booleanos para los otros siete, y llamó a esos siete **UNKNOWN** — correctamente,
por su propia regla de que un veredicto sin número es una opinión. Dos pasos
después `AUDITOR` leyó el mismo archivo y contestó **FREEZE**, citando
`mayFreeze: true`.

Los dos tenían razón sobre lo que leyeron. El seed había escrito un campo
`freeze_verdict` en los datos, así que el agente que sostiene la compuerta pudo
tomar el atajo salteándose la evidencia — **el mismo defecto que un gate que no
puede fallar**, un nivel más arriba. Darle a un verificador la respuesta que
existe para derivar no es una comodidad.

### La segunda corrida, sin el veredicto y con la evidencia en su lugar

| | primera corrida | segunda corrida |
|---|---|---|
| gates llamados verdes con un número | 1 de 8 | **8 de 8** |
| gates llamados UNKNOWN | 7 | **0** |
| decisión de `AUDITOR` | FREEZE, citando un campo precalculado | FREEZE, derivado, nombrando A12 |

Cada cifra que citaron los agentes se verificó contra los reportes en disco y es
real: A01 `9.28e-6`, A02 `2.22e-15`, A04 `3.99e-7`, A07 `0.0086`, A08 `2.31e-6`,
A11 `0`, A12 `1.999`. Ninguna inventada.

Y la segunda corrida produjo un argumento mejor para A02 del que este repositorio
tenía escrito. Donde `test_A02_orthogonality.py` dice que el Gram estructural es
la identidad por cómo normaliza `eigenmodes`, el agente dio la razón general:
*"los autovectores de un haz simétrico son M-ortogonales por construcción, sin
importar qué haya en M."* Por eso el gate no puede ver un defecto de masa — el
defecto está en `M`.

**La lección barata, que es el motivo de correrlo:** una topología de
verificación multi-agente vale lo que vale lo que el seed le entrega. Un campo en
un archivo JSON convirtió a un verificador en un sello de goma, y nada en el
estado del flow, su traza o su señal de contribución lo habría mostrado. Lo que
lo mostró fueron dos agentes leyendo el mismo archivo y discrepando.

## Completar la carga de trabajo, y el gesto que dejó a la vista

El proyecto alcanzó su resultado principal el 2026-08-14 — **GATE-B2, un máximo
interior estadísticamente significativo en SNR contra ruido, en 24 de 24
combinaciones de sonda y frecuencia**, con el óptimo medido a 11.6% de la
predicción sin parámetros libres `σ_opt = θ/2`. 80 gates verdes, contra 45.

Dos cosas de esa corrida pertenecen acá y no al proyecto.

### El escritorio no podía empezar trabajo

Todo gesto que el desk tenía — asignar, desasignar, avanzar, bifurcar, preguntar,
acomodar — opera sobre un documento que **ya existe**. No había forma de crear
uno. Así que empezar un proyecto significaba salir de la interfaz hacia un `curl`
o un script de siembra, que es una forma extraña para una superficie cuya
afirmación central es que el trabajo sobrevive a la conversación.

`POST /flow` y un formulario `New document` lo cierran, y dos decisiones adentro
son las mismas reglas que esta carga de trabajo viene imponiendo en todo lo demás:

* **`actorId` es obligatorio y no tiene default** — la regla de ADR-0009: un flow
  sin actor no se crea, en vez de crearse y atribuirse a una cuenta de servicio.
* **El objetivo es obligatorio y no se copia del título.** Un documento cuyo
  objetivo repite su nombre no declara nada sobre qué significa "terminado", que
  es la primera de las cuatro cosas que [03-ai-flows](03-ai-flows.md) dice que a
  una sesión le faltan y que un flow existe para aportar.

Se construyó con un formulario en línea y no con `window.prompt`, y la segunda
razón es la que vale registrar: un diálogo nativo bloquea el event loop de la
página, así que el gesto habría quedado **imposible de testear para cualquier
cosa que maneje un navegador** — incluida la verificación de que funciona. Una
decisión de producto y una de testeabilidad apuntaron al mismo lado, lo que suele
indicar que el idioma estaba mal desde el principio.

### El formato de intercambio se rompió, y los tests quedaron verdes

`json.dumps` de Python escribe `Infinity` y `-Infinity`. **JSON no tiene
ninguno de los dos.** Dos reportes de GATE-A10 llevaban un SNR de `-inf` en el
nivel de ruido donde el detector nunca dispara, `JSON.parse` tiró del lado
TypeScript, y `realReports()` — que devolvía `[]` ante cualquier falla — no
devolvió nada. Cuatro tests de deriva entre lenguajes **se reportaron como
saltados**.

La costura se había roto y la suite estaba verde. Eso es peor que el bug: un test
que falla es un mensaje y un test saltado es silencio.

Las dos mitades están corregidas y la corrección va en ambas direcciones. Los
escritores sanean los valores no finitos a `null` — que es el valor ausente de
JSON, y un SNR de menos infinito *es* "no se detectó señal", donde un `0`
forzado sería una medición fabricada — y pasan `allow_nan=False` para que lo que
el saneador no atrape explote al escribir. Los lectores ahora distinguen
**ausente** de **ilegible**: no haber directorio es un salto legítimo, un
directorio de archivos que no parsean es una falla que los nombra.

**La regla general para una costura entre lenguajes:** un lector que no puede
distinguir "el productor no corrió" de "el productor produjo algo que no puedo
leer" convierte cada rotura de intercambio en una pérdida de cobertura. Los dos
lados de ésta ahora dicen cuál es.

### E4, y qué puede decir del mundo una carga de trabajo con oráculo

El proyecto emitió su veredicto fisiológico el 2026-08-14, y su forma vale
registrarla acá y no solo en el proyecto: **el modelo es adimensional y el
veredicto no lo es.**

`σ_opt = θ/2` no se puede comparar contra nanómetros sin inventar una escala de
desplazamiento, y cualquier comparación construida sobre una sería una afirmación
sobre esa invención. Lo que hizo posible el veredicto fue **invertir la tasa de
cruces de Rice** para que las unidades se cancelen — inferir el ruido de una
**tasa de disparo espontánea**, que es medible, en vez de un desplazamiento, que
no lo es.

Esa inversión está verificada: GATE-A10 le da una tasa espontánea que produjo el
*simulador* y recupera el cociente conocido con 0.25% de error. Recién después se
la apunta a la fisiología.

**El veredicto: el óptimo de resonancia estocástica es alcanzable por fibras del
nervio auditivo hasta una frecuencia característica de ~1 kHz y no por encima.**
Apoya la hipótesis de 1995 y la acota, que es una afirmación más filosa que la
original.

Dos cosas viajan con él y vale generalizarlas:

* **Los números empíricos están marcados `[read]` y no se verificaron de forma
  independiente**, porque esta pasada no tuvo acceso a literatura en el loop.
  Citar un paper al lado de un número tomado de la propia especificación del
  proyecto habría sido fabricar procedencia. La corrida registra la salvedad en
  un campo, así que ninguna figura derivada puede citarse sin ella.
* **El supuesto que sostiene todo está nombrado en la corrida**, no enterrado en
  prosa: `ω_eff = 2π·CF`. Un resultado cuyo eslabón más débil se puede encontrar
  es un resultado que alguien puede atacar; uno cuyo eslabón débil es implícito
  es uno que se cita.

### Figuras que llevan su propia procedencia

La spec §8.4 pide que cada figura lleve su run id y el hash del manifiesto.
Hacerlo en los propios chunks de texto del PNG y no en un pie significa que la
procedencia sobrevive a que la figura se copie en una presentación — que es el
único viaje que una figura hace de verdad.

También detectó un defecto de inmediato. Los directorios de corrida acá están
**direccionados por contenido**, así que ordenar sus nombres no da orden alguno;
la primera versión del script tomó el último lexicográficamente y agarró una
corrida **superada**. Falló ruidosamente solo porque el esquema de esa corrida
había cambiado. Si no hubiera cambiado, la figura habría mostrado números viejos
bajo un sello de procedencia de apariencia correcta — procedencia presente,
legible por máquina, y equivocada.

**La lección para cualquier almacén atestado: el direccionamiento por contenido
elimina el orden del que no sabías que dependías.** Ordená por algo que signifique
tiempo.

## Qué argumenta que se construya después

**Una flow shape `Gated`.** Hoy `FLOW_SHAPES = ["open"]`, y
[NEXT.md](../../NEXT.md) lista las shapes faltantes sin una razón para elegir
cuál primero. Ésta es la razón: un flow `Gated` declara sus gates requeridos al
crearse, sus pasos llevan observaciones con valores reales, y **no puede llegar a
`done` mientras un gate requerido esté rojo o ausente**. La lógica de freeze
existe y está testeada; lo que falta es el cableado en `engine.ts` y la shape en
`types.ts`.

El orden importa y fue deliberado. `gates.ts` se escribió y testeó primero,
contra una carga de trabajo que existe, así que la shape se argumenta desde una
necesidad medida y no desde la lista de shapes que alguien anotó en
`03-ai-flows`.

## De qué NO es evidencia esto

Es un proyecto, en un dominio, cuyo oráculo es una solución en forma cerrada.
**Todo el argumento depende de que ese oráculo exista**, y la mayoría del trabajo
no lo tiene — que es la situación para la que se construyó `contribution.ts` y en
la que fracasó. Este documento afirma que una carga de trabajo con oráculo expone
una shape que a `ai-flows` le falta. No afirma que la shape ayude al trabajo sin
oráculo, y el cronómetro que decidiría algo sobre el escritorio
([NEXT.md § 1](../../NEXT.md)) sigue sin correrse.

El resultado físico es igualmente acotado y negativo:
[ADR-0002](../../projects/coclea-sr/decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
registra que el modelo de la especificación no puede producir una onda viajera
coclear, que la razón es analítica, y que el operador de reemplazo está
especificado y no construido. La cuerda pasiva está validada. Simplemente no es
una cóclea.

## Dónde leer el código

| | |
|---|---|
| [`ai-flows/src/gates.ts`](../../ai-flows/src/gates.ts) | La costura: parsear, resumir, veredicto de freeze, observación |
| [`ai-flows/test/gates.test.ts`](../../ai-flows/test/gates.test.ts) | 18 tests, seis contra los reportes reales de Python |
| [`ai-ui/src/cochlea-demo.ts`](../../ai-ui/src/cochlea-demo.ts) | El scope del demo, y un tercer eigensolver independiente |
| [`ai-ui/test/cochlea-demo.test.ts`](../../ai-ui/test/cochlea-demo.test.ts) | El test anti-deriva entre el demo y el proyecto |
| [`projects/coclea-sr/`](../../projects/coclea-sr/) | La carga de trabajo, sus gates, su ledger y sus decisiones |
