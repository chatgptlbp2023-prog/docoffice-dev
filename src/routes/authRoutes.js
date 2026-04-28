const express = require('express');
const {
  register,
  login,
  googleAuth,
  getGoogleAuthConfig,
  getMe,
  updateMe
} = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');
const {
  loginRateLimiter,
  registerRateLimiter,
} = require('../middleware/rateLimit');
const {
  validateRegister,
  validateLogin,
  validateGoogleAuth,
  validateUpdateProfile,
} = require('../middleware/requestValidation');

const router = express.Router();

router.post('/auth/register', registerRateLimiter, validateRegister, register);
router.post('/auth/login', loginRateLimiter, validateLogin, login);
router.get('/auth/google/config', getGoogleAuthConfig);
router.post('/auth/google', validateGoogleAuth, googleAuth);
router.get('/auth/me', requireAuth, getMe);
router.patch('/auth/me', requireAuth, validateUpdateProfile, updateMe);

module.exports = router;
