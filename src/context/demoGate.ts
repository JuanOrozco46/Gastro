// Demo login must never be available in a production bundle: the demo
// credentials (and demoAccounts.ts itself) are only reachable in dev builds.
// El check se deja estático a propósito: en build de producción Vite lo
// sustituye por `false`, Rollup elimina la rama y el chunk de demoAccounts
// (con las contraseñas) ni siquiera se genera en dist/.
// Para un entorno de staging con demo login, usa `vite build --mode development`.
export const DEMO_LOGIN_ENABLED: boolean = import.meta.env.DEV;
