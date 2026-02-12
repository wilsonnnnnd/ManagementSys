/**
 * User role type and helpers
 * @module types/user
 */

/**
 * @typedef {'admin'|'user'} UserRole
 */

/** Role constants */
const ROLES = Object.freeze({
  admin: 'admin',
  user: 'user',
});

/**
 * Check whether a value is a valid UserRole
 * @param {any} v
 * @returns {v is UserRole}
 */
function isValidRole(v) {
  return v === ROLES.admin || v === ROLES.user;
}

module.exports = { ROLES, isValidRole };
