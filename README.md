# 🍽️ GastroSync

> Plataforma integral de gestión gastronómica, delivery, cocina digital (KDS) y transacciones seguras para restaurantes y comensales.

---

## 🚀 Inicio Rápido para Desarrolladores

Si vas a desarrollar en el proyecto, asegúrate de estar trabajando sobre la rama de desarrollo:

```bash
# 1. Clonar y cambiar a la rama develop
git clone https://github.com/JuanOrozco46/Gastro.git
cd GastroSync
git checkout develop

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Iniciar servidor local
npm run dev
```

---

## 🛠️ Stack Tecnológico

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Estilos & Animaciones**: Tailwind CSS, [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/)
- **Backend & Base de Datos**: [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Edge Functions)
- **Pagos**: Pasarela Wompi Colombia (integridad SHA-256)
- **Calidad & Testing**: [Oxlint](https://oxc.rs/), Node Test Runner nativo (`node --test`), TypeScript Strict

---

## 🧪 Scripts de Verificación

```bash
npm run dev      # Servidor de desarrollo con HMR
npm run lint     # Linter ultrarrápido con Oxlint
npm test         # Suite de pruebas unitarias y de integración
npm run build    # Compilación y verificación de tipos (tsc -b + vite build)
npm run preview  # Previsualizar el bundle de producción
```

---

## 🌿 Flujo de Ramas y Contribución

Este repositorio sigue el estándar **GitFlow**:
- **`main`**: Producción estable.
- **`develop`**: Rama base para el desarrollo diario e integración de features.
- Todas las ramas de características (`feature/*`) o correcciones (`bugfix/*`) deben salir y fusionarse hacia **`develop`** mediante Pull Request.

Para conocer la guía completa de convenciones de commits, plantillas y buenas prácticas, consulta **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

---

## 📚 Documentación Adicional

- [Guía de Contribución](./CONTRIBUTING.md)
- [Arquitectura y Diseño](./DESIGN.md)
- [Definición de Producto](./PRODUCT.md)
- [Guía de Despliegue](./DEPLOYMENT.md)
- [Cumplimiento Legal (Colombia)](./LEGAL_COMPLIANCE_CO.md)
