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
