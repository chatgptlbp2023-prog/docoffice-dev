function normalizeDrawStatus(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.trim().toLowerCase();
}

function computeEventReadiness({
  eventStatus,
  drawStatus,
  goingCount,
  minPlayers
}) {
  const normalizedEventStatus = String(eventStatus || '').trim().toLowerCase();
  const normalizedDrawStatus = normalizeDrawStatus(drawStatus);
  const normalizedGoingCount = Number(goingCount || 0);
  const normalizedMinPlayers = Number(minPlayers || 0);

  if (normalizedEventStatus === 'cancelled') {
    return 'cancelled';
  }

  if (normalizedEventStatus === 'finished') {
    return 'finished';
  }

  if (normalizedDrawStatus === 'published') {
    if (normalizedGoingCount < normalizedMinPlayers) {
      return 'below_minimum';
    }

    return 'draw_published';
  }

  if (normalizedDrawStatus === 'stale') {
    if (normalizedGoingCount < normalizedMinPlayers) {
      return 'below_minimum';
    }

    return 'draw_stale';
  }

  return 'open';
}

function buildEventReadinessSummary(input) {
  const eventReadiness = computeEventReadiness(input);
  const normalizedDrawStatus = normalizeDrawStatus(input.drawStatus);

  return {
    eventReadiness,
    drawStatus: normalizedDrawStatus,
    requiresRepublish: normalizedDrawStatus === 'stale'
  };
}

module.exports = {
  computeEventReadiness,
  buildEventReadinessSummary
};
