const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  notifyTeamOnCreate: true,
  notifyAllOnNewRegistration: false,
  notifyAllWhenTwoSpotsLeft: true,
  notifyAllWhenFull: true,
  notifyWaitlistPromotion: true,
  notifyTeamDrawPublished: true,
  enableAutoTeamDrawOneHourBefore: true,
  notifyParticipantsOnEventUpdate: true,
  notifyParticipantsOnEventCancel: true,
  notifyWeatherAlerts: false
});

const NOTIFICATION_PREFERENCE_KEYS = Object.freeze(
  Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)
);

function normalizeNotificationPreferences(input) {
  const normalized = {
    ...DEFAULT_NOTIFICATION_PREFERENCES
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return normalized;
  }

  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    if (typeof input[key] === 'boolean') {
      normalized[key] = input[key];
    }
  }

  return normalized;
}

module.exports = {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  normalizeNotificationPreferences
};
