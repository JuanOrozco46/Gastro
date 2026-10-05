import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { fetchMySupportNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../services/supportService';
import type { SupportNotification } from '../services/supportService';
import { safeFormatDate } from '../utils/formatters';

interface Props {
  onOpenTicket: (ticketId: string) => void;
}

export const NotificationBell: React.FC<Props> = ({ onOpenTicket }) => {
  const [notifications, setNotifications] = useState<SupportNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const loadNotifications = () => {
    fetchMySupportNotifications().then(({ data }) => {
      setNotifications(data || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s as fallback
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (n: SupportNotification) => {
    if (!n.is_read) {
      await markNotificationAsRead(n.id);
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, is_read: true } : notif));
    }
    setIsOpen(false);
    if (n.ticket_id) {
      onOpenTicket(n.ticket_id);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative" ref={menuRef} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <Bell size={20} className="text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-gray-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl overflow-hidden z-50 border border-gray-100" style={{ top: '100%' }}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="font-bold text-gray-900 mb-0">Notificaciones</h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <Check size={14} /> Marcar leído
              </button>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <Bell size={32} className="text-gray-300 mb-2" />
                <p className="text-sm">No tienes notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left p-4 transition-colors flex gap-3 ${!n.is_read ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                    style={{ display: 'flex', textAlign: 'left', width: '100%', border: 'none', background: !n.is_read ? '#f0f9ff' : '#fff' }}
                  >
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" style={{ minWidth: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', marginTop: '6px' }} />
                    )}
                    <div className="flex-1 min-w-0" style={{ flex: 1, minWidth: 0 }}>
                      <p className={`text-sm mb-0.5 ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`} style={{ fontWeight: !n.is_read ? 600 : 500, fontSize: '14px', margin: '0 0 2px 0' }}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mb-1.5 leading-snug" style={{ fontSize: '12px', margin: '0 0 6px 0', color: '#64748b' }}>
                        {n.body}
                      </p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1" style={{ fontSize: '10px', margin: 0, display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <Clock size={10} /> {safeFormatDate(n.created_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
