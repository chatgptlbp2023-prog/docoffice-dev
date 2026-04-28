function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.is_superadmin !== true) {
    return res.status(403).json({
      ok: false,
      message: 'Ehhez a művelethez superadmin jogosultság kell.'
    });
  }

  return next();
}

module.exports = requireSuperadmin;
