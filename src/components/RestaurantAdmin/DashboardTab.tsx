import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  Clock,
  Eye,
  Film,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  QrCode,
  ShoppingBag,
  Star,
  TrendingUp,
  Utensils
} from 'lucide-react';
import type { Order, Post, Product, StoryItem, Tenant } from '../../types';

type Period = 7 | 30 | 90;

interface DashboardTabProps {
  tenant: Tenant;
  orders: Order[];
  products: Product[];
  posts: Post[];
  storyItems: StoryItem[];
  onNavigate: (tab: 'menu' | 'content' | 'reviews' | 'analytics' | 'orders') => void;
}

const DAY = 86_400_000;
const EASE = [0.22, 1, 0.36, 1] as const;

const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : cop(n);
const num = (n: number) => Math.round(n).toLocaleString('es-CO');

const fulfillmentOf = (o: Order): 'table_service' | 'restaurant_delivery' | 'pickup' => {
  if (o.fulfillment) return o.fulfillment;
  const t = (o.type || '').toLowerCase();
  if (t.includes('mesa')) return 'table_service';
  if (t.includes('domicilio')) return 'restaurant_delivery';
  return 'pickup';
};

const CHANNELS = [
  { key: 'table_service', label: 'Mesa QR', icon: QrCode, color: '#C85A38' },
  { key: 'restaurant_delivery', label: 'Domicilio', icon: Bike, color: '#6B8C6A' },
  { key: 'pickup', label: 'Recoger', icon: ShoppingBag, color: '#8B6F47' }
] as const;

const Delta: React.FC<{ current: number; previous: number }> = ({ current, previous }) => {
  if (previous === 0 && current === 0) return <span className="gsd-delta flat">Sin cambios</span>;
  if (previous === 0) return <span className="gsd-delta up"><ArrowUpRight size={13} /> Nuevo</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`gsd-delta ${up ? 'up' : 'down'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
};

const ChartTooltip: React.FC<{ active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string; money?: boolean }> = ({
  active,
  payload,
  label,
  money
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="gsd-tooltip">
      <span>{label}</span>
      {payload.map(p => (
        <strong key={p.name}>{money ? cop(p.value) : `${num(p.value)} pedidos`}</strong>
      ))}
    </div>
  );
};

export const DashboardTab: React.FC<DashboardTabProps> = ({ tenant, orders, products, posts, storyItems, onNavigate }) => {
  const [period, setPeriod] = useState<Period>(30);
  const [dishSort, setDishSort] = useState<'qty' | 'revenue'>('revenue');

  const [now] = useState(() => Date.now());

  const data = useMemo(() => {
    const start = now - period * DAY;
    const prevStart = start - period * DAY;
    const valid = orders.filter(o => o.status !== 'cancelled');
    const current = valid.filter(o => o.createdAt >= start);
    const previous = valid.filter(o => o.createdAt >= prevStart && o.createdAt < start);
    const cancelled = orders.filter(o => o.status === 'cancelled' && o.createdAt >= start).length;

    const revenue = current.reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = previous.reduce((s, o) => s + (o.total || 0), 0);
    const units = current.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
    const prevUnits = previous.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
    const avgTicket = current.length ? revenue / current.length : 0;
    const prevAvg = previous.length ? prevRevenue / previous.length : 0;

    // Daily series
    const buckets = period === 90 ? 13 : period;
    const bucketMs = (period * DAY) / buckets;
    const series = Array.from({ length: buckets }, (_, i) => {
      const from = start + i * bucketMs;
      const d = new Date(from);
      return {
        label:
          period === 90
            ? `Sem ${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`
            : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
        ventas: 0
      };
    });
    current.forEach(o => {
      const idx = Math.min(buckets - 1, Math.floor((o.createdAt - start) / bucketMs));
      if (idx >= 0) series[idx].ventas += o.total || 0;
    });

    // Dishes
    const productById = new Map(products.map(p => [p.id, p]));
    const productByName = new Map(products.map(p => [p.name.toLowerCase(), p]));
    const dishMap = new Map<string, { name: string; emoji: string; category: string; qty: number; revenue: number; prevQty: number }>();
    const addItems = (list: Order[], prev: boolean) =>
      list.forEach(o =>
        o.items.forEach(item => {
          const prod = productById.get(item.id) || productByName.get(item.name.toLowerCase());
          const key = prod?.id || item.name.toLowerCase();
          const entry = dishMap.get(key) || {
            name: prod?.name || item.name,
            emoji: prod?.emoji || '🍽️',
            category: prod?.category || 'Otros',
            qty: 0,
            revenue: 0,
            prevQty: 0
          };
          if (prev) entry.prevQty += item.qty;
          else {
            entry.qty += item.qty;
            entry.revenue += item.qty * item.price;
          }
          dishMap.set(key, entry);
        })
      );
    addItems(current, false);
    addItems(previous, true);
    const dishes = [...dishMap.values()].filter(d => d.qty > 0);
    const dishRevenueTotal = dishes.reduce((s, d) => s + d.revenue, 0);
    const soldIds = new Set([...dishMap.entries()].filter(([, d]) => d.qty > 0).map(([k]) => k));
    const unsold = products.filter(p => p.available && !soldIds.has(p.id));

    // Categories
    const catMap = new Map<string, number>();
    dishes.forEach(d => catMap.set(d.category, (catMap.get(d.category) || 0) + d.revenue));
    const categories = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Channels
    const channels = CHANNELS.map(c => {
      const list = current.filter(o => fulfillmentOf(o) === c.key);
      return { ...c, count: list.length, revenue: list.reduce((s, o) => s + (o.total || 0), 0) };
    });

    // Hours
    const hours = Array.from({ length: 24 }, (_, h) => ({ hora: `${h}h`, pedidos: 0 }));
    current.forEach(o => {
      hours[new Date(o.createdAt).getHours()].pedidos += 1;
    });
    const firstActive = hours.findIndex(h => h.pedidos > 0);
    const lastActive = 23 - [...hours].reverse().findIndex(h => h.pedidos > 0);
    const hourSlice = firstActive === -1 ? hours.slice(11, 23) : hours.slice(Math.max(0, firstActive - 1), Math.min(24, lastActive + 2));
    const peak = hours.reduce((m, h) => (h.pedidos > m.pedidos ? h : m), hours[0]);

    // Content
    const views = posts.reduce((s, p) => s + (p.viewCount || 0), 0);
    const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const comments = posts.reduce((s, p) => s + (p.commentsCount || 0), 0);
    const postOrders = posts.reduce((s, p) => s + (p.ordersFromPost || 0), 0);
    const engagement = views ? ((likes + comments) / views) * 100 : 0;
    const conversion = views ? (postOrders / views) * 100 : 0;
    const topPosts = [...posts]
      .sort((a, b) => (b.likes + b.commentsCount * 2 + (b.ordersFromPost || 0) * 5) - (a.likes + a.commentsCount * 2 + (a.ordersFromPost || 0) * 5))
      .slice(0, 4);
    const videos = posts.filter(p => p.mediaType === 'video').length;

    return {
      revenue, prevRevenue, units, prevUnits, avgTicket, prevAvg,
      count: current.length, prevCount: previous.length, cancelled,
      series, dishes, dishRevenueTotal, unsold, categories, channels,
      hourSlice, peak, views, likes, comments, postOrders, engagement, conversion, topPosts, videos
    };
  }, [orders, products, posts, period, now]);

  const sortedDishes = [...data.dishes].sort((a, b) => b[dishSort] - a[dishSort]).slice(0, 8);
  const maxDish = sortedDishes[0]?.[dishSort] || 1;
  const channelTotal = data.channels.reduce((s, c) => s + c.count, 0);
  const catTotal = data.categories.reduce((s, c) => s + c.value, 0);
  const rating = Number(tenant.rating || 0);

  const reveal = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: EASE, delay: 0.04 * i }
  });

  return (
    <div className="gsd">
      {/* Header */}
      <div className="gsd-head">
        <div>
          <h3 className="gsd-title">Resumen del negocio</h3>
          <p className="gsd-sub">
            Ventas, platos y contenido de {tenant.name} en los últimos {period} días, comparado con el periodo anterior.
          </p>
        </div>
        <div className="gsd-segment" role="tablist" aria-label="Periodo">
          {([7, 30, 90] as Period[]).map(p => (
            <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
              {period === p && <motion.span layoutId="gsd-period" className="gsd-segment-pill" transition={{ duration: 0.35, ease: EASE }} />}
              <span>{p} días</span>
            </button>
          ))}
        </div>
      </div>

      {/* Metric strip */}
      <motion.div className="gsd-strip" {...reveal(0)}>
        <div className="gsd-metric lead">
          <span className="gsd-label">Ventas netas</span>
          <strong className="gsd-value">{cop(data.revenue)}</strong>
          <Delta current={data.revenue} previous={data.prevRevenue} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Pedidos</span>
          <strong className="gsd-value">{num(data.count)}</strong>
          <Delta current={data.count} previous={data.prevCount} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Ticket promedio</span>
          <strong className="gsd-value">{cop(data.avgTicket)}</strong>
          <Delta current={data.avgTicket} previous={data.prevAvg} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Platos vendidos</span>
          <strong className="gsd-value">{num(data.units)}</strong>
          <Delta current={data.units} previous={data.prevUnits} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Cancelados</span>
          <strong className="gsd-value">{num(data.cancelled)}</strong>
          <span className="gsd-delta flat">
            {data.count + data.cancelled ? ((data.cancelled / (data.count + data.cancelled)) * 100).toFixed(1) : '0.0'}% del total
          </span>
        </div>
      </motion.div>

      <div className="gsd-grid">
        {/* Revenue chart */}
        <motion.section className="gsd-panel span-8" {...reveal(1)}>
          <header className="gsd-panel-head">
            <div>
              <h4><TrendingUp size={16} /> Evolución de ventas</h4>
              <p>{period === 90 ? 'Agrupado por semana' : 'Ventas diarias'} · pedidos no cancelados</p>
            </div>
            <button type="button" className="gsd-link" onClick={() => onNavigate('analytics')}>Ver finanzas</button>
          </header>
          <div className="gsd-chart" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gsdArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C85A38" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#C85A38" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#EFE9E0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#78706A' }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#78706A' }} tickFormatter={compact} width={52} />
                <Tooltip content={<ChartTooltip money />} cursor={{ stroke: '#D0C8BC', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="ventas" name="ventas" stroke="#C85A38" strokeWidth={2.25} fill="url(#gsdArea)" animationDuration={700} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        {/* Channels */}
        <motion.section className="gsd-panel span-4" {...reveal(2)}>
          <header className="gsd-panel-head">
            <div>
              <h4>Canales de venta</h4>
              <p>{num(channelTotal)} pedidos en el periodo</p>
            </div>
          </header>
          <div className="gsd-stackbar" aria-hidden>
            {data.channels.map(c => (
              <motion.span
                key={c.key}
                style={{ background: c.color }}
                initial={{ width: 0 }}
                animate={{ width: channelTotal ? `${(c.count / channelTotal) * 100}%` : '0%' }}
                transition={{ duration: 0.7, ease: EASE }}
              />
            ))}
          </div>
          <ul className="gsd-list">
            {data.channels.map(c => {
              const Icon = c.icon;
              return (
                <li key={c.key}>
                  <span className="gsd-dot" style={{ background: c.color }} />
                  <Icon size={15} className="gsd-muted-icon" />
                  <span className="gsd-list-name">{c.label}</span>
                  <span className="gsd-list-meta">{channelTotal ? Math.round((c.count / channelTotal) * 100) : 0}%</span>
                  <strong>{cop(c.revenue)}</strong>
                </li>
              );
            })}
          </ul>
          <div className="gsd-peak">
            <Clock size={15} />
            <span>
              Hora pico: <strong>{data.peak.pedidos ? `${data.peak.hora.replace('h', '')}:00` : '—'}</strong>
              {data.peak.pedidos ? ` · ${data.peak.pedidos} pedidos` : ''}
            </span>
          </div>
        </motion.section>

        {/* Top dishes */}
        <motion.section className="gsd-panel span-8" {...reveal(3)}>
          <header className="gsd-panel-head">
            <div>
              <h4><Utensils size={16} /> Platos más vendidos</h4>
              <p>{data.dishes.length} platos con ventas · {cop(data.dishRevenueTotal)} en productos</p>
            </div>
            <div className="gsd-segment small" role="tablist" aria-label="Ordenar platos">
              {(['revenue', 'qty'] as const).map(k => (
                <button key={k} type="button" role="tab" aria-selected={dishSort === k} className={dishSort === k ? 'active' : ''} onClick={() => setDishSort(k)}>
                  {dishSort === k && <motion.span layoutId="gsd-dish-sort" className="gsd-segment-pill" transition={{ duration: 0.3, ease: EASE }} />}
                  <span>{k === 'revenue' ? 'Ingresos' : 'Unidades'}</span>
                </button>
              ))}
            </div>
          </header>
          {sortedDishes.length === 0 ? (
            <div className="gsd-empty">
              <p>Aún no hay ventas en este periodo. Cuando lleguen pedidos verás aquí el ranking de tus platos.</p>
              <button type="button" className="gsd-link" onClick={() => onNavigate('menu')}>Revisar la carta</button>
            </div>
          ) : (
            <table className="gsd-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Plato</th>
                  <th className="num">Unidades</th>
                  <th className="num">Ingresos</th>
                  <th className="num">Participación</th>
                  <th className="num">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {sortedDishes.map((d, i) => (
                  <motion.tr
                    key={d.name}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, ease: EASE, delay: i * 0.03 }}
                  >
                    <td className="gsd-rank">{i + 1}</td>
                    <td>
                      <div className="gsd-dish">
                        <span className="gsd-dish-emoji">{d.emoji}</span>
                        <div>
                          <strong>{d.name}</strong>
                          <span>{d.category}</span>
                        </div>
                      </div>
                      <div className="gsd-bar">
                        <motion.span initial={{ width: 0 }} animate={{ width: `${(d[dishSort] / maxDish) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                      </div>
                    </td>
                    <td className="num">{num(d.qty)}</td>
                    <td className="num strong">{cop(d.revenue)}</td>
                    <td className="num">{data.dishRevenueTotal ? ((d.revenue / data.dishRevenueTotal) * 100).toFixed(1) : '0'}%</td>
                    <td className="num"><Delta current={d.qty} previous={d.prevQty} /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
          {data.unsold.length > 0 && (
            <p className="gsd-footnote">
              {data.unsold.length} {data.unsold.length === 1 ? 'plato disponible no tuvo' : 'platos disponibles no tuvieron'} ventas:{' '}
              {data.unsold.slice(0, 4).map(p => p.name).join(', ')}
              {data.unsold.length > 4 ? '…' : '.'}
            </p>
          )}
        </motion.section>

        {/* Categories + hours */}
        <motion.section className="gsd-panel span-4" {...reveal(4)}>
          <header className="gsd-panel-head">
            <div>
              <h4>Ventas por categoría</h4>
              <p>Participación en ingresos de productos</p>
            </div>
          </header>
          {data.categories.length === 0 ? (
            <div className="gsd-empty"><p>Sin datos en el periodo.</p></div>
          ) : (
            <ul className="gsd-cats">
              {data.categories.map(c => (
                <li key={c.name}>
                  <div className="gsd-cats-row">
                    <span>{c.name}</span>
                    <strong>{catTotal ? Math.round((c.value / catTotal) * 100) : 0}%</strong>
                  </div>
                  <div className="gsd-bar thin">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${catTotal ? (c.value / catTotal) * 100 : 0}%` }} transition={{ duration: 0.6, ease: EASE }} />
                  </div>
                  <span className="gsd-cats-amount">{cop(c.value)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="gsd-divider" />
          <h4 className="gsd-mini-title">Pedidos por hora</h4>
          <div className="gsd-chart" style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourSlice} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="hora" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#78706A' }} interval="preserveStartEnd" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,90,56,0.06)' }} />
                <Bar dataKey="pedidos" name="pedidos" radius={[4, 4, 0, 0]} animationDuration={600}>
                  {data.hourSlice.map(h => (
                    <Cell key={h.hora} fill={h.hora === data.peak.hora && h.pedidos > 0 ? '#C85A38' : '#E3D7C8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        {/* Content performance */}
        <motion.section className="gsd-panel span-12" {...reveal(5)}>
          <header className="gsd-panel-head">
            <div>
              <h4><Film size={16} /> Rendimiento del contenido</h4>
              <p>
                {posts.length} publicaciones ({data.videos} reels, {posts.length - data.videos} fotos) · {storyItems.length} historias activas
              </p>
            </div>
            <button type="button" className="gsd-link" onClick={() => onNavigate('content')}>Publicar contenido</button>
          </header>
          <div className="gsd-content">
            <dl className="gsd-content-stats">
              <div><dt><Eye size={14} /> Vistas</dt><dd>{num(data.views)}</dd></div>
              <div><dt><Heart size={14} /> Me gusta</dt><dd>{num(data.likes)}</dd></div>
              <div><dt><MessageCircle size={14} /> Comentarios</dt><dd>{num(data.comments)}</dd></div>
              <div><dt><ShoppingBag size={14} /> Pedidos desde posts</dt><dd>{num(data.postOrders)}</dd></div>
              <div><dt>Interacción</dt><dd>{data.engagement.toFixed(1)}%</dd></div>
              <div><dt>Conversión</dt><dd>{data.conversion.toFixed(2)}%</dd></div>
            </dl>
            <div className="gsd-posts">
              {data.topPosts.length === 0 ? (
                <div className="gsd-empty">
                  <p>Todavía no has publicado. Los platos con foto o reel reciben más pedidos desde el feed.</p>
                </div>
              ) : (
                data.topPosts.map((p, i) => (
                  <motion.article
                    key={p.id}
                    className="gsd-post"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE, delay: 0.2 + i * 0.05 }}
                  >
                    <div className="gsd-post-media">
                      {p.image ? <img src={p.image} alt={p.dishName} loading="lazy" /> : <span>{p.dishEmoji}</span>}
                      <span className="gsd-post-type">{p.mediaType === 'video' ? <Film size={11} /> : <ImageIcon size={11} />}</span>
                    </div>
                    <div className="gsd-post-body">
                      <strong>{p.dishName}</strong>
                      <div className="gsd-post-stats">
                        <span><Eye size={12} /> {num(p.viewCount || 0)}</span>
                        <span><Heart size={12} /> {num(p.likes)}</span>
                        <span><MessageCircle size={12} /> {num(p.commentsCount)}</span>
                        <span><ShoppingBag size={12} /> {num(p.ordersFromPost || 0)}</span>
                      </div>
                    </div>
                  </motion.article>
                ))
              )}
            </div>
            <button type="button" className="gsd-rating" onClick={() => onNavigate('reviews')}>
              <span className="gsd-label">Reputación</span>
              <strong>{rating ? rating.toFixed(1) : '—'}</strong>
              <span className="gsd-stars" aria-label={`${rating.toFixed(1)} de 5`}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={14} fill={s <= Math.round(rating) ? '#C9962B' : 'none'} stroke={s <= Math.round(rating) ? '#C9962B' : '#D0C8BC'} />
                ))}
              </span>
              <span className="gsd-list-meta">{num(tenant.reviewsCount || 0)} reseñas</span>
            </button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};
