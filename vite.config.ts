import { defineConfig } from 'vite'
import { version } from './package.json' with { type: 'json' }

// Relative asset paths allow the built app to live in any subfolder, including
// an NUS SoC personal-page directory such as /~username/inkpdf/.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
