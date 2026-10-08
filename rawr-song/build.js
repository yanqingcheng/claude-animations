#!/usr/bin/env node
/* Assembles src/ into one self-contained page.
   node build.js             -> index.html (opens by double-click)
   node build.js --artifact  -> also dist/rawr-song.html, the same page without the document wrapper,
                                which is the form a Claude artifact is published in                   */
const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const head = `<title>The Rawr Song</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Luckiest+Guy&family=Silkscreen:wght@400;700&display=swap">
<style>
${r('style.css')}</style>`;
const body = `${r('page.html')}
<script>
(() => {
'use strict';
${r('engine.js')}
${r('draw.js')}
${r('main.js')}
})();
</script>`;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
console.log('index.html', (page.length / 1024).toFixed(1) + ' KB');
if (process.argv.includes('--artifact')) {
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'rawr-song.html'), head + '\n' + body + '\n');
  console.log('dist/rawr-song.html');
}
