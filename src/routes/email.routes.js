const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');
const { requireRole } = require('../middleware/authorize.middleware');
const EmailController = require('../controllers/email.controller');

router.post(
    '/',
    requireRole('admin'),
    body('to').isEmail().withMessage('invalid to email'),
    body('subject').isString().notEmpty().withMessage('subject required'),
    body('html').isString().notEmpty().withMessage('html required'),
    handleValidation,
    EmailController.sendCustomEmail,
);

module.exports = router;
