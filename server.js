const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

function safePath(pathname) {
    const decoded = decodeURIComponent(pathname.split('?')[0]);
    const resolved = path.resolve(ROOT, '.' + decoded);
    if (!resolved.startsWith(ROOT)) return null;
    return resolved;
}

function hasFileExtension(segment) {
    return segment.includes('.') && !segment.endsWith('.');
}

function resolveFilePath(pathname) {
    if (pathname === '/dev' || pathname.startsWith('/dev/')) {
        const segments = pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        const isAsset = segments.length > 1 && hasFileExtension(last);
        if (!isAsset && pathname !== '/dev') {
            return path.join(ROOT, 'dev', 'index.html');
        }
    }

    let filePath = safePath(pathname);
    if (!filePath) return null;

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    return filePath;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const filePath = resolveFilePath(url.pathname);

    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 — Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Mino Pets dev server running at http://localhost:${PORT}`);
    console.log('Storefront: http://localhost:' + PORT + '/dev');
    console.log('SPA routes like /dev/fish are supported.');
});
