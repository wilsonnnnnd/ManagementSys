const prisma = require("../db/prisma");

module.exports = function logMiddleware(req, res, next) {
    const start = Date.now();
    const { method, originalUrl } = req;
    const ip = req.ip || req.connection?.remoteAddress || null;

    // shallow copy and redact sensitive fields
    const safeBody =
        req.body && typeof req.body === "object" ? { ...req.body } : null;
    if (safeBody) {
        if (safeBody.password) safeBody.password = "[REDACTED]";
        if (safeBody.refreshToken) safeBody.refreshToken = "[REDACTED]";
    }

    res.on("finish", async () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const userId = req.user && req.user.id ? req.user.id : null;

        const logEntry = {
            timestamp: new Date().toISOString(),
            ip,
            method,
            path: originalUrl,
            status,
            duration_ms: duration,
            user_id: userId,
            body: safeBody,
        };

        // push to redis queue for asynchronous persistence
        try {
            const redis = require('../db/redis');
            if (redis) {
                await redis.lpush('log_queue', JSON.stringify(logEntry));
                // trim queue to reasonable length
                await redis.ltrim('log_queue', 0, 9999);
            } else {
                // fallback: write directly to DB
                await prisma.api_logs.create({ data: { timestamp: new Date(), ip, method, path: originalUrl, status, duration_ms: duration, user_id: userId, body: safeBody } });
            }
        } catch (err) {
            console.error('Failed to enqueue or write API log:', err);
        }

        // concise console output
        console.log(`${new Date().toISOString()} ${ip || "-"} ${method} ${originalUrl} ${status} ${duration}ms user=${userId || "-"}`);
    });

    next();
};
