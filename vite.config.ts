import { defineConfig } from 'vite'

// Relative asset paths allow the built app to live in any subfolder, including
// an NUS SoC personal-page directory such as /~username/inkpdf/.
export default defineConfig({
  base: './',
})
