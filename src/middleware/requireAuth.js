const jwt = require('jsonwebtoken');
const { getUserByIdWithStats } = require('../services/userProfileService');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        message: 'Hiányzó vagy hibás Authorization fejléc.'
      });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await getUserByIdWithStats(payload.userId);

    if (!user) {
      return res.status(401).json({
        ok: false,
        message: 'A tokenhez tartozó user nem található.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        ok: false,
        message: 'A user nem aktív.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Érvénytelen vagy lejárt token.'
    });
  }
}

module.exports = requireAuth;
