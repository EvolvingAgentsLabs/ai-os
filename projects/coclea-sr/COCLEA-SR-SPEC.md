# COCLEA-SR: Modelo de la Membrana Basilar como Decodificador de Frecuencia con Resonancia Estocástica

## Especificación completa para desarrollo con Claude Code sobre harness multi-agente (ai-os / EvolvingAgentsLabs)

**Versión:** 1.0
**Fecha:** 2026-08-13
**Autor del modelo original (~1995):** Matias — hipótesis de resonancia estocástica como mecanismo de detección de señales subumbral en la cóclea
**Propósito de este documento:** servir como fuente de verdad única (single source of truth) para un desarrollo completo con Claude Code: fundamentos matemáticos, discretización numérica, arquitectura de agentes, gates de verificación, métricas y plan de implementación por fases.

> **Nota de implementación, 2026-08-14.** Este documento se conserva **sin
> modificar**. Donde la implementación diverge de él —porque el documento se
> contradice a sí mismo, o porque una hipótesis suya fue falsada al correrla— la
> divergencia está en `decisions/` y en el docstring del módulo que la toma,
> nunca editando este archivo. Ver `README.md` para el estado medido.

---

## 0. Resumen ejecutivo

Modelamos la membrana basilar (MB) de la cóclea como una **cuerda/cinta 1D con densidad de masa y rigidez variables**, con **extremo fijo en la base** (ventana oval) y **extremo libre en el ápex** (helicotrema). Este sistema pasivo es un **decodificador natural de frecuencia** (mapa tonotópico): cada frecuencia de entrada produce máxima amplitud en una posición característica x_cf(ω).

La hipótesis central (formulada por el autor hace ~30 años, hoy respaldada por literatura de resonancia estocástica en mecanorreceptores y sistemas auditivos): **el ruido fisiológico de fondo** — observable como actividad basal en potenciales evocados sin estimulación — **no es un defecto sino un mecanismo funcional**: mediante **resonancia estocástica (RE)**, permite que desplazamientos periódicos débiles y subumbrales de la MB crucen el umbral de disparo de las neuronas del ganglio espiral y sean detectados.

El proyecto tiene doble objetivo:

1. **Científico:** reproducir computacionalmente (a) el mapa tonotópico del modelo pasivo con validación analítica, y (b) la firma canónica de RE — la curva en U invertida de SNR vs intensidad de ruido — en la cadena MB → célula ciliada → umbral neuronal. Fase 2 (especificada, no implementada en el MVP): capa activa con osciladores de Hopf.
2. **De infraestructura:** usar este problema como **benchmark de referencia del harness multi-agente ai-os**, con roles diferenciados (derivación, exploración, verificación, confrontación con literatura), *eval-gated freeze* (ningún resultado numérico se acepta si no reproduce los casos analíticos conocidos) y **salida atestada** (semillas, hashes, código pinneado), en la línea de la topología exploración/verificación demostrada por los avances recientes de Anthropic (36 h, 60 subagentes, verificación Lean) y OpenAI (certificados Lean para 10 resultados).

**Principio unificador:** la resonancia estocástica (ruido + umbral de selección → detección de señal débil) es estructuralmente el mismo principio que la exploración estocástica con verificación en harness de agentes. La cóclea y el harness son el mismo algoritmo en sustratos distintos.

---

## 1. Contexto físico-biológico

### 1.1 Anatomía funcional mínima

- La cóclea es un tubo enrollado (~35 mm desenrollado en humanos) dividido longitudinalmente por la **membrana basilar**.
- La MB varía sus propiedades mecánicas a lo largo de x (base → ápex):
  - **Ancho:** ~0.1 mm (base) → ~0.5 mm (ápex): crece ~5×.
  - **Rigidez (stiffness):** decrece ~2–4 órdenes de magnitud de base a ápex.
  - **Masa efectiva por unidad de longitud:** crece hacia el ápex (más ancho + carga hidrodinámica).
- **Condiciones de borde mecánicas efectivas:**
  - **Base (x=0):** acoplada al estribo vía ventana oval → forzamiento de entrada; para el análisis modal de la cinta la tratamos como **extremo fijo** (Dirichlet) con el forzamiento como término fuente o condición de borde inhomogénea.
  - **Ápex (x=L):** helicotrema, comunicación libre entre scala vestibuli y scala tympani → **extremo libre** (Neumann): ∂u/∂x(L,t) = 0.
- **Mapa tonotópico (Greenwood, 1990, humanos):**

  f(x) = A (10^{a(1 - x/L)} − k),  con A ≈ 165.4 Hz, a ≈ 2.1, k ≈ 0.88, L ≈ 35 mm

  Frecuencias altas resuenan cerca de la base; bajas cerca del ápex. La variación de masa/rigidez es aproximadamente **exponencial en x** — esto justifica los perfiles paramétricos de la §3.

### 1.2 Cadena de transducción

MB se desplaza → cizalla entre membrana tectoria y estereocilios de células ciliadas internas (CCI) → apertura de canales mecanotransductores → despolarización → liberación de glutamato → potencial de acción en neurona del ganglio espiral **si se supera un umbral efectivo**.

Punto crítico para la hipótesis: cerca del umbral auditivo, los desplazamientos de la MB son del orden de **~0.1–1 nm** — comparables o menores al ruido térmico/browniano de los estereocilios (~1–3 nm RMS). Un detector determinista con umbral fijo no dispararía. **La RE resuelve esta paradoja**: el ruido co-opera con la señal débil para producir cruces de umbral correlacionados con la fase de la señal.

### 1.3 Evidencia acumulada desde el análisis original (~1995)

- **RE en mecanorreceptores:** Douglass, Wilkens, Pantazelou & Moss (Nature, 1993) — mecanorreceptores de crayfish; Levin & Miller (Nature, 1996) — cercal system.
- **RE en el sistema auditivo:** ruido subumbral mejora la detección en células ciliadas y fibras del nervio auditivo; aplicaciones en implantes cocleares (adición de ruido mejora umbrales y codificación de envolvente).
- **Amplificador coclear activo:** la cóclea no es puramente pasiva. Células ciliadas externas (CCE) inyectan energía (electromotilidad, prestina). Formalización moderna: cada sección de la MB opera cerca de una **bifurcación de Hopf** (Hudspeth, Duke, Jülicher, Magnasco, ~1998–2001), lo que explica compresión no lineal (~120 dB de rango dinámico), selectividad aguda y otoemisiones espontáneas.
- **Síntesis conceptual (nueva, propia de este proyecto):** un oscilador en el punto crítico de Hopf es el régimen donde el ruido tiene máximo efecto constructivo. La RE (hipótesis original) y la criticalidad de Hopf (modelo moderno) no compiten: el ruido fisiológico podría mantener/explotar la vecindad del punto crítico. **Pregunta falsable:** ¿el nivel de ruido basal medido en potenciales evocados en reposo es compatible con el nivel óptimo de RE que predice el modelo?

---

## 2. Fundamentos matemáticos — Parte I: la cuerda pasiva

Esta sección contiene TODO lo necesario para que los agentes deriven, implementen y verifiquen la capa pasiva. Cada resultado marcado **[GATE-A*]** es un gate analítico: la implementación numérica DEBE reproducirlo dentro de tolerancia antes de habilitar cualquier corrida exploratoria (eval-gated freeze).

### 2.1 Ecuación de onda con coeficientes variables

Desplazamiento transversal u(x,t) de una cuerda/cinta de longitud L, densidad lineal de masa μ(x) > 0, tensión/rigidez efectiva K(x) > 0, amortiguamiento viscoso γ(x) ≥ 0, forzamiento externo F(x,t):

∂/∂t [ μ(x) ∂u/∂t ] = ∂/∂x [ K(x) ∂u/∂x ] − γ(x) ∂u/∂t + F(x,t)    (2.1)

Condiciones de borde (fija-libre):

u(0,t) = 0  (Dirichlet, base)
∂u/∂x (L,t) = 0  (Neumann, ápex)    (2.2)

Condiciones iniciales: u(x,0) = u₀(x), ∂u/∂t(x,0) = v₀(x).

**Nota de modelado:** en la cóclea real la "tensión" es rigidez flexural + acoplamiento hidrodinámico; el modelo de cuerda con K(x) variable es la abstracción de orden más bajo que preserva la física tonotópica. Documentar esta limitación en todo output.

### 2.2 Caso de validación 1 — cuerda uniforme fija-libre **[GATE-A1]**

Con μ, K constantes, γ = 0, F = 0, y c² = K/μ, separación de variables u = φ(x)e^{iωt}:

φ'' + (ω/c)² φ = 0,  φ(0)=0,  φ'(L)=0

Soluciones: φ_n(x) = sin(k_n x) con

**k_n L = (2n−1)π/2,  n = 1, 2, 3, …**    (2.3)

**ω_n = (2n−1)πc / (2L)** — solo armónicos impares del cuarto de onda.    (2.4)

Este es el resultado clásico del tubo cerrado-abierto / cuerda fija-libre. **GATE-A1:** los autovalores numéricos del operador discretizado deben converger a (2.4) con orden 2 en Δx (ver §5.2); error relativo < 10⁻⁴ para los primeros 10 modos con N = 2000 puntos.

### 2.3 Estructura de Sturm-Liouville

La ecuación de autovalores del sistema (2.1) sin disipación es un problema de Sturm-Liouville:

−d/dx [ K(x) φ' ] = ω² μ(x) φ,  φ(0)=0, φ'(L)=0    (2.5)

Propiedades garantizadas por la teoría (los agentes verificadores deben chequearlas numéricamente):

1. **Espectro real, discreto, simple:** 0 < ω₁² < ω₂² < … → ∞.
2. **Ortogonalidad con peso μ:** ∫₀ᴸ μ(x) φ_m(x) φ_n(x) dx = δ_mn · N_n. **[GATE-A2]**: matriz de Gram numérica diagonal con off-diagonal < 10⁻⁸ relativo.
3. **Teorema de oscilación:** φ_n tiene exactamente n−1 ceros interiores. **[GATE-A3]**: contar ceros de los primeros 10 autovectores.
4. **Completitud:** toda condición inicial de energía finita se expande en serie generalizada de Fourier:

   u(x,t) = Σ_n [ a_n cos(ω_n t) + b_n sin(ω_n t) ] φ_n(x)
   a_n = (1/N_n) ∫₀ᴸ μ u₀ φ_n dx,  b_n = (1/(ω_n N_n)) ∫₀ᴸ μ v₀ φ_n dx    (2.6)

   **[GATE-A4]** (round-trip): proyectar una condición inicial suave, reconstruir, error L² < 10⁻⁶ con 200 modos en el caso uniforme.

Esta es la generalización directa de las series de Fourier del análisis original: para μ, K constantes, (2.6) ES la serie de Fourier en senos de armónicos impares.

### 2.4 Cociente de Rayleigh y energía

ω_n² = min sobre subespacios de dim n, max sobre el subespacio, de

R[φ] = ∫₀ᴸ K (φ')² dx / ∫₀ᴸ μ φ² dx    (2.7)

Energía total (sin disipación, conservada):

E(t) = ½ ∫₀ᴸ [ μ (∂u/∂t)² + K (∂u/∂x)² ] dx    (2.8)

**[GATE-A5]** (conservación): con γ=0, F=0 e integrador simpléctico (§5.3), |E(t) − E(0)|/E(0) < 10⁻⁶ durante 100 períodos del modo fundamental. Con γ>0, dE/dt = −∫ γ (∂u/∂t)² dx **[GATE-A6]**: balance de energía numérico con residuo relativo < 10⁻⁴.

### 2.5 Aproximación WKB — el mapa tonotópico analítico

Para μ(x), K(x) de variación lenta comparada con la longitud de onda local, el ansatz WKB:

φ(x) ≈ [μ(x) K(x)]^{−1/4} · exp( ± i ∫₀ˣ k(s) ds ),  con k(x) = ω √(μ(x)/K(x)) = ω / c(x)    (2.9)

Interpretación coclear (onda viajera de Békésy):

- La velocidad local c(x) = √(K(x)/μ(x)) **decrece** hacia el ápex (K cae más rápido de lo que μ crece).
- Una onda de frecuencia ω viaja desde la base **frenándose** (k crece) y **acumulando amplitud** (factor (μK)^{−1/4} crece), hasta la vecindad del **punto de resonancia/corte** x_cf(ω) donde la frecuencia local característica

  ω_local(x) ≡ √( K(x) κ² / μ(x) )   (κ: número de onda transversal efectivo, absorbido en la parametrización)

  iguala a ω. Más allá de x_cf la onda es evanescente. El pico de la envolvente define el **lugar característico**: éste es el decodificador de frecuencia.

- **Condición de validez WKB:** |dλ/dx| ≪ 2π, equivalentemente |c'(x)|/ω ≪ 1. Los agentes deben computar este número adimensional y reportarlo; donde falle, la comparación WKB↔numérico es solo cualitativa.

**Cuantización WKB para autovalores (chequeo semiclásico) [GATE-A7]:**

∫₀ᴸ k_n(x) dx = ω_n ∫₀ᴸ ds/c(s) ≈ (2n−1)π/2 + correcciones    (2.10)

Para el caso exponencial (§3) se debe verificar que los autovalores numéricos siguen (2.10) con error decreciente en n (la WKB mejora para modos altos).

### 2.6 Caso exponencial con solución cerrada **[GATE-A8]**

Perfil de referencia con solución analítica exacta (además del uniforme): tomar

K(x) = K₀ e^{−αx},  μ(x) = μ₀ e^{−αx}   (misma exponencial ⇒ c constante, pero impedancia variable)

Entonces (2.5) se reduce a φ'' − α φ' + (ω/c)² φ = 0, ecuación lineal a coeficientes constantes con solución

φ(x) = e^{αx/2} [ A sin(βx) + B cos(βx) ],  β = √( (ω/c)² − α²/4 )

Aplicando φ(0)=0 ⇒ B=0; la condición de Neumann en L da la ecuación trascendente

tan(βL) = −2β/α    (2.11)

cuyas raíces β_n dan ω_n = c√(β_n² + α²/4) en forma cerrada-implícita, resoluble por Newton con precisión de máquina. **GATE-A8:** autovalores numéricos del PDE-solver vs raíces de (2.11), error relativo < 10⁻⁵. Este gate es crucial: valida el solver con coeficientes GENUINAMENTE variables en la matriz, contra una verdad independiente.

### 2.7 Respuesta forzada estacionaria y función de transferencia

Forzamiento armónico F(x,t) = f(x) e^{iΩt} con disipación γ(x):

−Ω² μ U + iΩ γ U − d/dx( K U' ) = f,  U(0)=0, U'(L)=0    (2.12)

Solución modal: U(x) = Σ_n c_n φ_n(x), con

c_n = ⟨f, φ_n⟩ / [ N_n (ω_n² − Ω² + iΩ Γ_n) ],  Γ_n = ⟨γ φ_n, φ_n⟩/N_n    (2.13)

**Salida clave del modelo pasivo:** el mapa |U(x; Ω)| — para cada Ω, la posición del máximo define x_cf(Ω); la curva Ω ↦ x_cf(Ω) es el **mapa tonotópico simulado**, a confrontar con la forma funcional de Greenwood (§1.1) a nivel cualitativo (monotonicidad, log-lineal aproximado) **[GATE-B1, gate blando]**.

**Q local y ancho de sintonía:** para cada posición de sonda x_p, la curva de resonancia |U(x_p; Ω)| define f_c(x_p) y Q₁₀dB. Reportar Q(x) — en el modelo pasivo será bajo (Q ~ 1–10); la literatura fisiológica da Q mucho mayor en vivo: esa brecha ES el argumento cuantitativo para la capa activa de Fase 2. Documentarla explícitamente es un resultado, no un fracaso.

---

## 3. Parametrización de la membrana basilar

### 3.1 Perfiles paramétricos (familia de exploración)

Todos los perfiles se definen en x ∈ [0, L], L = 35 mm (adimensionalizar a L=1 internamente; ver §3.3).

| Símbolo | Significado | Perfil de referencia | Rango de exploración |
|---|---|---|---|
| μ(x) | masa lineal efectiva | μ₀ e^{+α_μ x/L} | α_μ ∈ [0, 4] |
| K(x) | rigidez efectiva | K₀ e^{−α_K x/L} | α_K ∈ [4, 10] |
| γ(x) | amortiguamiento | γ₀ (1 + g₁ x/L) | γ₀: ζ₁ ∈ [0.01, 0.3] |
| L | longitud | 35 mm | fijo |

- La frecuencia local ω_local(x) ∝ √(K/μ) = √(K₀/μ₀) e^{−(α_K+α_μ)x/2L} cae exponencialmente ⇒ mapa log-frecuencia ↔ posición lineal, consistente con Greenwood. Elegir (α_K + α_μ)/2 ≈ ln(f_base/f_apex) ≈ ln(20000/20) ≈ 6.9 para cubrir el rango audible.
- **Justificación biológica:** rigidez medida cae 2–4 órdenes (α_K ln-décadas), masa efectiva crece con el ancho y la carga de fluido (α_μ > 0). El caso degenerado α_μ = −α_K reproduce el gate analítico A8.

### 3.2 Forzamiento de entrada

Dos modos de inyección, ambos implementados:

1. **Borde (realista):** condición inhomogénea en la base, u(0,t) = s(t) — el estribo mueve la ventana oval. Homogeneizar con u = v + (1 − x/L)·s(t)... **No**: con extremo libre conviene el lifting w(x) = e^{−x/ℓ} s(t) con ℓ ≪ L y w'(L)≈0; el término fuente resultante entra en F.
2. **Distribuido (control):** F(x,t) = f(x)·s(t) con f(x) gaussiana estrecha centrada en x_f. Útil para pruebas unitarias y para (2.13).

Señal de prueba estándar: s(t) = A_s sin(Ω t), con A_s calibrada SUBUMBRAL (ver §4.4).

### 3.3 Adimensionalización (obligatoria en el código)

x̃ = x/L, t̃ = t·c₀/L (c₀ = √(K₀/μ₀)), ũ = u/u_ref. Parámetros adimensionales resultantes:

- α_μ, α_K (formas de perfil)
- ζ(x) = γ/(2√(μK/L²)) razón de amortiguamiento local
- Ω̃ = ΩL/c₀ frecuencia adimensional
- D̃ intensidad de ruido adimensional (§4)
- θ̃ umbral adimensional (§4.4)

Todo resultado se reporta en adimensional + conversión a unidades físicas en una tabla única (`units.py`, un solo lugar de verdad).

---

## 4. Fundamentos matemáticos — Parte II: resonancia estocástica

### 4.1 El sistema estocástico

A la ecuación (2.1) se agrega forzamiento estocástico distribuido:

∂/∂t[μ ∂u/∂t] = ∂/∂x[K ∂u/∂x] − γ ∂u/∂t + F_señal(x,t) + η(x,t)    (4.1)

con η ruido blanco gaussiano espacio-temporal:

⟨η(x,t)⟩ = 0,  ⟨η(x,t) η(x',t')⟩ = 2D μ(x) δ(x−x') δ(t−t')    (4.2)

**Nota:** el factor μ(x) en (4.2) implementa fluctuación-disipación local si D = γ k_B T_eff/μ; lo dejamos como opción `noise_scaling ∈ {mass, uniform}` — la comparación entre ambas es un experimento en sí (¿importa la estructura espacial del ruido para la RE?).

En la semidiscretización (§5), (4.1) se convierte en un sistema de SDEs lineales (Ornstein-Uhlenbeck multivariado en las variables modales):

dz = A z dt + b(t) dt + Σ dW_t    (4.3)

Esto es importante: **el campo u es gaussiano** ⇒ su estadística es exactamente computable (media + covarianza) como verificación semi-analítica **[GATE-A9]**: la varianza estacionaria de cada modo con señal apagada debe coincidir con la solución de la ecuación de Lyapunov A P + P Aᵀ + ΣΣᵀ = 0 (para el sistema modal desacoplado: Var(q_n) = D_n/(2 Γ_n ω_n²) en la normalización elegida — derivar y fijar en el documento de implementación). La NO-gaussianidad y la RE aparecen recién en el **elemento de umbral** (§4.4): esta separación limpia (campo lineal gaussiano + detector no lineal) es una fortaleza del diseño — aísla el mecanismo.

### 4.2 Teoría de RE — mínimo necesario

**RE de umbral (threshold SR / non-dynamical SR)** — el mecanismo relevante aquí:

Detector: y(t) = Θ(v(t) − θ) (tren de eventos cuando la variable observada v cruza θ hacia arriba). Con v = señal subumbral A sin(Ωt) + ruido gaussiano de desvío σ, la probabilidad de cruce por ciclo es modulada por la fase de la señal. Para señal débil (A ≪ σ, A < θ):

- La componente espectral de y(t) en Ω crece con σ mientras σ ≪ θ (el ruido "levanta" la señal hasta el umbral),
- y decrece cuando σ ≫ θ (el ruido domina y decorrelaciona los cruces).

⇒ **SNR(σ) tiene un máximo en σ_opt ~ O(θ − A)**: la curva en U invertida, firma canónica de la RE. Aproximación analítica de referencia (rate-modulation, límite adiabático Ω ≪ 1/τ_corr):

SNR ≈ C · (A θ / σ²)² · exp(−θ²/2σ²) · r₀(σ)    (4.4)

con r₀ la tasa base de cruces (Rice): r₀ = (1/2π)(σ_v'/σ_v) exp(−θ²/2σ_v²). **[GATE-A10]**: en un modelo de juguete 0-D (un solo grado de libertad OU + umbral), la curva SNR(σ) simulada debe reproducir forma y posición del máximo de la teoría de Rice-modulada dentro de un 15% en σ_opt. Este gate valida TODO el pipeline de medición (PSD, ventanas, estimación de SNR) antes de tocar el PDE.

**RE dinámica (Kramers)** — contexto teórico, no se implementa en MVP: partícula en doble pozo con forzamiento débil; tasa de Kramers r_K = (ω₀ω_b/2πγ) exp(−ΔV/D); matching r_K(D) ≈ 2Ω da el D óptimo. Se documenta porque la capa de Hopf (Fase 2) interpola entre ambos regímenes.

### 4.3 Cuantificadores (definiciones EXACTAS que usará el código)

Sea y(t) la salida del detector (tren de spikes binned o suma de cruces), T_total la duración, ventana de Welch W, solapamiento 50%, detrend por segmento.

1. **SNR espectral:**
   SNR = 10 log₁₀ [ S_y(Ω) / ⟨S_ruido(Ω)⟩ ]  [dB]
   con S_y(Ω) la potencia en el bin de la señal y ⟨S_ruido(Ω)⟩ el promedio del piso en bandas laterales [Ω±ΔB excluyendo ±2 bins]. Reportar SIEMPRE con IC bootstrap (§7.3).
2. **Índice de sincronización de fase (vector strength):**
   VS = |⟨e^{iΩ t_k}⟩_k| sobre tiempos de cruce t_k. VS ∈ [0,1]. Métrica estándar en fisiología auditiva ⇒ comparable con literatura.
3. **Información mutua** I(s; y) estimada por el método de histogramas con corrección de sesgo (Panzeri-Treves) — métrica secundaria, solo en corridas largas.
4. **Curva RE:** SNR(D) y VS(D) sobre grilla logarítmica de D (≥ 12 puntos, ≥ 20 semillas c/u). **Criterio de éxito del MVP [GATE-B2]:** máximo interior estadísticamente significativo (el SNR en D_opt supera al de los extremos de la grilla con IC 95% no solapados).

### 4.4 El elemento de umbral (modelo de transducción)

Cadena mínima, por canal de lectura en posición x_p (usar ≥ 8 posiciones a lo largo de la MB):

1. **Variable de entrada al detector:** v_p(t) = u(x_p, t) o ∂u/∂t(x_p,t) (flag `detector_input ∈ {disp, vel}` — las CCI responden a velocidad en baja frecuencia y desplazamiento en alta; comparar ambas es un experimento).
2. **Detector A (MVP): umbral con refractariedad.** Evento en t si v_p(t) cruza θ hacia arriba y t − t_último > τ_ref. τ_ref = 1 ms fisiológico.
3. **Detector B (Fase 1.5): LIF.** dV/dt = −V/τ_m + β v_p(t) + ξ(t); spike y reset en V ≥ V_th. Agrega ruido intrínseco neuronal ξ separable del ruido mecánico η — permite preguntar CUÁL de los dos ruidos es el agente de la RE (o si interactúan: término de interacción, §7.2).
4. **Calibración de subumbralidad:** fijar A_s tal que, con D = 0, la tasa de eventos sea < 1% de la tasa a D_opt esperado. Procedimiento automático `calibrate_subthreshold()` documentado y atestado.

### 4.5 Conexión con potenciales evocados en reposo (la hipótesis original)

El observable fisiológico que motivó la hipótesis: actividad basal registrable sin estimulación auditiva. En el modelo, el análogo es la **tasa base r₀ y el espectro de y(t) con señal apagada**. Predicción falsable del proyecto:

> Si el sistema auditivo opera cerca del óptimo de RE, entonces el nivel de ruido inferido de la actividad basal (vía r₀ y la fórmula de Rice invertida: σ_est a partir de r₀ y θ) debe caer en la vecindad de D_opt de la curva SNR(D) del propio modelo, para señales en el rango de umbral audiométrico (~0.1–1 nm de desplazamiento de MB).

El agente de literatura (§6) debe recopilar los rangos empíricos publicados (ruido browniano de estereocilios ~1–3 nm RMS; desplazamiento umbral ~0.1–1 nm; tasas espontáneas de fibras auditivas 0–100 sp/s) y el pipeline debe emitir el veredicto de compatibilidad con incertidumbre.

---

## 5. Métodos numéricos

### 5.1 Semidiscretización espacial (método de líneas)

Grilla: x_i = iΔx, i = 0..N, Δx = L/N. Discretización conservativa en forma de flujo (esencial con K variable):

d/dt[ μ_i u̇_i ] = ( K_{i+1/2}(u_{i+1} − u_i) − K_{i−1/2}(u_i − u_{i−1}) ) / Δx² − γ_i u̇_i + F_i + η_i    (5.1)

con K_{i±1/2} = K(x_i ± Δx/2) (evaluación en punto medio, NO promedio aritmético de nodos — orden 2 genuino).

Bordes:
- Dirichlet: u_0 = 0 (o = s(t) en modo borde).
- Neumann orden 2: nodo fantasma u_{N+1} = u_{N−1} ⇒ ecuación del nodo N con flujo derecho nulo. **PROHIBIDO** el one-sided de orden 1 (degrada la convergencia global y sesga los autovalores del extremo libre — exactamente donde vive la física del helicotrema).

Forma matricial: M ü = −S u − C u̇ + F + η, con M diag(μ_i), S simétrica semidefinida positiva (verificar simetría numérica **[GATE-A11]**: ‖S − Sᵀ‖∞ < 10⁻¹² tras ensamblado).

Autovalores: resolver el problema generalizado S φ = ω² M φ con `scipy.linalg.eigh(S, M)` (nunca invertir M explícitamente para el reporte de gates).

### 5.2 Convergencia espacial **[GATE-A12]**

Para los gates A1 y A8: computar ω_n(N) para N ∈ {250, 500, 1000, 2000, 4000}; ajustar ω_n(N) = ω_n^∞ + c/N^p; exigir p ∈ [1.9, 2.1] (orden 2) y extrapolación de Richardson consistente con el valor analítico.

### 5.3 Integración temporal

- **Determinista (gates de energía):** Störmer-Verlet / leapfrog (simpléctico) para γ=0; para γ>0, esquema de Verlet amortiguado con el término γ semi-implícito (exacto para el oscilador amortiguado por modo). Δt ≤ 0.5 · 2/ω_max (estabilidad) y Δt ≤ (2π/Ω)/50 (resolución de la señal).
- **Estocástico:** el sistema (4.3) es LINEAL ⇒ dos opciones, ambas implementadas:
  1. **Euler-Maruyama** sobre (5.1) — simple, orden fuerte 0.5; usar SOLO con test de convergencia en Δt **[GATE-A13]**: la varianza estacionaria de los primeros 5 modos vs la solución de Lyapunov (gate A9), error < 1% con el Δt de producción, y verificar reducción del error al refinar Δt.
  2. **Exponencial exacto por modo (recomendado para producción):** en la base modal, cada q_n es un OU 2-D con solución exacta; muestrear la transición gaussiana exacta (matriz exponencial 2×2 + covarianza de Van Loan). Sin error de discretización temporal en el campo; el único Δt relevante queda en el detector de cruces. Este método convierte el gate A9 en igualdad hasta precisión de muestreo.
- **RNG y reproducibilidad:** `numpy.random.Generator(PCG64)` con semilla por-corrida derivada de (semilla_maestra, run_id) vía SeedSequence.spawn. La semilla maestra vive en el manifiesto atestado (§8).

### 5.4 Detección de cruces

Interpolación lineal del instante de cruce entre muestras (reduce jitter de discretización en VS). Con detector exponencial-modal, muestrear el campo a Δt_det = (2π/Ω)/200 en las posiciones de sonda únicamente (no reconstruir todo el campo: costo O(N_probes · N_modes) por paso).

### 5.5 Truncamiento modal

Producción en base modal con N_m modos: elegir N_m tal que ω_{N_m} > 10·Ω_max de la señal Y la fracción de varianza de ruido capturada > 99% (criterio doble, reportado). Verificar insensibilidad: repetir un punto de la curva RE con 2·N_m **[GATE-A14]**, corrimiento de SNR < 0.2 dB.

---

## 6. Arquitectura de agentes (harness ai-os)

### 6.1 Principio de diseño

Topología inspirada en el experimento de Anthropic (ideación / soporte / exploración / verificación), adaptada y **instrumentada**: este proyecto no solo usa la topología, la MIDE (§7.2). Regla suprema: **eval-gated freeze** — ningún artefacto (código, figura, número) pasa a estado `frozen` sin que TODOS los gates aplicables estén en verde, y ningún resultado exploratorio se reporta si depende de un artefacto no congelado.

### 6.2 Roles

| Agente | Rol | Entradas | Salidas | Gates que ejecuta |
|---|---|---|---|---|
| **DERIVADOR** | derivación simbólica: modos, WKB, ecuación trascendente (2.11), Lyapunov (4.3), fórmulas de Rice | §2, §4 de este doc | `derivations/*.md` + implementaciones de referencia en SymPy | genera los valores-verdad de A1, A8, A9, A10 |
| **CONSTRUCTOR** | implementa el solver (§5) contra la API de §9 | spec §5, §9 | `src/` | corre unit tests |
| **VERIFICADOR-MATH** | ejecuta gates analíticos A1–A14; NO comparte código de generación de valores-verdad con CONSTRUCTOR (independencia: SymPy/mpmath vs NumPy) | `src/`, derivaciones | `gates/report_A*.json` | A1–A14 |
| **VERIFICADOR-STAT** | valida el pipeline de medición: SNR en señales sintéticas conocidas, cobertura de los IC bootstrap, gate A10 (juguete 0-D) | `src/analysis` | `gates/report_stat.json` | A10, cobertura IC |
| **EXPLORADORES (×k)** | barren el espacio (D, θ, Ω, α_μ, α_K, ζ, noise_scaling, detector_input) según el plan factorial de §7 | manifiestos de corrida | `runs/*/results.parquet` + atestación | consumen artefactos frozen |
| **LITERATURA** | confronta salidas con rangos empíricos (§1.3, §4.5): Greenwood, Q fisiológico, ruido de estereocilios, tasas espontáneas | figuras + web | `literature/comparison.md` con veredictos y fuentes | B1 (blando), veredicto §4.5 |
| **SINTETIZADOR** | estadística de interacciones (§7.2), figuras finales, redacción del reporte | `runs/` | `report/` | B2, B3 |
| **AUDITOR** | verifica la cadena de atestación (§8): hashes, semillas, reproducción independiente de ≥ 3 corridas al azar | todo | `audit/attestation.json` | reproducibilidad bit a bit |

k inicial = 4 exploradores; el ratio exploradores:verificadores es un PARÁMETRO del experimento de infraestructura (§7.4).

### 6.3 Protocolo de handoff

Cada transición de estado de un artefacto se registra en `ledger.jsonl` (append-only, hash-encadenado: cada entrada incluye el hash de la anterior — misma disciplina que Nebuah):

```json
{"ts": "...", "artifact": "src/solver.py", "sha256": "...", "state": "frozen",
 "gates_passed": ["A1","A8","A11","A12"], "actor": "VERIFICADOR-MATH",
 "prev_hash": "...", "claude_session": "..."}
```

### 6.4 Reglas para Claude Code (obligatorias, van en CLAUDE.md del repo)

1. Leer este documento COMPLETO antes de escribir código. Este archivo es la única especificación válida; ante ambigüedad, abrir un issue en `decisions/`, no improvisar.
2. Nunca modificar un artefacto `frozen` — crear versión nueva y re-correr sus gates.
3. Todo número que aparezca en una figura o tabla debe ser trazable a un run_id del ledger.
4. Los valores-verdad de los gates los produce el DERIVADOR con SymPy/mpmath en módulos separados de `src/` (prohibido importar `src/` desde `truth/`).
5. Tests primero para cada gate: el gate se escribe como test de pytest ANTES de implementar la funcionalidad.
6. Ninguna corrida estocástica sin semilla explícita en el manifiesto.
7. Commits atómicos por gate: `git commit -m "GATE-A8 green: exponential profile eigenvalues, rel.err 3.2e-6"`.

---

## 7. Diseño experimental

### 7.1 Fase 1 — MVP (capas pasiva + estocástica)

**E1. Validación completa** (gates A1–A14): salida = tabla de gates en verde. Sin esto, nada más corre.

**E2. Mapa tonotópico pasivo:** barrido de Ω (60 valores log-espaciados, 3 décadas) × perfil de referencia; extraer x_cf(Ω), Q(x). Contraste Greenwood (B1) y documentación de la brecha de Q (argumento pro-Fase 2).

**E3. Curva RE canónica (resultado principal):** en x_p = x_cf(Ω_test) para 3 frecuencias de prueba (baja/media/alta): SNR(D) y VS(D), grilla de 12 valores de D log-espaciados × 20 semillas. **Éxito = GATE-B2** (máximo interior significativo).

**E4. Veredicto de compatibilidad fisiológica** (§4.5): σ_opt del modelo vs ruido basal empírico, con propagación de incertidumbre.

### 7.2 Términos de interacción (el sello harness_eval)

Diseño factorial fraccionado sobre {D, detector_input, noise_scaling, ruido mecánico η vs ruido neuronal ξ (detector B), ζ}. Modelo lineal con interacciones de 2º orden sobre SNR; **una afirmación del tipo "el ruido mecánico y el neuronal cooperan" solo se publica si el término de interacción correspondiente clarea cero con IC 95%** — el mismo estándar que en harness_eval: lift absoluto sin término de interacción significativo no es hallazgo.

**GATE-B3:** análisis de interacciones con n suficiente (análisis de potencia previo por el VERIFICADOR-STAT: detectar interacción de 1 dB con potencia 0.8).

### 7.3 Estadística

- IC bootstrap (BCa, 10⁴ resamples) para SNR y VS por punto.
- Corrección por comparaciones múltiples (Holm) en la tabla de interacciones.
- Todas las curvas con bandas de IC, nunca solo la media.

### 7.4 Experimento de infraestructura (meta-nivel)

Registrar por corrida: tokens, tiempo de agente, gates fallados/pasados, retrabajos. Variable: ratio exploradores:verificadores ∈ {4:1, 2:1, 1:1}. Métrica: costo total hasta B2 verde y tasa de resultados retractados post-auditoría. **Este es el dato que ningún paper de los labs publicó**: la curva costo-calidad del ratio exploración/verificación en un problema con verdad analítica parcial. Salida: post técnico de EvolvingAgentsLabs.

### 7.5 Fase 2 — capa activa de Hopf (especificación, no MVP)

Cadena de osciladores normales de Hopf acoplados a la MB:

dz_j/dt = (μ_H + iω_j) z_j − |z_j|² z_j + c_f u(x_j,t) + ruido,   ω_j = ω_local(x_j)

con μ_H la distancia al punto crítico (μ_H < 0: pasivo amortiguado; μ_H = 0: crítico; μ_H > 0: autooscilante → otoemisiones). La fuerza activa Re(z_j) retroalimenta a F(x_j,t). Preguntas de Fase 2: (i) ¿la criticalidad (μ_H→0) desplaza D_opt hacia el nivel de ruido fisiológico? (ii) ¿RE y amplificación activa son sinérgicas (interacción > 0), redundantes (< 0) o independientes (≈ 0)? (iii) ¿emerge la compresión ~1/3 de exponente característica de Hopf? Gates nuevos: respuesta A^{1/3} en el punto crítico (analítica de la forma normal), y límite μ_H → −∞ debe recuperar la Fase 1 (test de regresión física).

---

## 8. Atestación y reproducibilidad

1. **Manifiesto por corrida** (`runs/<id>/manifest.json`): hash del commit, hashes de los artefactos frozen usados, parámetros completos, semilla, versión de entorno (lockfile), hardware.
2. **Ledger hash-encadenado** (§6.3) — verificable con un script independiente `verify_ledger.py` de < 100 líneas sin dependencias fuera de stdlib (el "verificador open-source" en miniatura, misma filosofía que Nebuah).
3. **Reproducción por terceros:** `make reproduce RUN=<id>` debe regenerar los resultados bit a bit (numpy con misma versión y misma semilla ⇒ determinista; documentar la excepción de BLAS multihilo y fijar `OMP_NUM_THREADS=1` en corridas atestadas).
4. **Figuras:** cada PNG/SVG lleva en metadatos el run_id y el hash del manifiesto.

---

## 9. Estructura del repositorio y API

```
coclea-sr/
├── CLAUDE.md                  # reglas §6.4 + puntero a este documento
├── COCLEA-SR-SPEC.md          # este documento (fuente de verdad)
├── pyproject.toml             # deps pinneadas: numpy, scipy, sympy, mpmath,
│                              #   matplotlib, pyarrow, pytest, hypothesis
├── truth/                     # valores-verdad (SymPy/mpmath) — NO importa src/
│   ├── uniform_modes.py       # (2.3)-(2.4)
│   ├── exponential_modes.py   # raíces de (2.11) por Newton/mpmath
│   ├── lyapunov_variance.py   # gate A9
│   └── rice_sr_toy.py         # gate A10 (teoría 0-D)
├── src/coclea/
│   ├── units.py               # adimensionalización, §3.3 — único lugar de verdad
│   ├── profiles.py            # μ(x), K(x), γ(x) paramétricos, §3.1
│   ├── assembly.py            # M, S, C en forma de flujo, §5.1; chequeo A11
│   ├── modal.py               # eigh(S,M), proyección/reconstrucción, Gram
│   ├── forced.py              # respuesta estacionaria (2.12)-(2.13), tonotopía
│   ├── stochastic.py          # OU modal exacto (Van Loan) + Euler-Maruyama
│   ├── detector.py            # umbral+refractario, LIF, cruces interpolados
│   ├── analysis.py            # Welch, SNR (def. §4.3), VS, bootstrap BCa
│   ├── calibrate.py           # calibrate_subthreshold()
│   └── attest.py              # manifiestos, ledger, hashes
├── gates/                     # un test pytest por gate: test_A01.py ... test_B03.py
├── experiments/               # E1..E4 como scripts declarativos (YAML + runner)
├── runs/                      # salidas atestadas (parquet + manifest)
├── ledger.jsonl
├── verify_ledger.py
├── decisions/                 # ADRs: toda ambigüedad resuelta queda escrita
└── report/
```

**API núcleo (contratos que Claude Code debe respetar):**

```python
# profiles.py
@dataclass(frozen=True)
class BMProfile:
    alpha_mu: float; alpha_K: float; zeta0: float; g1: float = 0.0
    def mu(self, x): ...   # adimensional, x en [0,1]
    def K(self, x): ...
    def gamma(self, x): ...

# assembly.py
def assemble(profile: BMProfile, N: int) -> System:  # System: M, S, C (scipy.sparse)
# modal.py
def eigenmodes(sys: System, n_modes: int) -> Modes:  # omega[n], phi[n,x], norms
# stochastic.py
def simulate_ou_modal(modes, drive: Drive, noise: Noise, T, dt_det, rng) -> ProbeSeries
# detector.py
def threshold_events(v: ProbeSeries, theta, tau_ref) -> EventTrain
# analysis.py
def snr_db(events: EventTrain, Omega, cfg: WelchCfg) -> Estimate  # value, ci_lo, ci_hi
def vector_strength(events, Omega) -> Estimate
```

---

## 10. Plan de implementación (hitos para Claude Code)

| Hito | Contenido | Definición de hecho |
|---|---|---|
| H1 | `truth/` completo + tests de los gates escritos (rojos) | pytest colecta A1–A14, B2, B3; todos fallan limpiamente |
| H2 | `units.py`, `profiles.py`, `assembly.py`, `modal.py` | A1, A2, A3, A4, A8, A11, A12 verdes |
| H3 | dinámica determinista + energía | A5, A6, A7 verdes |
| H4 | juguete 0-D + pipeline de análisis | A10 + cobertura IC verdes |
| H5 | `stochastic.py` (OU modal exacto) + `detector.py` | A9, A13, A14 verdes |
| H6 | E2 tonotopía | B1 evaluado, brecha de Q documentada |
| H7 | E3 curva RE (resultado principal) | **B2 verde** |
| H8 | E4 + interacciones + reporte | B3 verde, veredicto §4.5 emitido |
| H9 | auditoría + post de infraestructura (§7.4) | reproducción bit a bit de 3 corridas |

Estimación: H1–H5 ≈ 1 semana de sesiones con Claude Code; H6–H9 ≈ 1 semana adicional (dominada por cómputo, paralelizable por semillas).

---

## 11. Riesgos y decisiones anticipadas

- **R1 — El modelo pasivo no reproduce Q fisiológico.** Esperado y documentado (§2.7): no bloquea el MVP; es el argumento cuantitativo para Fase 2.
- **R2 — La RE aparece trivialmente por diseño del detector.** Mitigación: gate A10 fija la teoría del detector aislado; el resultado interesante es la MODULACIÓN espacial (curva RE vs x_p y vs sintonía Ω↔x_cf), no la mera existencia de la U invertida.
- **R3 — Ruido blanco espacial no físico.** El ruido browniano real entra en los estereocilios, no distribuido en la MB. Mitigación: el detector B con ruido ξ local ya modela esa vía; comparar η-dominante vs ξ-dominante es el experimento de interacción central (§7.2).
- **R4 — 1D vs hidrodinámica 2D/3D.** Asumido: el modelo de cuerda captura tonotopía cualitativa, no cuantitativa fina. Toda figura lleva la leyenda de alcance. Extensión 2-cámaras (modelo de caja con fluido) queda como Fase 3 posible.
- **R5 — Costo de bootstrap × semillas × factorial.** El método OU-modal exacto reduce el costo por corrida en ~10–50× vs Euler-Maruyama denso; el factorial es fraccionado; presupuesto de cómputo en el manifiesto de E3 antes de lanzar.

---

## 12. Referencias mínimas (para el agente LITERATURA)

- von Békésy, *Experiments in Hearing* (1960) — onda viajera.
- Greenwood (1990), *JASA* 87:2592 — mapa posición-frecuencia.
- Gammaitoni, Hänggi, Jung, Marchesoni (1998), *Rev. Mod. Phys.* 70:223 — revisión canónica de RE.
- Douglass, Wilkens, Pantazelou, Moss (1993), *Nature* 365:337 — RE en mecanorreceptores.
- Levin & Miller (1996), *Nature* 380:165 — RE en sistema cercal.
- Eguíluz, Ospeck, Choe, Hudspeth, Magnasco (2000), *PRL* 84:5232 — esencia de Hopf en audición.
- Duke & Jülicher (2003), *PRL* 90:158101 — onda viajera crítica.
- Hudspeth (2014), *Nat. Rev. Neurosci.* 15:600 — amplificador coclear, revisión.
- Rice (1944) — tasa de cruces de procesos gaussianos.
- Documentación interna: harness_eval (estadística de interacciones), agentvcs (eval-gated freeze), Nebuah (ledger atestado).

---

## 13. Patologías: el modelo como superficie terapéutica

**Añadido 2026-08-17.** Esta sección no estaba en la especificación original y no
podía estarlo: se volvió formulable recién después de [ADR-0002](decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md).
El documento completo es [`PATHOLOGIES.md`](PATHOLOGIES.md); acá queda la parte
normativa. El ADR que fija las decisiones es
[ADR-0006](decisions/0006-pathology-as-a-parameter-transform.md).

### 13.1 Por qué existe la sección

El operador previo a ADR-0002 era una cuerda graduada. Sus perillas eran la
tensión y la masa de la membrana, y **ninguna droga alcanza ninguna de las dos**.
La línea de transmisión metió el fluido dentro del operador —`β` lleva la
geometría de las escalas, `M` el fluido arrastrado, `R` la pérdida viscosa— y el
fluido es exactamente sobre lo que actúa un diurético o un agente osmótico. La
capa de Hopf agregó `μ_H`, que el salicilato y la furosemida ya mueven en humanos.
El detector agregó `θ`.

Es decir: un modelo falsado fue reemplazado por uno con **superficie terapéutica**.
La sección es consecuencia de la falsación, no de un plan previo, y eso se
registra porque es el mismo patrón que §11-R2 describe al revés.

### 13.2 Regla normativa

**Una patología es una transformación de los parámetros que el modelo ya tiene, y
nada más.** Ninguna patología introduce un término nuevo, una ecuación nueva ni
una constante ajustada. `Lesion()` con todos sus valores por defecto **es** una
cóclea sana, de modo que una lesión es literalmente el diff.

Corolario obligatorio: el control nulo es gratis y se corre. Si `Lesion()` no
reproduce la firma de referencia con delta `0.0` en cada componente, entonces los
observables derivan solos y toda diferencia del catálogo es esa deriva.

### 13.3 Las seis perillas

| perilla | capa | qué es | qué la mueve en una cóclea |
|---|---|---|---|
| `drive` | oído medio | presión que llega al estribo | otosclerosis, efusión, perforación |
| `β` | fluido | área de escala, densidad, geometría | volumen de endolinfa; agentes osmóticos y diuréticos |
| `S`, `M` | partición | rigidez y masa arrastrada | distensión, fibrosis, carga de masa |
| `R` | fluido | pérdida viscosa | viscosidad, temperatura |
| `μ_H` | activa | distancia al punto de Hopf | CCE, prestina, potencial endococlear, eferentes MOC |
| `θ` | detector | umbral de disparo | sinapsis en cinta de las CCI, dotación de fibras |

### 13.4 GATE-D1 — la afirmación que la sección tiene que sobrevivir

> Cada patología entra por una **perilla distinta**, y por lo tanto produce un
> **patrón de observables distinto**.

Es falsable: un modelo con una sola perilla efectiva mapearía todas las lesiones
a la misma firma y aun así produciría gráficos que parecen hipoacusia.
`gates/test_D01_pathology_signatures.py` verifica tres cosas, y la segunda y la
tercera son las que le dan sentido a la primera:

1. Siete lesiones producen **seis** firmas distintas — la colisión documentada y
   ninguna otra.
2. El control nulo reproduce la referencia con delta `0.0`.
3. **Ningún observable individual separa el catálogo** (máximo por columna: 3
   valores distintos sobre 7). El diagnóstico está en el patrón, así que el
   patrón tiene que ser portante.

La colisión documentada es `ohc-loss` / `prestin-block`: misma perilla a dos
profundidades. Se **afirma**, no se excluye. Un gate que la sacara de la
comparación pasaría igual de bien sobre un modelo que hubiera colapsado las siete
lesiones en una sola perilla.

### 13.5 Lo que la sección tiene prohibido

Regla de publicación, del mismo tipo que §7.2:

- **Ninguna afirmación clínica sin dato clínico.** Cada dirección terapéutica de
  `PATHOLOGIES.md` §5 lleva un campo *"lo que el modelo no puede decir"*, y ese
  campo es normativo: sin él la dirección no se publica.
- **Ningún número con magnitud sin derivación.** `μ_H = −0.02` para una cóclea
  sana es un **posit**, y los factores del hidrops también. Todo se escribe como
  *dirección de movimiento desde* ese punto, nunca como absoluto — por eso D1
  reduce cada observable a un signo antes de comparar.
- **La cota de E4 se respeta.** El régimen de resonancia estocástica es alcanzable
  hasta CF ≈ 1 kHz y no por encima. Cualquier propuesta de "ruido terapéutico" que
  se enuncie sin esa cota está enunciando una afirmación más grande que la que el
  proyecto midió.

### 13.6 El riesgo estructural (nuevo, R6)

**R6 — la ventana terapéutica tiene un borde.** Toda terapia que restaure el
amplificador empuja `μ_H` hacia cero, y cero es la bifurcación. Del otro lado el
oscilador corre sin entrada: emisión otoacústica espontánea, y el tinnitus tonal
que a veces la acompaña. El modo de falla del otro lado es un **síntoma**, no una
ausencia de beneficio.

Un modelo físico puede decir eso; uno estadístico ajustado a resultados no, porque
la falla vive del otro lado de un borde que los datos no contendrían. Se registra
como riesgo y no como resultado: **no se ha mostrado que el modelo prediga
tinnitus en nadie.** Lo que hace es ubicar el borde en su propio parámetro.

---

*Fin de la especificación. Ante cualquier conflicto entre código y este documento, gana este documento; ante cualquier laguna, se escribe un ADR en `decisions/` antes de implementar.*
