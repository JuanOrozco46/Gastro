# Preparación para Piloto: Pizzería en Armenia, Quindío

Este documento establece el estado de preparación del MVP de GastroSync para ejecutar una demostración operativa controlada con una pizzería real en Armenia, operando exclusivamente bajo el Modo Demo Local.

## 1. Datos Faltantes Requeridos del Restaurante

Para sustituir los datos de prueba (`demoAccounts.ts`) por los datos reales de la pizzería sin alterar la arquitectura, necesitamos recopilar la siguiente configuración exacta:

**Perfil del Negocio:**
- [ ] Nombre comercial exacto.
- [ ] Descripción corta (ideal para el feed).
- [ ] Categoría principal (ej. Pizzería, Comida Italiana).
- [ ] Zona de Armenia (Norte, Sur, Centro, etc.).
- [ ] Teléfono de contacto y enlace de WhatsApp para soporte.
- [ ] Horario exacto de atención.

**Reglas de Negocio:**
- [ ] Tiempo estimado promedio de preparación/entrega (ej. 30-45 min).
- [ ] Pedido mínimo permitido (en COP).
- [ ] Tarifa de domicilio estándar.
- [ ] Radio de cobertura máximo (si aplica).
- [ ] Modalidades que ofrecen: `restaurant_delivery`, `pickup` (Recoger en local), y/o `table_service` (Atención en mesa).

**Menú y Multimedia:**
- [ ] Catálogo de productos (Nombre, descripción, precio real en COP).
- [ ] Categorías del menú (ej. Tradicionales, Especiales, Bebidas).
- [ ] Extras o adiciones (bordes de queso, salsas, etc.) con sus precios.
- [ ] Fotografías reales y de buena calidad de al menos 3-4 productos estrella.
- [ ] 2-3 publicaciones (fotos/videos cortos) para inicializar su feed.

---

## 2. Auditoría de Flujos (Pruebas Realizadas)

Las siguientes validaciones han sido superadas con los datos de demo y se comportarán de manera idéntica al cargar los datos de la pizzería:

- ✅ **Checkout Domicilio:** La dirección inicia vacía; el formulario bloquea (HTML5 `required`) el envío de `restaurant_delivery` sin una dirección real.
- ✅ **Checkout Pickup:** Al seleccionar "Recoger en local", los campos de dirección se ocultan automáticamente, haciendo el flujo más rápido.
- ✅ **Checkout Table Service:** El sistema solicita y valida un número de mesa.
- ✅ **Cálculos Matemáticos:** El subtotal multiplica correctamente la cantidad x precio. La tarifa de domicilio y el fee de la plataforma se suman correctamente al total final.
- ✅ **Apertura/Cierre:** El owner (pizzería) puede simular abrir y cerrar su restaurante desde el dashboard, impidiendo la entrada de nuevos pedidos al estar cerrado.
- ✅ **Aislamiento de Cocina (KDS):** El staff ingresa y avanza el pedido de *Pendiente* a *Listo*, pero estructuralmente **no tienen botones** para Cancelar ni Entregar pedidos (seguridad validada).
- ✅ **Flujo de Propietario (Owner):** Puede cambiar el estado final del pedido (ej. Entregado) y gestionar el catálogo.
- ✅ **Limpieza de Carrito:** Una vez el pedido se genera exitosamente, el carrito se resetea a cero.

---

## 3. Errores Encontrados y Bloqueadores Reales

- **Bloqueadores Reales:** **0 (Cero).** El sistema está listo para demostración funcional y visual en modo local.
- **Error/Alerta (Menor):** Si la pizzería ofrece ingredientes "mitad y mitad" o variaciones complejas de tamaño (Personal, Mediana, Familiar) en un mismo producto base, la actual estructura de datos del MVP maneja un solo precio por producto. Esto podría requerir que cada tamaño se ingrese como un producto independiente por ahora.

---

## 4. Mejoras Recomendadas (Post-Piloto Inicial)

1. **Persistencia del Carrito:** Evitar que si el cliente recarga la página por accidente (ej. al salir a buscar la tarjeta de crédito), pierda los productos seleccionados.
2. **Notificaciones Sonoras en KDS:** Agregar un "ring" o alerta auditiva cuando caiga un pedido nuevo en la pantalla de la cocina.
3. **Manejo de Modificadores (Variantes):** Crear la lógica de base de datos para manejar "Adiciones" o "Tamaños" dinámicos en los productos en un futuro cercano.

---

## 5. Checklist de Ejecución para la Demostración (Día Cero)

1. [ ] Reemplazar temporalmente el objeto de `demoAccounts.ts` con el menú, logos y datos de la pizzería.
2. [ ] Configurar dos dispositivos reales (ej. un teléfono móvil simulando al cliente, un iPad simulando el KDS/Owner).
3. [ ] Ejecutar el servidor local conectado a la misma red WiFi para que ambos dispositivos accedan al entorno de demo.
4. [ ] Realizar un pedido de prueba en vivo, dejando que el dueño interactúe y mueva el estado del pedido en la pantalla.

---

## 6. Preguntas Clave para el Dueño (Levantamiento de Requisitos Reales)

Para asegurar el éxito a largo plazo, durante la demo debemos preguntar:
1. *¿Tu tarifa de domicilio es plana para toda Armenia, o varía drásticamente dependiendo del barrio?*
2. *¿Cómo manejas habitualmente las pizzas de dos sabores (mitad y mitad)?*
3. *¿Qué prefieres: que el cliente pague online a través de la plataforma o recibir pagos contra entrega (efectivo/transferencia)?*
4. *Cuando un pedido sale a reparto, ¿quién notifica al cliente que el domiciliario va en camino? ¿Te gustaría que la app lo automatizara?*

---

## 7. Checklist para Incorporar un Segundo Restaurante

- [ ] Repetir la recolección de los "Datos Faltantes Requeridos" descrita en el paso 1.
- [ ] Crear un nuevo ID de `tenant` en la base de datos (o demo payload).
- [ ] Asignar un usuario Owner y un usuario Staff vinculados **exclusivamente** a ese nuevo `tenant_id` para garantizar que sus pedidos no se mezclen.
- [ ] Asegurarse de etiquetar correctamente la zona y categoría para que los filtros de búsqueda los diferencien.
