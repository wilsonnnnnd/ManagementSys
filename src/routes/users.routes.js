const express = require("express");
const router = express.Router();


const UsersController = require("../controllers/users.controller");
const { requireRole, requireRoleOrOwner } = require("../middleware/authorize.middleware");
const { decodeIdParam } = require("../middleware/id.middleware");
const { body, param } = require("express-validator");
const { ROLES } = require("../types/user");
const handleValidation = require("../middleware/validation.middleware");

router.get("/", requireRole("admin"), UsersController.list);
router.get(
	"/:id",
	decodeIdParam,
	param("id").isInt().toInt(),
	handleValidation,
	requireRoleOrOwner("admin"),
	UsersController.getById
);
router.post(
	"/",
	requireRole("admin"),
	body("email").isEmail().withMessage("invalid email"),
	body("password").isLength({ min: 6 }).withMessage("password must be at least 6 characters"),
	body("role").optional().isIn([ROLES.admin, ROLES.user]).withMessage("invalid role"),
	handleValidation,
	UsersController.create
);

router.put(
	"/:id",
	decodeIdParam,
	param("id").isInt().toInt(),
	body("email").optional().isEmail().withMessage("invalid email"),
	body("role").optional().isIn([ROLES.admin, ROLES.user]).withMessage("invalid role"),
	handleValidation,
	requireRoleOrOwner("admin"),
	UsersController.update
);

router.delete("/:id", decodeIdParam, param("id").isInt().toInt(), handleValidation, requireRoleOrOwner("admin"), UsersController.delete);

module.exports = router;
