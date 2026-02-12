const prisma = require("../db/prisma");
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
    let session = await prisma.sessions.findFirst({
        where: { user_id: user.id, revoked_at: null },
        orderBy: { id: "desc" },
    });

    if (session) {
        session = await prisma.sessions.update({
            where: { id: session.id },
            data: {
                refresh_token: secretHash,
                refresh_expires_at: refreshExpiresAt,
                revoked_at: null,
            },
        });
    } else {
        session = await prisma.sessions.create({
            data: {
                user_id: user.id,
                refresh_token: secretHash,
                refresh_expires_at: refreshExpiresAt,
            },
        });
    }

    // create access token that references session id
    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );

    // return a token that includes session id and raw secret: "{sessionId}.{secret}"
    const refreshToken = tokenService.makeRefreshToken(session.id, secret);
    return { accessToken, refreshToken, user };
};

exports.refresh = async (refreshToken) => {
    assert(typeof refreshToken === "string", "refresh token required", 401);

    // Expect refreshToken format: "{sessionId}.{secret}"
    const parsed = tokenService.parseRefreshToken(refreshToken);
    assert(parsed, "refresh token required", 401);

    const session = await prisma.sessions.findUnique({
        where: { id: parsed.sessionId },
    });
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

    await prisma.sessions.update({
        where: { id: session.id },
        data: {
            refresh_token: newSecretHash,
            refresh_expires_at: newRefreshExpiresAt,
        },
    });

    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );

    return { accessToken, refreshToken: tokenService.makeRefreshToken(session.id, newSecret) };
};

exports.logout = async (refreshToken) => {
    // Accept token in format "{sessionId}.{secret}" and verify before revoking.
    // If no token provided, simply return (idempotent logout).
    const parsed = tokenService.parseRefreshToken(refreshToken);
    if (!parsed) return;

    const session = await prisma.sessions.findUnique({ where: { id: parsed.sessionId } });
    if (!session) return;

    const ok = await tokenService.verifySecret(parsed.secret, session.refresh_token);
    if (!ok) return;

    await prisma.sessions.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
    });
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

    const session = await prisma.sessions.findUnique({
        where: { id: sessionId },
    });
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
