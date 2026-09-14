import React from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Sliders, ListOrdered, Scale } from 'lucide-react';
import type { Tenant } from '../types';

interface TenantScore extends Tenant {
  score: number;
  equityBonus: number;
  newBonus: number;
  distanceScore: number;
}

export const FairAlgorithm: React.FC = () => {
  const { tenants, equityWeight, setEquityWeight } = useApp();

  const scoredRestaurants: TenantScore[] = tenants.map((r: Tenant) => {
    const equityBonus = (120 - r.salesWeekly) * equityWeight;
    const newBonus = r.isNew ? 25 : 0;
    const distanceScore = Math.max(0, (3 - r.distanceKm) * 10);
    const finalScore = Math.round((r.rating * 20) + equityBonus + newBonus + distanceScore);

    return {
      ...r,
      score: finalScore,
      equityBonus: Math.round(equityBonus),
      newBonus,
      distanceScore: Math.round(distanceScore)
    };
  }).sort((a: TenantScore, b: TenantScore) => b.score - a.score);

  const chartData = scoredRestaurants.map(r => ({
    name: r.name,
    score: r.score,
    equity: r.equityBonus,
    base: Math.round(r.rating * 20)
  }));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="tab-content active"
    >
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <span className="badge badge-secondary" style={{ padding: '6px 16px', fontSize: '0.82rem', fontWeight: 800 }}>
          ⚖️ ALGORITMO DE VISIBILIDAD ORGÁNICA E ÉTICA
        </span>
        <h2 style={{ fontSize: '2.1rem', fontWeight: 900, color: 'white', marginTop: '8px', letterSpacing: '-0.5px' }}>
          Simulador de Clasificación Justa sin Subastas de Publicidad
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '750px', margin: '6px auto 0' }}>
          Demostración interactiva de cómo GastroSync distribuye el tráfico entre comercios establecidos y cocinas independientes sin exigir pagos de publicidad.
        </p>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '1.75rem' }}>
        {/* Left Column: Algorithm Controls & Visual Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '28px', padding: '1.75rem' }}>
            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
              <div className="card-title" style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>
                <Sliders size={20} style={{ color: 'var(--primary)' }} /> Parámetros de Equidad Interactivos
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.88rem', color: 'white', fontWeight: 800, display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Factor de Equidad Social (Impulso a negocios emergentes):</span>
                <span className="badge badge-primary" style={{ fontSize: '0.85rem' }}>
                  {Math.round(equityWeight * 100)}%
                </span>
              </div>
              
              <input
                type="range"
                className="algo-slider"
                min="0"
                max="100"
                value={equityWeight * 100}
                onChange={(e) => setEquityWeight(parseFloat(e.target.value) / 100)}
                style={{ width: '100%', height: '8px', cursor: 'pointer' }}
              />
            </div>

            {/* Visual Recharts Bar Graph */}
            <div style={{ height: 220, marginTop: '1rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip contentStyle={{ background: '#0F172A', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', color: 'white' }} />
                  <Bar dataKey="base" name="Puntos por Rating/Calidad" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="equity" name="Bono de Equidad Social" fill="#FF5533" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '28px' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'white', fontWeight: 900 }}>
                <Scale size={20} style={{ color: '#10B981' }} /> ¿Por qué es Superior al Modelo Tradicional?
              </div>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              En plataformas tradicionales como Rappi u Uber Eats, las grandes marcas pagan comisiones premium para ocupar los primeros lugares, aplastando la visibilidad del pequeño cocinero local. En GastroSync la visibilidad se gana por la <strong>calidad real del plato</strong> y una <strong>rotación equitativa</strong>.
            </p>
          </div>

        </div>

        {/* Right Column: Ranked Restaurant List */}
        <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '28px' }}>
          <div className="card-header" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ color: 'white', fontWeight: 900 }}>
              <ListOrdered size={20} style={{ color: '#F59E0B' }} /> Posicionamiento en Feed del Cliente
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <AnimatePresence>
              {scoredRestaurants.map((r: TenantScore, index: number) => (
                <motion.div 
                  layout
                  key={r.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: index === 0 ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}>
                      #{index + 1}
                    </div>
                    <div>
                      <strong style={{ color: 'white', fontSize: '0.95rem' }}>{r.logoEmoji} {r.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '10px', marginTop: '3px' }}>
                        <span>⭐ {r.rating}</span>
                        <span>• {r.salesWeekly} ventas/sem</span>
                        <span>• 📍 {r.distanceKm} km</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-primary" style={{ fontWeight: 900 }}>Score: {r.score}</span>
                    <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '3px', fontWeight: 700 }}>
                      Bono Equidad: +{r.equityBonus} pts
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </motion.div>
  );
};
