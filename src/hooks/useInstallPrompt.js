import { useState, useEffect } from 'react';

/**
 * useInstallPrompt - Hook for managing PWA install prompt
 * 
 * Returns:
 * - canInstall: boolean - true if app can be installed
 * - isInstalled: boolean - true if running as installed PWA
 * - promptInstall: function - triggers the install prompt
 */
export const useInstallPrompt = () => {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if running as installed PWA
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        setIsInstalled(isStandalone);

        // Listen for the beforeinstallprompt event
        const handleBeforeInstallPrompt = (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event for later use
            setInstallPrompt(e);
        };

        // Listen for successful installation
        const handleAppInstalled = () => {
            setInstallPrompt(null);
            setIsInstalled(true);
            console.log('[PWA] App was installed');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const promptInstall = async () => {
        if (!installPrompt) {
            return false;
        }

        // Show the install prompt
        installPrompt.prompt();

        // Wait for the user's response
        const { outcome } = await installPrompt.userChoice;

        // Clear the stored prompt
        setInstallPrompt(null);

        return outcome === 'accepted';
    };

    return {
        canInstall: installPrompt !== null,
        isInstalled,
        promptInstall
    };
};
