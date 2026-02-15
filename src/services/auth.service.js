const prisma = require("../db/prisma");
const redis = require('../db/redis');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const tokenService = require("./token.service");

function assert(condition, message, status = 400) {
    if (!condition) {
        const err = new Error(message);
        err.status = status;
        throw err;
    }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error(
        "Environment variable JWT_SECRET is required for authentication and must be set before starting the server.",
    );
}

const ACCESS_TTL_MIN = Number(process.env.ACCESS_TTL_MIN || 15); // minutes
const REFRESH_TTL_HOURS = Number(process.env.REFRESH_TTL_HOURS || 24); // hours

// Token helpers are provided by `token.service`:
// - tokenService.generateSecret()
// - tokenService.hashSecret(secret)
// - tokenService.verifySecret(secret, hash)
// - tokenService.makeRefreshToken(sessionId, secret)
// - tokenService.parseRefreshToken(token)

exports.login = async (email, password) => {
    assert(typeof email === "string", "email required", 400);
    assert(typeof password === "string", "password required", 400);

    const user = await prisma.users.findUnique({ where: { email } });
    assert(user, "Invalid credentials", 401);

    const match = await bcrypt.compare(password, user.password);
    assert(match, "Invalid credentials", 401);

    // create refresh token secret and create/update single session per user
    const secret = tokenService.generateSecret(32);
    const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TTL_HOURS * 60 * 60 * 1000,
    );

    // hash the secret before storing in DB
    const secretHash = await tokenService.hashSecret(secret);

    // Attempt to reuse an active session for this user. If one exists,
    // replace its stored hashed secret. Otherwise create a new session.
    // Sessions are stored primarily in Redis under `session:<id>` and
    // indexed by `user_sessions:<userId>` set. We use `sessions:nextId` counter
    // to generate numeric ids compatible with tokenService.
    async function cacheSession(s) {
        if (!redis || !s) return;
        try {
            const ttl = Math.max(1, Math.ceil((refreshExpiresAt.getTime() - Date.now())/1000));
            await redis.set(`session:${s.id}`, JSON.stringify(s), 'EX', ttl);
            await redis.sadd(`user_sessions:${s.user_id}`, s.id);
        } catch (e) {
            console.error('auth.service: failed to cache session in redis', e);
        }
    }

    let session = null;
    try {
        if (redis) {
            const userSet = `user_sessions:${user.id}`;
            const ids = await redis.smembers(userSet);
            for (const sid of ids) {
                const sraw = await redis.get(`session:${sid}`);
                if (!sraw) continue;
                const s = JSON.parse(sraw);
                if (s.revoked_at) continue;
                if (s.refresh_expires_at && new Date(s.refresh_expires_at) <= new Date()) continue;
                session = s;
                break;
            }
        }
    } catch (e) {
        console.error('auth.service: failed to read sessions from redis', e);
    }

    if (session) {
        // update existing session secret + expiry
        session.refresh_token = secretHash;
        session.refresh_expires_at = refreshExpiresAt.toISOString();
        session.revoked_at = null;
        if (redis) {
            try {
                await redis.set(`session:${session.id}`, JSON.stringify(session), 'EX', Math.max(1, Math.ceil((refreshExpiresAt.getTime() - Date.now())/1000)));
            } catch (e) {
                console.error('auth.service: failed to update session in redis', e);
            }
        } else {
            session = await prisma.sessions.update({ where: { id: session.id }, data: { refresh_token: secretHash, refresh_expires_at: refreshExpiresAt, revoked_at: null } });
            await cacheSession(session);
        }
    } else {
        // create new session id via redis counter or DB fallback
        if (redis) {
            try {
                const sid = await redis.incr('sessions:nextId');
                const sessionObj = {
                    id: sid,
                    user_id: user.id,
                    refresh_token: secretHash,
                    refresh_expires_at: refreshExpiresAt.toISOString(),
                    revoked_at: null,
                };
                await redis.set(`session:${sid}`, JSON.stringify(sessionObj), 'EX', Math.max(1, Math.ceil((refreshExpiresAt.getTime() - Date.now())/1000)));
                await redis.sadd(`user_sessions:${user.id}`, sid);
                session = sessionObj;
            } catch (e) {
                console.error('auth.service: failed to create session in redis', e);
            }
        }

        if (!session) {
            session = await prisma.sessions.create({ data: { user_id: user.id, refresh_token: secretHash, refresh_expires_at: refreshExpiresAt } });
            await cacheSession(session);
        }
    }

    // create access token that references session id
    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );

    // update last_login_at for user and return updated user
    const updatedUser = await prisma.users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
    });

    // return a token that includes session id and raw secret: "{sessionId}.{secret}"
    const refreshToken = tokenService.makeRefreshToken(session.id, secret);
    return { accessToken, refreshToken, user: updatedUser };
};

exports.refresh = async (refreshToken) => {
    assert(typeof refreshToken === "string", "refresh token required", 401);

    // Expect refreshToken format: "{sessionId}.{secret}"
    const parsed = tokenService.parseRefreshToken(refreshToken);
    assert(parsed, "refresh token required", 401);

    // Try redis cache first
    let session = null;
    if (redis) {
        try {
            const cached = await redis.get(`session:${parsed.sessionId}`);
            if (cached) session = JSON.parse(cached);
        } catch (e) {
            console.error('auth.service: redis get session error', e);
        }
    }
    if (!session) {
        session = await prisma.sessions.findUnique({ where: { id: parsed.sessionId } });
    }
    assert(session && !session.revoked_at, "Session not found or revoked", 401);
    assert(
        new Date(session.refresh_expires_at) > new Date(),
        "Refresh token expired",
        401,
    );

    const user = await prisma.users.findUnique({
        where: { id: session.user_id },
    });
    assert(user, "User not found", 401);

    // verify secret against stored hash
    const ok = await tokenService.verifySecret(parsed.secret, session.refresh_token);
    assert(ok, "Invalid refresh token", 401);

    // Rotate refresh token: generate new secret and hash and update session
    const newSecret = tokenService.generateSecret(32);
    const newSecretHash = await tokenService.hashSecret(newSecret);
    const newRefreshExpiresAt = new Date(
        Date.now() + REFRESH_TTL_HOURS * 60 * 60 * 1000,
    );

    let updatedSession = null;
    if (redis) {
        try {
            const sraw = await redis.get(`session:${session.id}`);
            if (sraw) {
                const s = JSON.parse(sraw);
                s.refresh_token = newSecretHash;
                s.refresh_expires_at = newRefreshExpiresAt.toISOString();
                await redis.set(`session:${s.id}`, JSON.stringify(s), 'EX', Math.max(1, Math.ceil((newRefreshExpiresAt.getTime() - Date.now())/1000)));
                updatedSession = s;
            }
        } catch (e) {
            console.error('auth.service: redis update session error', e);
        }
    }

    if (!updatedSession) {
        updatedSession = await prisma.sessions.update({
            where: { id: session.id },
            data: {
                refresh_token: newSecretHash,
                refresh_expires_at: newRefreshExpiresAt,
            },
        });
        if (redis) {
            try {
                await redis.set(`session:${updatedSession.id}`, JSON.stringify(updatedSession), 'EX', Math.max(1, Math.ceil((newRefreshExpiresAt.getTime() - Date.now())/1000)));
            } catch (e) {
                console.error('auth.service: failed to update session cache', e);
            }
        }
    }

    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );

    // do not return password field
    const safeUser = { ...user };
    if (safeUser.password) delete safeUser.password;

    return { accessToken, refreshToken: tokenService.makeRefreshToken(session.id, newSecret), user: safeUser };
};

exports.logout = async (refreshToken) => {
    // Accept token in format "{sessionId}.{secret}" and verify before revoking.
    // If no token provided, simply return (idempotent logout).
    const parsed = tokenService.parseRefreshToken(refreshToken);
    if (!parsed) return;

    // try redis first
    let session = null;
    if (redis) {
        try {
            const sraw = await redis.get(`session:${parsed.sessionId}`);
            if (sraw) session = JSON.parse(sraw);
        } catch (e) {
            console.error('auth.service: redis get session error', e);
        }
    }
    if (!session) {
        session = await prisma.sessions.findUnique({ where: { id: parsed.sessionId } });
        if (!session) return;
    }

    const ok = await tokenService.verifySecret(parsed.secret, session.refresh_token);
    if (!ok) return;

    // revoke in redis and db
    try {
        if (redis) {
            try {
                // mark revoked
                session.revoked_at = new Date().toISOString();
                await redis.set(`session:${session.id}`, JSON.stringify(session));
                await redis.srem(`user_sessions:${session.user_id}`, session.id);
            } catch (e) {
                console.error('auth.service: failed to revoke session in redis', e);
            }
        }
        await prisma.sessions.update({ where: { id: session.id }, data: { revoked_at: new Date() } });
    } catch (e) {
        console.error('auth.service: failed to revoke session', e);
    }
};

exports.verifySession = async (accessToken) => {
    assert(typeof accessToken === "string", "access token required", 401);

    let payload;
    try {
        payload = jwt.verify(accessToken, JWT_SECRET);
    } catch (err) {
        const e = new Error("Invalid token");
        e.status = 401;
        throw e;
    }

    const sessionId = payload.sessionId;
    assert(sessionId, "Invalid token payload", 401);

    let session = null;
    if (redis) {
        try {
            const cached = await redis.get(`session:${sessionId}`);
            if (cached) session = JSON.parse(cached);
        } catch (e) {
            console.error('auth.service: redis get session error', e);
        }
    }
    if (!session) {
        session = await prisma.sessions.findUnique({ where: { id: sessionId } });
    }
    assert(session && !session.revoked_at, "Session not found or revoked", 401);
    assert(
        new Date(session.refresh_expires_at) > new Date(),
        "Session expired",
        401,
    );

    const user = await prisma.users.findUnique({
        where: { id: session.user_id },
    });
    assert(user, "User not found", 401);

    return { user, payload };
};
