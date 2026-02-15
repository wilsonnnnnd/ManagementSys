const prisma = require("../db/prisma");
const { ROLES, isValidRole } = require("../types/user");

function assert(condition, message, status = 400) {
    if (!condition) {
        const err = new Error(message);
        err.status = status;
        throw err;
    }
}

exports.list = async () => {
    return await prisma.users.findMany();
};

exports.getById = async (id) => {
    assert(Number.isFinite(id), "id must be a number", 400);

    const user = await prisma.users.findUnique({ where: { id } });
    assert(user, "User not found", 404);

    return user;
};

exports.create = async ({
    first_name,
    last_name,
    email,
    password,
    role,
    status,
}) => {
    assert(typeof email === "string", "email must be a string", 400);
    const trimmedEmail = email.trim();
    assert(
        trimmedEmail.length > 3 && trimmedEmail.includes("@"),
        "invalid email",
        400,
    );

    const exists = await prisma.users.findUnique({
        where: { email: trimmedEmail },
    });
    assert(!exists, "email already in use", 400);

    assert(
        typeof password === "string" && password.length >= 6,
        "password must be at least 6 characters",
        400,
    );
    const passwordHash = await require("bcrypt").hash(password, 10);

    const finalRole = role && isValidRole(role) ? role : ROLES.user;
    const created = await prisma.users.create({
        data: {
            first_name: first_name || "",
            last_name: last_name || "",
            email: trimmedEmail,
            password: passwordHash,
            role: finalRole,
            status: status || "pending",
        },
    });

    return created;
};

// Create user and also generate + persist an email verification token in a single transaction.
// Returns { user, verifyToken, verifyExpiresAt }
exports.createWithVerification = async ({
    first_name,
    last_name,
    email,
    password,
    role,
    status,
    expiresMinutes = 15,
}) => {
    assert(typeof email === "string", "email must be a string", 400);
    const trimmedEmail = email.trim();
    assert(
        trimmedEmail.length > 3 && trimmedEmail.includes("@"),
        "invalid email",
        400,
    );

    const exists = await prisma.users.findUnique({ where: { email: trimmedEmail } });
    assert(!exists, "email already in use", 400);

    assert(
        typeof password === "string" && password.length >= 6,
        "password must be at least 6 characters",
    );
    const passwordHash = await require("bcrypt").hash(password, 10);

    const finalRole = role && isValidRole(role) ? role : ROLES.user;

    const jwt = require("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        const err = new Error("Environment variable JWT_SECRET is required");
        err.status = 500;
        throw err;
    }

    // Use a transaction to ensure both create and update happen together.
    const result = await prisma.$transaction(async (tx) => {
        const created = await tx.users.create({
            data: {
                first_name: first_name || "",
                last_name: last_name || "",
                email: trimmedEmail,
                password: passwordHash,
                role: finalRole,
                status: status || "pending",
            },
        });

        const verifyToken = jwt.sign({ userId: created.id, type: "email_verification" }, JWT_SECRET, { expiresIn: `${expiresMinutes}m` });
        const verifyExpiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

        const updated = await tx.users.update({ where: { id: created.id }, data: { verify_token: verifyToken, verify_expires_at: verifyExpiresAt } });

        return { user: updated, verifyToken, verifyExpiresAt };
    });

    return result;
};

exports.update = async (id, data) => {
    assert(Number.isFinite(id), "id must be a number", 400);

    // Prevent email duplication when updating
    if (data.email) {
        const existing = await prisma.users.findUnique({
            where: { email: data.email },
        });
        if (existing && existing.id !== id) {
            const err = new Error("email already in use");
            err.status = 400;
            throw err;
        }
    }

    // Validate role when present
    if (data.role !== undefined && !isValidRole(data.role)) {
        const err = new Error("invalid role");
        err.status = 400;
        throw err;
    }

    const updated = await prisma.users.update({ where: { id }, data });
    return updated;
};

exports.delete = async (id) => {
    assert(Number.isFinite(id), "id must be a number", 400);

    const deleted = await prisma.users.delete({ where: { id } });
    return deleted;
};

// Generate a password reset token for the user with given email.
// Returns the plaintext token when created, otherwise null.
exports.generateResetToken = async (email, expiresMinutes = 60) => {
    assert(typeof email === 'string', 'email must be a string', 400);
    const trimmedEmail = email.trim();

    const user = await prisma.users.findUnique({ where: { email: trimmedEmail } });
    // For security, do not disclose whether user exists. Return null if not found.
    if (!user || user.status !== 'active') return null;

    const crypto = require('crypto');
    let token, hashed;
    let attempts = 0;
    const maxAttempts = 5;

    // Ensure the generated token's hash does not collide with another user's reset_token.
    while (attempts < maxAttempts) {
        token = crypto.randomBytes(32).toString('hex');
        hashed = crypto.createHash('sha256').update(token).digest('hex');

        const existing = await prisma.users.findFirst({ where: { reset_token: hashed } });
        if (existing && existing.id !== user.id) {
            attempts++;
            console.warn(`[users.service] duplicate reset token hash collision (attempt ${attempts}) for userId=${user.id}, collidesWith=${existing.id}`);
            continue; // retry
        }

        // no collision (or collision with same user) — use this token
        break;
    }

    if (attempts >= maxAttempts) {
        const err = new Error('Failed to generate unique reset token, try again');
        err.status = 500;
        console.error(`[users.service] failed to generate unique reset token for userId=${user.id} after ${maxAttempts} attempts`);
        throw err;
    }

    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);
    await prisma.users.update({ where: { id: user.id }, data: { reset_token: hashed, reset_expires_at: expiresAt } });

    console.info(`[users.service] generated reset token hash for userId=${user.id}, expiresAt=${expiresAt.toISOString()}`);
    return token;
};

// Verify reset token and set new password. Returns the updated user on success.
exports.resetPasswordByToken = async (token, newPassword) => {
    assert(typeof token === 'string' && token.length > 0, 'token required', 400);
    assert(typeof newPassword === 'string' && newPassword.length >= 6, 'password must be at least 6 characters', 400);

    const crypto = require('crypto');
    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    console.info(`[users.service] resetPasswordByToken attempt, tokenHashPrefix=${hashed.slice(0,8)}`);

    const user = await prisma.users.findFirst({ where: { reset_token: hashed, reset_expires_at: { gte: new Date() } } });
    if (!user) {
        console.warn(`[users.service] invalid or expired reset token used (hashPrefix=${hashed.slice(0,8)})`);
        const err = new Error('Invalid or expired token');
        err.status = 400;
        throw err;
    }

    const passwordHash = await require('bcrypt').hash(newPassword, 10);

    // update password, clear reset fields
    const updated = await prisma.users.update({ where: { id: user.id }, data: { password: passwordHash, reset_token: null, reset_expires_at: null } });

    // revoke any active sessions for this user
    try {
        // Revoke sessions in Redis (if available) and in DB for compatibility.
        try {
            const IORedis = require('ioredis');
        } catch (e) {}
        const redis = require('../db/redis');
        if (redis) {
            try {
                const setKey = `user_sessions:${user.id}`;
                const ids = await redis.smembers(setKey);
                for (const sid of ids) {
                    try {
                        const sraw = await redis.get(`session:${sid}`);
                        if (sraw) {
                            const s = JSON.parse(sraw);
                            s.revoked_at = new Date().toISOString();
                            await redis.set(`session:${sid}`, JSON.stringify(s));
                        }
                        await redis.srem(setKey, sid);
                    } catch (e) {
                        console.error('failed to revoke redis session', e);
                    }
                }
            } catch (e) {
                console.error('failed to list/revoke redis sessions for user', e);
            }
        }

        await prisma.sessions.updateMany({ where: { user_id: user.id, revoked_at: null }, data: { revoked_at: new Date() } });
    } catch (e) {
        console.error('failed to revoke sessions after password reset', e);
    }

    console.info(`[users.service] password reset completed for userId=${user.id}`);
    return updated;
};
