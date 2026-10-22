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
  Utensils,
  Share2,
  Sparkles,
  Award,
  Zap,
  Flame,
  AlertTriangle
} from 'lucide-react';
import type { Order, Post, Product, StoryItem, Tenant } from '../../types';

type Period = 7 | 30 | 90;
type ChartMetric = 'ventas' | 'pedidos' | 'ticket';
type DishCategoryFilter = 'all' | 'estrella' | 'popular' | 'oportunidad' | 'unsold';

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
  { key: 'restaurant_delivery', label: 'Domicilio Propio', icon: Bike, color: '#6B8C6A' },
  { key: 'pickup', label: 'Recoger en Local', icon: ShoppingBag, color: '#8B6F47' }
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

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  metric: ChartMetric;
}> = ({ active, payload, label, metric }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="gsd-tooltip">
      <span>{label}</span>
      <strong>
        {metric === 'ventas'
          ? cop(val)
          : metric === 'pedidos'
          ? `${num(val)} pedidos`
          : cop(val)}
      </strong>
    </div>
  );
};

interface ClassifiedDish {
  key: string;
  name: string;
  emoji: string;
  category: string;
  qty: number;
  revenue: number;
  prevQty: number;
  tag: 'estrella' | 'popular' | 'oportunidad' | 'regular';
  price: number;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  tenant,
  orders,
  products,
  posts,
  storyItems,
  onNavigate
}) => {
  const [period, setPeriod] = useState<Period>(30);
  const [dishSort, setDishSort] = useState<'revenue' | 'qty'>('revenue');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('ventas');
  const [dishFilter, setDishFilter] = useState<DishCategoryFilter>('all');

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
    const avgTicket = current.length ? Math.round(revenue / current.length) : 0;
    const prevAvg = previous.length ? Math.round(prevRevenue / previous.length) : 0;

    // Daily / weekly series
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
        ventas: 0,
        pedidos: 0,
        ticket: 0
      };
    });

    current.forEach(o => {
      const idx = Math.min(buckets - 1, Math.floor((o.createdAt - start) / bucketMs));
      if (idx >= 0) {
        series[idx].ventas += o.total || 0;
        series[idx].pedidos += 1;
      }
    });

    series.forEach(pt => {
      pt.ticket = pt.pedidos > 0 ? Math.round(pt.ventas / pt.pedidos) : 0;
    });

    // Dishes Intelligence & Classification
    const productById = new Map(products.map(p => [p.id, p]));
    const productByName = new Map(products.map(p => [p.name.toLowerCase(), p]));
    const dishMap = new Map<
      string,
      {
        key: string;
        name: string;
        emoji: string;
        category: string;
        qty: number;
        revenue: number;
        prevQty: number;
        price: number;
      }
    >();

    const addItems = (list: Order[], prev: boolean) =>
      list.forEach(o =>
        o.items.forEach(item => {
          const prod = productById.get(item.id) || productByName.get(item.name.toLowerCase());
          const key = prod?.id || item.name.toLowerCase();
          const entry = dishMap.get(key) || {
            key,
            name: prod?.name || item.name,
            emoji: prod?.emoji || '🍽️',
            category: prod?.category || 'Otros',
            qty: 0,
            revenue: 0,
            prevQty: 0,
            price: prod?.price || item.price || 0
          };
          if (prev) {
            entry.prevQty += item.qty;
          } else {
            entry.qty += item.qty;
            entry.revenue += item.qty * item.price;
          }
          dishMap.set(key, entry);
        })
      );

    addItems(current, false);
    addItems(previous, true);

    const dishesRaw = [...dishMap.values()].filter(d => d.qty > 0);
    const dishRevenueTotal = dishesRaw.reduce((s, d) => s + d.revenue, 0);
    const dishQtyTotal = dishesRaw.reduce((s, d) => s + d.qty, 0);

    const avgDishQty = dishesRaw.length > 0 ? dishQtyTotal / dishesRaw.length : 0;
    const avgDishRev = dishesRaw.length > 0 ? dishRevenueTotal / dishesRaw.length : 0;

    const dishes: ClassifiedDish[] = dishesRaw.map(d => {
      let tag: ClassifiedDish['tag'] = 'regular';
      if (d.qty >= avgDishQty && d.revenue >= avgDishRev) {
        tag = 'estrella';
      } else if (d.qty >= avgDishQty) {
        tag = 'popular';
      } else if (d.revenue >= avgDishRev || d.price >= avgDishRev / Math.max(1, avgDishQty)) {
        tag = 'oportunidad';
      }
      return { ...d, tag };
    });

    const soldIds = new Set([...dishMap.entries()].filter(([, d]) => d.qty > 0).map(([k]) => k));
    const unsold = products.filter(p => p.available && !p.isArchived && !soldIds.has(p.id));

    // Categories
    const catMap = new Map<string, number>();
    dishes.forEach(d => catMap.set(d.category, (catMap.get(d.category) || 0) + d.revenue));
    const categories = [...catMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

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
    const hourSlice =
      firstActive === -1
        ? hours.slice(11, 23)
        : hours.slice(Math.max(0, firstActive - 1), Math.min(24, lastActive + 2));
    const peak = hours.reduce((m, h) => (h.pedidos > m.pedidos ? h : m), hours[0]);

    // Content Funnel and Analysis
    const views = posts.reduce((s, p) => s + (p.viewCount || 0), 0);
    const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const comments = posts.reduce((s, p) => s + (p.commentsCount || 0), 0);
    const postOrders = posts.reduce((s, p) => s + (p.ordersFromPost || 0), 0);
    const totalInteractions = likes + comments;
    const engagement = views ? (totalInteractions / views) * 100 : 0;
    const conversion = views ? (postOrders / views) * 100 : 0;

    const videoPosts = posts.filter(p => p.mediaType === 'video');
    const photoPosts = posts.filter(p => p.mediaType !== 'video');
    const videoViews = videoPosts.reduce((s, p) => s + (p.viewCount || 0), 0);
    const photoViews = photoPosts.reduce((s, p) => s + (p.viewCount || 0), 0);
    const videoOrders = videoPosts.reduce((s, p) => s + (p.ordersFromPost || 0), 0);
    const photoOrders = photoPosts.reduce((s, p) => s + (p.ordersFromPost || 0), 0);

    const estimatedRevenueFromPosts = postOrders * (avgTicket || 32000);

    const topPosts = [...posts]
      .sort(
        (a, b) =>
          b.likes +
          b.commentsCount * 2 +
          (b.ordersFromPost || 0) * 8 -
          (a.likes + a.commentsCount * 2 + (a.ordersFromPost || 0) * 8)
      )
      .slice(0, 4);

    return {
      revenue,
      prevRevenue,
      units,
      prevUnits,
      avgTicket,
      prevAvg,
      count: current.length,
      prevCount: previous.length,
      cancelled,
      series,
      dishes,
      dishRevenueTotal,
      unsold,
      categories,
      channels,
      hourSlice,
      peak,
      views,
      likes,
      comments,
      postOrders,
      totalInteractions,
      engagement,
      conversion,
      topPosts,
      videoPostsCount: videoPosts.length,
      photoPostsCount: photoPosts.length,
      videoViews,
      photoViews,
      videoOrders,
      photoOrders,
      estimatedRevenueFromPosts
    };
  }, [orders, products, posts, period, now]);

  // Dish filtering & sorting
  const filteredDishes = useMemo(() => {
    if (dishFilter === 'unsold') return [];
    if (dishFilter === 'all') return data.dishes;
    return data.dishes.filter(d => d.tag === dishFilter);
  }, [data.dishes, dishFilter]);

  const sortedDishes = useMemo(() => {
    return [...filteredDishes].sort((a, b) => b[dishSort] - a[dishSort]);
  }, [filteredDishes, dishSort]);

  const maxDish = sortedDishes[0]?.[dishSort] || 1;
  const channelTotal = data.channels.reduce((s, c) => s + c.count, 0);
  const catTotal = data.categories.reduce((s, c) => s + c.value, 0);
  const rating = Number(tenant.rating || 0);

  const estrellaCount = data.dishes.filter(d => d.tag === 'estrella').length;
  const popularCount = data.dishes.filter(d => d.tag === 'popular').length;
  const oportunidadCount = data.dishes.filter(d => d.tag === 'oportunidad').length;

  const reveal = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: EASE, delay: 0.04 * i }
  });

  return (
    <div className="gsd">
      {/* ── HEADER CON SELECTOR DE PERIODO ── */}
      <div className="gsd-head">
        <div>
          <h3 className="gsd-title">Resumen Ejecutivo</h3>
          <p className="gsd-sub">
            Métricas clave, rotación de platos y conversión de contenido de <strong>{tenant.name}</strong> en los últimos {period} días.
          </p>
        </div>
        <div className="gsd-segment" role="tablist" aria-label="Periodo">
          {([7, 30, 90] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {period === p && (
                <motion.span
                  layoutId="gsd-period"
                  className="gsd-segment-pill"
                  transition={{ duration: 0.35, ease: EASE }}
                />
              )}
              <span>{p} días</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── METRIC STRIP (5 TARJETAS UNIFICADAS) ── */}
      <motion.div className="gsd-strip" {...reveal(0)}>
        <div className="gsd-metric lead">
          <span className="gsd-label">Ventas Netas Totales</span>
          <strong className="gsd-value">{cop(data.revenue)}</strong>
          <Delta current={data.revenue} previous={data.prevRevenue} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Pedidos Completados</span>
          <strong className="gsd-value">{num(data.count)}</strong>
          <Delta current={data.count} previous={data.prevCount} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Ticket Promedio</span>
          <strong className="gsd-value">{cop(data.avgTicket)}</strong>
          <Delta current={data.avgTicket} previous={data.prevAvg} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Platos Despachados</span>
          <strong className="gsd-value">{num(data.units)}</strong>
          <Delta current={data.units} previous={data.prevUnits} />
        </div>
        <div className="gsd-metric">
          <span className="gsd-label">Tasa de Cancelación</span>
          <strong className="gsd-value">
            {data.count + data.cancelled
              ? `${((data.cancelled / (data.count + data.cancelled)) * 100).toFixed(1)}%`
              : '0.0%'}
          </strong>
          <span className="gsd-delta flat">
            {num(data.cancelled)} orden{data.cancelled !== 1 ? 'es' : ''} cancelada{data.cancelled !== 1 ? 's' : ''}
          </span>
        </div>
      </motion.div>

      <div className="gsd-grid">
        {/* ── GRÁFICA DINÁMICA INTERACTIVA (VENTAS | PEDIDOS | TICKET) ── */}
        <motion.section className="gsd-panel span-8" {...reveal(1)}>
          <header className="gsd-panel-head">
            <div>
              <h4>
                <TrendingUp size={16} /> Evolución del Negocio
              </h4>
              <p>
                {chartMetric === 'ventas'
                  ? 'Ingresos netos por día en COP'
                  : chartMetric === 'pedidos'
                  ? 'Cantidad de órdenes atendidas'
                  : 'Valor medio por orden en el tiempo'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="gsd-segment small" role="tablist" aria-label="Métrica gráfica">
                {([
                  { key: 'ventas', label: 'Ventas COP' },
                  { key: 'pedidos', label: 'N° Pedidos' },
                  { key: 'ticket', label: 'Ticket Medio' }
                ] as const).map(m => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={chartMetric === m.key}
                    className={chartMetric === m.key ? 'active' : ''}
                    onClick={() => setChartMetric(m.key)}
                  >
                    {chartMetric === m.key && (
                      <motion.span
                        layoutId="gsd-chart-metric"
                        className="gsd-segment-pill"
                        transition={{ duration: 0.25, ease: EASE }}
                      />
                    )}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="gsd-link"
                onClick={() => onNavigate('analytics')}
                title="Ir a contabilidad y dispersión"
              >
                Ver finanzas completas →
              </button>
            </div>
          </header>

          <div className="gsd-chart" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gsdChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={
                        chartMetric === 'ventas'
                          ? '#C85A38'
                          : chartMetric === 'pedidos'
                          ? '#6B8C6A'
                          : '#8B6F47'
                      }
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        chartMetric === 'ventas'
                          ? '#C85A38'
                          : chartMetric === 'pedidos'
                          ? '#6B8C6A'
                          : '#8B6F47'
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#EFE9E0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#78706A' }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#78706A' }}
                  tickFormatter={chartMetric === 'pedidos' ? num : compact}
                  width={56}
                />
                <Tooltip
                  content={<ChartTooltip metric={chartMetric} />}
                  cursor={{ stroke: '#D0C8BC', strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric}
                  name={chartMetric}
                  stroke={
                    chartMetric === 'ventas'
                      ? '#C85A38'
                      : chartMetric === 'pedidos'
                      ? '#6B8C6A'
                      : '#8B6F47'
                  }
                  strokeWidth={2.5}
                  fill="url(#gsdChartGrad)"
                  animationDuration={650}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        {/* ── CANALES DE VENTA Y HORA PICO ── */}
        <motion.section className="gsd-panel span-4" {...reveal(2)}>
          <header className="gsd-panel-head">
            <div>
              <h4>Canales de Venta</h4>
              <p>{num(channelTotal)} órdenes completadas</p>
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
                  <span className="gsd-list-meta">
                    {channelTotal ? Math.round((c.count / channelTotal) * 100) : 0}% ({c.count})
                  </span>
                  <strong>{cop(c.revenue)}</strong>
                </li>
              );
            })}
          </ul>

          <div className="gsd-peak">
            <Clock size={16} />
            <span>
              Hora Pico Operativa:{' '}
              <strong>{data.peak.pedidos ? `${data.peak.hora.replace('h', '')}:00 hrs` : '—'}</strong>
              {data.peak.pedidos ? ` · ${data.peak.pedidos} pedidos recibidos` : ''}
            </span>
          </div>
        </motion.section>

        {/* ── INGENIERÍA DE MENÚ Y RENDIMIENTO DE PLATOS ── */}
        <motion.section className="gsd-panel span-8" {...reveal(3)}>
          <header className="gsd-panel-head">
            <div>
              <h4>
                <Utensils size={16} /> Rotación e Ingeniería de Platos
              </h4>
              <p>
                {data.dishes.length} platos vendidos · {cop(data.dishRevenueTotal)} en catálogo ·{' '}
                {data.unsold.length} sin rotación
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="gsd-segment small" role="tablist" aria-label="Ordenar platos">
                {(['revenue', 'qty'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={dishSort === k}
                    className={dishSort === k ? 'active' : ''}
                    onClick={() => setDishSort(k)}
                  >
                    {dishSort === k && (
                      <motion.span
                        layoutId="gsd-dish-sort"
                        className="gsd-segment-pill"
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    )}
                    <span>{k === 'revenue' ? 'Ingresos COP' : 'Unidades'}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Chips de Categorización de Platos (Matriz de Menú) */}
          <div className="gsd-dish-filters">
            <button
              type="button"
              className={`gsd-dish-filter-chip ${dishFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDishFilter('all')}
            >
              Todos ({data.dishes.length})
            </button>
            <button
              type="button"
              className={`gsd-dish-filter-chip estrella ${dishFilter === 'estrella' ? 'active' : ''}`}
              onClick={() => setDishFilter('estrella')}
            >
              <Award size={13} /> Platos Estrella ({estrellaCount})
            </button>
            <button
              type="button"
              className={`gsd-dish-filter-chip popular ${dishFilter === 'popular' ? 'active' : ''}`}
              onClick={() => setDishFilter('popular')}
            >
              <Flame size={13} /> Alta Rotación ({popularCount})
            </button>
            <button
              type="button"
              className={`gsd-dish-filter-chip oportunidad ${dishFilter === 'oportunidad' ? 'active' : ''}`}
              onClick={() => setDishFilter('oportunidad')}
            >
              <Zap size={13} /> Oportunidad ({oportunidadCount})
            </button>
            {data.unsold.length > 0 && (
              <button
                type="button"
                className={`gsd-dish-filter-chip unsold ${dishFilter === 'unsold' ? 'active' : ''}`}
                onClick={() => setDishFilter('unsold')}
              >
                Sin Ventas ({data.unsold.length})
              </button>
            )}
          </div>

          {dishFilter === 'unsold' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
              <div className="pam-callout" style={{ margin: 0, padding: '10px 14px' }}>
                <AlertTriangle size={16} />
                <span>
                  Estos platos están activos en tu carta pero no tuvieron pedidos en los últimos {period} días. Puedes destacarlos en una Historia o revisar su precio.
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginTop: '6px' }}>
                {data.unsold.map(p => (
                  <div key={p.id} className="gsd-unsold-card">
                    <span className="gsd-dish-emoji">{p.emoji || '🍽️'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {p.category} · {cop(p.price)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="gsd-action-btn"
                      onClick={() => onNavigate('content')}
                      title="Crear publicación en el feed"
                    >
                      <Share2 size={13} /> Promocionar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : sortedDishes.length === 0 ? (
            <div className="gsd-empty">
              <p>No se encontraron platos para este filtro en los últimos {period} días.</p>
              <button type="button" className="gsd-link" onClick={() => onNavigate('menu')}>
                Revisar la carta completa
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="gsd-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Plato</th>
                    <th>Tipo</th>
                    <th className="num">Unidades</th>
                    <th className="num">Ingresos</th>
                    <th className="num">Participación</th>
                    <th className="num">Tendencia</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDishes.slice(0, 8).map((d, i) => (
                    <motion.tr
                      key={d.key}
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
                          <motion.span
                            initial={{ width: 0 }}
                            animate={{ width: `${(d[dishSort] / maxDish) * 100}%` }}
                            transition={{ duration: 0.6, ease: EASE }}
                          />
                        </div>
                      </td>
                      <td>
                        <span className={`gsd-dish-tag ${d.tag}`}>
                          {d.tag === 'estrella' && '★ Estrella'}
                          {d.tag === 'popular' && '🔥 Popular'}
                          {d.tag === 'oportunidad' && '⚡ Oportunidad'}
                          {d.tag === 'regular' && 'Estándar'}
                        </span>
                      </td>
                      <td className="num">{num(d.qty)}</td>
                      <td className="num strong">{cop(d.revenue)}</td>
                      <td className="num">
                        {data.dishRevenueTotal
                          ? `${((d.revenue / data.dishRevenueTotal) * 100).toFixed(1)}%`
                          : '0%'}
                      </td>
                      <td className="num">
                        <Delta current={d.qty} previous={d.prevQty} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="gsd-action-btn"
                          onClick={() => onNavigate('content')}
                          title="Crear Reel o Foto en Feed"
                        >
                          <Share2 size={12} /> Post
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        {/* ── CATEGORÍAS + HORARIOS DE PEDIDO ── */}
        <motion.section className="gsd-panel span-4" {...reveal(4)}>
          <header className="gsd-panel-head">
            <div>
              <h4>Ventas por Categoría</h4>
              <p>Participación sobre ingresos de comida</p>
            </div>
          </header>

          {data.categories.length === 0 ? (
            <div className="gsd-empty">
              <p>Sin datos en el periodo.</p>
            </div>
          ) : (
            <ul className="gsd-cats">
              {data.categories.map(c => (
                <li key={c.name}>
                  <div className="gsd-cats-row">
                    <span>{c.name}</span>
                    <strong>{catTotal ? Math.round((c.value / catTotal) * 100) : 0}%</strong>
                  </div>
                  <div className="gsd-bar thin">
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${catTotal ? (c.value / catTotal) * 100 : 0}%` }}
                      transition={{ duration: 0.6, ease: EASE }}
                    />
                  </div>
                  <span className="gsd-cats-amount">{cop(c.value)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="gsd-divider" />
          <h4 className="gsd-mini-title">Distribución por Horas del Día</h4>
          <div className="gsd-chart" style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourSlice} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="hora"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#78706A' }}
                  interval="preserveStartEnd"
                />
                <Tooltip
                  content={<ChartTooltip metric="pedidos" />}
                  cursor={{ fill: 'rgba(200,90,56,0.06)' }}
                />
                <Bar dataKey="pedidos" name="pedidos" radius={[4, 4, 0, 0]} animationDuration={600}>
                  {data.hourSlice.map(h => (
                    <Cell
                      key={h.hora}
                      fill={h.hora === data.peak.hora && h.pedidos > 0 ? '#C85A38' : '#E3D7C8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        {/* ── RENDIMIENTO Y EMBUDO DE CONTENIDO ── */}
        <motion.section className="gsd-panel span-12" {...reveal(5)}>
          <header className="gsd-panel-head">
            <div>
              <h4>
                <Film size={16} /> Embudo y Conversión de Contenido
              </h4>
              <p>
                {posts.length} publicaciones activas ({data.videoPostsCount} Reels en video, {data.photoPostsCount} fotografías) ·{' '}
                {storyItems.length} historias activas
              </p>
            </div>
            <button
              type="button"
              className="pam-btn-primary"
              onClick={() => onNavigate('content')}
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
            >
              <Share2 size={14} /> Publicar Nuevo Reel o Foto
            </button>
          </header>

          {/* Embudo de Conversión Visual (Vistas -> Interacción -> Pedidos -> Ingresos) */}
          <div className="gsd-funnel-strip">
            <div className="gsd-funnel-step">
              <span className="gsd-funnel-label"><Eye size={13} /> 1. Vistas Totales</span>
              <strong className="gsd-funnel-value">{num(data.views)}</strong>
              <span className="gsd-funnel-sub">100% alcance del feed</span>
            </div>
            <div className="gsd-funnel-arrow">→</div>

            <div className="gsd-funnel-step">
              <span className="gsd-funnel-label"><Heart size={13} /> 2. Interacciones</span>
              <strong className="gsd-funnel-value">{num(data.totalInteractions)}</strong>
              <span className="gsd-funnel-sub">{data.engagement.toFixed(1)}% tasa de enganche</span>
            </div>
            <div className="gsd-funnel-arrow">→</div>

            <div className="gsd-funnel-step">
              <span className="gsd-funnel-label"><ShoppingBag size={13} /> 3. Pedidos Directos</span>
              <strong className="gsd-funnel-value" style={{ color: 'var(--primary)' }}>
                {num(data.postOrders)}
              </strong>
              <span className="gsd-funnel-sub">{data.conversion.toFixed(2)}% tasa de conversión</span>
            </div>
            <div className="gsd-funnel-arrow">→</div>

            <div className="gsd-funnel-step highlight">
              <span className="gsd-funnel-label"><Sparkles size={13} /> 4. Ingreso Generado</span>
              <strong className="gsd-funnel-value">{cop(data.estimatedRevenueFromPosts)}</strong>
              <span className="gsd-funnel-sub">Ventas atribuidas a contenido</span>
            </div>
          </div>

          <div className="gsd-content">
            {/* Comparativa Reels vs Fotos */}
            <div className="gsd-media-compare">
              <h5 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Formato: Reels vs Fotos
              </h5>
              <div className="gsd-media-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Film size={16} style={{ color: 'var(--primary)' }} />
                  <div>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)', display: 'block' }}>
                      Reels / Video ({data.videoPostsCount})
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {num(data.videoViews)} vistas · {num(data.videoOrders)} pedidos
                    </span>
                  </div>
                </div>
                <span className="rpa-badge primary">Mayor Retención</span>
              </div>

              <div className="gsd-media-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={16} style={{ color: 'var(--secondary)' }} />
                  <div>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)', display: 'block' }}>
                      Fotos de Plato ({data.photoPostsCount})
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {num(data.photoViews)} vistas · {num(data.photoOrders)} pedidos
                    </span>
                  </div>
                </div>
                <span className="rpa-badge secondary">Rápido Catálogo</span>
              </div>

              <div className="gsd-footnote" style={{ marginTop: 'auto', paddingTop: '8px' }}>
                💡 <em>Los reels de preparación logran hasta 3x más pedidos directos desde el feed local.</em>
              </div>
            </div>

            {/* Listado de Posts Más Exitosos */}
            <div className="gsd-posts">
              {data.topPosts.length === 0 ? (
                <div className="gsd-empty">
                  <p>Todavía no has publicado fotos o reels en el feed. Comparte tus platos para atraer más comensales.</p>
                </div>
              ) : (
                data.topPosts.map((p, i) => {
                  const postConv = p.viewCount ? ((p.ordersFromPost || 0) / p.viewCount) * 100 : 0;
                  return (
                    <motion.article
                      key={p.id}
                      className="gsd-post"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE, delay: 0.2 + i * 0.05 }}
                    >
                      <div className="gsd-post-media">
                        {p.image ? (
                          <img src={p.image} alt={p.dishName} loading="lazy" />
                        ) : (
                          <span>{p.dishEmoji}</span>
                        )}
                        <span className="gsd-post-type">
                          {p.mediaType === 'video' ? <Film size={11} /> : <ImageIcon size={11} />}
                        </span>
                      </div>
                      <div className="gsd-post-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '0.86rem' }}>{p.dishName}</strong>
                          {p.ordersFromPost ? (
                            <span className="rpa-badge success" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                              {p.ordersFromPost} ped.
                            </span>
                          ) : null}
                        </div>
                        <div className="gsd-post-stats">
                          <span>
                            <Eye size={12} /> {num(p.viewCount || 0)}
                          </span>
                          <span>
                            <Heart size={12} /> {num(p.likes)}
                          </span>
                          <span>
                            <MessageCircle size={12} /> {num(p.commentsCount)}
                          </span>
                          {postConv > 0 && (
                            <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>
                              {postConv.toFixed(1)}% conv.
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })
              )}
            </div>

            {/* Reputación del Restaurante */}
            <button
              type="button"
              className="gsd-rating"
              onClick={() => onNavigate('reviews')}
              title="Ver reseñas de clientes"
            >
              <span className="gsd-label">Calificación de Clientes</span>
              <strong>{rating ? rating.toFixed(1) : '5.0'}</strong>
              <span className="gsd-stars" aria-label={`${rating.toFixed(1)} de 5 estrellas`}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Star
                    key={s}
                    size={14}
                    fill={s <= Math.round(rating) ? '#C9962B' : 'none'}
                    stroke={s <= Math.round(rating) ? '#C9962B' : '#D0C8BC'}
                  />
                ))}
              </span>
              <span className="gsd-list-meta">
                {num(tenant.reviewsCount || 0)} opiniones verificadas →
              </span>
            </button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};
