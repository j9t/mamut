import { defineConfig } from 'vite';

// `connect-src` must stay open, as any Fediverse server can be queried
const POLICY_CONTENT_SECURITY = [
  'default-src \'none\'',
  'base-uri \'none\'',
  'connect-src https:',
  'form-action \'none\'',
  'img-src \'self\' data:',
  'script-src \'self\'',
  'style-src \'self\''
].join('; ');

const config = defineConfig({
  root: 'site',
  build: {
    outDir: 'build'
  },
  server: {
    port: 3457
  },
  // Build only, as the dev server relies on inline styles and a WebSocket
  plugins: [{
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{
      attrs: { content: POLICY_CONTENT_SECURITY, 'http-equiv': 'Content-Security-Policy' },
      injectTo: 'head-prepend',
      tag: 'meta'
    }]
  }]
});

export default config;