const redis = require('../db/redis');

module.exports = function metricsMiddleware(req, res, next) {
    const start = Date.now();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = req.user && req.user.id ? req.user.id : 'anon';
    const route = req.method + ' ' + (req.route ? req.route.path : req.originalUrl || req.url);

    // increment counters in redis (if available)
    if (redis) {
        try {
            const ts = Math.floor(Date.now() / 1000);
            // global per-second counter
            redis.incr(`metrics:global:count:${ts}`);
            // per-route
            redis.incr(`metrics:route:${route}:count:${ts}`);
            // per-ip
            redis.incr(`metrics:ip:${ip}:count:${ts}`);
            // per-user
            redis.incr(`metrics:user:${userId}:count:${ts}`);
            // last seen
            redis.set(`metrics:lastseen:ip:${ip}`, Date.now());
            if (userId !== 'anon') redis.set(`metrics:lastseen:user:${userId}`, Date.now());
        } catch (e) {
            console.error('metrics middleware redis error', e);
        }
    }

    res.on('finish', () => {
        const duration = Date.now() - start;
        if (redis) {
            try {
                // store histogram-ish by appending durations
                redis.lpush(`metrics:durations:${route}`, duration);
                redis.ltrim(`metrics:durations:${route}`, 0, 999); // keep last 1000
            } catch (e) {
                console.error('metrics middleware redis error (durations)', e);
            }
        }
    });

    next();
};
