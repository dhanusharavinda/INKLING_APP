// Post-processes dist/index.html after `expo export --platform web`:
// adds the PWA/home-screen meta tags and the app-like no-text-selection CSS.
// Runs in CI (Netlify) and locally; plain Node, no dependencies.
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const meta =
  '<meta name="theme-color" content="#FBF7F0" />' +
  '<meta name="apple-mobile-web-app-capable" content="yes" />' +
  '<meta name="mobile-web-app-capable" content="yes" />' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />' +
  '<meta name="apple-mobile-web-app-title" content="Inkling" />' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />' +
  '<link rel="manifest" href="/manifest.json" />';

const css =
  '<style>body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;' +
  '-webkit-tap-highlight-color:transparent}input,textarea{-webkit-user-select:text;user-select:text}</style>';

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('<title>Inkling</title>', `<title>Inkling</title>${meta}`);
}
if (!html.includes('user-select:none')) {
  html = html.replace('</head>', `${css}</head>`);
}

fs.writeFileSync(htmlPath, html);
console.log('inject-web: PWA meta + app CSS injected into dist/index.html');
