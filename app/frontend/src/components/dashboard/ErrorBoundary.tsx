import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center">
                    <h1 className="text-3xl font-bold text-red-500 mb-4">Ha ocurrido un error inesperado</h1>
                    <div className="bg-slate-800 p-6 rounded-lg max-w-3xl overflow-auto w-full border border-slate-700">
                        <h2 className="text-xl font-semibold mb-2 text-yellow-400">Error:</h2>
                        <pre className="whitespace-pre-wrap text-red-300 mb-6 font-mono text-sm">
                            {this.state.error && this.state.error.toString()}
                        </pre>

                        <h2 className="text-xl font-semibold mb-2 text-yellow-400">Detalles:</h2>
                        <pre className="whitespace-pre-wrap text-slate-400 font-mono text-xs">
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                    >
                        Recargar Página
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
