const { normalizeRankStatus, normalizeRankValue } = require('./rankModel');

const RANK_REVIEW_EVENT_COUNT = 10;
const REGISTRATION_WAVES = Object.freeze({
  TOP: 0,
  MID: 72,
  LOW: 144
});

function clampRank(value) {
  if (value < 1) return 1;
  if (value > 10) return 10;
  return value;
}

function computeParticipationRatio({ attendedEvents = 0, evaluatedEvents = 0 }) {
  if (!evaluatedEvents) return null;
  return Number((attendedEvents / evaluatedEvents).toFixed(4));
}

function computeEffectiveRankValue({ rankStatus, baseRankValue, attendedEvents, evaluatedEvents }) {
  const normalizedStatus = normalizeRankStatus(rankStatus, 'guest');
  if (normalizedStatus !== 'ranked') {
    return null;
  }

  const baseValue = normalizeRankValue(baseRankValue, 10);
  if (evaluatedEvents < RANK_REVIEW_EVENT_COUNT) {
    return baseValue;
  }

  const ratio = computeParticipationRatio({ attendedEvents, evaluatedEvents });
  if (ratio == null) {
    return baseValue;
  }

  const delta = ratio >= 0.6 ? 1 : -1;
  return clampRank(baseValue + delta);
}

function getRegistrationWaveOffsetHours({ rankModuleEnabled, rankStatus, effectiveRankValue }) {
  if (!rankModuleEnabled) return REGISTRATION_WAVES.TOP;

  const normalizedStatus = normalizeRankStatus(rankStatus, 'guest');
  if (normalizedStatus !== 'ranked') {
    return REGISTRATION_WAVES.TOP;
  }

  const rankValue = normalizeRankValue(effectiveRankValue, 10);
  if (rankValue >= 7) return REGISTRATION_WAVES.TOP;
  if (rankValue >= 4) return REGISTRATION_WAVES.MID;
  return REGISTRATION_WAVES.LOW;
}

function computeRegistrationWindow({
  rankModuleEnabled,
  rankStatus,
  effectiveRankValue,
  publishedAt,
  eventStartAt,
  now = new Date()
}) {
  const baseOffsetHours = getRegistrationWaveOffsetHours({
    rankModuleEnabled,
    rankStatus,
    effectiveRankValue
  });

  const publishedDate = publishedAt ? new Date(publishedAt) : null;
  const baseDate = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate : new Date(now);
  const eventStartDate = eventStartAt ? new Date(eventStartAt) : null;
  const hasFastStartException = Boolean(
    eventStartDate &&
    !Number.isNaN(eventStartDate.getTime()) &&
    eventStartDate.getTime() - baseDate.getTime() <= 3 * 60 * 60 * 1000
  );
  const offsetHours = hasFastStartException ? 0 : baseOffsetHours;
  const opensAt = new Date(baseDate.getTime() + (offsetHours * 60 * 60 * 1000));
  const isOpen = opensAt.getTime() <= now.getTime();

  let waveLabel = 'azonnali';
  if (offsetHours === REGISTRATION_WAVES.MID) waveLabel = '72 órás';
  if (offsetHours === REGISTRATION_WAVES.LOW) waveLabel = '144 órás';

  return {
    offsetHours,
    opensAt: opensAt.toISOString(),
    isOpen,
    waveLabel,
    fastStartException: hasFastStartException
  };
}

function buildMemberRankSnapshot({
  rankModuleEnabled,
  rankStatus,
  rankValue,
  evaluatedEvents = 0,
  attendedEvents = 0,
  missedEvents = 0,
  neutralEvents = 0
}) {
  const normalizedStatus = normalizeRankStatus(rankStatus, 'guest');
  const normalizedValue = normalizeRankValue(rankValue, 10);
  const participationRatio = computeParticipationRatio({ attendedEvents, evaluatedEvents });
  const effectiveRankValue = computeEffectiveRankValue({
    rankStatus: normalizedStatus,
    baseRankValue: normalizedValue,
    attendedEvents,
    evaluatedEvents
  });

  return {
    rankModuleEnabled: Boolean(rankModuleEnabled),
    rankStatus: normalizedStatus,
    baseRankValue: normalizedStatus === 'ranked' ? normalizedValue : null,
    effectiveRankValue,
    stats: {
      evaluatedEvents,
      attendedEvents,
      missedEvents,
      neutralEvents,
      participationRatio,
      reviewWindowSize: RANK_REVIEW_EVENT_COUNT
    }
  };
}

module.exports = {
  RANK_REVIEW_EVENT_COUNT,
  REGISTRATION_WAVES,
  computeParticipationRatio,
  computeEffectiveRankValue,
  getRegistrationWaveOffsetHours,
  computeRegistrationWindow,
  buildMemberRankSnapshot
};
