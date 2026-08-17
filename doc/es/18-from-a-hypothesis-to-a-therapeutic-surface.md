# 18 · De una hipótesis a una superficie terapéutica

> **Referencia.** Todo lo de abajo corrió, o está marcado como que no corrió.
> [`projects/coclea-sr/`](../../projects/coclea-sr/) tiene **26 gates / 125
> chequeos, todos verdes [ran]**, una hipótesis falsada por su propio brazo de
> control **[ran]**, y una sección de patologías cuya afirmación de
> discriminación está ella misma gateada **[ran]**. `ai-base`, `ai-flows` y
> `ai-ui` corren 605 tests propios **[ran]**.
>
> Este capítulo es el que responde *"¿para qué sirve realmente un OS
> multi-agente?"* con un ejemplo trabajado en vez de con un argumento. También es
> el capítulo con más en contra, y §8 es donde eso vive.

## La afirmación, escrita para poder discutirla

Una hipótesis de biofísica de ~1995 —que el ruido ayuda al oído a detectar señales
demasiado débiles para cruzar un umbral— se llevó de punta a punta sobre este
sistema: planteada como matemática, simulada, **encontrada apoyada sobre un modelo
equivocado**, reparada contra una condición registrada antes de la reparación,
medida, acotada, y finalmente convertida en un conjunto de afirmaciones falsables
sobre patologías y su tratamiento.

La afirmación no es que los agentes hicieron ciencia. Es más angosta y es
verificable:

> Un sistema multi-agente con **verdad generada independientemente** y **promoción
> gateada por evaluación** puede llevar una pregunta de investigación real a través
> de la etapa en la que el propio autor de la pregunta estaba equivocado — y puede
> hacerlo de un modo en que el error es la salida registrada y no un relato
> posterior.

La condición de falsación está sobre la mesa: si la falla del modelo la hubiera
encontrado una persona mirando gráficos, o si la reparación se hubiera aceptado
porque *parecía* fisiológica, nada de esto sería evidencia de nada. §3 es
exactamente sobre ese momento.

## 1 · Plantear la biofísica como matemática verificable

La cóclea es una estructura mecánica graduada dentro de un fluido. Las frecuencias
altas pican cerca de la base, las bajas viajan hacia el ápice; un sonido complejo
se descompone mecánicamente antes de que nada llegue a un nervio. Escrito, eso es
un problema de Sturm-Liouville con coeficientes variables, un extremo fijo y uno
libre.

Lo que lo volvió tratable para agentes no es la matemática. Es una regla de
directorios:

> **`truth/` no puede importar `src/`.**

Las formas cerradas —sympy y mpmath— viven en `truth/`. El solver vive en `src/`.
Un gate compara uno contra otro, y la regla significa que el valor contra el que
un gate chequea **no puede ser producido por el código bajo prueba**. Son cuatro
palabras de política y son la estructura portante de todo el proyecto, porque son
lo que hace que un gate verde signifique algo distinto de auto-consistencia.

Lo que eso compró, concretamente **[ran]**:

| | contra qué | medido |
|---|---|---|
| autovalores uniformes | `ω_n = (2n−1)πc/2L` | `9.28e-6` |
| perfil exponencial | raíces de `tan βL = −2β/α` | `2.31e-6` |
| varianza estocástica | la solución de Lyapunov | dentro del error de muestreo |
| el óptimo de RE, 0-D | tasa de cruces de Rice, `σ_opt = θ/2` | `9.5%` |
| línea de transmisión | `P = sin(k(1−x))/sin(k)` | `7.3e-7`, orden `2.00` |
| balance de potencia | entrada en el estribo = disipación | residuo `4.3e-8` |

Ninguno de esos números se negocia con lenguaje. Esa es la propiedad que se
compra. **La conservación de la energía no toma en cuenta lo persuasivo que sea un
agente.**

## 2 · Simularlo, y la parte que no es la simulación

El solver no tiene nada de notable, y está bien así: volúmenes finitos, proyección
modal, y un tratamiento exacto de OU donde Euler-Maruyama habría costado 45.8% de
sesgo en el paso de producción que la propia especificación indicaba **[ran]**.

Lo que sí vale la pena reportar es que **el pipeline de medición necesitó más
gates que la física.** De los veintiséis del proyecto, cerca de la mitad chequean
el instrumento y no el modelo: ¿el análisis recupera un óptimo conocido en un
juguete donde la respuesta está fijada? ¿El estimador de interacciones recupera
una interacción de tamaño conocido, y no reporta ninguna cuando no hay? ¿Holm
efectivamente saca algo, o la corrección es un no-op con nombre?

La razón está en [`projects/coclea-sr/README.md`](../../projects/coclea-sr/README.md),
en *"Nine ways the instrument lied"*. Cada una de esas produjo un número que
parecía evidencia. **Ninguna se detectó leyendo el código.** Cada una se detectó
corriéndolo y desconfiando del primer resultado — un benchmark de memoria cuyo
baseline ya sacaba 10/10 y por lo tanto no podía moverse; un gate atado a un modo
de falla que habría cancelado un experimento por un sujeto que fallaba del otro
modo; un gate de convergencia cuyo propio piso de precisión subía tan rápido como
bajaba el error que medía.

Si hay un hallazgo transferible para cualquiera que construya agentes para
ciencia, es ese, y no es glamoroso: **el instrumento es donde ocurre la mentira.**

## 3 · El modelo estaba mal, y cómo se encontró

Esta es la sección portante.

El primer operador era cercano a la idea de 1995: una cuerda graduada, la tensión
de la propia membrana llevando la onda, masa y rigidez variando con la posición.
Elegante, y varios gates de bajo nivel pasaban sobre él.

No se comportaba como una cóclea. La onda viajera moría antes de llegar al lugar
donde el mismo modelo decía que debía picar. Medido, la respuesta caía **veintiocho
órdenes de magnitud** antes de llegar **[ran]**.

La razón era un signo que ninguna elección de parámetros mueve. En una cuerda, la
impedancia de la membrana está en el **numerador** del número de onda local — así
que la onda se bloquea exactamente donde la membrana es rígida, que es por donde
tiene que entrar. Una línea de transmisión con fluido pone la misma impedancia en
el **denominador**, y entonces los signos salen bien *por la razón física*:
propagante basal al lugar característico, longitud de onda colapsando ahí,
evanescente apical. El pico de Békésy como consecuencia y no como entrada.

Tres cosas sobre cómo salió eso, y cada una es ahora una regla:

**La condición de aceptación se escribió antes de construir el reemplazo.** El
operador nuevo tenía que producir propagación en la dirección fisiológica correcta
y la relación frecuencia-lugar correcta. Registrado primero, implementado después,
corrido al final.
[ADR-0002](../../projects/coclea-sr/decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md).

**Los rediseños se contaron.** Tres cambios de modelo en una sesión —un término de
acoplamiento absorbido, hecho explícito, y reescalado— cada uno acercando el
instrumento a la respuesta que quería. El tercero es donde se para y se registra la
falsación en vez de tomar el cuarto. *"Una vez está bien, dos es sospechoso, y a la
tercera está buscando el resultado en vez de medirlo."*

**La alternativa es lo que la regla evita.** Si la onda viajera invertida se
hubiera descubierto *después* de construir encima la capa estocástica, todos los
números de arriba habrían quedado nulos.

## 4 · El resultado, y sus dos fronteras

Recién después de que la mecánica y el pipeline sobrevivieran sus gates se corrió
la pregunta de 1995.

**La resonancia estocástica está, y está donde la teoría dice.** Tres frecuencias
de excitación, ocho posiciones, ruido barrido en cada una: la SNR contra ruido
muestra un máximo interior cuyo intervalo del 95% despeja ambos extremos de la
grilla — **24 curvas de 24 [ran]**. El óptimo medido cae a **11.6% de la predicción
sin parámetros `σ_opt = θ/2`**, que es medio espaciado de grilla: emparejado con la
resolución del instrumento. Toda cantidad libre —intensidad de ruido, amortiguación,
amplitud de excitación, la constante de la SNR— se cancela en esa predicción, así
que no queda nada que ajustar para forzar el acuerdo.

Y después las dos fronteras, que valen más que el resultado:

**Frecuencia.** Puenteando a la fisiología del nervio auditivo vía tasa espontánea,
el régimen es alcanzable **sólo hasta una frecuencia característica de unos 1 kHz
[ran]**. Por encima no es compatible con los propios supuestos del modelo. La
hipótesis se angostó de *"el oído usa ruido"* a *"acá está el régimen donde el
mecanismo sobrevive, y acá donde este modelo dice que no debería"*.

**Selectividad.** El `Q` de la membrana pasiva es 2.2–2.7 **[ran]**; una cóclea viva
es mucho más selectiva. Esa brecha se reporta en vez de ajustarse, y es el argumento
cuantitativo para la capa activa — que es lo que hizo posible §5.

Una más, del experimento de interacción: el ruido mecánico y el neuronal ayudan cada
uno por separado, pero su interacción medida es **negativa — sub-aditiva, −1.22 dB,
IC [−1.58, −0.87] [ran]**. No la cooperación que la intuición esperaba.

## 5 · De un modelo corregido a una superficie terapéutica

Acá está la parte que nos sorprendió, y es consecuencia de §3 y no de un plan.

La cuerda tenía dos perillas: la tensión y la masa de la propia membrana. **Ninguna
intervención alcanza ninguna de las dos.** La línea de transmisión metió el *fluido*
dentro del operador —geometría de las escalas, masa arrastrada, pérdida viscosa— y
el fluido es precisamente sobre lo que actúa un diurético o un agente osmótico. La
capa activa agregó `μ_H`, la distancia al punto de Hopf, que el salicilato y la
furosemida ya mueven en humanos, reversiblemente, hoy. El detector de umbral agregó
`θ`.

O sea: el modelo falsado fue reemplazado por uno con **superficie terapéutica**. La
falsación compró la sección.

[`PATHOLOGIES.md`](../../projects/coclea-sr/PATHOLOGIES.md) fija la regla: *una
patología es una transformación de los parámetros que el modelo ya tiene, y nada
más*. Ningún término nuevo, ninguna ecuación nueva, ninguna constante ajustada.
`Lesion()` con todos los valores por defecto **es** una cóclea sana, así que una
lesión es literalmente el diff — y el control nulo sale gratis.

Siete lesiones, y la tabla se lee por sus **ceros**: lo que identifica una lesión no
es la columna que se movió sino las cinco que no **[ran]**:

| lesión | perilla | CF | Q | sensibilidad | compresión | rodilla | ruido óptimo | oscila |
|---|---|---|---|---|---|---|---|---|
| sana | — | 1.000 | 1.000 | 0 dB | 0.365 | 0.0028 | 0.500 | no |
| conductiva | `drive` | 1.000 | 1.000 | **−20.0 dB** | 0.365 | 0.0028 | 0.500 | no |
| pérdida CCE | `μ_H` | 1.000 | 1.000 | 0 dB | **0.811** | **0.354** | 0.500 | no |
| bloqueo prestina | `μ_H` | 1.000 | 1.000 | 0 dB | **0.638** | **0.089** | 0.500 | no |
| hidrops | `β,S,M` | **1.117** | **1.056** | **−3.9 dB** | 0.365 | 0.0028 | 0.500 | no |
| sinaptopatía | `θ` | 1.000 | 1.000 | 0 dB | 0.365 | 0.0028 | **0.900** | no |
| sobrepasada | `μ_H`>0 | 1.000 | 1.000 | 0 dB | — | — | 0.500 | **sí** |

**La discriminación está ella misma gateada.** GATE-D1 chequea tres cosas, y las
dos últimas son las que le dan sentido a la primera: seis firmas distintas de siete;
una lesión que no cambia nada reproduce la referencia con `0.0` en cada componente;
y **ningún observable individual separa el catálogo** (máximo por columna: 3 valores
distintos de 7), así que el patrón es portante y no decorativo. Probado en vez de
asumido: si se le saca la lesión al hidrops, colapsa sobre sana y el gate se pone
rojo **[ran]**.

La única colisión —`pérdida CCE` y `bloqueo prestina`— se **afirma, no se excluye**.
Son un mismo eje a dos profundidades, y ninguna medición instantánea separa dos
puntos de un eje. Un gate que sacara ese par de la comparación pasaría igual de bien
sobre un modelo que hubiera colapsado las siete lesiones en una sola perilla, que es
la falla que el gate existe para atrapar.

### Lo que el modelo dice entonces sobre tratamiento

Cuatro direcciones, cada una con su falsador y cada una con un campo normativo *"lo
que el modelo no puede decir"* — sin ese campo la dirección no se publica. La más
barata no necesita ninguna terapia nueva:

    ganancia ∝ |μ_H|^(−1)     →  un retroceso 10× desde la criticidad cuesta 20 dB
    rodilla  ∝ |μ_H|^(+3/2)   →  el mismo retroceso mueve la rodilla 31.6×

Mismo parámetro, potencias distintas. **La rodilla de compresión es 1.5× más
sensible en términos logarítmicos que el audiograma**, y la pendiente entrada/salida
de un producto de distorsión otoacústico es una medición clínica estándar. El modelo
dice que un protocolo de monitoreo de ototoxicidad debería mirar la pendiente, no el
umbral. Es una afirmación que un clínico puede atacar con datos que ya existen.

Y el riesgo, que es el ejemplo más claro de esta página de por qué valía la pena
construir un *mecanismo*: toda terapia que restaure el amplificador empuja `μ_H`
hacia cero, y cero es la bifurcación. Del otro lado el oscilador corre sin entrada
—emisión espontánea, y el tinnitus tonal que a veces la acompaña—.

> El objetivo es un punto que el tratamiento tiene que acercar y no cruzar, y el
> modo de falla del otro lado es un **síntoma**, no una ausencia de beneficio.

Un modelo ajustado a resultados no podría decir eso, porque la falla vive del otro
lado de un borde que los datos no contendrían.

## 6 · Quién hizo qué — agentes, humanos, y los dos juntos

El roster son ocho roles, y la separación es el diseño y no la decoración: un
**Derivador** produciendo referencias analíticas independientes, un **Constructor**
implementando solvers, un **Verificador Matemático** y un **Verificador
Estadístico** atacándolos desde direcciones distintas, **Exploradores** barriendo,
un rol de **Literatura** comparando contra fisiología, un **Sintetizador**, y un
**Auditor** sobre procedencia.

Honestamente, igual, la división del trabajo que importó no fue agente-contra-agente:

**Los agentes hicieron bien:** derivar formas cerradas y chequearlas simbólicamente;
escribir los solvers; barrer parámetros; encontrar las causas *numéricas* de las
fallas — que un tratamiento de borde no divida por dos el volumen de control en un
extremo libre es exactamente el tipo de defecto que un modelo diagnostica rápido y
una persona no ve a las 2 de la mañana.

**Los agentes hicieron mal, repetidamente:** decidir cuándo un rediseño se había
vuelto búsqueda de resultado; notar que un gate no podía fallar; notar que el
baseline de un benchmark ya estaba en el techo. Cada una de las nueve fallas de
instrumento se atrapó *corriendo* algo y desconfiando del número, nunca con un
agente leyendo su propio diseño.

**La contribución humana que ninguna disposición de agentes reemplazó** fue rechazar
el resultado plausible: parar cuando los gráficos parecían fisiológicos pero la onda
corría al revés, y decidir que una falsación era la salida y no un contratiempo.

**Y la forma que hizo funcionar al par** es `Gated`: agentes libres de explorar,
cambiar ecuaciones, reescribir solvers, producir artefactos que después resultan
equivocados — pero un artefacto no puede volverse dependencia de trabajo posterior
hasta que sobrevive sus gates. Los errores siguen siendo fáciles de crear y se
vuelven difíciles de preservar.

## 7 · El sistema midiéndose a sí mismo

El proyecto es también la carga de evaluación de ai-os, y se comporta como tal.

Correr §7.4 —la curva costo/calidad del ratio explorador:verificador— contra el
stack vivo hizo aparecer de inmediato un defecto real en `ai-flows`: un intento
quedó `running` durante **3.316 segundos** mientras el flow reportaba `waiting`, que
es el mismo estado que reporta un flow sano **[ran]**. Corregido con un reaper de
intentos colgados, tres tests. Ese es el punto de tener una carga con oráculo: es
carga que una tarea en prosa nunca genera.

Encontró un segundo en la corrida siguiente, y este es más filoso: **la etiqueta de
precio destruyó la medición**. Una falla transitoria de DNS en el endpoint de costo
salió por excepción desde `spend_so_far` en la línea *posterior* a que el flow
terminara, descartando una respuesta ya medida porque no se pudo leer su precio. La
sonda ahora reintenta y devuelve `null` — un costo faltante es un costo faltante, y
la fila conserva su respuesta.

Dos correcciones de instrumento se hicieron **antes** de que llegaran los datos de
ese experimento, y las dos están registradas en vez de aplicadas en silencio: la
métrica de retractación estaba sesgada por brazo (5 pares explorador-verificador en
5:1 contra 9 en 1:1, así que sube con la cantidad de verificadores se atrape algo o
no), y la atribución de costo por flow se apoya en un endpoint que no está cruzado
contra otro que lo contradice.

La primera rindió de inmediato. La **única** retractación marcada de toda la corrida
fue un verificador que dijo "WRONG" en prosa y después produjo un número que
coincidía con los exploradores dentro de un décimo de la tolerancia. La métrica
sesgada la cuenta al 25%; la insesgada reporta 0%. Un verificador que dice WRONG y
después coincide no retractó nada — produjo prosa que una métrica atada a la prosa
va a contar.

## 8 · Lo que esto no muestra

La sección con más en contra, completa.

**No se mostró que la cóclea use resonancia estocástica.** Un modelo computacional
no puede establecer eso. Lo que el experimento muestra es que el mecanismo sobrevive
dentro de este modelo, reproduce la firma pre-registrada, y genera predicciones
comparables con fisiología.

**Ninguna afirmación acá se comparó contra datos de pacientes.** §5 es un conjunto
de hipótesis derivadas del modelo. `μ_H = −0.02` para una cóclea sana es un posit
sin derivación; dos de las siete lesiones están parametrizadas a mano; y el modelo
ya está en desacuerdo con la clínica en al menos un punto que encontramos (*afina*
la sintonía bajo hidrops donde Ménière la ensancha). Las tres cosas están en
[PATHOLOGIES.md §4](../../projects/coclea-sr/PATHOLOGIES.md) y en
[ADR-0006](../../projects/coclea-sr/decisions/0006-pathology-as-a-parameter-transform.md).

**La justificación habitual de la arquitectura es más débil de lo que suponíamos, y
lo descubrimos nosotros.** Un experimento acompañante testeó si un modelo frontier
puede atrapar resultados de física fabricados y sutilmente defectuosos. Los atrapó
**todos** —doce fabricaciones burdas y nueve defectos numéricos sutiles— y nombró
causas al nivel de *"el tratamiento de borde en el extremo libre no divide por dos
el volumen de control"*. Así que "el modelo no se da cuenta" **no** es el argumento
para los gates. Lo que sobrevive es más angosto: un modelo puede *juzgar* una tarea
pero no puede *generarla* con respuesta conocida (no se crea verdad afirmándola), y
un juez que acierta siempre igual no te entrega ledger, ni freeze, ni comando de
reproducción.

**Y nuestro propio experimento de ratio volvió nulo.**
[E7](../../projects/coclea-sr/experiments/E7-RESULTS.md) midió si más agentes
verificadores y menos exploradores compran corrección. Diez flows, cuarenta
afirmaciones de agentes, tres brazos: **100% de acierto en todos, cero
correcciones, 0% de disenso por verificador**. La verificación no compró nada
porque nunca hubo nada equivocado — la dispersión completa entre todos los agentes
fue 0.034 contra una tolerancia de 0.25.

La tarea estaba diseñada para que razonar desde los docstrings dé la respuesta
equivocada y medir dé la correcta. Cuarenta de cuarenta **midieron**. Eso es un
hallazgo levemente alentador sobre el modelo, y fatal para el experimento: el
baseline estaba en el techo, así que todos los brazos empataron, y un empate se
lee como resultado.

La regla que lo habría atrapado está en el propio `CLAUDE.md` de este repositorio
—*chequear el headroom antes de construir el tratamiento, nunca después*— y un
solo flow de control, corrido antes de comprar los otros nueve, lo habría dicho.
**Escribir una regla no es lo mismo que aplicarla**, y eso es lo más útil que
produjo este experimento.

**Una convención se aflojó:** los docs 15–18 no tienen ilustración, y 00–14 sí.
Registrado en vez de dejado caer en silencio.

## 9 · Reproducirlo

```bash
cd projects/coclea-sr
.venv/bin/python -m pytest gates/ -q      # 26 gates, 125 chequeos, ~9 min
.venv/bin/python gates/check_reports.py   # reportes sin test detrás
python3 verify_ledger.py                  # la cadena de hashes, sólo stdlib
python3 render_evidence.py                # report/evidence.html, desde el ledger
```

Cada corrida aceptada registra sus parámetros, semilla, estado del código y hashes
de dependencias. Las transiciones de artefactos van a un ledger append-only
encadenado por hash. Las figuras llevan su run id, hash de resultado y commit **en
los metadatos del propio PNG**. Los directorios de corrida son direccionados por
contenido, así que una re-corrida con números distintos no puede pisar una atestada.

El sentido de toda esa maquinaria es una pregunta que vale más que este proyecto:

> ¿Y si la reproducibilidad fuera una propiedad del instrumento en vez de una
> promesa hecha después del experimento?

Hoy el artefacto final de la ciencia es un paper, y el código, las semillas, los
modelos descartados y las decisiones intermedias viven en otro lado si es que
sobreviven. Para la ciencia computacional no hay razón para que eso siga siendo así.
El artefacto puede ser ejecutable — hipótesis, supuestos, derivaciones,
implementación, *las implementaciones que se descartaron*, los gates, las corridas
crudas, las semillas, la cadena de procedencia, y el camino exacto por el que una
afirmación llegó a aceptarse.

Un revisor no sólo leería la conclusión. Podría reconstruirla.

---

**Relacionados.** [16 · Una carga de trabajo con oráculo](16-a-workload-with-an-oracle.md)
es por qué este proyecto está acá. [17 · Nace un proyecto](17-a-project-is-born.md)
es cómo se dotó y amuebló desde el escritorio.
[`projects/coclea-sr/`](../../projects/coclea-sr/) es el trabajo en sí;
[`PATHOLOGIES.md`](../../projects/coclea-sr/PATHOLOGIES.md) es el §13 de la
especificación.
