const redis = require('../db/redis');

// Simple GET response cache. Keyed by method+url+body (for idempotent GETs body ignored).
module.exports = function cacheMiddleware(ttlSeconds = 60) {
    return async function (req, res, next) {
        if (req.method !== 'GET' || !redis) return next();

        const key = `cache:${req.method}:${req.originalUrl}`;

        try {
            const cached = await redis.get(key);
            if (cached) {
                const payload = JSON.parse(cached);
                res.set(payload.headers || {});
                return res.status(payload.status || 200).send(payload.body);
            }
        } catch (e) {
            console.error('cache middleware read error', e);
        }

        // hijack send to cache response
        const originalSend = res.send.bind(res);
        res.send = async (body) => {
            try {
                const payload = {
                    status: res.statusCode,
                    headers: {},
                    body,
                };
                // capture a few safe headers
                ['content-type', 'cache-control'].forEach((h) => {
                    if (res.getHeader && res.getHeader(h)) payload.headers[h] = res.getHeader(h);
                });
                await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
            } catch (e) {
                console.error('cache middleware write error', e);
            }
            return originalSend(body);
        };

        next();
    };
};
