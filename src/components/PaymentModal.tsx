import React, { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { PaymentSimulatorService } from '../services/paymentService';
import type { PaymentMethod, OrderFulfillment, CheckoutDetails, SavedDeliveryAddress } from '../types';
import { calculateOrderFinancialBreakdown, MIN_DIGITAL_PAYMENT_COP } from '../utils/wompiFees';
import { loadUserAddressBank, sanitizeSavedAddresses } from '../utils/addressBank';
import { getDeviceId } from '../utils/deviceId';
import { openLegalCenter } from '../utils/legalNavigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Bike,
  Utensils,
  MapPin,
  User,
  Phone,
  FileText,
  Hash,
  Banknote,
  Landmark,
  ShieldCheck,
  Lock,
  Check,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PaymentStatus } from './PaymentStatus';
import type { WompiCheckoutConfig } from './WompiCheckout';

const WompiCheckout = React.lazy(() => import('./WompiCheckout').then(m => ({ default: m.WompiCheckout })));

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderType?: string;
  prefilledTableId?: string;
  prefilledTableToken?: string;
  entryPoint?: 'qr' | 'feed' | 'directory';
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, orderType = 'pickup', prefilledTableId, prefilledTableToken, entryPoint }) => {
  const { cart, clearCart, cities, zones, selectedCityId, setSelectedCity, tenants, currentTenant: contextTenant, currentUser, submitOrderWithPayment, retryRemotePayment, updateUserProfile, authMode, isSubmittingOrder, orderError } = useApp();
  const [lockedTenantId, setLockedTenantId] = useState<string | null>(() => cart[0]?.product?.tenantId || null);
  const [createdRemoteOrderId, setCreatedRemoteOrderId] = useState<string | null>(null);
  const activeTenantId = cart[0]?.product?.tenantId || lockedTenantId;
  const currentTenant = (activeTenantId ? tenants.find(t => t.id === activeTenantId) : undefined) || contextTenant;
  const tenantCityName = cities.find(c => c.id === currentTenant.cityId)?.name || 'Colombia';
  const tenantZoneName = zones.find(z => z.id === currentTenant.zoneId)?.name;
  const userSelectedCityName = cities.find(c => c.id === selectedCityId)?.name;
  const isCrossCityOrder = Boolean(
    selectedCityId &&
    currentTenant.cityId &&
    selectedCityId !== currentTenant.cityId &&
    entryPoint !== 'qr'
  );
  const [method, setMethod] = useState<PaymentMethod>('wompi');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmCrossCity, setConfirmCrossCity] = useState(false);
  const [wompiConfig, setWompiConfig] = useState<WompiCheckoutConfig | null>(null);
  const [pendingPaymentInfo, setPendingPaymentInfo] = useState<{orderId: string, paymentId: string, sandboxUrl?: string} | null>(null);

  // Banco de Ubicaciones del usuario
  const userSavedAddresses = useMemo<SavedDeliveryAddress[]>(() => {
    if (!currentUser) return [];
    const localBank = loadUserAddressBank([currentUser.id, currentUser.email]);
    const raw = currentUser.savedAddresses?.length ? currentUser.savedAddresses : localBank;
    const defaultCityUuid = currentUser.preferredCityId || currentTenant.cityId || selectedCityId || '00000000-0000-0000-0000-000000000001';
    const sanitized = sanitizeSavedAddresses(raw, defaultCityUuid);
    if (sanitized.length > 0) return sanitized;
    if (currentUser.defaultAddress?.trim()) {
      return [
        {
          id: 'addr-default',
          label: 'Casa',
          address: currentUser.defaultAddress.trim(),
          notes: currentUser.defaultDeliveryNotes?.trim() || undefined,
          cityId: defaultCityUuid,
          zoneId: currentUser.preferredZoneId || null,
          isPrimary: true,
          isDefault: true
        }
      ];
    }
    return [];
  }, [currentUser, currentTenant.cityId, selectedCityId]);

  const defaultSelectedSavedAddress = useMemo(() => {
    return (
      userSavedAddresses.find((a) => a.cityId === currentTenant.cityId && a.isPrimary) ||
      userSavedAddresses.find((a) => a.cityId === currentTenant.cityId) ||
      userSavedAddresses.find((a) => a.isPrimary) ||
      userSavedAddresses[0] ||
      null
    );
  }, [userSavedAddresses, currentTenant.cityId]);

  // Available delivery modes for this restaurant
  const allowedModes: OrderFulfillment[] = (currentTenant.deliveryModes && currentTenant.deliveryModes.length > 0)
    ? currentTenant.deliveryModes
    : ['pickup'];

  // Default mode selection
  const initialMode: OrderFulfillment = (() => {
    if (entryPoint === 'qr') return 'table_service';
    if (orderType.toLowerCase().includes('mesa') && allowedModes.includes('table_service')) {
      return 'table_service';
    }
    if (orderType.toLowerCase().includes('domicilio') && allowedModes.includes('restaurant_delivery')) {
      return 'restaurant_delivery';
    }
    return allowedModes[0] || 'pickup';
  })();

  const [fulfillment, setFulfillment] = useState<OrderFulfillment>(initialMode);

  // Customer & Delivery Form State (autocompleted from currentUser profile & Address Bank)
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    () => defaultSelectedSavedAddress?.id || 'new'
  );
  const [newAddressLabel, setNewAddressLabel] = useState<'Casa' | 'Oficina' | 'Apartamento' | 'Pareja'>('Casa');
  const [saveToAddressBank, setSaveToAddressBank] = useState<boolean>(true);
  const [customerName, setCustomerName] = useState(currentUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(
    defaultSelectedSavedAddress?.address || currentUser?.defaultAddress || ''
  );
  const [deliveryNotes, setDeliveryNotes] = useState(
    defaultSelectedSavedAddress?.notes || currentUser?.defaultDeliveryNotes || ''
  );

  // Table Service Form State
  const initialTableNum = (() => {
    const match = orderType.match(/\d+/);
    return match ? match[0] : '4';
  })();
  const [tableNumber, setTableNumber] = useState(initialTableNum);
  const [restaurantNotes, setRestaurantNotes] = useState('');

  const [tempOrderId] = useState(() => Math.floor(104 + Math.random() * 895).toString());

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevTenantId, setPrevTenantId] = useState(currentTenant.id);
  const [prevUserId, setPrevUserId] = useState(currentUser?.id || currentUser?.email || '');

  const currentUserKey = currentUser?.id || currentUser?.email || '';
  if (isOpen !== prevIsOpen || currentTenant.id !== prevTenantId || currentUserKey !== prevUserId) {
    setPrevIsOpen(isOpen);
    setPrevTenantId(currentTenant.id);
    setPrevUserId(currentUserKey);
    if (isOpen) {
      setFormError(null);
      setSuccess(false);
      setConfirmCrossCity(false);
      setCreatedRemoteOrderId(null);
      if (cart[0]?.product?.tenantId) {
        setLockedTenantId(cart[0].product.tenantId);
      }
      setFulfillment(initialMode);
      if (currentUser?.name) setCustomerName(currentUser.name);
      if (currentUser?.phone) setCustomerPhone(currentUser.phone);
      if (defaultSelectedSavedAddress) {
        setSelectedAddressId(defaultSelectedSavedAddress.id);
        setDeliveryAddress(defaultSelectedSavedAddress.address);
        setDeliveryNotes(defaultSelectedSavedAddress.notes || '');
      } else {
        setSelectedAddressId('new');
        setDeliveryAddress(currentUser?.defaultAddress || '');
        setDeliveryNotes(currentUser?.defaultDeliveryNotes || '');
      }
    }
  }

  if (!isOpen) return null;

  // Economic calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = fulfillment === 'restaurant_delivery' ? (currentTenant.deliveryFee || 0) : 0;
  const total = subtotal + deliveryFee;
  const isBelowDigitalMin = total > 0 && total < MIN_DIGITAL_PAYMENT_COP && currentTenant.acceptsCash !== false;
  const minOrderAmount = Number(currentTenant.minOrder || 0);
  const isBelowRestaurantMinOrder = fulfillment === 'restaurant_delivery' && minOrderAmount > 0 && subtotal > 0 && subtotal < minOrderAmount;

  const breakdown = calculateOrderFinancialBreakdown(total, method, currentTenant.commissionRate);
  const platformFee = breakdown.gastroSyncFeeCop;
  const gatewayFee = breakdown.wompiTotalFeeCop;
  const restaurantPayout = breakdown.restaurantNetCop;

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    if (!currentTenant.isOpen) {
      setFormError('El restaurante está cerrado temporalmente. No se pueden procesar pedidos.');
      return;
    }

    if (cart.length === 0 && !createdRemoteOrderId) {
      setFormError('El carrito está vacío.');
      return;
    }

    if (isBelowRestaurantMinOrder) {
      setFormError(
        `El pedido mínimo a domicilio en ${currentTenant.name} es de $${minOrderAmount.toLocaleString('es-CO')} COP en productos (te faltan $${(minOrderAmount - subtotal).toLocaleString('es-CO')} COP). Agrega más platos o cambia a Recoger en Local.`
      );
      return;
    }

    if (isCrossCityOrder && !confirmCrossCity) {
      setFormError(
        `Atención de cobertura: Tu ubicación seleccionada es ${userSelectedCityName || 'otra ciudad'}, pero ${currentTenant.name} opera únicamente en ${tenantCityName}. Marca la casilla de confirmación de ciudad antes de pagar.`
      );
      return;
    }

    if (method !== 'cash' && isBelowDigitalMin) {
      setFormError(
        `El monto mínimo para pagos digitales por pasarela (Wompi / Tarjeta) es de $${MIN_DIGITAL_PAYMENT_COP.toLocaleString('es-CO')} COP (por el cargo fijo de $700 + IVA). Selecciona Efectivo o agrega $${(MIN_DIGITAL_PAYMENT_COP - total).toLocaleString('es-CO')} COP más.`
      );
      return;
    }

    if (!allowedModes.includes(fulfillment)) {
      setFormError('La modalidad seleccionada no está disponible en este restaurante.');
      return;
    }

    if (fulfillment === 'restaurant_delivery') {
      if (!customerName.trim()) {
        setFormError('Ingresa tu nombre completo para la entrega a domicilio.');
        return;
      }
      if (!customerPhone.trim()) {
        setFormError('Ingresa un teléfono de contacto para el domiciliario.');
        return;
      }
      if (!deliveryAddress.trim()) {
        setFormError(`Ingresa la dirección de entrega en ${tenantCityName}.`);
        return;
      }
    }

    if (fulfillment === 'table_service') {
      if (!tableNumber.trim()) {
        setFormError('Ingresa el número de mesa.');
        return;
      }
    }

    // Si el usuario tiene @handle, incluirlo junto al nombre para identificación clara en cocina
    const baseName = customerName.trim() || currentUser?.name || 'Cliente';
    const formattedCustomerName =
      currentUser?.username && !baseName.includes(`@${currentUser.username}`)
        ? `${baseName} (@${currentUser.username})`
        : baseName;

    // Determinar etiqueta de la ubicación seleccionada o nueva
    const matchedSaved = userSavedAddresses.find((a) => a.id === selectedAddressId);
    const activeAddressLabel = matchedSaved ? matchedSaved.label : newAddressLabel;

    // Guardar en segundo plano teléfono / dirección y actualizar el Banco de Ubicaciones del usuario
    if (currentUser) {
      const profilePatch: {
        phone?: string;
        defaultAddress?: string;
        defaultDeliveryNotes?: string;
        preferredCityId?: string;
        savedAddresses?: SavedDeliveryAddress[];
      } = {};
      if (customerPhone.trim() && customerPhone.trim() !== currentUser.phone) {
        profilePatch.phone = customerPhone.trim();
      }
      if (fulfillment === 'restaurant_delivery' && deliveryAddress.trim()) {
        const cleanAddr = deliveryAddress.trim();
        const cleanNotes = deliveryNotes.trim() || undefined;
        const targetCityId = currentTenant.cityId || selectedCityId || currentUser.preferredCityId || '00000000-0000-0000-0000-000000000001';

        profilePatch.defaultAddress = cleanAddr;
        profilePatch.defaultDeliveryNotes = cleanNotes || '';
        profilePatch.preferredCityId = targetCityId;

        if (selectedAddressId === 'new' && saveToAddressBank) {
          const existingSame = userSavedAddresses.find(
            (a) => a.address.toLowerCase() === cleanAddr.toLowerCase() && a.cityId === targetCityId
          );
          if (existingSame) {
            profilePatch.savedAddresses = userSavedAddresses.map((a) => ({
              ...a,
              notes: a.id === existingSame.id ? cleanNotes : a.notes,
              isPrimary: a.id === existingSame.id
            }));
          } else {
            const createdAddr: SavedDeliveryAddress = {
              id: `addr-chk-${Date.now()}`,
              label: newAddressLabel,
              address: cleanAddr,
              notes: cleanNotes,
              cityId: targetCityId,
              zoneId: currentTenant.zoneId || null,
              isPrimary: true,
              createdAt: Date.now()
            };
            profilePatch.savedAddresses = [
              createdAddr,
              ...userSavedAddresses.map((a) => ({ ...a, isPrimary: false }))
            ];
          }
        } else if (matchedSaved) {
          profilePatch.savedAddresses = userSavedAddresses.map((a) => ({
            ...a,
            address: a.id === matchedSaved.id ? cleanAddr : a.address,
            notes: a.id === matchedSaved.id ? cleanNotes : a.notes,
            isPrimary: a.id === matchedSaved.id
          }));
        }
      }
      if (Object.keys(profilePatch).length > 0) {
        void updateUserProfile(profilePatch);
      }
    }

    const checkoutDetails: CheckoutDetails = {
      fulfillment,
      customerName: formattedCustomerName,
      customerPhone: customerPhone.trim(),
      deliveryAddress: fulfillment === 'restaurant_delivery' ? {
        label: activeAddressLabel,
        addressLine: deliveryAddress.trim(),
        notes: deliveryNotes.trim() || undefined
      } : undefined,
      tableNumber: fulfillment === 'table_service' ? tableNumber.trim() : undefined,
      tableId: fulfillment === 'table_service' ? prefilledTableId : undefined,
      tableToken: fulfillment === 'table_service' ? prefilledTableToken : undefined,
      deviceId: fulfillment === 'table_service' ? getDeviceId() : undefined,
      restaurantNotes: restaurantNotes.trim() || undefined
    };

    let successResult = false;

    if (authMode === 'remote') {
      setLockedTenantId(currentTenant.id);
      if (createdRemoteOrderId && method !== 'cash') {
        const retryRes = await retryRemotePayment(createdRemoteOrderId, checkoutDetails.deviceId);
        if (retryRes.success && retryRes.paymentId) {
          clearCart();
          if (retryRes.wompiConfig) {
            setWompiConfig(retryRes.wompiConfig as WompiCheckoutConfig);
          } else {
            setPendingPaymentInfo({
              orderId: createdRemoteOrderId,
              paymentId: retryRes.paymentId,
              sandboxUrl: retryRes.sandboxUrl
            });
          }
          return;
        }
        successResult = false;
      } else {
        const res = await submitOrderWithPayment(checkoutDetails, method);
        if (res.orderId) {
          setCreatedRemoteOrderId(res.orderId);
        }
        if (res.success && res.orderId && res.paymentId) {
          if (res.wompiConfig) {
            setWompiConfig(res.wompiConfig as WompiCheckoutConfig);
          } else {
            setPendingPaymentInfo({
              orderId: res.orderId,
              paymentId: res.paymentId,
              sandboxUrl: res.sandboxUrl
            });
          }
          return;
        }
        successResult = res.success;
      }
    } else {
      setLoading(true);
      const transaction = await PaymentSimulatorService.processPayment({
        orderId: tempOrderId,
        tenantId: currentTenant.id,
        totalAmount: total,
        commissionRate: currentTenant.commissionRate,
        paymentMethod: method
      });
      setLoading(false);
      const res = await submitOrderWithPayment(checkoutDetails, method, transaction);
      successResult = res.success;
    }

    if (successResult) {
      setSuccess(true);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1800);
    }
  };

  const paymentOptions: Array<{
    id: PaymentMethod;
    name: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    ...(currentTenant.acceptsCash !== false
      ? [{
          id: 'cash' as PaymentMethod,
          name: 'Efectivo',
          subtitle: 'Pago al recibir',
          icon: <Banknote size={18} />
        }]
      : []),
    {
      id: 'wompi',
      name: authMode === 'demo' ? 'Pago Digital (Simulador)' : 'Pasarela Wompi',
      subtitle: 'PSE, Nequi, Tarjeta o Bancolombia',
      icon: <Landmark size={18} />
    }
  ];

  const primaryCtaLabel = (loading || isSubmittingOrder)
    ? 'Procesando tu pedido...'
    : method === 'cash'
      ? fulfillment === 'table_service'
        ? 'Confirmar y pagar en mesa'
        : fulfillment === 'pickup'
          ? 'Confirmar y pagar al recoger'
          : 'Confirmar y pagar al recibir'
      : 'Confirmar y pagar ahora';

  return (
    <AnimatePresence>
      <div
        className="payment-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="payment-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gs-checkout-modal-title"
        >
          {/* ── Editorial Header ── */}
          <div className="gs-checkout-header">
            <div className="gs-checkout-brand-row">
              <div className="gs-checkout-tenant-avatar">
                {currentTenant.logoUrl ? (
                  <img src={currentTenant.logoUrl} alt={currentTenant.name} />
                ) : (
                  <span>{currentTenant.logoEmoji || '🍽️'}</span>
                )}
              </div>
              <div className="gs-checkout-header-copy">
                <span className="gs-checkout-eyebrow">
                  <ShieldCheck size={12} /> Comanda directa · Sin intermediarios
                </span>
                <h3 id="gs-checkout-modal-title" className="gs-checkout-title">
                  Confirmar pedido en {currentTenant.name}
                </h3>
                <div className="gs-checkout-subtitle">
                  <MapPin size={12} />
                  <span>
                    {tenantCityName}
                    {tenantZoneName ? ` · Zona ${tenantZoneName}` : ''}
                    {currentTenant.address ? ` · ${currentTenant.address}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="gs-checkout-close"
              aria-label="Cerrar ventana de pago"
            >
              <X size={18} />
            </button>
          </div>

          {wompiConfig ? (
            <React.Suspense
              fallback={
                <div className="gs-pay-state-panel">
                  <div className="gf-fallback-spinner" />
                  <p className="gs-pay-state-desc">Preparando pasarela de pago...</p>
                </div>
              }
            >
              <WompiCheckout
                config={wompiConfig}
                onWidgetClosed={() => {
                  setPendingPaymentInfo({
                    orderId: wompiConfig.orderId,
                    paymentId: wompiConfig.paymentId
                  });
                  setWompiConfig(null);
                }}
                onCancel={() => {
                  setPendingPaymentInfo({
                    orderId: wompiConfig.orderId,
                    paymentId: wompiConfig.paymentId
                  });
                  setWompiConfig(null);
                }}
              />
            </React.Suspense>
          ) : pendingPaymentInfo ? (
            <PaymentStatus
              orderId={pendingPaymentInfo.orderId}
              paymentId={pendingPaymentInfo.paymentId}
              authMode={authMode}
              sandboxUrl={pendingPaymentInfo.sandboxUrl}
              onClose={() => {
                setPendingPaymentInfo(null);
                onClose();
              }}
              onRetry={async () => {
                setFormError(null);
                const currentOrderId = pendingPaymentInfo.orderId;
                setPendingPaymentInfo(null);
                const res = await retryRemotePayment(currentOrderId);
                if (res.success && res.paymentId) {
                  if (res.wompiConfig) {
                    setWompiConfig(res.wompiConfig as WompiCheckoutConfig);
                  } else {
                    setPendingPaymentInfo({
                      orderId: currentOrderId,
                      paymentId: res.paymentId,
                      sandboxUrl: res.sandboxUrl
                    });
                  }
                } else {
                  setFormError('No fue posible iniciar el reintento de pago.');
                }
              }}
            />
          ) : success ? (
            <div className="gs-pay-state-panel">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="gs-pay-state-icon success"
              >
                <CheckCircle2 size={34} />
              </motion.div>
              <h3 className="gs-pay-state-title">
                ¡Pedido confirmado con éxito!
              </h3>
              <p className="gs-pay-state-desc">
                Tu orden por <strong>${total.toLocaleString('es-CO')} COP</strong> fue enviada directamente a la cocina de <strong>{currentTenant.name}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePaySubmit} className="gs-checkout-form">
              <div className="gs-checkout-body">
                {/* Validation Alert */}
                {(formError || orderError) && (
                  <div className="gs-checkout-alert danger" role="alert">
                    <AlertCircle size={18} className="gs-checkout-alert-icon" />
                    <div className="gs-checkout-alert-body">
                      <span>{formError || orderError}</span>
                    </div>
                  </div>
                )}

                {/* Order Items Summary Strip */}
                {cart.length > 0 && (
                  <div className="gs-checkout-items-card">
                    <div className="gs-checkout-items-head">
                      <span>Resumen de tu comanda</span>
                      <span className="gs-checkout-items-count">
                        {totalUnits} {totalUnits === 1 ? 'plato' : 'platos'}
                      </span>
                    </div>
                    <div className="gs-checkout-items-list">
                      {cart.map(item => {
                        const hasPhotoUrl = Boolean(
                          item.product.image &&
                          (item.product.image.startsWith('http') || item.product.image.startsWith('data:'))
                        );
                        return (
                          <div key={item.product.id} className="gs-checkout-item-row">
                            <div className="gs-checkout-item-left">
                              <span className="gs-checkout-item-qty">{item.quantity}x</span>
                              <span className="gs-checkout-item-thumb">
                                {hasPhotoUrl ? (
                                  <img src={item.product.image} alt={item.product.name} />
                                ) : (
                                  item.product.emoji || item.product.image || '🍽️'
                                )}
                              </span>
                              <span className="gs-checkout-item-name">
                                {item.product.name}
                              </span>
                            </div>
                            <span className="gs-checkout-item-price">
                              ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Alerta Anti-Error de Ciudad Distinta */}
                {isCrossCityOrder && (
                  <div className="gs-checkout-alert warning">
                    <AlertCircle size={18} className="gs-checkout-alert-icon" />
                    <div className="gs-checkout-alert-body">
                      <span className="gs-checkout-alert-title">
                        Verifica la ciudad del restaurante
                      </span>
                      <span>
                        Estás explorando desde <strong>{userSelectedCityName || 'otra ciudad'}</strong>, pero{' '}
                        <strong>{currentTenant.name}</strong> opera físicamente en{' '}
                        <strong>{tenantCityName}{tenantZoneName ? ` (Zona ${tenantZoneName})` : ''}</strong>.
                      </span>
                      <label className="gs-checkout-checkbox-label">
                        <input
                          type="checkbox"
                          checked={confirmCrossCity}
                          onChange={e => {
                            setConfirmCrossCity(e.target.checked);
                            setFormError(null);
                          }}
                        />
                        <span>Confirmo que estoy en {tenantCityName} para recibir o recoger este pedido</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Alerta de Pedido Mínimo del Restaurante */}
                {isBelowRestaurantMinOrder && (
                  <div className="gs-checkout-alert danger">
                    <AlertCircle size={18} className="gs-checkout-alert-icon" />
                    <div className="gs-checkout-alert-body">
                      <span>
                        <strong>Pedido mínimo a domicilio: ${minOrderAmount.toLocaleString('es-CO')} COP.</strong>{' '}
                        Te faltan <strong>${(minOrderAmount - subtotal).toLocaleString('es-CO')} COP</strong> en productos (o puedes elegir <em>Recoger en el local</em>).
                      </span>
                    </div>
                  </div>
                )}

                {/* Step 1: Select Fulfillment Mode */}
                {entryPoint !== 'qr' && (
                  <div className="gs-checkout-section">
                    <div className="gs-checkout-section-head">
                      <h4 className="gs-checkout-section-title">
                        <span className="gs-checkout-step-num">1</span>
                        Modalidad de entrega
                      </h4>
                    </div>
                    <div className="gs-fulfillment-grid">
                      {allowedModes.includes('pickup') && (
                        <button
                          type="button"
                          onClick={() => setFulfillment('pickup')}
                          className={`gs-fulfillment-card ${fulfillment === 'pickup' ? 'is-active' : ''}`}
                        >
                          <div className="gs-fulfillment-card-top">
                            <span className="gs-fulfillment-icon">
                              <ShoppingBag size={18} />
                            </span>
                            <span className="gs-fulfillment-check">
                              <Check size={12} />
                            </span>
                          </div>
                          <div>
                            <strong className="gs-fulfillment-title">Recoger en el local</strong>
                            <span className="gs-fulfillment-meta">
                              Sin costo de envío · Retiro directo
                            </span>
                          </div>
                        </button>
                      )}

                      {allowedModes.includes('restaurant_delivery') && (
                        <button
                          type="button"
                          onClick={() => setFulfillment('restaurant_delivery')}
                          className={`gs-fulfillment-card ${fulfillment === 'restaurant_delivery' ? 'is-active' : ''}`}
                        >
                          <div className="gs-fulfillment-card-top">
                            <span className="gs-fulfillment-icon">
                              <Bike size={18} />
                            </span>
                            <span className="gs-fulfillment-check">
                              <Check size={12} />
                            </span>
                          </div>
                          <div>
                            <strong className="gs-fulfillment-title">Domicilio propio</strong>
                            <span className="gs-fulfillment-meta">
                              Envío:{' '}
                              <strong>
                                {currentTenant.deliveryFee
                                  ? `$${currentTenant.deliveryFee.toLocaleString('es-CO')}`
                                  : 'Gratis'}
                              </strong>
                            </span>
                          </div>
                        </button>
                      )}

                      {allowedModes.includes('table_service') && (
                        <button
                          type="button"
                          onClick={() => setFulfillment('table_service')}
                          className={`gs-fulfillment-card ${fulfillment === 'table_service' ? 'is-active' : ''}`}
                        >
                          <div className="gs-fulfillment-card-top">
                            <span className="gs-fulfillment-icon">
                              <Utensils size={18} />
                            </span>
                            <span className="gs-fulfillment-check">
                              <Check size={12} />
                            </span>
                          </div>
                          <div>
                            <strong className="gs-fulfillment-title">Servicio en mesa</strong>
                            <span className="gs-fulfillment-meta">
                              Atención directa en el salón
                            </span>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Form Fields per Fulfillment Mode */}
                <div className="gs-checkout-section">
                  <div className="gs-checkout-section-head">
                    <h4 className="gs-checkout-section-title">
                      <span className="gs-checkout-step-num">{entryPoint === 'qr' ? '1' : '2'}</span>
                      {fulfillment === 'pickup'
                        ? 'Datos para recoger en local'
                        : fulfillment === 'restaurant_delivery'
                          ? 'Datos de entrega a domicilio'
                          : 'Datos de servicio en mesa'}
                    </h4>
                    {currentUser && (
                      <div className="gs-checkout-profile-pill">
                        <span className="gs-checkout-profile-avatar">
                          {currentUser.avatarUrl ? (
                            <img src={currentUser.avatarUrl} alt={currentUser.name} />
                          ) : (
                            (currentUser.name || 'U').slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <span>
                          {currentUser.username ? `@${currentUser.username}` : currentUser.name} · Autocompletado
                        </span>
                      </div>
                    )}
                  </div>

                  {fulfillment === 'pickup' && (
                    <div className="gs-checkout-fields-card">
                      <div className="gs-pickup-location-banner">
                        <MapPin size={16} className="gs-pickup-location-icon" />
                        <div className="gs-pickup-location-copy">
                          <strong>Punto de recogida: {currentTenant.name}</strong>
                          <span>{currentTenant.address || tenantCityName}</span>
                        </div>
                      </div>
                      <div className="gs-checkout-grid-2">
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-pickup-name">
                            <span>Nombre de quien recoge</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><User size={15} /></span>
                            <input
                              id="checkout-pickup-name"
                              type="text"
                              className="gs-checkout-input"
                              placeholder="Tu nombre"
                              value={customerName}
                              onChange={e => setCustomerName(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-pickup-phone">
                            <span>Teléfono de contacto</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><Phone size={15} /></span>
                            <input
                              id="checkout-pickup-phone"
                              type="tel"
                              className="gs-checkout-input is-mono"
                              placeholder="Ej. 300 123 4567"
                              value={customerPhone}
                              onChange={e => setCustomerPhone(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {fulfillment === 'restaurant_delivery' && (
                    <div className="gs-checkout-fields-card">
                      {/* Banco de Ubicaciones del Usuario */}
                      {userSavedAddresses.length > 0 && (
                        <div className="gs-checkout-address-bank">
                          <div className="gs-checkout-address-bank-head">
                            <span>Tu Banco de Ubicaciones</span>
                            <button
                              type="button"
                              className={`gs-checkout-new-addr-btn ${selectedAddressId === 'new' ? 'is-active' : ''}`}
                              onClick={() => {
                                setSelectedAddressId('new');
                                setDeliveryAddress('');
                                setDeliveryNotes('');
                              }}
                            >
                              <Plus size={13} />
                              <span>Nueva dirección</span>
                            </button>
                          </div>

                          <div className="gs-checkout-saved-list" role="radiogroup" aria-label="Seleccionar dirección guardada">
                            {userSavedAddresses.map((saved) => {
                              const isChosen = selectedAddressId === saved.id;
                              const savedCityName = cities.find((c) => c.id === saved.cityId)?.name || tenantCityName;
                              return (
                                <button
                                  key={saved.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={isChosen}
                                  className={`gs-checkout-saved-card ${isChosen ? 'is-active' : ''}`}
                                  onClick={() => {
                                    setSelectedAddressId(saved.id);
                                    setDeliveryAddress(saved.address);
                                    setDeliveryNotes(saved.notes || '');
                                    if (saved.cityId && saved.cityId !== selectedCityId) {
                                      setSelectedCity(saved.cityId);
                                    }
                                  }}
                                >
                                  <span className="gs-checkout-saved-radio" aria-hidden="true">
                                    {isChosen && <Check size={11} strokeWidth={3} />}
                                  </span>
                                  <div className="gs-checkout-saved-copy">
                                    <div className="gs-checkout-saved-top">
                                      <span className="gs-checkout-saved-badge">{saved.label}</span>
                                      <span className="gs-checkout-saved-city">{savedCityName}</span>
                                    </div>
                                    <span className="gs-checkout-saved-street">{saved.address}</span>
                                    {saved.notes && (
                                      <span className="gs-checkout-saved-notes">{saved.notes}</span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="gs-checkout-grid-2">
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-delivery-name">
                            <span>Nombre de quien recibe *</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><User size={15} /></span>
                            <input
                              id="checkout-delivery-name"
                              type="text"
                              className="gs-checkout-input"
                              placeholder="Ej. María Fernanda"
                              value={customerName}
                              onChange={e => setCustomerName(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-delivery-phone">
                            <span>Teléfono de contacto *</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><Phone size={15} /></span>
                            <input
                              id="checkout-delivery-phone"
                              type="tel"
                              className="gs-checkout-input is-mono"
                              placeholder="Ej. +57 300 123 4567"
                              value={customerPhone}
                              onChange={e => setCustomerPhone(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {selectedAddressId === 'new' && (
                        <div className="gs-checkout-field">
                          <span className="gs-checkout-label">Etiqueta para tu Banco de Ubicaciones</span>
                          <div className="gs-address-label-pills" role="group" aria-label="Etiqueta de ubicación">
                            {(['Casa', 'Oficina', 'Apartamento', 'Pareja'] as const).map((lbl) => (
                              <button
                                key={lbl}
                                type="button"
                                onClick={() => setNewAddressLabel(lbl)}
                                className={`gs-address-label-pill ${newAddressLabel === lbl ? 'active' : ''}`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="gs-checkout-field">
                        <label className="gs-checkout-label" htmlFor="checkout-delivery-address">
                          <span>Dirección de entrega en {tenantCityName} *</span>
                        </label>
                        <div className="gs-checkout-input-wrap">
                          <span className="gs-checkout-input-icon"><MapPin size={15} /></span>
                          <input
                            id="checkout-delivery-address"
                            type="text"
                            className="gs-checkout-input"
                            placeholder="Ej. Calle 2 Norte # 18 - 144, Barrio..."
                            value={deliveryAddress}
                            onChange={e => setDeliveryAddress(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="gs-checkout-field">
                        <label className="gs-checkout-label" htmlFor="checkout-delivery-notes">
                          <span>Notas para el repartidor</span>
                          <span className="gs-checkout-label-opt">Opcional</span>
                        </label>
                        <div className="gs-checkout-input-wrap">
                          <span className="gs-checkout-input-icon"><FileText size={15} /></span>
                          <input
                            id="checkout-delivery-notes"
                            type="text"
                            className="gs-checkout-input"
                            placeholder="Ej. Apto 302, timbrar en recepción"
                            value={deliveryNotes}
                            onChange={e => setDeliveryNotes(e.target.value)}
                          />
                        </div>
                      </div>

                      {currentUser && selectedAddressId === 'new' && (
                        <label className="gs-checkout-save-bank-check">
                          <input
                            type="checkbox"
                            checked={saveToAddressBank}
                            onChange={(e) => setSaveToAddressBank(e.target.checked)}
                          />
                          <span>Guardar esta dirección ({newAddressLabel}) en mi banco de ubicaciones</span>
                        </label>
                      )}
                    </div>
                  )}

                  {fulfillment === 'table_service' && (
                    <div className="gs-checkout-fields-card">
                      <div className="gs-checkout-grid-2">
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-table-number">
                            <span>Número de mesa *</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><Hash size={15} /></span>
                            <input
                              id="checkout-table-number"
                              type="text"
                              className="gs-checkout-input is-mono"
                              placeholder="Ej. 4"
                              value={tableNumber}
                              onChange={e => setTableNumber(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="gs-checkout-field">
                          <label className="gs-checkout-label" htmlFor="checkout-table-notes">
                            <span>Nota para cocina</span>
                            <span className="gs-checkout-label-opt">Opcional</span>
                          </label>
                          <div className="gs-checkout-input-wrap">
                            <span className="gs-checkout-input-icon"><FileText size={15} /></span>
                            <input
                              id="checkout-table-notes"
                              type="text"
                              className="gs-checkout-input"
                              placeholder="Ej. Sin cebolla en la ensalada"
                              value={restaurantNotes}
                              onChange={e => setRestaurantNotes(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3: Payment Method Selection */}
                <div className="gs-checkout-section">
                  <div className="gs-checkout-section-head">
                    <h4 className="gs-checkout-section-title">
                      <span className="gs-checkout-step-num">{entryPoint === 'qr' ? '2' : '3'}</span>
                      Método de pago
                    </h4>
                  </div>

                  <div className="gs-payment-methods-grid">
                    {paymentOptions.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMethod(option.id)}
                        className={`gs-pay-method-card ${method === option.id ? 'is-active' : ''}`}
                      >
                        <span className="gs-pay-method-icon">{option.icon}</span>
                        <span className="gs-pay-method-name">{option.name}</span>
                        <span className="gs-pay-method-sub">{option.subtitle}</span>
                      </button>
                    ))}
                  </div>

                  {isBelowDigitalMin && method !== 'cash' && (
                    <div className="gs-checkout-alert warning">
                      <AlertCircle size={18} className="gs-checkout-alert-icon" />
                      <div className="gs-checkout-alert-body">
                        <span>
                          Los pagos digitales requieren mínimo <strong>${MIN_DIGITAL_PAYMENT_COP.toLocaleString('es-CO')} COP</strong> (por el cargo fijo de pasarela Wompi de $700 + IVA).
                        </span>
                        <button
                          type="button"
                          className="gs-checkout-inline-switch-btn"
                          onClick={() => {
                            setMethod('cash');
                            setFormError(null);
                          }}
                        >
                          <Banknote size={14} /> Cambiar a efectivo
                        </button>
                      </div>
                    </div>
                  )}

                  {method !== 'cash' && (
                    <div className="gs-checkout-fields-card">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <ShieldCheck size={18} style={{ color: '#10B981', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '2px' }}>
                            {authMode === 'demo'
                              ? 'Simulación de Pago Digital (Sin cargos reales)'
                              : 'Checkout Tokenizado Seguro (PCI-DSS)'}
                          </strong>
                          <span>
                            {authMode === 'demo'
                              ? 'Estás en modo de prueba local. No se capturan datos de tarjetas reales ni se efectúan cobros.'
                              : 'GastroSync nunca captura números de tarjeta ni códigos CVV en esta pantalla. Serás redirigido al widget cifrado de Wompi para pagar con PSE, Nequi o Tarjeta.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Editorial Receipt + 97/3 Fair-Trade Breakdown */}
                <div className="gs-checkout-receipt">
                  <div className="gs-receipt-main">
                    <div className="gs-receipt-row">
                      <span>Subtotal de productos</span>
                      <strong>${subtotal.toLocaleString('es-CO')} COP</strong>
                    </div>
                    {fulfillment === 'restaurant_delivery' && (
                      <div className="gs-receipt-row">
                        <span>Envío del restaurante</span>
                        <strong className={currentTenant.deliveryFee ? '' : 'is-free'}>
                          {currentTenant.deliveryFee
                            ? `$${currentTenant.deliveryFee.toLocaleString('es-CO')} COP`
                            : 'Gratis'}
                        </strong>
                      </div>
                    )}
                    <div className="gs-receipt-total-row">
                      <span className="gs-receipt-total-label">Total a pagar</span>
                      <strong className="gs-receipt-total-value">
                        ${total.toLocaleString('es-CO')} COP
                      </strong>
                    </div>
                  </div>

                  <div className="gs-receipt-fairtrade">
                    <div className="gs-receipt-fairtrade-head">
                      <ShieldCheck size={13} />
                      <span>Transparencia GastroSync · Comercio Justo 97/3</span>
                    </div>
                    <div className="gs-receipt-subrow payout">
                      <span>
                        {method === 'cash'
                          ? `Ingreso neto para ${currentTenant.name} (97%)`
                          : `Ingreso neto para ${currentTenant.name} (tras pasarela + 3%)`}
                      </span>
                      <strong>${restaurantPayout.toLocaleString('es-CO')} COP</strong>
                    </div>
                    {gatewayFee > 0 && (
                      <div className="gs-receipt-subrow">
                        <span>Pasarela Wompi (2.65% + $700 + IVA)</span>
                        <strong>${gatewayFee.toLocaleString('es-CO')} COP</strong>
                      </div>
                    )}
                    <div className="gs-receipt-subrow">
                      <span>Comisión GastroSync (3% libre)</span>
                      <strong>${platformFee.toLocaleString('es-CO')} COP</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="gs-checkout-footer">
                <button
                  type="submit"
                  className="gs-checkout-submit-btn"
                  disabled={loading || isSubmittingOrder}
                >
                  <span className="gs-checkout-submit-left">
                    {method === 'cash' ? <Banknote size={18} /> : <Lock size={17} />}
                    <span>{primaryCtaLabel}</span>
                  </span>
                  <span className="gs-checkout-submit-amount">
                    ${total.toLocaleString('es-CO')} COP
                  </span>
                </button>
                <div className="gs-checkout-security-note">
                  {method === 'cash' ? (
                    <>
                      <ShieldCheck size={14} />
                      <span>Pago en efectivo directo al restaurante al recibir o recoger tu orden</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} />
                      <span>Transacción protegida con firma criptográfica SHA-256</span>
                    </>
                  )}
                </div>
                <p className="gs-checkout-legal-note">
                  Al confirmar tu pedido autorizas compartir tus datos de entrega con{' '}
                  <strong>{currentTenant.name}</strong> conforme a nuestra{' '}
                  <button
                    type="button"
                    className="gs-inline-legal-link"
                    onClick={() => openLegalCenter('privacy')}
                  >
                    Política de Privacidad (Ley 1581)
                  </button>{' '}
                  y los{' '}
                  <button
                    type="button"
                    className="gs-inline-legal-link"
                    onClick={() => openLegalCenter('terms')}
                  >
                    Términos de Compra (Ley 1480)
                  </button>
                  .
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </AnimatePresence>
  );
};
