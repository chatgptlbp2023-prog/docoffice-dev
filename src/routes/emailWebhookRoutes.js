const express = require('express');
const emailProviderWebhookService = require('../services/emailProviderWebhookService');

const router = express.Router();

router.post('/webhooks/email/:provider', async (req, res) => {
  try {
    const result = await emailProviderWebhookService.processProviderEvent({
      provider: req.params.provider,
      payload: req.body,
      headers: req.headers
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Email provider webhook hiba:', error);
    }

    return res.status(statusCode).json({
      ok: false,
      error: error.message || 'Email provider webhook feldolgozasi hiba.'
    });
  }
});

module.exports = router;
