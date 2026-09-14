import React from 'react';
import { useApp } from '../context/useApp';
import { Bell } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast } = useApp();

  if (!toast) return null;

  return (
    <div className="toast-container">
      <div className="toast">
        <Bell size={18} />
        <span>{toast}</span>
      </div>
    </div>
  );
};
