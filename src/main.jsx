import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Build info for debugging deployments
console.log('[ProtoFace] Build:', new Date().toISOString().split('T')[0], '| onnxruntime-web: 1.18.0');

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Register Service Worker for PWA functionality (production only)
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
            console.log('[PWA] Service Worker registered:', registration.scope);

            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New content available, notify user (optional: show update prompt)
                        console.log('[PWA] New content available, refresh to update.');
                    }
                });
            });
        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
        }
    });
}
