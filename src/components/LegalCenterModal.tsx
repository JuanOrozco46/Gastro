import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Cookie,
  Scale,
  CheckCircle2,
  Building2,
  Lock,
  Trash2,
  Image as ImageIcon,
  Type,
  SlidersHorizontal,
} from 'lucide-react';
import {
  LEGAL_OPEN_EVENT,
  openCookieSettingsBanner,
  CURRENT_LEGAL_POLICY_VERSION,
} from '../utils/legalNavigation';
import type { LegalTabId } from '../utils/legalNavigation';

function getInitialLegalTabFromUrl(): LegalTabId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const legalParam = params.get('legal');
  if (
    legalParam === 'privacy' ||
    legalParam === 'terms' ||
    legalParam === 'cookies' ||
    legalParam === 'rnbd'
  ) {
    return legalParam;
  }
  return null;
}

export const LegalCenterModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(() => getInitialLegalTabFromUrl() !== null);
  const [activeTab, setActiveTab] = useState<LegalTabId>(
    () => getInitialLegalTabFromUrl() || 'privacy'
  );

  useEffect(() => {
    const handleOpenEvent = (event: Event) => {
      const customEvent = event as CustomEvent<LegalTabId | undefined>;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
      setIsOpen(true);
    };

    window.addEventListener(LEGAL_OPEN_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener(LEGAL_OPEN_EVENT, handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('legal')) {
      url.searchParams.delete('legal');
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div
      className="gs-legal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gs-legal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="gs-legal-modal">
        {/* Cabecera editorial */}
        <header className="gs-legal-header">
          <div className="gs-legal-header-brand">
            <span className="gs-legal-badge">
              <ShieldCheck size={14} /> Cumplimiento Legal Colombia · Versión {CURRENT_LEGAL_POLICY_VERSION}
            </span>
            <h2 id="gs-legal-modal-title" className="gs-legal-title">
              Centro de Privacidad, Habeas Data y Términos Legales
            </h2>
            <p className="gs-legal-subtitle">
              Marco normativo conforme a la Ley Estatutaria 1581 de 2012, Decreto 1377 de 2013, Decreto 090 de 2018 (SIC) y Ley 1480 de 2011 (Estatuto del Consumidor).
            </p>
          </div>
          <button
            type="button"
            className="gs-legal-close-btn"
            onClick={handleClose}
            aria-label="Cerrar centro legal"
          >
            <X size={20} />
          </button>
        </header>

        {/* Navegación por pestañas */}
        <nav className="gs-legal-tabs" aria-label="Secciones legales">
          <button
            type="button"
            className={`gs-legal-tab ${activeTab === 'privacy' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <ShieldCheck size={16} />
            <span>Política de Privacidad</span>
          </button>
          <button
            type="button"
            className={`gs-legal-tab ${activeTab === 'terms' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            <FileText size={16} />
            <span>Términos y Condiciones</span>
          </button>
          <button
            type="button"
            className={`gs-legal-tab ${activeTab === 'cookies' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('cookies')}
          >
            <Cookie size={16} />
            <span>Política de Cookies</span>
          </button>
          <button
            type="button"
            className={`gs-legal-tab ${activeTab === 'rnbd' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('rnbd')}
          >
            <Scale size={16} />
            <span>RNBD (SIC) y Licencias</span>
          </button>
        </nav>

        {/* Cuerpo del documento */}
        <div className="gs-legal-body">
          {activeTab === 'privacy' && (
            <article className="gs-legal-article">
              <div className="gs-legal-highlight-card">
                <div className="gs-legal-highlight-header">
                  <Lock size={18} />
                  <strong>Resumen de Protección de Datos Personales (Ley 1581 de 2012)</strong>
                </div>
                <p>
                  En GastroSync tú eres el único dueño de tu información. Nunca vendemos bases de datos a terceros, aplicamos aislamiento criptográfico por restaurante (Row Level Security) y puedes ejercer tu <strong>Derecho de Supresión (&ldquo;Derecho al Olvido&rdquo;)</strong> en tiempo real desde tu perfil.
                </p>
              </div>

              <section className="gs-legal-section">
                <h3>1. Identificación del Responsable del Tratamiento</h3>
                <p>
                  <strong>GastroSync Colombia</strong> (en adelante, &ldquo;GastroSync&rdquo; o la &ldquo;Plataforma&rdquo;), operando como infraestructura tecnológica de comercio electrónico gastronómico en la República de Colombia, actúa en calidad de <strong>Responsable del Tratamiento</strong> respecto de los datos de registro y operación en la plataforma, y como <strong>Encargado del Tratamiento</strong> respecto del canal de pedidos de los Restaurantes Aliados.
                </p>
                <ul className="gs-legal-list">
                  <li><strong>Canal oficial de Habeas Data y Privacidad:</strong> <code>privacidad@gastrosync.co</code></li>
                  <li><strong>Jurisdicción aplicable:</strong> República de Colombia (Superintendencia de Industria y Comercio — SIC).</li>
                  <li><strong>Entrada en vigencia de la presente versión:</strong> Octubre de 2026 (Versión {CURRENT_LEGAL_POLICY_VERSION}).</li>
                </ul>
              </section>

              <section className="gs-legal-section">
                <h3>2. Categorías de Datos Personales Recolectados</h3>
                <p>
                  Recolectamos exclusivamente los datos estrictamente necesarios, pertinentes y no excesivos para la prestación del servicio gastronómico (Principio de Libertad y Finalidad, Art. 4 Ley 1581 de 2012):
                </p>
                <div className="gs-legal-grid-2">
                  <div className="gs-legal-subcard">
                    <h4>Comensales y Usuarios</h4>
                    <ul className="gs-legal-list">
                      <li>Nombre completo y nombre de usuario (<code>@handle</code>).</li>
                      <li>Correo electrónico autenticado y teléfono celular de contacto para entregas.</li>
                      <li>Dirección física de entrega e indicaciones de domicilio (cuando solicita envío).</li>
                      <li>Historial de pedidos, reseñas verificadas y favoritos en el feed.</li>
                    </ul>
                  </div>
                  <div className="gs-legal-subcard">
                    <h4>Restaurantes Aliados y Propietarios</h4>
                    <ul className="gs-legal-list">
                      <li>Nombre comercial, ciudad, zona de cobertura y dirección del establecimiento.</li>
                      <li>Nombre del representante o propietario, correo corporativo y WhatsApp operativo.</li>
                      <li>Datos de cuenta bancaria o billetera para la dispersión del 97% del valor de sus ventas digitales.</li>
                    </ul>
                  </div>
                </div>
                <p className="gs-legal-note">
                  <strong>Nota sobre datos financieros sensibles:</strong> GastroSync <strong>NO almacena números completos de tarjetas de crédito, códigos CVV ni claves bancarias</strong>. Todas las transacciones digitales son procesadas directamente por la pasarela certificada PCI-DSS <strong>Wompi (Bancolombia)</strong>.
                </p>
              </section>

              <section className="gs-legal-section">
                <h3>3. Finalidades del Tratamiento Autorizado</h3>
                <ul className="gs-legal-list">
                  <li>Procesar, transmitir a cocina (KDS) y entregar los pedidos solicitados en modalidad Domicilio, Para recoger o Servicio en Mesa QR.</li>
                  <li>Compartir con el Restaurante Aliado seleccionado únicamente el nombre, teléfono y dirección necesarios para preparar y despachar el pedido.</li>
                  <li>Gestionar la conciliación de pagos electrónicos con Wompi y calcular las liquidaciones semanales de los comercios aliados.</li>
                  <li>Permitir la publicación de comentarios, likes y reseñas gastronómicas dentro de la comunidad.</li>
                  <li>Prevenir fraudes transaccionales, suplantaciones de identidad o cobros duplicados.</li>
                </ul>
              </section>

              <section className="gs-legal-section">
                <h3>4. Derechos de los Titulares (Art. 8 Ley 1581 de 2012)</h3>
                <p>Como titular de tus datos personales tienes derecho en todo momento y de forma gratuita a:</p>
                <ul className="gs-legal-list">
                  <li><strong>Conocer, actualizar y rectificar</strong> tus datos frente a GastroSync desde la ventana <em>Mi Perfil</em> o el <em>Panel Administrativo</em>.</li>
                  <li><strong>Solicitar prueba de la autorización</strong> otorgada (registrada con marca de tiempo exacta en tu perfil).</li>
                  <li><strong>Revocar la autorización y/o solicitar la supresión total de tus datos</strong> cuando lo desees, salvo que exista un deber legal o contractual de permanecer en la base de datos.</li>
                  <li><strong>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC)</strong> por infracciones a la Ley 1581 de 2012.</li>
                </ul>
              </section>

              <section className="gs-legal-section">
                <h3>5. Mecanismo Automático de Supresión de Cuenta y Baja de Restaurante</h3>
                <div className="gs-legal-subcard">
                  <h4>
                    <Trash2 size={16} /> Autoservicio inmediato dentro de la aplicación
                  </h4>
                  <p>
                    Además del canal de correo electrónico (con plazos máximos de ley de 10 días hábiles para consultas y 15 días hábiles para reclamos conforme a los Arts. 14 y 15 de la Ley 1581), GastroSync incorpora un <strong>mecanismo de supresión inmediata en un clic</strong>:
                  </p>
                  <ul className="gs-legal-list">
                    <li>
                      <strong>Para Clientes:</strong> Ingresa a <em>Mi Perfil &rarr; Zona de Privacidad y Baja de Cuenta</em> y confirma <code>ELIMINAR MI CUENTA</code>. El sistema elimina tu perfil, avatar, reseñas, likes y comentarios, y <strong>anonimiza irreversiblemente tus órdenes históricas</strong> (reemplazando tu nombre y teléfono por <em>&ldquo;Titular Suprimido (Ley 1581)&rdquo;</em> para preservar únicamente los soportes contables exigidos por el Estatuto Tributario).
                    </li>
                    <li>
                      <strong>Para Restaurantes Aliados:</strong> Ingresa a <em>Panel Admin &rarr; Configuración &rarr; Privacidad, Datos y Baja del Comercio</em> y confirma <code>ELIMINAR RESTAURANTE</code>. El sistema desactiva el restaurante, elimina su catálogo de productos sin historial contable, borra publicaciones y purga todos los teléfonos, direcciones y cuentas bancarias del propietario.
                    </li>
                  </ul>
                </div>
              </section>
            </article>
          )}

          {activeTab === 'terms' && (
            <article className="gs-legal-article">
              <div className="gs-legal-highlight-card">
                <div className="gs-legal-highlight-header">
                  <FileText size={18} />
                  <strong>Términos y Condiciones de Uso — Plataforma GastroSync</strong>
                </div>
                <p>
                  Regulados por la Ley 1480 de 2011 (Estatuto del Consumidor), la Ley 527 de 1999 (Comercio Electrónico en Colombia) y el Código de Comercio Colombiano.
                </p>
              </div>

              <section className="gs-legal-section">
                <h3>1. Naturaleza del Servicio y Rol de GastroSync</h3>
                <p>
                  GastroSync es una plataforma tecnológica interactiva que combina un directorio social gastronómico con herramientas de gestión de pedidos (KDS) y recaudo electrónico. <strong>Los alimentos y bebidas exhibidos son preparados, manipulados, empacados y despachados directamente por cada Restaurante Aliado independiente</strong>, quien ostenta la calidad de productor y proveedor directo frente al consumidor en materia sanitaria y de calidad alimentaria.
                </p>
              </section>

              <section className="gs-legal-section">
                <h3>2. Precios, Modalidades de Pedido y Pagos</h3>
                <ul className="gs-legal-list">
                  <li><strong>Moneda e impuestos:</strong> Todos los precios se expresan en Pesos Colombianos (COP) e incluyen los impuestos aplicables (IVA o Impoconsumo según el régimen tributario del restaurante). El costo de envío (si aplica) se informa de manera discriminada antes de pagar.</li>
                  <li><strong>Modalidades operativas:</strong> El usuario puede elegir entre <em>Envío a domicilio</em>, <em>Para recoger en el local</em> o <em>Servicio en Mesa QR</em>.</li>
                  <li><strong>Medios de pago:</strong> Pagos digitales procesados en línea mediante <strong>Wompi (Bancolombia)</strong> o pago en efectivo contra entrega en los comercios que habiliten dicha modalidad.</li>
                </ul>
              </section>

              <section className="gs-legal-section">
                <h3>3. Cancelaciones, Derecho de Retracto y Reversión de Pago</h3>
                <ul className="gs-legal-list">
                  <li>
                    <strong>Excepción al Derecho de Retracto en Alimentos Preparados (Art. 47 num. 4 y 7, Ley 1480 de 2011):</strong> Dado que los platos del menú son bienes perecederos preparados bajo pedido inmediato, el pedido puede cancelarse sin costo mientras se encuentre en estado <code>Recibido (pending)</code>. Una vez el restaurante inicia la cocción (<code>En preparación</code>), no procede el retracto unilateral salvo incumplimiento en la entrega o defecto de calidad.
                  </li>
                  <li>
                    <strong>Reversión del Pago Electrónico (Art. 51 Ley 1480 de 2011 y Decreto 587 de 2016):</strong> Cuando el usuario pague mediante tarjeta, PSE o billetera digital a través de Wompi, podrá solicitar la reversión dentro de los cinco (5) días hábiles siguientes en caso de: (i) ser objeto de fraude, (ii) operación no solicitada, (iii) no recibir el pedido pagado, o (iv) recibir un producto defectuoso o que no corresponda a lo solicitado. Además, nuestro motor financiero marca automáticamente como <code>reembolsado (refunded)</code> todo pago digital cuyo pedido sea cancelado antes de entregarse.
                  </li>
                </ul>
              </section>

              <section className="gs-legal-section">
                <h3>4. Condiciones Comerciales para Restaurantes Aliados</h3>
                <ul className="gs-legal-list">
                  <li><strong>Comisión ética del 3%:</strong> GastroSync cobra una tarifa tecnológica plana del 3% sobre el subtotal y domicilio de las órdenes efectivamente completadas, más el costo directo de procesamiento bancario de Wompi cuando el pago es digital.</li>
                  <li><strong>Liquidación de comisiones en efectivo:</strong> Para órdenes pagadas en efectivo directamente al restaurante, la comisión del 3% se acumula en el balance operativo del comercio. Si el saldo pendiente supera el tope de seguridad configurado ($150.000 COP por defecto), la recepción de nuevos pedidos en efectivo se pausa automáticamente hasta conciliar el corte.</li>
                  <li><strong>Propiedad intelectual de fotografías:</strong> El Restaurante Aliado declara ser titular o contar con licencia comercial sobre las fotografías, videos y logotipos que suba a su menú y perfil.</li>
                </ul>
              </section>
            </article>
          )}

          {activeTab === 'cookies' && (
            <article className="gs-legal-article">
              <div className="gs-legal-highlight-card">
                <div className="gs-legal-highlight-header">
                  <Cookie size={18} />
                  <strong>Transparencia en Cookies y Almacenamiento Local (LocalStorage)</strong>
                </div>
                <p>
                  GastroSync no utiliza cookies publicitarias invasivas ni rastreadores de terceros para vender perfiles de navegación. Utilizamos almacenamiento local del navegador para mantener tu sesión segura y tu carrito activo.
                </p>
              </div>

              <section className="gs-legal-section">
                <h3>Inventario Técnico de Almacenamiento Local</h3>
                <div className="gs-legal-table-wrap">
                  <table className="gs-legal-table">
                    <thead>
                      <tr>
                        <th>Identificador</th>
                        <th>Categoría</th>
                        <th>Finalidad en GastroSync</th>
                        <th>Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>sb-*-auth-token</code></td>
                        <td>Esencial (Seguridad)</td>
                        <td>Mantiene tu sesión autenticada y segura con Supabase Auth (JWT).</td>
                        <td>Sesión activa</td>
                      </tr>
                      <tr>
                        <td><code>gs_cart_v1</code></td>
                        <td>Esencial (Transaccional)</td>
                        <td>Conserva los platos agregados a tu carrito para que no se pierdan al recargar.</td>
                        <td>Persistente local</td>
                      </tr>
                      <tr>
                        <td><code>gs_cookie_consent_v1</code></td>
                        <td>Esencial (Legal)</td>
                        <td>Guarda tu decisión y preferencias sobre el banner de cookies.</td>
                        <td>12 meses</td>
                      </tr>
                      <tr>
                        <td><code>gs_selected_city_slug</code></td>
                        <td>Funcional</td>
                        <td>Recuerda tu ciudad y zona elegida en Colombia para filtrar restaurantes cercanos.</td>
                        <td>Persistente local</td>
                      </tr>
                      <tr>
                        <td><code>gs_device_id</code></td>
                        <td>Funcional (Mesa QR)</td>
                        <td>Identificador anónimo aleatorio para asociar pedidos hechos desde código QR en mesa.</td>
                        <td>Sesión de mesa</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="gs-legal-section">
                <div className="gs-legal-action-row">
                  <div>
                    <h3>Gestionar mis preferencias de cookies</h3>
                    <p>Puedes abrir el panel de configuración en cualquier momento para modificar las categorías opcionales.</p>
                  </div>
                  <button
                    type="button"
                    className="gs-legal-secondary-btn"
                    onClick={() => {
                      handleClose();
                      openCookieSettingsBanner();
                    }}
                  >
                    <SlidersHorizontal size={16} /> Configurar Cookies
                  </button>
                </div>
              </section>
            </article>
          )}

          {activeTab === 'rnbd' && (
            <article className="gs-legal-article">
              <div className="gs-legal-highlight-card">
                <div className="gs-legal-highlight-header">
                  <Scale size={18} />
                  <strong>¿Debemos registrar la Base de Datos ante la SIC (RNBD)?</strong>
                </div>
                <p>
                  Explicación jurídica conforme al <strong>Decreto 090 del 18 de enero de 2018</strong> (que modificó el Decreto Único Reglamentario 1074 de 2015) expedido por el Ministerio de Comercio, Industria y Turismo.
                </p>
              </div>

              <section className="gs-legal-section">
                <h3>1. Regla Legal del Registro Nacional de Bases de Datos (RNBD) en Colombia</h3>
                <p>
                  Originalmente, la Ley 1581 de 2012 exigía a todas las empresas inscribir sus bases de datos ante la Superintendencia de Industria y Comercio (SIC). Sin embargo, el <strong>Decreto 090 de 2018</strong> redujo el universo de obligados para no imponer cargas desproporcionadas a micro y pequeñas empresas:
                </p>
                <div className="gs-legal-grid-2">
                  <div className="gs-legal-subcard">
                    <h4>
                      <Building2 size={16} /> ¿Quiénes SÍ están obligados a inscribir en el portal RNBD de la SIC?
                    </h4>
                    <p>
                      Únicamente las sociedades y entidades sin ánimo de lucro que tengan <strong>activos totales superiores a 100.000 UVT</strong> (Unidades de Valor Tributario, equivalentes a aprox. <strong>$4.979 millones COP en 2025 / $5.230 millones COP en 2026</strong>) y las personas jurídicas de naturaleza pública.
                    </p>
                  </div>
                  <div className="gs-legal-subcard">
                    <h4>
                      <CheckCircle2 size={16} /> ¿Qué aplica para GastroSync hoy (Startup / Pyme)?
                    </h4>
                    <p>
                      Mientras los activos totales de la sociedad o persona natural operadora sean inferiores a 100.000 UVT, el Decreto 090 de 2018 contempla exención del cargue en el portal RNBD de la SIC; sin embargo, <strong>esta calificación requiere revisión jurídica externa formal según la razón social, NIT y estados financieros certificados del operador antes de operación comercial</strong>. En todos los escenarios es obligatorio cumplir los deberes sustanciales de la Ley 1581 de 2012 (Política de Privacidad, Consentimiento Informado trazable, Seguridad RLS y Canal de Supresión).
                    </p>
                  </div>
                </div>
              </section>

              <section className="gs-legal-section">
                <h3>2. Inventario Interno de Bases de Datos (Listo para Auditoría SIC / RNBD)</h3>
                <p>
                  Para garantizar buenas prácticas de gobierno de datos (Principio de Responsabilidad Demostrada / <em>Accountability</em>) y dejar listo el expediente en caso de registro voluntario o crecimiento sobre 100.000 UVT, GastroSync mantiene documentadas sus cuatro (4) bases de datos lógicas en PostgreSQL (Supabase):
                </p>
                <div className="gs-legal-table-wrap">
                  <table className="gs-legal-table">
                    <thead>
                      <tr>
                        <th>Nombre de la Base</th>
                        <th>Tablas Principales</th>
                        <th>Titulares</th>
                        <th>Finalidad Principal</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>BD-01: Usuarios y Perfiles</strong></td>
                        <td><code>auth.users</code>, <code>public.profiles</code></td>
                        <td>Comensales y Usuarios registrados</td>
                        <td>Autenticación, perfil social, trazabilidad de consentimiento Ley 1581.</td>
                      </tr>
                      <tr>
                        <td><strong>BD-02: Comercios Aliados</strong></td>
                        <td><code>restaurants</code>, <code>restaurant_applications</code>, <code>restaurant_members</code></td>
                        <td>Propietarios y personal de restaurantes</td>
                        <td>Vinculación B2B, exhibición de catálogo y dispersión bancaria del 97%.</td>
                      </tr>
                      <tr>
                        <td><strong>BD-03: Pedidos y Pagos</strong></td>
                        <td><code>orders</code>, <code>order_items</code>, <code>payments</code></td>
                        <td>Compradores y comercios</td>
                        <td>Despacho de alimentos, conciliación Wompi y soporte contable/tributario.</td>
                      </tr>
                      <tr>
                        <td><strong>BD-04: Interacción Social</strong></td>
                        <td><code>posts</code>, <code>post_comments</code>, <code>post_likes</code>, <code>restaurant_reviews</code></td>
                        <td>Comunidad GastroSync</td>
                        <td>Reseñas gastronómicas verificadas, favoritos y feed multimedia.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="gs-legal-section">
                <h3>3. Licencias de Tipografías, Iconografía y Fotografías</h3>
                <div className="gs-legal-grid-2">
                  <div className="gs-legal-subcard">
                    <h4>
                      <Type size={16} /> Tipografías e Iconos (Uso Comercial Libre)
                    </h4>
                    <ul className="gs-legal-list">
                      <li>
                        <strong>Playfair Display</strong> (Títulos editoriales): Licencia <strong>SIL Open Font License (OFL) v1.1</strong> vía Google Fonts. Autoriza uso comercial gratuito en web y apps sin regalías.
                      </li>
                      <li>
                        <strong>Figtree</strong> (Interfaz y lectura): Licencia <strong>SIL Open Font License (OFL) v1.1</strong> vía Google Fonts.
                      </li>
                      <li>
                        <strong>JetBrains Mono</strong> (Cifras, precios COP y códigos): Licencia <strong>SIL Open Font License (OFL) v1.1</strong> vía Google Fonts.
                      </li>
                      <li>
                        <strong>Lucide Icons (<code>lucide-react</code>)</strong>: Licencia abierta <strong>ISC / MIT</strong> para uso comercial ilimitado.
                      </li>
                    </ul>
                  </div>
                  <div className="gs-legal-subcard">
                    <h4>
                      <ImageIcon size={16} /> Fotografías Gastronómicas (Unsplash License)
                    </h4>
                    <p>
                      Todas las fotografías de ambientación del carrusel de bienvenida y del catálogo de demostración provienen de <strong>Unsplash (<code>images.unsplash.com</code>)</strong> bajo la <strong>Licencia Oficial de Unsplash</strong>:
                    </p>
                    <ul className="gs-legal-list">
                      <li>Uso gratuito para fines comerciales y no comerciales en todo el mundo.</li>
                      <li>No requiere pago de regalías ni atribución obligatoria (aunque documentamos el origen por transparencia).</li>
                      <li>Los restaurantes reales vinculados en modo producción son responsables de subir fotografías propias de sus platos conforme a la cláusula 4 de los Términos y Condiciones.</li>
                    </ul>
                  </div>
                </div>
              </section>
            </article>
          )}
        </div>

        {/* Pie del modal */}
        <footer className="gs-legal-footer">
          <div className="gs-legal-footer-meta">
            <span>GastroSync Colombia · Protección de Datos Ley 1581 de 2012</span>
            <span>Contacto oficial: privacidad@gastrosync.co</span>
          </div>
          <div className="gs-legal-footer-actions">
            <button
              type="button"
              className="gs-legal-secondary-btn"
              onClick={() => {
                handleClose();
                openCookieSettingsBanner();
              }}
            >
              <Cookie size={15} /> Preferencias de Cookies
            </button>
            <button type="button" className="gs-legal-primary-btn" onClick={handleClose}>
              Entendido y cerrar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
