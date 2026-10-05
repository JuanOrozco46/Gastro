import React, { useState } from 'react';
import {
  Building2, ShieldCheck, Zap,
  MessageSquare, ArrowRight, Percent,
  X, ChevronDown
} from 'lucide-react';
import { PartnerApplicationModal } from './PartnerApplicationModal';

interface PartnerLandingViewProps {
  onClose?: () => void;
}

export const PartnerLandingView: React.FC<PartnerLandingViewProps> = ({ onClose }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: '¿Cuál es la comisión por venta en GastroSync?',
      a: 'Cobramos únicamente una comisión justa del 3% por cada pedido procesado. Sin costos ocultos, sin mensualidades forzadas ni penalizaciones.'
    },
    {
      q: '¿Cuánto tiempo tarda la revisión de mi solicitud?',
      a: 'Nuestro equipo valida la información comercial y la zona urbana elegida en un plazo máximo de 24 a 48 horas hábiles.'
    },
    {
      q: '¿Cómo recibo el acceso a mi panel administrativo (KDS)?',
      a: 'Una vez aprobada tu solicitud, recibirás un correo electrónico de invitación segura para crear tu contraseña y acceder inmediatamente al panel del restaurante.'
    },
    {
      q: '¿Qué necesito para registrar mi comercio?',
      a: 'Únicamente el nombre comercial, datos del propietario (correo y teléfono), dirección en una ciudad activa y definir tus modalidades de atención (recoger en local, domicilio o mesa).'
    }
  ];

  return (
    <div
      className="partner-landing-container"
      style={{
        background: 'var(--bg-main, #0F172A)',
        color: 'white',
        minHeight: '100vh',
        padding: '1.5rem 1rem 4rem',
        maxWidth: '1100px',
        margin: '0 auto'
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'var(--primary, #EF4444)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.2rem'
            }}
          >
            🍳
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, color: 'white' }}>
              GastroSync Partners
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94A3B8)' }}>
              Red de Restaurantes Aliados
            </span>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: '10px',
              padding: '8px 14px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              fontWeight: 700
            }}
          >
            <X size={16} /> Volver a la App
          </button>
        )}
      </div>

      {/* Hero Section */}
      <div
        style={{
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(30, 41, 59, 0.8))',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '28px',
          marginBottom: '3rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10B981',
            borderRadius: '20px',
            padding: '6px 16px',
            fontSize: '0.8rem',
            fontWeight: 800,
            marginBottom: '1rem'
          }}
        >
          <ShieldCheck size={16} /> VINCULACIÓN PROFESIONAL MULTI-CIUDAD
        </div>

        <h2 style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1.2, marginBottom: '1rem', color: 'white' }}>
          Haz crecer tu restaurante con comisiones justas del <span style={{ color: 'var(--primary, #EF4444)' }}>3%</span>
        </h2>

        <p style={{ fontSize: '1rem', color: '#94A3B8', maxWidth: '640px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
          Únete a la plataforma gastronómica que conecta directamente tu cocina con los clientes de tu ciudad, sin intermediarios abusivos ni comisiones del 30%.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: '14px 32px',
            borderRadius: '16px',
            fontSize: '1rem',
            fontWeight: 800,
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>Solicitar Vinculación Gratis</span>
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Benefits Grid */}
      <div style={{ marginBottom: '3.5rem' }}>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 900, textAlign: 'center', marginBottom: '2rem' }}>
          ¿Por qué elegir GastroSync?
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem'
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              padding: '1.5rem'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Percent size={22} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Comisión Justa del 3%</h4>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.5 }}>
              Conserva el 97% del valor de tus ventas. Diseñado para garantizar la rentabilidad de tu negocio local.
            </p>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              padding: '1.5rem'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Zap size={22} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Panel KDS en Tiempo Real</h4>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.5 }}>
              Recibe y administra tus pedidos de cocina al instante. Notificaciones en vivo y seguimiento de estados.
            </p>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              padding: '1.5rem'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Building2 size={22} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Presencia Multi-Ciudad</h4>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.5 }}>
              Posiciona tu marca en las ciudades y zonas activas de cobertura. Atrae clientes cercanos a tu cocina.
            </p>
          </div>
        </div>
      </div>

      {/* How it works Process */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '24px',
          padding: '2rem 1.5rem',
          marginBottom: '3.5rem'
        }}
      >
        <h3 style={{ fontSize: '1.3rem', fontWeight: 900, textAlign: 'center', marginBottom: '2rem' }}>
          ¿Cómo funciona el proceso de vinculación?
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>1</div>
            <h5 style={{ fontWeight: 800, marginBottom: '0.4rem' }}>Completa el Formulario</h5>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Ingresa los datos de tu comercio, ciudad y modalidades de entrega.</p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>2</div>
            <h5 style={{ fontWeight: 800, marginBottom: '0.4rem' }}>Revisión Administrativa</h5>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Nuestro equipo valida la información comercial en 24 a 48h.</p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>3</div>
            <h5 style={{ fontWeight: 800, marginBottom: '0.4rem' }}>Activación e Invitación</h5>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Recibes una invitación segura por email para configurar tu contraseña.</p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>4</div>
            <h5 style={{ fontWeight: 800, marginBottom: '0.4rem' }}>Carga tu Menú y Vende</h5>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Abre tu restaurante en el directorio y empieza a recibir pedidos.</p>
          </div>
        </div>
      </div>

      {/* FAQs Section */}
      <div style={{ marginBottom: '3.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 900, textAlign: 'center', marginBottom: '1.5rem' }}>
          Preguntas Frecuentes
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '14px',
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <span>{faq.q}</span>
                  <ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {isOpen && (
                  <div style={{ padding: '0 18px 14px 18px', fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.5 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Support & CTA Footer */}
      <div
        style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '20px'
        }}
      >
        <h4 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>¿Tienes dudas adicionales sobre tu registro?</h4>
        <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '1.25rem' }}>
          Contacta con nuestro equipo de soporte comercial para alianzas estratégicas.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{ fontWeight: 800, padding: '10px 24px', borderRadius: '12px' }}
          >
            Solicitar Vinculación
          </button>
          <a
            href="https://wa.me/573000000000?text=Hola,%20deseo%20informaci%C3%B3n%20para%20vincular%20mi%20restaurante%20a%20GastroSync"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ fontWeight: 700, padding: '10px 20px', borderRadius: '12px', color: 'white', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <MessageSquare size={16} /> Soporte por WhatsApp
          </a>
        </div>
      </div>

      {/* Partner Application Modal */}
      <PartnerApplicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
