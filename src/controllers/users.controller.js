const UsersService = require("../services/users.service");
const { encodeId } = require("../utils/idCipher");

// 用 try/catch 把错误交给统一 error middleware
exports.list = async (req, res, next) => {
    try {
        const users = await UsersService.list();
        // strip password field from each user
        const safe = users.map((u) => {
            if (!u) return u;
            const { password, ...rest } = u;
            return { ...rest, id: encodeId(rest.id) };
        });
        res.json(safe);
    } catch (err) {
        next(err);
    }
};

exports.getById = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const user = await UsersService.getById(id);
        if (user && user.password) delete user.password;
        if (user && user.id) user.id = encodeId(user.id);
        res.json(user);
    } catch (err) {
        next(err);
    }
};

exports.create = async (req, res, next) => {
    try {
        const { first_name, last_name, email, password, role, status } =
            req.body;
        const created = await UsersService.create({
            first_name,
            last_name,
            email,
            password,
            role,
            status,
        });
        if (created && created.password) delete created.password;
        if (created && created.id) created.id = encodeId(created.id);
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
};

exports.update = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const updated = await UsersService.update(id, data);
        if (updated && updated.password) delete updated.password;
        if (updated && updated.id) updated.id = encodeId(updated.id);
        res.json(updated);
    } catch (err) {
        next(err);
    }
};

exports.delete = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        await UsersService.delete(id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
};
