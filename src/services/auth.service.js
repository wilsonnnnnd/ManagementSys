const prisma = require("../db/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

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

function randomToken(len = 48) {
    return crypto.randomBytes(len).toString("hex");
}

exports.login = async (email, password) => {
    assert(typeof email === "string", "email required", 400);
    assert(typeof password === "string", "password required", 400);

    const user = await prisma.users.findUnique({ where: { email } });
    assert(user, "Invalid credentials", 401);

    const match = await bcrypt.compare(password, user.password_hash);
    assert(match, "Invalid credentials", 401);

    // create refresh token and session
    const refreshToken = randomToken(32);
    const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TTL_HOURS * 60 * 60 * 1000,
    );

    const session = await prisma.sessions.create({
        data: {
            user_id: user.id,
            refresh_token: refreshToken,
            refresh_expires_at: refreshExpiresAt,
        },
    });

    // create access token that references session id
    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );

    return { accessToken, refreshToken, user };
};

exports.refresh = async (refreshToken) => {
    assert(typeof refreshToken === "string", "refresh token required", 401);

    const session = await prisma.sessions.findUnique({
        where: { refresh_token: refreshToken },
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

    const accessToken = jwt.sign(
        { userId: user.id, sessionId: session.id },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_MIN}m` },
    );
    return { accessToken };
};

exports.logout = async (refreshToken) => {
    assert(typeof refreshToken === "string", "refresh token required", 400);

    const session = await prisma.sessions.findUnique({
        where: { refresh_token: refreshToken },
    });
    if (!session) return;

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
