import React from 'react';

/**
 * ErrorBoundary - A standard React error boundary to catch and display
 * runtime errors gracefully. 
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: '#ef4444',
                    margin: '1rem'
                }}>
                    <h2 style={{ marginBottom: '1rem' }}>Something went wrong.</h2>
                    <p style={{ marginBottom: '1.5rem', opacity: 0.8, fontSize: '0.9rem' }}>
                        {this.state.error?.message || "An unexpected error occurred in this section of the app."}
                    </p>
                    <button
                        className="btn-primary"
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        Try Refreshing Section
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
