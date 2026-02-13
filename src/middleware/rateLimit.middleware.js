// Rate limiter with Redis backend when REDIS_URL is configured.
// Falls back to an in-memory limiter for single-process/dev use.

// Configurable via environment variables
const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 10) || 60 * 60; // default 1 hour
const MAX_PER_IP = parseInt(process.env.RATE_LIMIT_MAX_PER_IP, 10) || 5;
const MAX_PER_EMAIL = parseInt(process.env.RATE_LIMIT_MAX_PER_EMAIL, 10) || 5;
const REDIS_PREFIX = process.env.RATE_LIMIT_REDIS_PREFIX || 'rl:forgot';

let redisClient = null;
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS;
if (REDIS_URL) {
    try {
        const IORedis = require('ioredis');
        redisClient = new IORedis(REDIS_URL);
        redisClient.on('error', (e) => console.error('Redis error:', e));
    } catch (e) {
        console.error('ioredis not installed or failed to load, falling back to in-memory limiter. To enable Redis, install ioredis and set REDIS_URL.');
        redisClient = null;
    }
}

// In-memory fallback stores (only for dev / single-process)
const ipStore = new Map();
const emailStore = new Map();

function makeInMemoryKey(store, key, windowSeconds, limit) {
    const nowMs = Date.now();
    const expiresAt = nowMs + windowSeconds * 1000;
    const existing = store.get(key);
    if (!existing || existing.expiresAt <= nowMs) {
        store.set(key, { count: 1, expiresAt });
        return { count: 1, ttl: windowSeconds };
    }
    existing.count += 1;
    store.set(key, existing);
    return { count: existing.count, ttl: Math.ceil((existing.expiresAt - nowMs) / 1000) };
}

async function incrRedisKey(key, windowSeconds) {
    // INCR, set EXPIRE if first
    const val = await redisClient.incr(key);
    if (val === 1) {
        await redisClient.expire(key, windowSeconds);
    }
    const ttl = await redisClient.ttl(key);
    return { count: val, ttl: ttl > 0 ? ttl : windowSeconds };
}

async function forgotPasswordRateLimiter(req, res, next) {
    try {
        const ip = (req.ip || req.connection?.remoteAddress || '').toString();
        const emailRaw = (req.body && req.body.email) || '';
        const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

        if (redisClient) {
            // use Redis counters
            const ipKey = `${REDIS_PREFIX}:ip:${ip}`;
            const emailKey = email ? `${REDIS_PREFIX}:email:${email}` : null;

            const ipRes = await incrRedisKey(ipKey, WINDOW_SECONDS);
            if (ipRes.count > MAX_PER_IP) {
                const err = new Error('Too many requests from this IP, try again later');
                err.status = 429;
                err.retryAfter = ipRes.ttl;
                throw err;
            }

            if (emailKey) {
                const emailRes = await incrRedisKey(emailKey, WINDOW_SECONDS);
                if (emailRes.count > MAX_PER_EMAIL) {
                    const err = new Error('Too many password reset requests for this email, try again later');
                    err.status = 429;
                    err.retryAfter = emailRes.ttl;
                    throw err;
                }
            }

            return next();
        }

        // fallback: in-memory
        const ipRes = makeInMemoryKey(ipStore, ip, WINDOW_SECONDS, MAX_PER_IP);
        if (ipRes.count > MAX_PER_IP) {
            const err = new Error('Too many requests from this IP, try again later');
            err.status = 429;
            err.retryAfter = ipRes.ttl;
            throw err;
        }
        if (email) {
            const emailRes = makeInMemoryKey(emailStore, email, WINDOW_SECONDS, MAX_PER_EMAIL);
            if (emailRes.count > MAX_PER_EMAIL) {
                const err = new Error('Too many password reset requests for this email, try again later');
                err.status = 429;
                err.retryAfter = emailRes.ttl;
                throw err;
            }
        }

        return next();
    } catch (err) {
        next(err);
    }
}

module.exports = { forgotPasswordRateLimiter };
