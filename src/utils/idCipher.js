const crypto = require('crypto');

// Derive a 32-byte key from environment secret (fallback to JWT_SECRET)
const SECRET = process.env.ID_SECRET || process.env.JWT_SECRET || 'default_dev_secret_replace_me';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

function base64UrlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // pad
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64');
}

function encodeId(id) {
    const iv = crypto.randomBytes(12); // GCM recommended 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const plaintext = Buffer.from(String(id), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    // output: iv|tag|ciphertext
    const out = Buffer.concat([iv, tag, encrypted]);
    return base64UrlEncode(out);
}

function decodeId(token) {
    try {
        const data = base64UrlDecode(token);
        const iv = data.slice(0, 12);
        const tag = data.slice(12, 28);
        const ciphertext = data.slice(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return Number(decrypted.toString('utf8'));
    } catch (err) {
        return null;
    }
}

module.exports = { encodeId, decodeId };
