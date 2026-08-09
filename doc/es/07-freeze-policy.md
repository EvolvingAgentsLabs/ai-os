# 07 · Política de congelado

<img src="../assets/07-freeze-policy.jpg" alt="" width="100%">

<sub>Veintiuno archivados. Uno sigue tibio.</sub>

> **Proyecto.** Qué significa "congelado" para los otros repositorios de la organización.


> **El inglés es canónico.** Traducción de [`doc/07-freeze-policy.md`](../07-freeze-policy.md).

ai-os es el proyecto principal de la organización. Todo lo demás está congelado.
Este documento define qué significa "congelado" operativamente, porque un
congelado sin definir es indistinguible del abandono seis meses después — y esta
organización tiene el hábito documentado de dejar repositorios describiendo
software que dejó de ser cierto.

## Estado real — `EvolvingAgentsLabs`, 2026-08-01

**28 repositorios. 21 ya estaban archivados.** El congelado es mucho más chico de
lo que suena; la mayor parte pasó en la auditoría de portfolio de julio.

Vivos ese día:

| Repo | ★ | Qué hacer |
|---|---:|---|
| `evolving-agents` | 452 | **Congelar** — el flagship saliente, y el único con alcance real |
| `skillos` | 54 | **Congelar** |
| `gemma4nanoloop` | 0 | **Congelar** |
| `evolvingagentslabs.github.io` | 0 | **Mantener vivo** — sitio de la org, debe apuntar a ai-os |
| `.github` | 0 | **Mantener vivo** — perfil de la org, debe apuntar a ai-os |

Los 21 restantes ya estaban archivados y sólo necesitan el encabezado del paso 1
si no lo tienen.

## Los tres estados

Cada repositorio está en exactamente uno, y se ve desde la portada.

### `ACTIVO`
En desarrollo. Hoy: sólo `ai-os`, más los dos repos de presencia de la org.

### `CONGELADO`
Sin desarrollo; **todavía cierto**. Corre, su README describe lo que realmente es,
y se conserva porque alguien podría leerlo o tomar algo de ahí. Archivado en
GitHub (sólo lectura), con un encabezado arriba del README.

### `REEMPLAZADO`
Congelado, y su idea ahora vive en ai-os. Igual que congelado, más una línea que
dice adónde fue la idea y por qué.

No hay un cuarto estado para "quizás volvamos". Ese estado es `CONGELADO`, y
volver es una decisión explícita, no una intención que se dejó vencer.

## Congelar, paso a paso

**1. Encabezado al tope del README** — arriba del título, lo primero que se ve:

```markdown
> **FROZEN — 2026-08-01.** Not under development. This repository is kept
> because it is still true, not because it is maintained.
> The organisation's active work is [ai-os](https://github.com/EvolvingAgentsLabs/ai-os).
> Last verified: 2026-08-01.
```

Para `REEMPLAZADO`, agregar una línea: *"La idea detrás de X ahora vive en ai-os
como `ai-flows` — ver `doc/03-ai-flows.md`."*

**2. Hacer que el README sea cierto antes de congelarlo.** Un repositorio se
congela en el estado en que se lee, para siempre. Si el README promete algo que se
borró, arreglarlo *ahora* — después de archivar, nadie lo va a hacer.

Este es el paso que realmente importa y el que se saltea. Fue innegociable para
`evolving-agents`, que tiene 452 estrellas y anunciaba un milestone incumplido en
su `PLAN.md`.

**3. Cerrar o convertir issues y PRs abiertos.** Un PR abierto contra un repo
archivado es una promesa que nadie puede cumplir.

**4. Archivar en GitHub.**

```bash
gh repo archive EvolvingAgentsLabs/<name> --yes
```

**5. Registrarlo** en la tabla de abajo, en este archivo, en el mismo commit.

## Notas por repositorio

### `evolving-agents` (452★) — `REEMPLAZADO`, y el delicado

El único repositorio de la organización con alcance real. Tres cosas tenían que
ser ciertas antes de archivarlo, y se cumplieron:

1. **`PLAN.md` declaraba M1 como "not started, and the reason this repo exists".**
   Congelarlo con esa frase viva dejaba un repositorio cuyo propio plan dice que
   su propósito quedó incumplido. Se reescribió para decir que el trabajo se mudó
   a ai-os como linaje de flows.
2. **`pip install agentvcs` devolvía 404** — verificado, no supuesto. El README lo
   prometía en dos lugares; ahora dice que nunca se publicó y da el install desde
   fuente que sí funciona.
3. **El encabezado enlaza a ai-os.** 452 estrellas es la audiencia del proyecto
   nuevo; es el único canal de distribución real que tiene la organización.

### `skillos` (54★) — `CONGELADO`
Sin PRs abiertos al momento de congelar. Sólo encabezado.

### `gemma4nanoloop` — `CONGELADO`
Tenía el PR #7 abierto — un fix real: un test que afirmaba que la función a
optimizar debía *fallar* el criterio de aceptación, lo que ponía el gate en rojo
justo sobre la respuesta correcta. Se mergeó antes de congelar.

### `evolvingagentslabs.github.io` y `.github` — siguen `ACTIVOS`
No se congelan: son cómo se lee la organización. Ambos lideran con ai-os. Dejar el
sitio apuntando a un flagship congelado es peor que no tener sitio.

### Los 21 ya archivados
Sólo encabezado, y sólo donde falte. No desarchivar para agregarlo — el encabezado
puede esperar a una pasada en lote, o saltearse en los de 0★.

## Descongelar

Requiere un ADR en `ai-os/doc/adr/` que diga qué cambió. No un estado de ánimo.

## Registro

Se actualiza en el mismo commit que cada congelado.

| Repo | Estado | Congelado el | Idea se mudó a | Por |
|---|---|---|---|---|
| `evolving-agents` | REEMPLAZADO | 2026-08-01 | ai-os · `ai-flows` (linaje) | matiasmolinas |
| `skillos` | CONGELADO | 2026-08-01 | ai-os · `ai-flows` | matiasmolinas |
| `gemma4nanoloop` | CONGELADO | 2026-08-01 | — | matiasmolinas |
