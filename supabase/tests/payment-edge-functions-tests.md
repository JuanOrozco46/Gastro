# Pruebas de Integración y Seguridad para Pagos (Edge Functions)

Esta suite de pruebas cubre los requisitos de la Fase 5B. Al ejecutarse en Supabase Edge Functions, deben probarse enviando peticiones HTTP (cURL, Postman o Insomnia) a las funciones desplegadas.

## Entorno Requerido
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` configurados.
- Token JWT del cliente autenticado (`Bearer <TOKEN>`).
- UUIDs reales de la base de datos (Órdenes, Usuarios).

---

### A. Pruebas de Creación de Pagos (`create-payment`)
*URL:* `POST /functions/v1/create-payment`

#### 1. Usuario no autenticado
- **Acción:** Enviar payload sin cabecera `Authorization`.
- **Resultado Esperado:** HTTP 401 Unauthorized (`{ error: 'No autorizado.' }`).
- **Verificación:** El pago no se crea.

#### 2. Usuario intentando pagar una orden ajena
- **Acción:** Enviar payload con un `orderId` de una orden que pertenece a otro `customer_id`.
- **Resultado Esperado:** HTTP 403 Forbidden (`{ error: 'El pedido no pertenece al usuario.' }`).
- **Verificación:** El pago no se crea.

#### 3. OrderId inexistente
- **Acción:** Enviar payload con un `orderId` que no existe (ej. `00000000-0000-0000-0000-000000000000`).
- **Resultado Esperado:** HTTP 404 Not Found (`{ error: 'Pedido no encontrado.' }`).
- **Verificación:** El pago no se crea.

#### 4. Monto alterado desde el cliente
- **Acción:** (N/A). El endpoint `create-payment` **NO ACEPTA** un parámetro `amount` en el payload. Obtiene el `total_cop` directamente desde PostgreSQL de forma segura usando el `orderId`.
- **Resultado Esperado:** Es imposible alterar el monto.

#### 14. Checkout remoto sin credenciales sandbox
- **Acción:** Desplegar función sin `SUPABASE_SERVICE_ROLE_KEY`.
- **Resultado Esperado:** El `createClient` fallará y el endpoint devolverá 500 Internal Server Error.

---

### B. Pruebas de Webhook (`payment-webhook`)
*URL:* `POST /functions/v1/payment-webhook`

#### 5. Webhook sin firma
- **Acción:** Enviar payload HTTP válido sin cabecera `x-sandbox-signature`.
- **Resultado Esperado:** HTTP 401 Unauthorized (`{ error: 'Firma inválida' }`).
- **Verificación:** El pago no se modifica.

#### 6. Webhook con firma incorrecta
- **Acción:** Enviar payload con cabecera `x-sandbox-signature` que no coincide con `WEBHOOK_SECRET`.
- **Resultado Esperado:** HTTP 401 Unauthorized.

#### 7. Webhook duplicado (Idempotencia) / 11. Reintento de pago
- **Acción:** Enviar repetidas veces un webhook con `status: 'approved'` para la misma `reference`.
- **Resultado Esperado:** La primera petición actualiza el estado y retorna HTTP 200. La segunda petición detecta que ya está `approved` e ignora el update, retornando HTTP 200 con `note: 'Idempotency caught'`.
- **Verificación:** Ninguna transacción duplicada se genera en BD.

#### 8. Webhook aprobado válido
- **Acción:** Enviar payload con firma válida y `status: 'approved'`.
- **Resultado Esperado:** HTTP 200. El pago en la BD cambia a `approved`.

#### 9. Webhook rechazado
- **Acción:** Enviar payload con firma válida y `status: 'declined'`.
- **Resultado Esperado:** HTTP 200. El pago en la BD cambia a `declined`.

#### 10. Pago asociado a otra orden
- **Acción:** (Protegido por diseño). La búsqueda en BD (`payment-webhook/index.ts:31`) se hace usando `provider_reference`, el cual es un string encriptado / inyectado unívocamente para un solo `order_id` en `create-payment`.
- **Verificación:** Un webhook nunca puede apuntar a otra orden.

#### 12. Error del proveedor
- **Acción:** Payload del webhook con `status: 'failed'`.
- **Resultado Esperado:** El estado muta a `failed` correctamente.

---

### C. Pruebas Estructurales y React

#### 13. Carrito Demo
- **Acción:** Operar React con `authMode === 'demo'`.
- **Resultado Esperado:** El carrito utiliza `PaymentSimulatorService`. Ninguna orden o pago viaja a Supabase. Todo queda en `localStorage`.

#### 15. Confirmar que no existen inserts directos a payments desde React
- **Acción:** Buscar `supabase.from('payments').insert(` en `src/`.
- **Resultado Esperado:** Búsqueda sin coincidencias. Todo uso ocurre vía Edge Functions y la RPC `update_order_status`. Adicionalmente, las pruebas 31-33 en `rls-smoke-tests.sql` lo bloquean por RLS nativamente en BD.
