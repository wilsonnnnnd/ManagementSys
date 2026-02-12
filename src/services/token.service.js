const crypto = require("crypto");
const bcrypt = require("bcrypt");

const DEFAULT_SECRET_BYTES = 32;
const DEFAULT_BCRYPT_ROUNDS = 10;

function generateSecret(len = DEFAULT_SECRET_BYTES) {
    return crypto.randomBytes(len).toString("hex");
}

async function hashSecret(secret, rounds = DEFAULT_BCRYPT_ROUNDS) {
    return await bcrypt.hash(secret, rounds);
}

async function verifySecret(secret, hash) {
    return await bcrypt.compare(secret, hash);
}

function makeRefreshToken(sessionId, secret) {
    return `${sessionId}.${secret}`;
}

function parseRefreshToken(token) {
    if (typeof token !== "string") return null;
    const idx = token.indexOf(".");
    if (idx <= 0) return null;
    const sid = Number(token.slice(0, idx));
    if (!Number.isFinite(sid)) return null;
    const secret = token.slice(idx + 1);
    if (!secret) return null;
    return { sessionId: sid, secret };
}

module.exports = {
    generateSecret,
    hashSecret,
    verifySecret,
    makeRefreshToken,
    parseRefreshToken,
};
