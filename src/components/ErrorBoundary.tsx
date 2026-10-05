import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '12px',
          margin: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          color: '#EF4444',
          textAlign: 'center'
        }}>
          <AlertTriangle size={48} />
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>Ha ocurrido un error al cargar este módulo</h3>
            <p style={{ color: '#E2E8F0', fontSize: '0.9rem', maxWidth: '400px' }}>
              {this.props.fallbackMessage || 'Hubo un problema técnico al renderizar esta vista. Nuestro equipo técnico ha sido notificado.'}
            </p>
            <p style={{ marginTop: '8px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8' }}>
              Error: {this.state.errorMessage}
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#EF4444' }}
          >
            <RefreshCcw size={16} /> Recargar pantalla
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
