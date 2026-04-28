const RANK_DEFINITIONS = Object.freeze({
  10: {
    value: 10,
    label: 'Old Boys',
    emoji: '👑',
    description: 'A legmagasabb prioritású, meghatározó kerettag.'
  },
  9: {
    value: 9,
    label: 'Öltözőkulcsos',
    emoji: '🔑',
    description: 'Megbízható, visszatérő játékos, aki szinte mindig ott van.'
  },
  8: {
    value: 8,
    label: 'Hazai pályás',
    emoji: '🏟️',
    description: 'Erős jelenlétű tag, rendszeresen számol vele a csapat.'
  },
  7: {
    value: 7,
    label: 'Stabil kerettag',
    emoji: '📋',
    description: 'Kiszámítható, jól terhelhető tag a heti szervezésben.'
  },
  6: {
    value: 6,
    label: 'Rotációs játékos',
    emoji: '🔄',
    description: 'Jó eséllyel jön, de nem minden héten állandó.'
  },
  5: {
    value: 5,
    label: 'Félidős klasszis',
    emoji: '⏱️',
    description: 'Hullámzó jelenlétű játékos, de még stabilan körforgásban van.'
  },
  4: {
    value: 4,
    label: 'Cserepadról érkező',
    emoji: '🪑',
    description: 'Alacsonyabb prioritású, jellemzően később nyíló jelentkezéssel.'
  },
  3: {
    value: 3,
    label: 'Bemelegítő szélső',
    emoji: '🏃',
    description: 'Ritkábban aktív, ezért későbbi jelentkezési hullámba kerülhet.'
  },
  2: {
    value: 2,
    label: 'Pályaszéli megfigyelő',
    emoji: '👀',
    description: 'Kevésbé aktív tag, inkább a végső nyitási hullámban számolunk vele.'
  },
  1: {
    value: 1,
    label: 'Eseti beugró',
    emoji: '🎟️',
    description: 'Legkésőbb nyíló jelentkezési sávban kap helyet.'
  }
});

const GUEST_RANK = Object.freeze({
  label: 'Vendég',
  emoji: '🤝',
  description: 'Újonnan érkező vagy próbaidős tag, aki még vendég státuszban van.'
});

function normalizeRankValue(value, fallback = 10) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 10) {
    return fallback;
  }
  return num;
}

function normalizeRankStatus(value, fallback = 'guest') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized === 'ranked' ? 'ranked' : 'guest';
}

function getRankDefinition(rankValue) {
  return RANK_DEFINITIONS[normalizeRankValue(rankValue)] || RANK_DEFINITIONS[10];
}

module.exports = {
  RANK_DEFINITIONS,
  GUEST_RANK,
  normalizeRankValue,
  normalizeRankStatus,
  getRankDefinition
};
