import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        mkcert()
    ],
    define: {
        // Real app version for the deployment-verification badge
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    base: '/protoface/',
    optimizeDeps: {
        exclude: ['onnxruntime-web']
    },
    worker: {
        format: 'es'
    }
})
