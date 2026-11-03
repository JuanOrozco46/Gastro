# Guía de Contribución y Desarrollo - GastroSync

Bienvenido al repositorio de **GastroSync**. Para mantener la alta calidad del código, la estabilidad en producción y la agilidad del equipo de ingeniería, seguimos estándares profesionales de desarrollo de software basados en **GitFlow**, **Conventional Commits** e **Integración Continua (CI)** estricta.

---

## 1. Estrategia de Ramas (Branching Model)

El flujo de trabajo se basa en un modelo GitFlow adaptado a CI/CD moderno:

```
main (producción estable) ───────────────────● (tag v1.0.0) ───────────
                                            ▲
                                            │ merge / PR
develop (integración de desarrollo) ────────┴──────────────────────────
           ▲                   ▲
           │ PR                │ PR
    feature/auth-refresh   bugfix/cart-calc
```

### Ramas Principales (Larga Duración)
- **`main`**: Código productivo y estable. Sólo se actualiza mediante Pull Requests aprobados desde `develop` (o `release/*` / `hotfix/*`). **Nunca se realiza `push` directo.**
- **`develop`**: Rama base para todos los desarrolladores. Contiene el código integrado más reciente probado por el CI.

### Ramas de Soporte (Corta Duración)
Nombra tus ramas siguiendo el formato estándar:

| Prefijo | Propósito | Rama Base | Merge hacia |
|---|---|---|---|
| `feature/<nombre>` | Nueva funcionalidad | `develop` | `develop` |
| `bugfix/<nombre>` | Corrección de error en ciclo de desarrollo | `develop` | `develop` |
| `hotfix/<nombre>` | Corrección urgente detectada en producción | `main` | `main` y `develop` |
| `refactor/<nombre>` | Mejoras estructurales sin cambio de funcionalidad | `develop` | `develop` |
| `release/vX.Y.Z` | Preparación de versión y congelamiento de features | `develop` | `main` y `develop` |

---

## 2. Convención de Commits (Conventional Commits)

Todos los mensajes de commit deben seguir la especificación [Conventional Commits v1.0.0](https://www.conventionalcommits.org/):

```
<tipo>(<ámbito opcional>): <descripción concisa en imperativo o presente>

[cuerpo explicativo opcional]

[pie con tickets o referencias opcional]
```

### Tipos Permitidos
- **`feat`**: Una nueva característica o funcionalidad.
- **`fix`**: Corrección de un error (bug).
- **`refactor`**: Refactorización de código que no añade features ni corrige bugs.
- **`perf`**: Cambio que mejora el rendimiento de la aplicación.
- **`test`**: Adición o corrección de pruebas unitarias o de integración.
- **`docs`**: Cambios exclusivos en documentación (`README`, `DEPLOYMENT`, etc.).
- **`chore`**: Tareas de mantenimiento, dependencias o configuración interna.
- **`ci`**: Cambios en workflows de GitHub Actions o scripts de despliegue.

### Ejemplos
```bash
git commit -m "feat(kds): add optimistic order status updates"
git commit -m "fix(checkout): validate zero amounts in fee breakdown"
git commit -m "chore(deps): update vite and oxlint configurations"
```

---

## 3. Configuración del Entorno Local

### Requisitos Previos
- **Node.js**: v20.0+ (Recomendado v24 LTS para paridad con GitHub Actions).
- **npm**: v10+.
- **Git**: v2.30+.

### Paso a Paso
1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/JuanOrozco46/Gastro.git
   cd GastroSync
   ```

2. **Cambiar a la rama de desarrollo**:
   ```bash
   git checkout develop
   ```

3. **Instalar dependencias**:
   ```bash
   npm install
   ```

4. **Variables de entorno**:
   Copia el archivo base y configura tus credenciales locales o de staging:
   ```bash
   cp .env.example .env
   ```

5. **Iniciar servidor de desarrollo**:
   ```bash
   npm run dev
   ```

---

## 4. Scripts de Calidad y Verificación

Antes de hacer commit o crear un Pull Request, **es obligatorio** que las siguientes verificaciones pasen en local:

```bash
# 1. Análisis estático de código (Oxlint)
npm run lint

# 2. Verificación estricta de tipos de TypeScript
npx tsc -b

# 3. Suite de pruebas unitarias y de integración
npm test

# 4. Verificación de compilación para producción
npm run build
```

---

## 5. Ciclo de Vida de un Pull Request (PR)

1. **Crear rama propia** a partir de `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/mi-nueva-funcionalidad
   ```

2. **Desarrollar y probar**:
   - Implementa cambios atómicos.
   - Si creas lógica crítica de negocio, agrega las pruebas unitarias pertinentes en `tests/`.

3. **Verificar calidad**:
   - Ejecuta `npm run lint`, `npx tsc -b`, `npm test` y `npm run build`.

4. **Push y apertura del PR**:
   ```bash
   git push -u origin feature/mi-nueva-funcionalidad
   ```
   - Abre el Pull Request apuntando como rama base a **`develop`**.
   - Completa minuciosamente la plantilla de Pull Request (`.github/pull_request_template.md`).

5. **Revisión de Código**:
   - Todo PR requiere aprobación de al menos un revisor.
   - El workflow de CI de GitHub Actions debe estar en verde (`verify` job exitoso).
   - Se debe utilizar **Squash and Merge** o **Rebase and Merge** para mantener un historial limpio y lineal.

---

## 6. Seguridad y Buenas Prácticas

- **Cero Secretos**: Nunca comitees tokens de API, llaves privadas ni claves de servicio en archivos versionados.
- **Supabase & RLS**: Toda nueva tabla o función en base de datos debe incluir políticas Row Level Security (RLS) y estar encapsulada en migraciones idempotentes dentro de `supabase/migrations/`.
- **Inmutabilidad y Atomicidad**: Funciones financieras y de pagos (Wompi) deben contar con validaciones de integridad y desgloses exactos en enteros.
