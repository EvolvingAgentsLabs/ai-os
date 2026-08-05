# 11 · Elegir un modelo — el lift no es el número que decide

<img src="../assets/11-choosing-a-model.jpg" alt="" width="100%">

<sub>Dos lifts que parecen resultados. La distancia entre sus cimas es el único número que decide — y cambia de signo.</sub>

> **Estado: estimadores implementados y testeados. No se corrió ninguna comparación
> de modelos.** `stats.ts`, `conformance.ts` y `tasks/physics.ts` — 97 tests **[ran]** en
> 73 en todo `ai-flows`. Todavía no hay suite de tareas ni un segundo modelo, y
> este documento tiene cuidado de decir qué está citado y qué está medido.

## La pregunta, y la trampa que tiene adentro

¿Puede un modelo chico detrás de un buen harness reemplazar a uno de frontera?

El reflejo es medir el lift del harness: puntuar el modelo chico pelado, después
con tools, subagentes, memoria y contexto estructurado, y leer la diferencia. Ese
número siempre es grande y siempre es al lado de la cuestión.

**Tu competidor también corre un harness.** Así que la comparación que decide algo
es `chico+harness` contra `frontier+harness`, y el chico cierra la brecha solo si
el harness lo levanta *más*. Esa diferencia de diferencias — el **término de
interacción** — es la cantidad, y puede estar cerca de cero con ambos lifts
enormes.

```
                    pelado       harness        lift
  chico              0.03          0.90        +0.87
  frontier           0.14          0.88        +0.74
                                     interacción       +0.13
```

Dos lifts que cada uno daría para un blogpost, y una decisión que cuelga del
tercer número.

## Tres cosas que la literatura ya resolvió

Pagadas leyendo, no con GPU.

**El signo se da vuelta con la dificultad.** Una comparación controlada y
pre-registrada — tres scaffolds × cinco modelos × GAIA niveles 1 y 2, tareas
fijas, tres intentos por pregunta ([arXiv:2606.08529](https://arxiv.org/abs/2606.08529))
— reporta que la predicción de que los modelos más capaces son menos sensibles al
scaffold *"queda rechazada en dirección"*: el modelo más capaz **ganó más** con
scaffolds estructurados en el nivel difícil, y el escalonamiento por tier se
sostuvo solo en el nivel fácil. Sustitución en trabajo fácil, complementariedad en
trabajo difícil.

**Entonces un término de interacción agrupado no es un hallazgo.** Puede quedar en
cero mientras el efecto es fuertemente positivo en tareas fáciles y fuertemente
negativo en difíciles. `interactionByStratum` y `crossingPoint` existen porque
**el punto de cruce es el límite de producto**: abajo una flota chica es
defendible, en él y arriba el frontier se despega más cuanto mejor sea tu scaffold.

**La estructura de la tarea decide más que la elección del modelo.** La
coordinación multiagente da **+80.9%** en tareas descomponibles y **−39% a −70%**
en razonamiento secuencial; un orquestador que valida contiene la amplificación de
error en **4.4×** contra **17.2×** de agentes paralelos independientes; y la
arquitectura se predice desde la estructura de la tarea con R² = 0.513, acertando
en 87% de tareas no vistas
([Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/)).

**La composición por paso tiene respaldo.** El éxito de agentes en tareas largas se
modela bien con una tasa de falla constante por paso — decaimiento exponencial,
cada agente con su vida media ([arXiv:2505.05115](https://arxiv.org/abs/2505.05115)).
Eso es `r^h`, la misma ley que `(1−δ)^w` en [10](10-observability.md). El autor
marca la generalización como desconocida, así que `calibrateCompounding` la chequea
sobre datos reales en vez de asumirla.

## Lo que apareció al construirlo **[ran]**

El estimador tiene un modo de falla que nadie predijo, y falla en la dirección
cara.

El log-odds está indefinido en 0 y 1, así que las celdas se corrigen sumando ½
antes de la transformación. Esa corrección también *encoge* los extremos — y
encoge un brazo cerca del piso distinto de uno cerca del techo. Los dos lifts
quedan comprimidos de manera desigual y la diferencia de diferencias hereda la
distancia.

Medido contra una construcción cuya interacción verdadera es **exactamente cero**:

| pasos por ítem | 4 | 8 | 16 | 32 | 64 | 128 |
|---|---|---|---|---|---|---|
| interacción medida | **+0.597** | **+0.394** | **+0.211** | +0.067 | −0.002 | −0.001 |
| ¿supera el cero? | **sí** | **sí** | **sí** | no | no | no |

Las tres primeras columnas son falsos positivos, y todas apuntan hacia *"enviá la
flota chica"*. Una evaluación con ocho observaciones por ítem habría producido una
respuesta confiada, equivocada y cara — a partir de un harness que no hace nada.

Treinta y dos es donde volvió el nulo; sesenta y cuatro recupera el signo casi
exacto (−1.248 contra −1.221, +1.199 contra +1.221). Por eso
`MIN_STEPS_PER_ITEM = 32`, y cada `Interaction` lleva `minStepsPerItem` y una
bandera `underpowered`. **Un resultado decisivo bajo esa bandera no es evidencia**,
y la bandera viaja con el número para que nadie lea el veredicto sin lo que lo
invalida — la misma regla que [10](10-observability.md) aplica a δ.

## La falla silenciosa que se ve igual que un hallazgo

`conformance.ts` es una compuerta, no un diagnóstico, y existe por un motivo
puntual.

Un adaptador puede fallar sin levantar nada: un modelo que contesta bien en prosa
y nunca llama a la tool, una respuesta cuyo contenido cae en un campo que quien
llama no lee, degradación que solo aparece cuando se acumula historial.

Si las tool calls se descartan en silencio, **todas las condiciones con harness
puntúan como peladas**. El lift desaparece, la interacción se va a cero, y el
resultado es indistinguible de un hallazgo honesto de que el harness no ayuda a
ese modelo. Nada en la estadística puede notar la diferencia.

Entonces: cinco chequeos, todos fallando ruidoso; el resultado asentado al lado de
la evaluación que autoriza; y un **vencimiento de 24 horas**, porque un endpoint
local se puede reiniciar con otra cuantización de un día para el otro y el eval
nunca se enteraría. Una evaluación cuyo adaptador no fue verificado no es
evidencia.

## Qué se sigue para el producto

No un veredicto enviar / no enviar. Una restricción de diseño, y cada cláusula la
carga un número de arriba:

> **Una flota de modelos chicos es viable para saltos cortos, verificables y
> descomponibles detrás de un orquestador que valida. No es viable como cadena
> larga, autónoma y secuencial.**

Cortos: los modelos de frontera aciertan en <10% de las tareas que a un humano le
llevan más de cuatro horas ([METR](https://metr.org/blog/2026-1-29-time-horizon-1-1/)).
Verificables: la corrección solo funciona donde los estados intermedios se pueden
chequear. Descomponibles: +80.9% contra −70%. Orquestador que valida: 17.2× → 4.4×.

La mitad negativa está sobre-determinada — el gap remanente entre abierto y
cerrado se concentra en razonamiento, contexto largo y capacidad agéntica
([Epoch](https://epoch.ai/data-insights/open-closed-eci-gap)), lo multiagente
degrada el trabajo secuencial, la complementariedad favorece al frontier en tareas
difíciles, y el error por paso compone. Cuatro resultados independientes, una
misma dirección.

## La suite de tareas: menos equivocado, medido **[ran]**

Los estimadores necesitaban de qué estimar, y el workload tenía un requisito duro
— un oráculo exacto, para que un desacuerdo sea del modelo y no del corrector.
`ai-flows/src/tasks/physics.ts` arma uno con sistemas físicos donde una primera
aproximación está equivocada, un modelo más completo está *menos* equivocado, y
los dos se computan con precisión de máquina.

La forma es la de *La relatividad del error* de Asimov: la Tierra plana está
equivocada, la esfera está equivocada, el esferoide achatado está equivocado, y el
error se achica. La energía cinética newtoniana no es falsa — es el término
principal de la relativista. Un péndulo no es un oscilador armónico, pero a cinco
grados no se nota.

Cuatro sistemas, cada uno con su límite lineal: período del péndulo (ángulo chico
→ elíptica exacta), energía cinética (Newton → relatividad), población
(exponencial → logística), caída (vacío → arrastre lineal).

**La dificultad deja de ser una etiqueta y pasa a ser aritmética.** Una tarea pide
una respuesta dentro de una tolerancia relativa τ, y si la primera aproximación
supera τ se *calcula*:

| | |
|---|---|
| **L1** | el modelo lineal ya cumple τ |
| **L2** | no cumple, pero por menos de 10× τ |
| **L3** | falla por más de 10× τ — solo sirve el modelo completo |

Eso importa más de lo que parece. La estratificación que decide dónde cambia de
signo el término de interacción ahora se apoya en un cálculo y no en la opinión de
alguien sobre qué es difícil. Y **barrer τ sube la misma pregunta física por la
escalera sin cambiar de tema** — mismo sistema, mismos parámetros, misma redacción,
solo se mueve la precisión pedida — lo que descarta el confundidor que la mayoría
de las estratificaciones por dificultad no puede descartar.

Con 128 tareas los niveles quedan cerca de L1 65 / L2 21 / L3 42, estable entre
semillas, y con todos los sistemas presentes en todos los niveles.

**Las tools pasan a ser determinantes**, que es la otra razón por la que esta suite
funciona: una integral elíptica a seis cifras no es algo que un modelo haga en
prosa. Una condición pelada genuinamente no puede lo que puede una con sandbox, así
que el lift de harness que se mide es real y no simulado.

**Y la tasa de error no detectado se vuelve medible.** Todo prompt permite responder
`UNSURE`. Un número equivocado dicho con confianza es un error *no detectado*; la
misma equivocación señalada es *detectado*. Esa distinción normalmente es difícil de
instrumentar y acá es una rama del corrector. `errorReduction` reporta cuánto menos
equivocada está una respuesta que el modelo lineal — 1 si es exacta, 0 si apenas
reproduce la aproximación, **negativa si hace algo peor que no modelar la no
linealidad.**

### Dos bugs del oráculo que cacharon los tests

Los dos en el mismo lugar, y los dos habrían corrompido justamente las tareas L1.

La forma relativista de manual `(1/√(1−β²) − 1)·c²` resta de 1 un número apenas
mayor que 1 a baja velocidad, destruyendo unos once dígitos significativos antes de
multiplicar los restos por `c²`. La forma de arrastre de manual diferencia dos
valores cerca de 3×10⁹ para recuperar una caída de 44 m, y devolvía 42.05. A los dos
los cacharon tests que afirman que la aproximación es el límite correcto — no una
inspección.

Reescritas sin la cancelación (`β²/(s(1+s))`, y el corchete de arrastre por serie
debajo del cruce), la corrección relativista ahora sigue su predicción analítica ¾β²
a lo largo de siete órdenes de magnitud.

**En ambos casos el régimen de falla era el límite donde el modelo simple es casi
correcto** — así que una suite construida para medir cuánto menos equivocado está el
modelo difícil habría estado corrigiendo contra ruido exactamente donde la respuesta
fácil era correcta.

### Qué no es esta suite

Sistemas de manual, y un modelo puede haber memorizado el método. Los parámetros se
sortean para que la *respuesta* haya que computarla y no recordarla, pero el enfoque
no le es novedoso a nadie. **Es una suite de calibración del instrumento y una
primera lectura de dónde cae el punto de cruce. No es un workload legal ni
literario**, y un resultado acá se transfiere a esos como hipótesis, no como
evidencia.

## Cómo se falsifica

**Los estimadores** se falsifican con su propia calibración: tienen que recuperar
el signo de una construcción conocida a lo largo de las fuerzas de sustitución, y
devolver el nulo cuando el harness es neutral respecto de la capacidad. Eso es un
test, corre en CI, y es lo que cachó el sesgo de encogimiento de arriba.

**El programa por paso** se falsifica si `r^h` no predice el éxito de trayectoria
— si las fallas están correlacionadas entre pasos en vez de ser independientes.
`calibrateCompounding` reporta observado contra predicho por cantidad de saltos; un
error absoluto medio grande significa que la medición por paso no compone, que la
trayectoria tiene que ser la unidad después de todo, y que los tamaños de muestra
que eso cuesta son los que quedan fuera de alcance. **Testearlo en la primera
suite real, sin costo extra.**

**La conclusión de producto** se falsifica si un modelo chico detrás de un
orquestador que valida aguanta trabajo secuencial largo en un workload real,
contra cuatro resultados que predicen que no. Sería el desenlace más interesante
disponible acá.

## Qué no está construido

Dicho en presente, por la regla de casa 3.

- **No se corrió contra ningún modelo.** La suite existe y corrige bien; nada fue
  puntuado con ella. El paso siguiente es un workload real etiquetado por tiempo
  humano, secuencial contra descomponible, y verificabilidad — tres etiquetas, sin
  modelos, y entre ellas predicen la mayor parte de la respuesta.
- **No hay segundo modelo.** `deepseek/deepseek-v4-flash` corre en `pi` y su δ está
  medido ([10](10-observability.md)). Nada más está cableado, y **ningún modelo
  local pasó conformidad, porque no hay ninguno corriendo.**
- **No hay ε ni u.** Error de tarea y tasa de falla silenciosa necesitan un oráculo
  por tarea.
- **Las trayectorias todavía no son flows.** Deberían serlo cuando exista el motor
  de M2: un `Flow` con *h* steps **es** una trayectoria de *h* saltos, y
  `Attempt.observation` ya es el registro por paso (ADR-0007). Ahí `r` sale de
  `flow_attempts` en vez de ajustarse, el eval mide el sistema que se shippea en
  vez de una simulación, y se convierte en el harness de falsación que
  [03](03-ai-flows.md) ya debe. **Nada de esto puede demorar M2.**
