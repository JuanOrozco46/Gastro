import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, RotateCcw } from 'lucide-react';
import { attemptChunkReload, isChunkLoadError } from '../utils/lazyWithRetry';

interface Props {
  children?: ReactNode;
  fallbackMessage?: string;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    isChunkError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Error inesperado al cargar la vista',
      isChunkError: isChunkLoadError(error)
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
    if (isChunkLoadError(error)) {
      attemptChunkReload();
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      isChunkError: false
    });
  };

  public render() {
    if (this.state.hasError) {
      const moduleLabel = this.props.moduleName ? `«${this.props.moduleName}»` : 'este módulo';

      return (
        <div className="gs-error-boundary" role="alert">
          <div className="gs-error-boundary__card">
            <div className="gs-error-boundary__icon" aria-hidden="true">
              <AlertTriangle size={28} />
            </div>

            <span className="gs-error-boundary__eyebrow">
              {this.state.isChunkError ? 'Nueva versión disponible' : 'Recuperación de vista'}
            </span>

            <h3 className="gs-error-boundary__title">
              {this.state.isChunkError
                ? `Actualizando ${moduleLabel} a la última versión`
                : `Ha ocurrido un error al cargar ${moduleLabel}`}
            </h3>

            <p className="gs-error-boundary__description">
              {this.props.fallbackMessage ||
                (this.state.isChunkError
                  ? 'Se publicó una actualización reciente de GastroSync mientras tenías la sesión abierta. Recarga la pantalla para sincronizar los módulos nuevos.'
                  : 'Hubo un problema técnico momentáneo al mostrar esta vista. Puedes recargar la pantalla o reintentar sin perder tu cuenta.')}
            </p>

            {this.state.errorMessage && (
              <p className="gs-error-boundary__code">
                Detalle técnico: {this.state.errorMessage}
              </p>
            )}

            <div className="gs-error-boundary__actions">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="gs-error-boundary__btn gs-error-boundary__btn--primary"
              >
                <RefreshCcw size={16} />
                <span>Recargar pantalla</span>
              </button>

              {!this.state.isChunkError && (
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="gs-error-boundary__btn gs-error-boundary__btn--secondary"
                >
                  <RotateCcw size={16} />
                  <span>Reintentar vista</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
