const EMAIL_TEMPLATE_KEYS = Object.freeze({
  EVENT_CREATED: 'event_created',
  EVENT_CREATED_SCHEDULED: 'event_created_scheduled',
  NEW_MEMBER_EVENT_CATCHUP: 'new_member_event_catchup',
  TEAM_INVITE: 'team_invite',
  NEW_REGISTRATION: 'new_registration',
  CAPACITY_TWO_SPOTS_LEFT: 'capacity_two_spots_left',
  CAPACITY_FULL: 'capacity_full',
  WAITLIST_PROMOTION: 'waitlist_promotion',
  TEAM_DRAW_PUBLISHED: 'team_draw_published',
  EVENT_UPDATED: 'event_updated',
  EVENT_CANCELLED: 'event_cancelled',
  WEATHER_ALERT: 'weather_alert',
  TEAM_BREAK_REMINDER: 'team_break_reminder',
  REGISTRATION_SUMMARY: 'registration_summary'
});

const EMAIL_TEMPLATE_CATALOG = Object.freeze([
  {
    key: EMAIL_TEMPLATE_KEYS.EVENT_CREATED,
    label: 'Uj esemeny',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'Az esemeny kihirdetese ujraindithato a csapat aktiv, ertesitheto tagjainak.',
    recipientsDescription: 'Aktiv, ertesitheto csapattagok, szabin es passziv tagok nelkul.',
    triggerDescription: 'Published esemeny letrehozasakor vagy draftbol publikalaskor megy ki.',
    contentDescription: 'Esemenyadatok, Jelentkezem/Kihagyom gombok, belepes, esemeny megnyitasa es szabi gomb.',
    sendabilityRules: [
      'Az esemeny statusza published.',
      'A notifyTeamOnCreate kapcsolo aktiv.',
      'Van legalabb egy ertesitheto cimzett.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.EVENT_CREATED_SCHEDULED,
    label: 'Utemezett uj esemeny',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'Ismetlodo esemenysorozat kesobbi alkalmainak utemezett uj esemeny emailje.',
    recipientsDescription: 'Ugyanazok, mint az uj esemeny emailnel.',
    triggerDescription: 'Sorozatesemenyeknel utemezetten, heti sorozatnal kb. 163 oras eltolassal.',
    contentDescription: 'Az uj esemeny email tartalma, de nem azonnali, hanem utemezett kuldessel.',
    sendabilityRules: [
      'Kezileg most nem kuldheto kulon sablonkent.',
      'Kezi ujrakuldeshez az Uj esemeny sablon hasznalhato az adott alkalomra.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.NEW_MEMBER_EVENT_CATCHUP,
    label: 'Uj tag felzarkoztato',
    manualResendEnabled: true,
    requiresEvent: false,
    description: 'Az ujonnan csatlakozott tag ne maradjon le a mar letezo kozelgo esemenyekrol.',
    recipientsDescription: 'Egy konkret ujonnan csatlakozott tag.',
    triggerDescription: 'Meghivo elfogadasa vagy csatlakozas utan fut.',
    contentDescription: 'Uj esemeny email az uj tag szamara, a kozelgo published esemenyekrol.',
    sendabilityRules: [
      'Kezi kuldeshez konkret tagvalasztas szukseges.',
      'Ez a jelenlegi admin email feluleten meg nincs celzott tagvalasztashoz kotve.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.TEAM_INVITE,
    label: 'Csapatmeghivo',
    manualResendEnabled: false,
    requiresEvent: false,
    description: 'Csapatmeghivo email.',
    recipientsDescription: 'A meghivott email cim.',
    triggerDescription: 'Amikor a csapatkapitany meghivot kuld.',
    contentDescription: 'Csapatnev, szerep, szemelyes uzenet, meghivokod es link.',
    sendabilityRules: []
  },
  {
    key: EMAIL_TEMPLATE_KEYS.NEW_REGISTRATION,
    label: 'Uj jelentkezo',
    manualResendEnabled: false,
    requiresEvent: true,
    description: 'Ertesites uj jelentkezesrol.',
    recipientsDescription: 'Csapattagok, az eppen jelentkezo kivetelevel.',
    triggerDescription: 'Ha valaki jelentkezik, es a kapcsolo aktiv.',
    contentDescription: 'Ki jelentkezett, milyen statusszal, es kik vannak mar bent.',
    sendabilityRules: []
  },
  {
    key: EMAIL_TEMPLATE_KEYS.CAPACITY_TWO_SPOTS_LEFT,
    label: 'Mar csak 2 hely maradt',
    manualResendEnabled: false,
    requiresEvent: true,
    description: 'Keves hely maradt figyelmeztetes.',
    recipientsDescription: 'Nem reagalt, meg nem jelentkezett aktiv csapattagok.',
    triggerDescription: 'Amikor pontosan 2 szabad hely marad.',
    contentDescription: 'Osztonzo email a gyors jelentkezesre.',
    sendabilityRules: []
  },
  {
    key: EMAIL_TEMPLATE_KEYS.CAPACITY_FULL,
    label: 'Betelt az esemeny',
    manualResendEnabled: false,
    requiresEvent: true,
    description: 'Betelt esemeny email.',
    recipientsDescription: 'Csapattagok a vonatkozo szuresekkel.',
    triggerDescription: 'Amikor az esemeny betelik.',
    contentDescription: 'Varolista jelentkezesre osztonzo email.',
    sendabilityRules: []
  },
  {
    key: EMAIL_TEMPLATE_KEYS.WAITLIST_PROMOTION,
    label: 'Varolistarol bekerult',
    manualResendEnabled: false,
    requiresEvent: true,
    description: 'Varolistarol bekerulo jatekos ertesitese.',
    recipientsDescription: 'A konkret promotalt jatekos.',
    triggerDescription: 'Ha visszalepes utan valaki elorelep.',
    contentDescription: 'Jelzi, hogy a jatekos bekerult a jatekba.',
    sendabilityRules: []
  },
  {
    key: EMAIL_TEMPLATE_KEYS.TEAM_DRAW_PUBLISHED,
    label: 'Csapatleosztas kesz',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'A kihirdetett csapatleosztas ertesitese ujrakuldheto.',
    recipientsDescription: 'Aktiv jelentkezok: going, varolista es rangvarolista statuszuak.',
    triggerDescription: 'Amikor a csapatleosztast kezzel vagy automatikusan kihirdetik.',
    contentDescription: 'Jelzi, hogy elerheto a csapatleosztas.',
    sendabilityRules: [
      'Az esemenyhez van published csapatleosztas.',
      'A notifyTeamDrawPublished kapcsolo aktiv.',
      'Van legalabb egy ertesitheto cimzett.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.EVENT_UPDATED,
    label: 'Idopont/helyszin valtozas',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'Idopont vagy helyszin valtozasrol szolo email.',
    recipientsDescription: 'Aktiv jelentkezok.',
    triggerDescription: 'Ha az idopont vagy helyszin valtozik, es a kapcsolo aktiv.',
    contentDescription: 'Regi es uj idopont/helyszin osszehasonlitasa.',
    sendabilityRules: [
      'Kezi ujrakuldeshez ertelmes korabbi allapot szukseges.',
      'A jelenlegi felulet nem tarol eleg korabbi allapotot a pontos ujrakuldeshez.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.EVENT_CANCELLED,
    label: 'Esemeny torolve',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'Torolt vagy elmarado esemeny ertesitese.',
    recipientsDescription: 'Jelentkezok es erintettek: going, varolista, rangvarolista, cancelled statuszuak.',
    triggerDescription: 'Ha az esemenyt torlik vagy minimum letszamhiany miatt elmarad.',
    contentDescription: 'Eredeti idopont, helyszin es torles/elmaradas jelzese.',
    sendabilityRules: [
      'Az esemeny statusza cancelled.',
      'A notifyParticipantsOnEventCancel kapcsolo aktiv.',
      'Van legalabb egy ertesitheto cimzett.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.WEATHER_ALERT,
    label: 'Idojarasi figyelmeztetes',
    manualResendEnabled: true,
    requiresEvent: true,
    description: 'Aktualis idojarasi figyelmeztetes ujrakuldese.',
    recipientsDescription: 'Aktiv jelentkezok.',
    triggerDescription: 'Esemeny elott automatizmusban, ha az idojaras modul aktiv es van figyelmeztetes.',
    contentDescription: 'Csapadek, szel vagy eros idojarasi kockazat jelzese.',
    sendabilityRules: [
      'Az idojaras ertesites kapcsolo aktiv.',
      'Az esemenyhez van pontos cim.',
      'Az aktualis elorejelzesbol figyelmeztetes kovetkezik.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.TEAM_BREAK_REMINDER,
    label: 'Szabi emlekezteto',
    manualResendEnabled: true,
    requiresEvent: false,
    description: 'Szabin levo tagnak kuldott visszakerdezo email.',
    recipientsDescription: 'Egy szabin levo tag.',
    triggerDescription: 'Ha a szabi lejart vagy 24 oran belul lejar, es meg nem kapott emlekeztetot.',
    contentDescription: 'Maradok szabin meg 1 hetig / Visszaterek aktivnak gombok.',
    sendabilityRules: [
      'Kezi kuldeshez konkret szabin levo tagvalasztas szukseges.',
      'Ez a jelenlegi admin email feluleten meg nincs celzott tagvalasztashoz kotve.'
    ]
  },
  {
    key: EMAIL_TEMPLATE_KEYS.REGISTRATION_SUMMARY,
    label: 'Regisztracios osszesito',
    manualResendEnabled: false,
    requiresEvent: false,
    description: 'Belsos admin regisztracios osszesito.',
    recipientsDescription: 'Platform/admin cim.',
    triggerDescription: 'Uj user regisztracio utan.',
    contentDescription: 'Regisztracios utvonalankenti napi es osszes darabszam.',
    sendabilityRules: []
  }
]);

function normalizeTemplateKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getEmailTemplateCatalog() {
  return EMAIL_TEMPLATE_CATALOG.map(item => ({ ...item }));
}

function getEmailTemplateDefinition(templateKey) {
  const normalized = normalizeTemplateKey(templateKey);
  return EMAIL_TEMPLATE_CATALOG.find(item => item.key === normalized) || null;
}

function getManualResendEmailTemplates() {
  return EMAIL_TEMPLATE_CATALOG
    .filter(item => item.manualResendEnabled === true)
    .map(item => ({ ...item }));
}

module.exports = {
  EMAIL_TEMPLATE_KEYS,
  getEmailTemplateCatalog,
  getEmailTemplateDefinition,
  getManualResendEmailTemplates,
  normalizeTemplateKey
};
