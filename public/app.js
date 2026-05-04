const state = {
  apiBase: localStorage.getItem('foci_api_base') || `${window.location.origin}/api`,
  token: localStorage.getItem('foci_token') || '',
  user: JSON.parse(localStorage.getItem('foci_user') || 'null'),
  currentTeamId: '',
  selectedAdminEvent: null,
  selectedAdminEventDetail: null,
  selectedUserEvent: null,
  selectedUserEventDetail: null,
  teamRole: null,
  myTeams: [],
  myInvites: [],
  myEvents: [],
  userEventDetailsById: {},
  adminEventDetailsById: {},
  userTeamEvents: [],
  teamMembers: [],
  currentTeamFinance: null,
  teamFinanceEntries: [],
  teamInvites: [],
  adminEvents: [],
  teamSkillSettings: null,
  rankSettingsSaving: false,
  teamDrawPreview: null,
  savedEventDraw: null,
  savedEventDrawEventId: null,
  adminSavedEventDraw: null,
  adminSavedEventDrawEventId: null,
  currentTeam: null,
  messageTimer: null,
  skillSettingsSaving: false,
  countdownTimer: null,
  googleAuthConfig: null,
  versionInfo: null,
  pendingInviteToken: new URLSearchParams(window.location.search).get('invite') || '',
  pendingInvitePreview: null,
  platformSummary: null,
  adminEventFormMode: 'create',
  adminEditingEventId: null,
  adminHideHiddenEvents: localStorage.getItem('foci_admin_hide_hidden_events') !== 'false',
  adminFinanceFilters: {
    status: 'all',
    search: ''
  },
  paymentQrPreview: null,
  adminWorkspace: 'home',
  tournamentWorkspace: 'home',
  adminTeamSection: 'invites',
  adminEventsSection: 'upcoming',
  adminFinanceSection: 'settlement',
  adminEventFormSection: 'basics',
  authMode: 'login',
  selectedRegistrationPath: '',
  sidebarCollapsed: localStorage.getItem('foci_sidebar_collapsed') === 'true',
  userInvitePulseUntil: 0,
  userInvitePulseTimer: null,
  userInviteJumpHighlightTimer: null,
  userNewEventsPulseUntil: 0,
  userNewEventsPulseTimer: null,
  layoutEditor: {
    isEditing: false,
    viewId: null,
    draftLayouts: {},
    dragging: null,
    resizing: null
  }
};

const REGISTRATION_PATH_OPTIONS = Object.freeze([
  {
    value: 'tournament_organizer',
    title: 'Tornát szervezek',
    description: 'Foci, kosár, röplabda vagy bármilyen sport. Akár 32 csapatos torna is mehet, a szervezéstől a lebonyolításon át az elszámolásig minden egy helyen.'
  },
  {
    value: 'team_sport_organizer',
    title: 'Csapatsportot szervezek',
    description: 'Foci, kosár, haverok, buli, Fanta. Add meg a helyszínt és az időpontot, építsd a csapatod, a sorsolástól a Revolut- és Wise-kezelésig minden egy helyen.'
  },
  {
    value: 'activity_organizer',
    title: 'Csoportos órákat szervezek',
    description: 'Jóga, pilátesz, TRX vagy kismamatorna, teljesen mindegy. A helyszín, a jelentkezések, a jelenlét és az elszámolás is mindig előtted marad.'
  },
  {
    value: 'invited_participant',
    title: 'Meghívóval érkeztem',
    description: 'Máris nyertél. A csapatkapitány már beszervezett, neked csak be kell lépned, és pár kattintás után látod, mikor, hol és kivel leszel egy csapatban.'
  }
]);

function getTeamStorageKeyForUser(userId) {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `foci_team_id_${normalizedUserId}` : null;
}

function getStoredTeamIdForUser(userId) {
  const key = getTeamStorageKeyForUser(userId);
  return key ? (localStorage.getItem(key) || '') : '';
}

function clearStoredTeamIdForUser(userId) {
  const key = getTeamStorageKeyForUser(userId);
  if (key) {
    localStorage.removeItem(key);
  }
}

function getSeenUserEventsStorageKey(userId) {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `foci_seen_user_events_${normalizedUserId}` : '';
}

function getSeenUserEventIds(userId) {
  const key = getSeenUserEventsStorageKey(userId);
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
}

function saveSeenUserEventIds(userId, eventIds) {
  const key = getSeenUserEventsStorageKey(userId);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify((eventIds || []).map(item => String(item))));
}

function getTournamentSetupStorageKey(userId) {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `foci_tournament_setup_${normalizedUserId}` : '';
}

function getDefaultTournamentSetupDraft() {
  return {
    title: '',
    teamCount: 16,
    fieldCount: 2,
    locationName: '',
    matchDurationMinutes: 20,
    startDate: '',
    formatHint: 'group_knockout',
    notes: '',
    savedAt: ''
  };
}

function loadTournamentSetupDraft(userId = state.user?.id) {
  const key = getTournamentSetupStorageKey(userId);
  if (!key) return getDefaultTournamentSetupDraft();

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return {
      ...getDefaultTournamentSetupDraft(),
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    };
  } catch {
    return getDefaultTournamentSetupDraft();
  }
}

function saveTournamentSetupDraft(draft, userId = state.user?.id) {
  const key = getTournamentSetupStorageKey(userId);
  if (!key) return getDefaultTournamentSetupDraft();
  const normalized = {
    ...getDefaultTournamentSetupDraft(),
    ...(draft || {}),
    teamCount: clamp(Number(draft?.teamCount) || 0, 2, 128),
    fieldCount: clamp(Number(draft?.fieldCount) || 0, 1, 24),
    matchDurationMinutes: clamp(Number(draft?.matchDurationMinutes) || 0, 5, 180),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(key, JSON.stringify(normalized));
  return normalized;
}

const els = {
  appShell: document.querySelector('.app-shell'),
  sidebar: document.querySelector('.sidebar'),
  profileDrawer: document.getElementById('profileDrawer'),
  sidebarVersionInfo: document.getElementById('sidebarVersionInfo'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  mainMessage: document.getElementById('globalMessage'),
  apiBase: document.getElementById('apiBase'),
  saveApiBaseBtn: document.getElementById('saveApiBaseBtn'),
  globalMessage: document.getElementById('sidebarMessage') || document.getElementById('globalMessage'),
  navButtons: [...document.querySelectorAll('.nav-btn')],
  views: [...document.querySelectorAll('.view')],
  sessionBadge: document.getElementById('sessionBadge'),
  sessionInfo: document.getElementById('sessionInfo'),
  logoutBtn: document.getElementById('logoutBtn'),
  profilePanel: document.getElementById('profilePanel'),
  adminOverviewCards: document.getElementById('adminOverviewCards'),
  adminHomeContent: document.getElementById('adminHomeContent'),
  adminHomeSummary: document.getElementById('adminHomeSummary'),
  tournamentOverviewCards: document.getElementById('tournamentOverviewCards'),
  tournamentHomeContent: document.getElementById('tournamentHomeContent'),
  tournamentWorkspaceSummary: document.getElementById('tournamentWorkspaceSummary'),
  adminFinanceContent: document.getElementById('adminFinanceContent'),
  adminAttendanceContent: document.getElementById('adminAttendanceContent'),
  adminFinanceBalancesCard: document.getElementById('adminFinanceBalancesCard'),
  adminFinanceSettlementCard: document.getElementById('adminFinanceSettlementCard'),
  adminEventEditorCard: document.getElementById('adminEventEditorCard'),
  adminStatisticsContent: document.getElementById('adminStatisticsContent'),
  userOverviewCards: document.getElementById('userOverviewCards'),
  nextEventHero: document.getElementById('nextEventHero'),
  userTeamDrawPreview: document.getElementById('userTeamDrawPreview'),
  userFinanceModule: document.getElementById('userFinanceModule'),
  userRankModule: document.getElementById('userRankModule'),
  userWeatherModule: document.getElementById('userWeatherModule'),

  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  authVersionInfo: document.getElementById('authVersionInfo'),
  authCardTitle: document.getElementById('authCardTitle'),
  authCardSubtitle: document.getElementById('authCardSubtitle'),
  authModeLoginBtn: document.getElementById('authModeLoginBtn'),
  authModeRegisterBtn: document.getElementById('authModeRegisterBtn'),
  loginPanel: document.getElementById('loginPanel'),
  registerPanel: document.getElementById('registerPanel'),

  myTeamsList: document.getElementById('myTeamsList'),
  myEventsList: document.getElementById('myEventsList'),
  myInvitesList: document.getElementById('myInvitesList'),
  refreshMyInvitesBtn: document.getElementById('refreshMyInvitesBtn'),

  createTeamForm: document.getElementById('createTeamForm'),
  teamLoadForm: document.getElementById('teamLoadForm'),
  teamSummary: document.getElementById('teamSummary'),
  teamDrawContent: document.getElementById('teamDrawContent'),
  teamAdvancedContent: document.getElementById('teamAdvancedContent'),
  teamIdInput: document.getElementById('teamIdInput'),
  useSavedTeamBtn: document.getElementById('useSavedTeamBtn'),

  createInviteForm: document.getElementById('createInviteForm'),
  inviteEmail: document.getElementById('inviteEmail'),
  inviteRole: document.getElementById('inviteRole'),
  inviteMessage: document.getElementById('inviteMessage'),
  createJoinLinkForm: document.getElementById('createJoinLinkForm'),
  joinLinkRole: document.getElementById('joinLinkRole'),
  joinLinkMessage: document.getElementById('joinLinkMessage'),
  teamInvitesAdminList: document.getElementById('teamInvitesAdminList'),

  addMemberForm: document.getElementById('addMemberForm'),
  memberEmail: document.getElementById('memberEmail'),
  memberRole: document.getElementById('memberRole'),
  teamMembersAdminList: document.getElementById('teamMembersAdminList'),

  createEventForm: document.getElementById('createEventForm'),
  recurringToggle: document.getElementById('isRecurringToggle'),
  recurringOptions: document.getElementById('recurringOptions'),
  recurrenceType: document.getElementById('recurrenceType'),
  seriesEndType: document.getElementById('seriesEndType'),
  occurrenceCountWrapper: document.getElementById('occurrenceCountWrapper'),
  untilDateWrapper: document.getElementById('untilDateWrapper'),
  seriesOccurrenceCount: document.getElementById('seriesOccurrenceCount'),
  seriesUntilDate: document.getElementById('seriesUntilDate'),
  adminEventsList: document.getElementById('adminEventsList'),
  adminClosedEventsList: document.getElementById('adminClosedEventsList'),
  refreshAdminEventsBtn: document.getElementById('refreshAdminEventsBtn'),
  selectedEventMeta: document.getElementById('selectedEventMeta'),
  editEventForm: document.getElementById('editEventForm'),
  editTitle: document.getElementById('editTitle'),
  editDescription: document.getElementById('editDescription'),
  editStartAt: document.getElementById('editStartAt'),
  editLocationName: document.getElementById('editLocationName'),
  editMinPlayers: document.getElementById('editMinPlayers'),
  editPlayersOnField: document.getElementById('editPlayersOnField'),
  editSubstitutesEnabled: document.getElementById('editSubstitutesEnabled'),
  editSubstitutesCount: document.getElementById('editSubstitutesCount'),
  editRulesText: document.getElementById('editRulesText'),
  statusButtons: [...document.querySelectorAll('[data-status-btn]')],

  userTeamForm: document.getElementById('userTeamForm'),
  userTeamIdInput: document.getElementById('userTeamIdInput'),
  useSavedUserTeamBtn: document.getElementById('useSavedUserTeamBtn'),
  refreshUserEventsBtn: document.getElementById('refreshUserEventsBtn'),
  userEventsList: document.getElementById('userEventsList'),
  userEventDetail: document.getElementById('userEventDetail')
};

function getDefaultRegistrationPath() {
  return state.pendingInviteToken ? 'invited_participant' : '';
}

function getSelectedRegistrationPath() {
  return state.selectedRegistrationPath || getDefaultRegistrationPath() || '';
}

function shouldHighlightInviteRegistrationPath() {
  return Boolean(state.pendingInviteToken) && !state.token;
}

function setSelectedRegistrationPath(path) {
  const nextPath = path || getDefaultRegistrationPath() || '';
  state.selectedRegistrationPath = nextPath;
  document.querySelectorAll('.auth-path-panel').forEach(option => {
    option.dataset.selected = option.dataset.registrationPath === nextPath ? 'true' : 'false';
  });
}

function syncRegistrationPathUi() {
  const selectedPath = getSelectedRegistrationPath();
  state.selectedRegistrationPath = selectedPath;

  document.querySelectorAll('.auth-path-panel').forEach(option => {
    option.classList.toggle('is-active', option.dataset.registrationPath === selectedPath);
    option.classList.toggle(
      'is-invite-landing-highlight',
      shouldHighlightInviteRegistrationPath() && option.dataset.registrationPath === 'invited_participant'
    );
  });

  const details = document.getElementById('registerFormDetails');
  const detailsMount = document.getElementById('registerDetailsMount');
  const activeSlot = selectedPath
    ? document.querySelector(`.auth-path-panel[data-registration-path="${selectedPath}"] .auth-path-form-slot`)
    : null;
  if (details) {
    if (activeSlot && details.parentElement !== activeSlot) {
      activeSlot.appendChild(details);
    } else if (!activeSlot && detailsMount && details.parentElement !== detailsMount) {
      detailsMount.appendChild(details);
    }

    details.hidden = !selectedPath;
    details.classList.toggle('hidden', !selectedPath);
  }

  const inviteInput = document.getElementById('registerInviteToken');
  if (inviteInput) {
    const needsInvite = selectedPath === 'invited_participant';
    inviteInput.required = needsInvite;
    inviteInput.closest('.auth-field-block')?.classList.toggle('is-required', needsInvite);
  }

  if (els.authCardSubtitle) {
    if (selectedPath === 'tournament_organizer') {
      els.authCardSubtitle.textContent = 'Versenynaptár, pályabeosztás, lebonyolítás és pénzügy egy látványos, gyors rendszerben.';
    } else if (selectedPath === 'activity_organizer') {
      els.authCardSubtitle.textContent = 'Tartsd kézben az órákat, a jelentkezőket, a jelenlétet és az elszámolást ugyanabban a felületben.';
    } else if (selectedPath === 'invited_participant') {
      els.authCardSubtitle.textContent = 'Belépés után rögtön látod, mikor, hol és kikkel játszol vagy edzel, a szervezést pedig intézi helyetted a rendszer.';
    } else {
      els.authCardSubtitle.textContent = 'Építs csapatot, hirdess eseményeket, sorsolj automatikusan, és intézd a pénzügyeket ugyanott.';
    }
  }

  syncAuthPoster();
}

function getRegistrationPathPresentation(path) {
  switch (path) {
    case 'tournament_organizer':
      return {
        tone: 'tournament',
        kicker: 'Főmodul',
        eyebrow: 'Tornaszervezés',
        title: 'A tornaszervezés végre nem Excelből, Messengerből és idegeskedésből áll.',
        lead: 'Hozz létre 8, 16 vagy akár 32 csapatos tornát, oszd be a pályákat, vezesd az eredményeket és zárd le a pénzügyeket egyetlen erős munkatérből.',
        bullets: ['Csapatmeghívás és nevezés', 'Pálya- és időbeosztás', 'Eredmények, gólok, statok', 'Elszámolás egy helyen'],
        footer: 'Komoly szervezőknek, komoly eseményekhez.'
      };
    case 'activity_organizer':
      return {
        tone: 'activity',
        kicker: 'Almodul',
        eyebrow: 'Csoportos órák és közösségi alkalmak',
        title: 'Ha órát tartasz, ne találgasd, hányan jönnek ma este.',
        lead: 'Jóga, pilátesz, TRX, futás vagy túra: hívd meg az embereket, lásd a jelentkezéseket azonnal, vezesd a jelenlétet, és maradj képben a bevételekkel is.',
        bullets: ['Korlátlan számú alkalom', 'Helyszín és létszám kezelés', 'Jelenlét egy mozdulattal', 'Pénzügyi rálátás'],
        footer: 'Egyszerűbb szervezés, kevesebb utánajárás, nyugodtabb napok.'
      };
    case 'invited_participant':
      return {
        tone: 'invite',
        kicker: 'Gyors belépés',
        eyebrow: 'Meghívóval érkeztem',
        title: 'Négy kattintás, és már bent is vagy a csapat ritmusában.',
        lead: 'A csapatkapitány már megtette a nehezét. Neked most csak be kell lépned, és rögtön látod, mikor, hol és kikkel leszel egy oldalon.',
        bullets: ['Azonnali csatlakozás', 'Következő események egy helyen', 'Csapattársak és státuszok', 'Fizetési infók kézközelben'],
        footer: 'Gyorsabb belépés, kevesebb kérdés, több játék.'
      };
    case 'team_sport_organizer':
    default:
      return {
        tone: 'team',
        kicker: 'Almodul',
        eyebrow: 'Csapatsport-szervezés',
        title: 'A haveri csapat szervezése is nézhet ki úgy, mintha 2026 lenne.',
        lead: 'Add meg a helyszínt és az időpontot, építsd a csapatod, használd az automata csapatgenerátort, és intézd a Revolut- vagy Wise-elszámolást ugyanabban a flow-ban.',
        bullets: ['Jelentkezés és várólista', 'Automatikus csapatgenerátor', 'Kik jönnek, ki hol játszik', 'Revolut és Wise támogatás'],
        footer: 'Foci, kosár vagy bármi, ahol számít, ki jön el végül.'
      };
  }
}

function syncAuthPoster() {
  const poster = document.getElementById('authPoster');
  if (!poster) return;

  const isRegister = state.authMode === 'register';
  const presentation = isRegister
    ? getRegistrationPathPresentation(getSelectedRegistrationPath())
    : {
        tone: 'login',
        kicker: 'Sportplatform',
        eyebrow: 'Belépés',
        title: 'Lépj vissza oda, ahol a csapat, a torna és a következő esemény már vár.',
        lead: 'A szervezés, a csapattársak, a státuszok és a pénzügyek ugyanabban a felületben állnak össze. Belépés után rögtön ott folytatod, ahol abbahagytad.',
        bullets: ['Csapatok és események', 'Jelentkezések és státuszok', 'Leosztás és jelenlét', 'Átlátható pénzügyek'],
        footer: 'Nem csak adminfelület. Ez a meccs előszobája.'
      };

  poster.className = `auth-poster auth-poster-${presentation.tone}`;
  poster.innerHTML = `
    <div class="auth-poster-topline">
      <span class="auth-poster-kicker">${escapeHtml(presentation.kicker)}</span>
      <span class="auth-poster-eyebrow">${escapeHtml(presentation.eyebrow)}</span>
    </div>
    <h2 class="auth-poster-title">${escapeHtml(presentation.title)}</h2>
    <p class="auth-poster-lead">${escapeHtml(presentation.lead)}</p>
    <div class="auth-poster-bullets">
      ${presentation.bullets.map(item => `<span class="auth-poster-chip">${escapeHtml(item)}</span>`).join('')}
    </div>
    <div class="auth-poster-footer">${escapeHtml(presentation.footer)}</div>
  `;
}

function ensureAuthOnboardingUi() {
  const authView = document.getElementById('authView');
  if (authView && !document.getElementById('inviteLandingCard')) {
    const inviteCard = document.createElement('div');
    inviteCard.id = 'inviteLandingCard';
    inviteCard.className = 'card top-space hidden';
    inviteCard.innerHTML = '<div class="small muted">Meghívó adatainak betöltése…</div>';
    authView.insertBefore(inviteCard, authView.firstChild);
  }

  const main = document.querySelector('.main');
  if (main && !document.getElementById('tournamentView')) {
    const section = document.createElement('section');
    section.id = 'tournamentView';
    section.className = 'view';
    section.dataset.surfaceLayout = 'true';
    section.innerHTML = `
      <div class="view-header card compact" data-layout-item data-layout-key="tournament-overview" data-default-col-span="12" data-default-row-span="1" data-min-col-span="12" data-max-col-span="12">
        <div>
          <h2>Tornaszervező</h2>
          <p class="muted small">Itt épül majd a teljes tornaszervezői munkatér: nevezések, lebonyolítás, mérkőzések, pénzügy és kommunikáció egy saját világban.</p>
        </div>
        <div id="tournamentOverviewCards" class="overview-grid compact-overview"></div>
      </div>

      <div class="card compact admin-subnav-card top-space" data-layout-item data-layout-key="tournament-nav" data-default-col-span="12" data-default-row-span="1" data-min-col-span="12" data-max-col-span="12">
        <div class="admin-subnav">
          <button class="subnav-btn active" type="button" data-tournament-workspace="home">Kezdőpult</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="tournaments">Tornák</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="registrations">Csapatok és nevezések</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="format">Lebonyolítás</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="matches">Mérkőzések</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="finance">Pénzügy</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="comms">Kommunikáció</button>
          <button class="subnav-btn" type="button" data-tournament-workspace="stats">Statisztika</button>
        </div>
      </div>

      <section class="top-space" data-tournament-workspace-panel="home" data-layout-item data-layout-key="tournament-home" data-default-col-span="12" data-default-row-span="3" data-min-col-span="12" data-max-col-span="12">
        <div class="grid two-col">
          <div class="card">
            <h2>Kezdőpult</h2>
            <div class="small muted section-note">Ez a tornaszervezői főmunkatér. Innen indítod a tornát, hívod meg a csapatkapitányokat, rakod össze a lebonyolítást és zárod le az elszámolást.</div>
            <div id="tournamentHomeContent" class="stack top-space"></div>
          </div>
          <div class="card">
            <h2>Itt tart most a munkatér</h2>
            <div class="small muted section-note">A fő irány maradjon egyszerű: előbb torna, aztán nevezések, utána lebonyolítás és mérkőzések.</div>
            <div id="tournamentWorkspaceSummary" class="stack top-space"></div>
          </div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="tournaments" data-layout-item data-layout-key="tournament-tournaments" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Tornák</h2>
          <div class="small muted section-note">Itt jön majd a torna létrehozása: hány csapat, hány pálya, milyen helyszín, mennyi egy meccs és milyen napokra esik a teljes esemény.</div>
          <div class="stack top-space" id="tournamentTournamentsPanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="registrations" data-layout-item data-layout-key="tournament-registrations" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Csapatok és nevezések</h2>
          <div class="small muted section-note">Ez lesz a meghívott csapatkapitányok, nevezések, hiányzó keretek és visszaigazolások otthona.</div>
          <div class="stack top-space" id="tournamentRegistrationsPanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="format" data-layout-item data-layout-key="tournament-format" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Lebonyolítás</h2>
          <div class="small muted section-note">Itt fog összeállni a csoportkör, a kieséses ág, a pálya- és idősávkiosztás, valamint az egész torna ritmusa.</div>
          <div class="stack top-space" id="tournamentFormatPanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="matches" data-layout-item data-layout-key="tournament-matches" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Mérkőzések</h2>
          <div class="small muted section-note">Itt kapnak helyet a meccslisták, eredmények, gólok, asszisztok és a mérkőzések élő állapotai.</div>
          <div class="stack top-space" id="tournamentMatchesPanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="finance" data-layout-item data-layout-key="tournament-finance" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Pénzügy</h2>
          <div class="small muted section-note">Ide kerül majd a nevezési díj, csapatonkénti befizetés, tornaelszámolás és a szervezői pénzügyi összkép.</div>
          <div class="stack top-space" id="tournamentFinancePanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="comms" data-layout-item data-layout-key="tournament-comms" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Kommunikáció</h2>
          <div class="small muted section-note">A csapatkapitányok, értesítések, tornafrissítések és központi üzenetek külön szervezői felületet kapnak.</div>
          <div class="stack top-space" id="tournamentCommsPanel"></div>
        </div>
      </section>

      <section class="top-space hidden" hidden data-tournament-workspace-panel="stats" data-layout-item data-layout-key="tournament-stats" data-default-col-span="12" data-default-row-span="2" data-min-col-span="12" data-max-col-span="12">
        <div class="card">
          <h2>Statisztika</h2>
          <div class="small muted section-note">Itt jelennek majd meg a torna tabellái, játékos- és csapatszintű mutatók, valamint az egész esemény záró számai.</div>
          <div class="stack top-space" id="tournamentStatsPanel"></div>
        </div>
      </section>
    `;
    main.appendChild(section);
    els.views = [...document.querySelectorAll('.view')];
  }

  if (main && !document.getElementById('platformView')) {
    const section = document.createElement('section');
    section.id = 'platformView';
    section.className = 'view';
    section.innerHTML = `
      <div class="view-header card compact">
        <div>
          <h2>Platform gazda nézet</h2>
          <p class="muted small">Teljes platform rálátás csapatokra, tagokra és eseményekre.</p>
        </div>
        <div id="platformOverviewCards" class="overview-grid compact-overview"></div>
      </div>
      <div class="grid two-col top-space">
        <div class="card">
          <h2>Friss csapatok</h2>
          <div id="platformTeamsList" class="stack top-space"></div>
        </div>
        <div class="card">
          <h2>Közelgő események</h2>
          <div id="platformEventsList" class="stack top-space"></div>
        </div>
      </div>
    `;
    main.appendChild(section);
    els.views = [...document.querySelectorAll('.view')];
  }

  const nav = document.querySelector('.nav');
  if (nav && !document.querySelector('[data-view="tournamentView"]')) {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.view = 'tournamentView';
    btn.textContent = 'Tornaszervező';
    nav.insertBefore(btn, document.querySelector('[data-view="adminView"]'));
    els.navButtons = [...document.querySelectorAll('.nav-btn')];
  }

  if (nav && !document.querySelector('[data-view="platformView"]')) {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.view = 'platformView';
      btn.textContent = 'Platform gazda';
    nav.insertBefore(btn, document.querySelector('[data-view="adminView"]'));
    els.navButtons = [...document.querySelectorAll('.nav-btn')];
  }

  if (els.loginForm && !document.getElementById('googleLoginMount')) {
    const mount = document.createElement('div');
    mount.id = 'googleLoginMount';
    mount.className = 'top-space';
    els.loginForm.insertAdjacentElement('afterend', mount);
  }

  if (els.registerForm && !document.getElementById('registerPhone')) {
    const registerPathBlock = document.createElement('div');
    registerPathBlock.className = 'auth-field-block';
    registerPathBlock.innerHTML = `
      <label class="label auth-choice-label">Így indulok</label>
      <div id="registrationPathChooser" class="auth-path-grid">
        ${REGISTRATION_PATH_OPTIONS.map(option => {
          const presentation = getRegistrationPathPresentation(option.value);
          return `
          <section class="auth-path-panel auth-path-panel-${option.value}" data-registration-path="${option.value}">
            <span class="auth-path-visual auth-path-visual-${option.value}"></span>
            <div class="auth-path-copy">
              <div class="auth-path-topline">
                <span class="auth-path-kicker">${escapeHtml(presentation.kicker)}</span>
                <span class="auth-path-eyebrow">${escapeHtml(presentation.eyebrow)}</span>
              </div>
              <strong>${escapeHtml(presentation.title)}</strong>
              <p class="auth-path-lead">${escapeHtml(presentation.lead)}</p>
              <div class="auth-path-bullets">
                ${presentation.bullets.map(item => `<span class="auth-path-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
              <p class="auth-path-footer">${escapeHtml(presentation.footer)}</p>
            </div>
            <button class="auth-path-trigger" type="button" data-registration-path="${option.value}">
              <span class="auth-path-trigger-title">${escapeHtml(option.title)}</span>
              <span class="auth-path-trigger-description">${escapeHtml(option.description)}</span>
            </button>
            <div class="auth-path-form-slot"></div>
          </section>
        `;
        }).join('')}
      </div>
      <div id="registerDetailsMount" hidden></div>
    `;

    const registerPhoneBlock = document.createElement('div');
    registerPhoneBlock.className = 'auth-field-block';
    registerPhoneBlock.innerHTML = `
      <label class="label" for="registerPhone">Telefonszám</label>
      <input id="registerPhone" name="phone" type="text" placeholder="+36..." />
    `;

    const registerInviteBlock = document.createElement('div');
    registerInviteBlock.className = 'auth-field-block';
    registerInviteBlock.innerHTML = `
      <label class="label" for="registerInviteToken">Meghívókód / token</label>
      <input id="registerInviteToken" name="inviteToken" type="text" placeholder="Ha meghívólinkkel jöttél, itt is megadhatod" />
    `;

    const submitBtn = els.registerForm.querySelector('button[type="submit"]');
    const existingBlocks = [...els.registerForm.children];
    const detailsBlock = document.createElement('div');
    detailsBlock.id = 'registerFormDetails';
    detailsBlock.className = 'auth-register-details hidden';
    detailsBlock.hidden = true;
    detailsBlock.innerHTML = `
      <div class="auth-register-details-head">
        <strong>Készen állsz? Már csak ezeket add meg.</strong>
      </div>
    `;

    existingBlocks.forEach(block => {
      detailsBlock.appendChild(block);
    });

    detailsBlock.insertBefore(registerPhoneBlock, submitBtn);
    detailsBlock.insertBefore(registerInviteBlock, submitBtn);

    els.registerForm.appendChild(registerPathBlock);
    els.registerForm.appendChild(detailsBlock);
  }

  const registerInviteInput = document.getElementById('registerInviteToken');
  if (registerInviteInput && state.pendingInviteToken && !registerInviteInput.value) {
    registerInviteInput.value = state.pendingInviteToken;
  }

  document.querySelectorAll('.auth-path-trigger').forEach(button => {
    if (button.dataset.boundRegistrationPath !== 'true') {
      button.addEventListener('click', () => {
        setSelectedRegistrationPath(button.dataset.registrationPath || '');
        syncRegistrationPathUi();
      });
      button.dataset.boundRegistrationPath = 'true';
    }
  });

  setSelectedRegistrationPath(state.selectedRegistrationPath || getDefaultRegistrationPath());
  syncRegistrationPathUi();

  if (els.registerForm && !document.getElementById('googleRegisterMount')) {
    const mount = document.createElement('div');
    mount.id = 'googleRegisterMount';
    mount.className = 'top-space';
    els.registerForm.insertAdjacentElement('afterend', mount);
  }

  els.inviteLandingCard = document.getElementById('inviteLandingCard');
  els.tournamentOverviewCards = document.getElementById('tournamentOverviewCards');
  els.tournamentHomeContent = document.getElementById('tournamentHomeContent');
  els.tournamentWorkspaceSummary = document.getElementById('tournamentWorkspaceSummary');
  els.platformOverviewCards = document.getElementById('platformOverviewCards');
  els.platformTeamsList = document.getElementById('platformTeamsList');
  els.platformEventsList = document.getElementById('platformEventsList');
}

function ensureAuthShell() {
  const authView = document.getElementById('authView');
  const authShell = authView?.querySelector('.auth-shell');
  const loginCard = els.loginForm?.closest('.card');
  const registerCard = els.registerForm?.closest('.card');
  if (!authView || !authShell || !loginCard || !registerCard) return;

  authView.classList.add('auth-view-shell');
  authShell.classList.add('auth-shell-ready');
  authView.style.display = authView.classList.contains('active') ? 'flex' : '';
  authView.style.justifyContent = 'center';
  authView.style.alignItems = 'flex-start';
  authView.style.paddingTop = '24px';
  authShell.style.margin = '0 auto';
  authShell.style.width = '100%';
  authShell.style.maxWidth = '1460px';

  let formStage = authShell.querySelector('.auth-form-stage');
  if (!formStage) {
    formStage = document.createElement('div');
    formStage.className = 'auth-form-stage';
    authShell.appendChild(formStage);
  }

  if (loginCard.parentElement !== formStage) {
    formStage.appendChild(loginCard);
  }

  if (registerCard.parentElement !== formStage) {
    formStage.appendChild(registerCard);
  }

  if (!document.getElementById('authPoster')) {
    const poster = document.createElement('aside');
    poster.id = 'authPoster';
    poster.className = 'auth-poster auth-poster-login';
    authShell.appendChild(poster);
  }

  loginCard.id = 'loginPanel';
  registerCard.id = 'registerPanel';
  loginCard.classList.add('auth-card', 'auth-form-panel');
  registerCard.classList.add('auth-card', 'auth-form-panel');

  loginCard.querySelector('h2:not(#authCardTitle)')?.remove();
  registerCard.querySelector('h2')?.remove();

  if (document.querySelector('.auth-shell-header')) {
    document.querySelector('.auth-shell-header')?.remove();
  }

  if (!document.getElementById('authModeLoginBtn')) {
    const authHead = document.createElement('div');
    authHead.className = 'auth-card-head';
    authHead.innerHTML = `
      <div>
        <h2 id="authCardTitle">Bejelentkezés</h2>
        <p id="authCardSubtitle" class="muted small">Lépj be, és folytasd a csapatod szervezését.</p>
      </div>
      <div class="auth-toggle" role="tablist" aria-label="Belépés vagy regisztráció">
        <button id="authModeLoginBtn" class="auth-toggle-btn active" type="button">Belépés</button>
        <button id="authModeRegisterBtn" class="auth-toggle-btn" type="button">Regisztráció</button>
      </div>
    `;
    loginCard.prepend(authHead);
  }

  if (!loginCard.querySelector('[data-auth-mode-switch="register"]')) {
    els.loginForm?.insertAdjacentHTML('afterend', `
      <div class="auth-switch-note">
        <span class="muted small">Még nincs fiókod?</span>
        <button class="auth-inline-link" type="button" data-auth-mode-switch="register">Regisztráció</button>
      </div>
    `);
  }

  if (!registerCard.querySelector('[data-auth-mode-switch="login"]')) {
    els.registerForm?.insertAdjacentHTML('afterend', `
      <div class="auth-switch-note">
        <span class="muted small">Van már fiókod?</span>
        <button class="auth-inline-link" type="button" data-auth-mode-switch="login">Vissza a belépéshez</button>
      </div>
    `);
  }

  els.authCardTitle = document.getElementById('authCardTitle');
  els.authCardSubtitle = document.getElementById('authCardSubtitle');
  els.authModeLoginBtn = document.getElementById('authModeLoginBtn');
  els.authModeRegisterBtn = document.getElementById('authModeRegisterBtn');
  els.loginPanel = loginCard;
  els.registerPanel = registerCard;
  syncAuthPoster();
}

function ensureSidebarShell() {
  if (!els.sidebar || !els.profilePanel) return;

  const noteCard = els.sidebar.querySelector('.note-card');
  if (els.profilePanel.parentElement !== els.sidebar) {
    if (noteCard) {
      els.sidebar.insertBefore(els.profilePanel, noteCard);
    } else {
      els.sidebar.appendChild(els.profilePanel);
    }
  }

  els.profilePanel.classList.add('sidebar-profile-panel');
  els.profileDrawer?.setAttribute('hidden', 'hidden');
  if (els.profileDrawer) {
    els.profileDrawer.style.display = 'none';
  }

  let sidebarToggle = document.getElementById('sidebarToggle');
  if (!sidebarToggle) {
    sidebarToggle = document.createElement('button');
    sidebarToggle.id = 'sidebarToggle';
    sidebarToggle.className = 'sidebar-toggle';
    sidebarToggle.type = 'button';
    sidebarToggle.innerHTML = '<span class="sidebar-toggle-label">Profiladatok</span>';
    els.sidebar.prepend(sidebarToggle);
  }

  if (sidebarToggle.dataset.boundCollapse !== 'true') {
    sidebarToggle.addEventListener('click', () => {
      toggleSidebarCollapse();
    });
    sidebarToggle.dataset.boundCollapse = 'true';
  }
  els.sidebarToggle = sidebarToggle;
}

function ensureAdminStatisticsUi() {
  const adminSubnav = document.querySelector('.admin-subnav-card .admin-subnav');
  if (adminSubnav && !adminSubnav.querySelector('[data-admin-workspace="statistics"]')) {
    const button = document.createElement('button');
    button.className = 'subnav-btn';
    button.type = 'button';
    button.dataset.adminWorkspace = 'statistics';
    button.textContent = 'Statisztikák';
    adminSubnav.appendChild(button);
  }

  const adminView = document.getElementById('adminView');
  if (adminView && !document.querySelector('[data-admin-workspace-panel="statistics"]')) {
    const financePanel = document.querySelector('[data-admin-workspace-panel="finance"]');
    const section = document.createElement('section');
    section.className = 'top-space hidden';
    section.hidden = true;
    section.dataset.adminWorkspacePanel = 'statistics';
    section.innerHTML = `
      <div class="card">
        <h2>Statisztikák</h2>
        <div class="small muted section-note">Csapatszintű áttekintés a rangokról, jelenlétről, aktivitásról és a pénzügyi fegyelemről. Ez nem napi operatív nézet, hanem vezetői rálátás.</div>
        <div id="adminStatisticsContent" class="stack top-space"></div>
      </div>
    `;

    if (financePanel?.parentElement) {
      financePanel.insertAdjacentElement('afterend', section);
    } else {
      adminView.appendChild(section);
    }
  }

  els.adminStatisticsContent = document.getElementById('adminStatisticsContent');
}

function placeAuthHeader(targetPanel) {
  if (!targetPanel) return;
  const header = document.querySelector('.auth-card-head');
  if (!header || header.parentElement === targetPanel) return;
  targetPanel.prepend(header);
}

function setAuthMode(mode = 'login') {
  state.authMode = mode === 'register' ? 'register' : 'login';
  const isRegister = state.authMode === 'register';
  const activePanel = isRegister ? els.registerPanel : els.loginPanel;
  const authShell = document.querySelector('.auth-shell');

  placeAuthHeader(activePanel);

  els.loginPanel?.classList.toggle('hidden', isRegister);
  els.registerPanel?.classList.toggle('hidden', !isRegister);
  if (els.loginPanel) {
    els.loginPanel.style.display = isRegister ? 'none' : 'flex';
  }
  if (els.registerPanel) {
    els.registerPanel.style.display = isRegister ? 'flex' : 'none';
  }
  els.loginPanel?.classList.toggle('active', !isRegister);
  els.registerPanel?.classList.toggle('active', isRegister);
  els.authModeLoginBtn?.classList.toggle('active', !isRegister);
  els.authModeRegisterBtn?.classList.toggle('active', isRegister);

  const registerHeading = els.registerPanel?.querySelector('h2');
  if (registerHeading) {
    registerHeading.textContent = 'Regisztráció';
  }

  if (els.authCardTitle) {
    els.authCardTitle.textContent = isRegister ? 'Regisztráció' : 'Bejelentkezés';
  }
  if (els.authCardSubtitle) {
    els.authCardSubtitle.textContent = isRegister
      ? 'Válaszd ki, milyen szervezőként érkezel, és már indulhat is a saját sportvilágod.'
      : 'Lépj be, és folytasd ott, ahol a csapatod, a tornád vagy a következő eseményed vár.';
  }

  const registerEmailInput = document.getElementById('registerEmail');
  if (registerEmailInput) {
    registerEmailInput.disabled = false;
    registerEmailInput.readOnly = false;
  }

  authShell?.classList.toggle('auth-shell-register-mode', isRegister);

  if (isRegister) {
    syncRegistrationPathUi();
    renderInviteLanding();
  } else {
    syncAuthPoster();
    renderInviteLanding();
  }
}

function resetAuthForms({ preserveInviteToken = true } = {}) {
  const inviteToken = preserveInviteToken
    ? (document.getElementById('registerInviteToken')?.value || state.pendingInviteToken || '')
    : '';

  els.loginForm?.reset();
  els.registerForm?.reset();

  const registerEmailInput = document.getElementById('registerEmail');
  if (registerEmailInput) {
    registerEmailInput.value = '';
    registerEmailInput.disabled = false;
    registerEmailInput.readOnly = false;
  }

  const loginEmailInput = document.getElementById('loginEmail');
  if (loginEmailInput) {
    loginEmailInput.value = '';
    loginEmailInput.disabled = false;
    loginEmailInput.readOnly = false;
  }

  const organizerToggle = document.getElementById('registerAsOrganizer');
  if (organizerToggle) {
    organizerToggle.checked = false;
  }

  const registerPhoneInput = document.getElementById('registerPhone');
  if (registerPhoneInput) {
    registerPhoneInput.value = '';
  }

  const registerInviteInput = document.getElementById('registerInviteToken');
  if (registerInviteInput) {
    registerInviteInput.value = inviteToken;
  }

  setSelectedRegistrationPath(getDefaultRegistrationPath());
  syncRegistrationPathUi();
}

function syncSidebarCollapse() {
  const activeViewId = document.querySelector('.view.active')?.id;
  const guestMode = activeViewId === 'authView';

  if (els.appShell) {
    els.appShell.classList.toggle('guest-mode', guestMode);
    els.appShell.classList.toggle('sidebar-collapsed', !guestMode && state.sidebarCollapsed);
    if (guestMode) {
      els.appShell.style.gridTemplateColumns = 'minmax(0, 1fr)';
    } else if (state.sidebarCollapsed) {
      els.appShell.style.gridTemplateColumns = '64px minmax(0, 1fr)';
    } else {
      els.appShell.style.gridTemplateColumns = '320px minmax(0, 1fr)';
    }
  }

  if (els.sidebar) {
    els.sidebar.hidden = guestMode;
    els.sidebar.style.display = guestMode ? 'none' : 'flex';
    els.sidebar.style.padding = !guestMode && state.sidebarCollapsed ? '24px 8px' : '24px';
    els.sidebar.style.alignItems = !guestMode && state.sidebarCollapsed ? 'center' : '';

    [...els.sidebar.children].forEach(child => {
      if (child === els.sidebarToggle) return;
      child.style.display = guestMode || state.sidebarCollapsed ? 'none' : '';
    });
  }

  if (els.sidebarToggle) {
    els.sidebarToggle.hidden = guestMode;
    els.sidebarToggle.style.display = guestMode ? 'none' : 'inline-flex';
    els.sidebarToggle.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
  }

  if (els.profilePanel) {
    const showProfileInSidebar = Boolean(state.token && state.user && !guestMode && !state.sidebarCollapsed);
    els.profilePanel.hidden = !showProfileInSidebar;
    if (showProfileInSidebar) {
      els.profilePanel.removeAttribute('hidden');
    } else {
      els.profilePanel.setAttribute('hidden', 'hidden');
    }
    els.profilePanel.style.display = showProfileInSidebar ? '' : 'none';
  }

  if (els.profileDrawer) {
    els.profileDrawer.hidden = true;
    els.profileDrawer.style.display = 'none';
  }
}

function toggleSidebarCollapse(forceCollapsed = null) {
  const nextCollapsed = typeof forceCollapsed === 'boolean'
    ? forceCollapsed
    : !state.sidebarCollapsed;
  state.sidebarCollapsed = nextCollapsed;
  localStorage.setItem('foci_sidebar_collapsed', String(nextCollapsed));
  syncSidebarCollapse();
}

function syncAuthLayout() {
  const activeViewId = document.querySelector('.view.active')?.id;
  const guestMode = !state.token && activeViewId === 'authView';
  els.appShell?.classList.toggle('guest-mode', guestMode);
  const authView = document.getElementById('authView');
  if (authView) {
    authView.style.display = activeViewId === 'authView' ? 'flex' : '';
    authView.style.justifyContent = 'center';
    authView.style.alignItems = 'flex-start';
    authView.style.paddingTop = '24px';
  }
  syncSidebarCollapse();
}

function getMessageTarget() {
  const activeViewId = document.querySelector('.view.active')?.id;
  return !state.token && activeViewId === 'authView'
    ? (els.mainMessage || els.globalMessage)
    : (els.globalMessage || els.mainMessage);
}

function showMessage(text, type = 'info') {
  if (state.messageTimer) {
    window.clearTimeout(state.messageTimer);
    state.messageTimer = null;
  }

  const target = getMessageTarget();
  if (!target) return;

  target.textContent = text;
  target.className = `message ${type}`;
  target.removeAttribute('aria-hidden');

  if (type !== 'error') {
    state.messageTimer = window.setTimeout(() => {
      clearMessage();
    }, 4200);
  }
}

function clearMessage() {
  if (state.messageTimer) {
    window.clearTimeout(state.messageTimer);
    state.messageTimer = null;
  }

  [els.globalMessage, els.mainMessage].filter(Boolean).forEach(target => {
    target.className = 'message hidden';
    target.textContent = '';
    target.setAttribute('aria-hidden', 'true');
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

async function copyTextToClipboard(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error('Nincs másolható szöveg.');
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized);
    return true;
  }

  const temp = document.createElement('textarea');
  temp.value = normalized;
  temp.setAttribute('readonly', 'readonly');
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
  return true;
}

function isTeamSkillModuleEnabled() {
  return state.teamSkillSettings?.skill_balancing_enabled !== false;
}

function isRankModuleEnabled() {
  return state.teamSkillSettings?.rank_module_enabled === true;
}

function isCurrentUserRankModuleEnabled() {
  const currentMember = getCurrentTeamMember();
  if (currentMember?.rank_snapshot?.rankModuleEnabled != null) {
    return currentMember.rank_snapshot.rankModuleEnabled === true;
  }

  if (state.currentTeam?.rank_module_enabled != null) {
    return state.currentTeam.rank_module_enabled === true;
  }

  if (state.teamSkillSettings?.rank_module_enabled != null) {
    return state.teamSkillSettings.rank_module_enabled === true;
  }

  const focusEvent = state.selectedUserEventDetail?.event
    || state.selectedUserEvent
    || state.myEvents[0]
    || state.userTeamEvents[0]
    || null;

  if (focusEvent?.rank_module_enabled != null) {
    return focusEvent.rank_module_enabled === true;
  }

  return false;
}

const USER_RANK_DEFINITIONS = Object.freeze({
  10: { value: 10, label: 'Old Boys', emoji: '👑', description: 'A legmagasabb prioritású, meghatározó kerettag.' },
  9: { value: 9, label: 'Öltözőkulcsos', emoji: '🔑', description: 'Megbízható, visszatérő játékos, aki szinte mindig ott van.' },
  8: { value: 8, label: 'Hazai pályás', emoji: '🏟️', description: 'Erős jelenlétű tag, rendszeresen számol vele a csapat.' },
  7: { value: 7, label: 'Stabil kerettag', emoji: '📋', description: 'Kiszámítható, jól terhelhető tag a heti szervezésben.' },
  6: { value: 6, label: 'Rotációs játékos', emoji: '🔄', description: 'Jó eséllyel jön, de nem minden héten állandó.' },
  5: { value: 5, label: 'Félidős klasszis', emoji: '⏱️', description: 'Hullámzó jelenlétű játékos, de még stabilan körforgásban van.' },
  4: { value: 4, label: 'Cserepadról érkező', emoji: '🪑', description: 'Alacsonyabb prioritású, jellemzően később nyíló jelentkezéssel.' },
  3: { value: 3, label: 'Bemelegítő szélső', emoji: '🏃', description: 'Ritkábban aktív tag, ezért későbbi jelentkezési hullámba kerülhet.' },
  2: { value: 2, label: 'Pályaszéli megfigyelő', emoji: '👀', description: 'Kevésbé aktív tag, inkább a végső nyitási hullámban számolunk vele.' },
  1: { value: 1, label: 'Eseti beugró', emoji: '🎟️', description: 'Legkésőbb nyíló jelentkezési sávban kap helyet.' }
});

const GUEST_RANK_PROFILE = Object.freeze({
  label: 'Vendég',
  emoji: '🤝',
  description: 'Újonnan érkező vagy próbaidős tag. A rangszámítása később aktiválható.'
});

const USER_RANK_LABELS = Object.freeze({
  10: { value: 10, label: 'Old Boys', emoji: '👑', description: 'A legmagasabb prioritású, meghatározó kerettag.' },
  9: { value: 9, label: 'Öltözőkulcsos', emoji: '🔑', description: 'Megbízható, visszatérő játékos, aki szinte mindig ott van.' },
  8: { value: 8, label: 'Hazai pályás', emoji: '🏟️', description: 'Erős jelenlétű tag, rendszeresen számol vele a csapat.' },
  7: { value: 7, label: 'Stabil kerettag', emoji: '📋', description: 'Kiszámítható, jól terhelhető tag a heti szervezésben.' },
  6: { value: 6, label: 'Rotációs játékos', emoji: '🔄', description: 'Jó eséllyel jön, de nem minden héten állandó.' },
  5: { value: 5, label: 'Félidős klasszis', emoji: '⏱️', description: 'Hullámzó jelenlétű játékos, de még stabilan körforgásban van.' },
  4: { value: 4, label: 'Cserepadról érkező', emoji: '🪑', description: 'Alacsonyabb prioritású, jellemzően később nyíló jelentkezéssel.' },
  3: { value: 3, label: 'Bemelegítő szélső', emoji: '🏃', description: 'Ritkábban aktív tag, ezért későbbi jelentkezési hullámba kerülhet.' },
  2: { value: 2, label: 'Pályaszéli megfigyelő', emoji: '👀', description: 'Kevésbé aktív tag, inkább a végső nyitási hullámban számolunk vele.' },
  1: { value: 1, label: 'Eseti beugró', emoji: '🎟️', description: 'Legkésőbb nyíló jelentkezési sávban kap helyet.' }
});

const GUEST_RANK_LABEL = Object.freeze({
  label: 'Vendég',
  emoji: '🤝',
  description: 'Újonnan érkező vagy próbaidős tag. A rangszámítása később aktiválható.'
});

function normalizeUserRankValue(value, fallback = 10) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 10 ? num : fallback;
}

function normalizeUserRankStatus(value, fallback = 'guest') {
  return String(value || fallback).trim().toLowerCase() === 'ranked' ? 'ranked' : 'guest';
}

function getMemberRankProfile(member) {
  const status = normalizeUserRankStatus(member?.rank_status, 'guest');
  if (status === 'guest') {
    return {
      status,
      value: null,
      ...GUEST_RANK_LABEL
    };
  }

  const rankValue = normalizeUserRankValue(member?.effective_rank_value ?? member?.rank_snapshot?.effectiveRankValue ?? member?.rank_value, 10);
  const definition = USER_RANK_LABELS[rankValue] || USER_RANK_LABELS[10];
  return {
    status,
    ...definition
  };
}

function getCurrentTeamMember() {
  return state.teamMembers.find(member => member.user_id === state.user?.id) || null;
}

function getTeamDrawMode() {
  return isTeamSkillModuleEnabled() ? 'skill' : 'random';
}

function countActiveGoalkeepers(members = []) {
  return members.filter(member => member.membership_status === 'active' && member.is_goalkeeper).length;
}

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  state.currentTeamId = getStoredTeamIdForUser(user?.id);
  state.sidebarCollapsed = false;
  localStorage.setItem('foci_token', token || '');
  localStorage.setItem('foci_user', JSON.stringify(user || null));
  localStorage.setItem('foci_sidebar_collapsed', 'false');
  updateSessionUi();
  applyRoleAwareUi();
}

async function refreshCurrentUser() {
  if (!state.token) return null;

  try {
    const me = await api('/auth/me', { method: 'GET' });
    if (me?.user) {
      setAuth(state.token, me.user);
      return me.user;
    }
  } catch (error) {
    console.error('Aktuális user frissítési hiba:', error);
  }

  return state.user;
}

function getProfileDraftFromForm() {
  const nameInput = document.getElementById('profileName');
  const nicknameInput = document.getElementById('profileNickname');
  const phoneInput = document.getElementById('profilePhone');
  const birthYearInput = document.getElementById('profileBirthYear');
  const avatarInput = document.getElementById('profileAvatarDataUrl');
  const paymentProviderInput = document.getElementById('profilePaymentProvider');
  const paymentUsernameInput = document.getElementById('profilePaymentUsername');
  const paymentQrInput = document.getElementById('profilePaymentQrDataUrl');

  return {
    name: nameInput?.value?.trim() || state.user?.name || '',
    nickname: nicknameInput?.value?.trim() || '',
    phone: phoneInput?.value?.trim() || '',
    birth_year: birthYearInput?.value?.trim() || '',
    avatar_data_url: avatarInput?.value || state.user?.avatar_data_url || '',
    payment_provider: paymentProviderInput?.value || state.user?.payment_provider || '',
    payment_username: paymentUsernameInput?.value?.trim() || '',
    payment_qr_data_url: paymentQrInput?.value || state.user?.payment_qr_data_url || ''
  };
}

const SURFACE_LAYOUT_STORAGE_PREFIX = 'foci_surface_layout_';
const SURFACE_LAYOUT_COLUMNS = 12;
const SURFACE_LAYOUT_MIN_SPAN = 3;
const SURFACE_LAYOUT_MAX_ROW_SPAN = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSurfaceViewById(viewId) {
  if (!viewId) return null;
  const view = document.getElementById(viewId);
  return view?.matches('[data-surface-layout="true"]') ? view : null;
}

function getActiveEditableSurfaceView() {
  return document.querySelector('.view.active[data-surface-layout="true"]');
}

function getSurfaceItems(viewId) {
  const view = getSurfaceViewById(viewId);
  if (!view) return [];
  return [...view.querySelectorAll(':scope > [data-layout-item][data-layout-key]')];
}

function getDefaultSurfaceLayout(viewId) {
  return getSurfaceItems(viewId).map((item, index) => ({
    key: item.dataset.layoutKey,
    order: index,
    colSpan: clamp(
      Number(item.dataset.defaultColSpan || 12) || 12,
      Number(item.dataset.minColSpan || SURFACE_LAYOUT_MIN_SPAN) || SURFACE_LAYOUT_MIN_SPAN,
      Number(item.dataset.maxColSpan || SURFACE_LAYOUT_COLUMNS) || SURFACE_LAYOUT_COLUMNS
    ),
    rowSpan: clamp(
      Number(item.dataset.defaultRowSpan || 1) || 1,
      Number(item.dataset.minRowSpan || 1) || 1,
      Number(item.dataset.maxRowSpan || SURFACE_LAYOUT_MAX_ROW_SPAN) || SURFACE_LAYOUT_MAX_ROW_SPAN
    )
  }));
}

function normalizeSurfaceLayout(viewId, layout) {
  const items = getSurfaceItems(viewId);
  const defaults = getDefaultSurfaceLayout(viewId);
  const byKey = new Map((Array.isArray(layout) ? layout : []).map(entry => [entry.key, entry]));
  const constraintsByKey = new Map(items.map(item => [
    item.dataset.layoutKey,
    {
      minColSpan: Number(item.dataset.minColSpan || SURFACE_LAYOUT_MIN_SPAN) || SURFACE_LAYOUT_MIN_SPAN,
      maxColSpan: Number(item.dataset.maxColSpan || SURFACE_LAYOUT_COLUMNS) || SURFACE_LAYOUT_COLUMNS,
      minRowSpan: Number(item.dataset.minRowSpan || 1) || 1,
      maxRowSpan: Number(item.dataset.maxRowSpan || SURFACE_LAYOUT_MAX_ROW_SPAN) || SURFACE_LAYOUT_MAX_ROW_SPAN
    }
  ]));

  return defaults.map((entry, index) => {
    const saved = byKey.get(entry.key) || {};
    const constraints = constraintsByKey.get(entry.key) || {
      minColSpan: SURFACE_LAYOUT_MIN_SPAN,
      maxColSpan: SURFACE_LAYOUT_COLUMNS,
      minRowSpan: 1,
      maxRowSpan: SURFACE_LAYOUT_MAX_ROW_SPAN
    };
    return {
      key: entry.key,
      order: Number.isFinite(saved.order) ? saved.order : index,
      colSpan: clamp(
        Number(saved.colSpan || entry.colSpan) || entry.colSpan,
        constraints.minColSpan,
        constraints.maxColSpan
      ),
      rowSpan: clamp(
        Number(saved.rowSpan || entry.rowSpan) || entry.rowSpan,
        constraints.minRowSpan,
        constraints.maxRowSpan
      )
    };
  }).sort((a, b) => a.order - b.order)
    .map((entry, index) => ({ ...entry, order: index }));
}

function loadSurfaceLayout(viewId) {
  try {
    const raw = localStorage.getItem(`${SURFACE_LAYOUT_STORAGE_PREFIX}${viewId}`);
    if (!raw) return getDefaultSurfaceLayout(viewId);
    return normalizeSurfaceLayout(viewId, JSON.parse(raw));
  } catch {
    return getDefaultSurfaceLayout(viewId);
  }
}

function saveSurfaceLayout(viewId, layout) {
  const normalized = normalizeSurfaceLayout(viewId, layout);
  localStorage.setItem(`${SURFACE_LAYOUT_STORAGE_PREFIX}${viewId}`, JSON.stringify(normalized));
  return normalized;
}

function getWorkingSurfaceLayout(viewId) {
  if (state.layoutEditor.isEditing && state.layoutEditor.viewId === viewId) {
    return normalizeSurfaceLayout(viewId, state.layoutEditor.draftLayouts[viewId] || loadSurfaceLayout(viewId));
  }
  return loadSurfaceLayout(viewId);
}

function ensureSurfaceLayoutChrome(viewId) {
  getSurfaceItems(viewId).forEach(item => {
    if (!item.querySelector('.surface-layout-controls')) {
      const controls = document.createElement('div');
      controls.className = 'surface-layout-controls';
      controls.innerHTML = `
        <span class="surface-layout-chip surface-drag-handle" title="Mozgatás" data-layout-drag-handle="true">Mozgatás</span>
        <span class="surface-layout-chip" title="Szélesség × magasság" data-layout-size-label="true"></span>
      `;
      item.prepend(controls);
    }

    if (!item.querySelector('.surface-resize-handle')) {
      const resizeHandle = document.createElement('button');
      resizeHandle.type = 'button';
      resizeHandle.className = 'surface-resize-handle';
      resizeHandle.dataset.layoutResizeHandle = 'true';
      resizeHandle.setAttribute('aria-label', 'Átméretezés');
      item.appendChild(resizeHandle);
    }
  });
}

function applySurfaceLayout(viewId, layout = null) {
  const view = getSurfaceViewById(viewId);
  if (!view) return;

  ensureSurfaceLayoutChrome(viewId);

  const normalized = normalizeSurfaceLayout(viewId, layout || getWorkingSurfaceLayout(viewId));
  const byKey = new Map(normalized.map(entry => [entry.key, entry]));

  getSurfaceItems(viewId).forEach((item, index) => {
    const entry = byKey.get(item.dataset.layoutKey) || normalized[index];
    item.style.setProperty('--surface-col-span', entry?.colSpan || 12);
    item.style.setProperty('--surface-row-span', entry?.rowSpan || 1);
    item.style.order = String(entry?.order ?? index);
    item.dataset.layoutOrder = String(entry?.order ?? index);
    const sizeLabel = item.querySelector('[data-layout-size-label]');
    if (sizeLabel) {
      sizeLabel.textContent = `${entry?.colSpan || 12} × ${entry?.rowSpan || 1}`;
    }
  });
}

function updateSurfaceLayoutDraft(viewId, updater, options = {}) {
  const { rerenderProfile = false } = options;
  const current = getWorkingSurfaceLayout(viewId);
  const nextLayout = typeof updater === 'function'
    ? updater(current.map(entry => ({ ...entry })))
    : updater;
  const normalized = normalizeSurfaceLayout(viewId, nextLayout);
  state.layoutEditor.draftLayouts[viewId] = normalized;
  applySurfaceLayout(viewId, normalized);
  if (rerenderProfile) {
    renderProfilePanel(getProfileDraftFromForm());
  }
}

function moveSurfaceItem(viewId, key, targetIndex) {
  updateSurfaceLayoutDraft(viewId, current => {
    const ordered = [...current].sort((a, b) => a.order - b.order);
    const fromIndex = ordered.findIndex(entry => entry.key === key);
    if (fromIndex === -1) return current;
    const [moved] = ordered.splice(fromIndex, 1);
    const safeTargetIndex = clamp(targetIndex, 0, ordered.length);
    ordered.splice(safeTargetIndex, 0, moved);
    return ordered.map((entry, index) => ({ ...entry, order: index }));
  });
}

function resizeSurfaceItem(viewId, key, nextColSpan, nextRowSpan) {
  updateSurfaceLayoutDraft(viewId, current => current.map(entry => (
    entry.key === key
      ? {
          ...entry,
          colSpan: clamp(nextColSpan, SURFACE_LAYOUT_MIN_SPAN, SURFACE_LAYOUT_COLUMNS),
          rowSpan: clamp(nextRowSpan, 1, SURFACE_LAYOUT_MAX_ROW_SPAN)
        }
      : entry
  )));
}

function startSurfaceLayoutEditing() {
  const activeView = getActiveEditableSurfaceView();
  if (!activeView) {
    showMessage('Ebben a nézetben most nincs szerkeszthető felület.', 'error');
    return;
  }

  const viewId = activeView.id;
  state.layoutEditor.isEditing = true;
  state.layoutEditor.viewId = viewId;
  state.layoutEditor.draftLayouts[viewId] = loadSurfaceLayout(viewId);
  activeView.classList.add('surface-layout-editing');
  applySurfaceLayout(viewId, state.layoutEditor.draftLayouts[viewId]);
  renderProfilePanel(getProfileDraftFromForm());
  showMessage('Felületszerkesztés bekapcsolva. A Mozgatás fogóval átrendezheted, a sarokkal pedig átméretezheted a fő paneleket.', 'info');
}

function saveSurfaceLayoutDraft() {
  const viewId = state.layoutEditor.viewId;
  if (!state.layoutEditor.isEditing || !viewId) return;

  const savedLayout = saveSurfaceLayout(viewId, state.layoutEditor.draftLayouts[viewId] || loadSurfaceLayout(viewId));
  const view = getSurfaceViewById(viewId);
  if (view) {
    view.classList.remove('surface-layout-editing');
  }

  state.layoutEditor.isEditing = false;
  state.layoutEditor.viewId = null;
  state.layoutEditor.dragging = null;
  state.layoutEditor.resizing = null;
  applySurfaceLayout(viewId, savedLayout);
  renderProfilePanel(getProfileDraftFromForm());
  showMessage('Felületelrendezés elmentve.', 'success');
}

function cancelSurfaceLayoutDraft() {
  const viewId = state.layoutEditor.viewId;
  if (!state.layoutEditor.isEditing || !viewId) return;

  const view = getSurfaceViewById(viewId);
  if (view) {
    view.classList.remove('surface-layout-editing');
  }

  applySurfaceLayout(viewId, loadSurfaceLayout(viewId));
  state.layoutEditor.isEditing = false;
  state.layoutEditor.viewId = null;
  state.layoutEditor.dragging = null;
  state.layoutEditor.resizing = null;
  delete state.layoutEditor.draftLayouts[viewId];
  renderProfilePanel(getProfileDraftFromForm());
  showMessage('A felületszerkesztés mentés nélkül bezárva.', 'info');
}

function resetSurfaceLayoutDraft() {
  const viewId = state.layoutEditor.viewId;
  if (!state.layoutEditor.isEditing || !viewId) return;

  updateSurfaceLayoutDraft(viewId, getDefaultSurfaceLayout(viewId), { rerenderProfile: true });
  showMessage('Az alapelrendezés visszaállt. Ha megtartod, mentsd el.', 'info');
}

function stopSurfacePointerInteractions() {
  const draggingKey = state.layoutEditor.dragging?.key;
  if (draggingKey && state.layoutEditor.viewId) {
    const draggingItem = getSurfaceItems(state.layoutEditor.viewId)
      .find(item => item.dataset.layoutKey === draggingKey);
    draggingItem?.classList.remove('surface-layout-dragging');
  }

  state.layoutEditor.dragging = null;
  state.layoutEditor.resizing = null;
}

function handleSurfaceLayoutPointerDown(event) {
  if (!state.layoutEditor.isEditing) return;

  const dragHandle = event.target.closest('[data-layout-drag-handle="true"]');
  const resizeHandle = event.target.closest('[data-layout-resize-handle="true"]');
  const item = event.target.closest('[data-layout-item][data-layout-key]');
  const view = item?.closest('[data-surface-layout="true"]');

  if (!item || !view || view.id !== state.layoutEditor.viewId) return;

  if (dragHandle) {
    event.preventDefault();
    item.classList.add('surface-layout-dragging');
    state.layoutEditor.dragging = { key: item.dataset.layoutKey };
    return;
  }

  if (resizeHandle) {
    event.preventDefault();
    const entry = getWorkingSurfaceLayout(view.id).find(layoutItem => layoutItem.key === item.dataset.layoutKey);
    state.layoutEditor.resizing = {
      key: item.dataset.layoutKey,
      viewId: view.id,
      startX: event.clientX,
      startY: event.clientY,
      startColSpan: entry?.colSpan || 12,
      startRowSpan: entry?.rowSpan || 1
    };
  }
}

function handleSurfaceLayoutPointerMove(event) {
  if (state.layoutEditor.resizing) {
    const { viewId, key, startX, startY, startColSpan, startRowSpan } = state.layoutEditor.resizing;
    const deltaCols = Math.round((event.clientX - startX) / 70);
    const deltaRows = Math.round((event.clientY - startY) / 110);
    resizeSurfaceItem(viewId, key, startColSpan + deltaCols, startRowSpan + deltaRows);
    return;
  }

  if (!state.layoutEditor.dragging || !state.layoutEditor.viewId) return;

  const viewId = state.layoutEditor.viewId;
  const draggingKey = state.layoutEditor.dragging.key;
  const items = getSurfaceItems(viewId);
  const siblings = items.filter(item => item.dataset.layoutKey !== draggingKey);

  if (!siblings.length) return;

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  siblings.forEach(sibling => {
    const rect = sibling.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = sibling;
    }
  });

  if (!bestMatch) return;

  const currentLayout = [...getWorkingSurfaceLayout(viewId)].sort((a, b) => a.order - b.order);
  const targetIndex = currentLayout.findIndex(entry => entry.key === bestMatch.dataset.layoutKey);
  if (targetIndex === -1) return;

  const rect = bestMatch.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
  moveSurfaceItem(viewId, draggingKey, insertAfter ? targetIndex + 1 : targetIndex);
}

function handleSurfaceLayoutPointerUp() {
  stopSurfacePointerInteractions();
}

function renderProfilePanel(draft = null) {
  if (!els.profilePanel) return;

  if (!state.user || !state.token) {
    els.profilePanel.innerHTML = `
      <div class="profile-panel-empty">
        <strong>Profil</strong>
        <div class="small muted">Belépés után itt tudod megadni a becenevedet, telefonszámodat, születési évedet és az avatárodat.</div>
      </div>
    `;
    return;
  }

  const profileDraft = draft || {
    name: state.user.name || '',
    nickname: state.user.nickname || '',
    phone: state.user.phone || '',
    birth_year: state.user.birth_year != null ? String(state.user.birth_year) : '',
    avatar_data_url: state.user.avatar_data_url || '',
    payment_provider: state.user.payment_provider || '',
    payment_username: state.user.payment_username || '',
    payment_qr_data_url: state.user.payment_qr_data_url || ''
  };
  const previewUser = {
    ...state.user,
    ...profileDraft,
    birth_year: profileDraft.birth_year || null,
    avatar_data_url: profileDraft.avatar_data_url || null,
    payment_provider: profileDraft.payment_provider || null,
    payment_username: profileDraft.payment_username || null,
    payment_qr_data_url: profileDraft.payment_qr_data_url || null
  };
  const selectedAvatar = getAvatarPreview(previewUser);
  const activeAvatar = previewUser.avatar_data_url || '';
  const overallAttendanceStats = state.user?.attendance_stats || {
    present_count: 0,
    no_show_count: 0,
    marked_count: 0
  };
  const currentMember = getCurrentTeamMember();
  const currentTeamAttendanceStats = currentMember?.attendance_stats || null;
  const currentTeamFinanceStats = state.currentTeamFinance || null;
  const activeSurfaceView = getActiveEditableSurfaceView();
  const canEditSurface = Boolean(activeSurfaceView);
  const isEditingSurface = state.layoutEditor.isEditing && state.layoutEditor.viewId === activeSurfaceView?.id;
  const showAdminHiddenToggle = activeSurfaceView?.id === 'adminView' && canAccessAdminView();
  const surfaceButtonRow = canEditSurface ? `
    <div class="profile-panel-actions">
      ${isEditingSurface
        ? `
          <button class="btn" type="button" data-layout-action="save">Elrendezés mentése</button>
          <button class="btn btn-secondary" type="button" data-layout-action="cancel">Mégse</button>
          <button class="btn btn-secondary" type="button" data-layout-action="reset">Alaphelyzet</button>
        `
        : '<button class="btn btn-secondary" type="button" data-layout-action="edit">Felület szerkesztése</button>'}
    </div>
  ` : '';
  const adminHiddenToggleRow = showAdminHiddenToggle ? `
    <label class="module-switch top-space" for="adminHideHiddenEventsToggle">
      <span>
        <span class="module-switch-label">Rejtett események elrejtése</span>
        <span class="module-switch-description">Bekapcsolva a rejtett főlistás események eltűnnek az admin listából. Kikapcsolva halványabban újra megjelennek.</span>
      </span>
      <span class="module-switch-control">
        <input id="adminHideHiddenEventsToggle" type="checkbox" ${state.adminHideHiddenEvents ? 'checked' : ''} />
        <span class="module-switch-track" aria-hidden="true"></span>
      </span>
    </label>
  ` : '';

  els.profilePanel.innerHTML = `
    <div class="profile-panel-head">
      <div>
        <div class="small muted">Saját profil</div>
        <h3 class="profile-panel-title">${escapeHtml(getDisplayName(previewUser))}</h3>
      </div>
      <img class="profile-avatar-preview" src="${escapeHtml(selectedAvatar)}" alt="Profilkép" />
    </div>

    <form id="profileForm" class="stack top-space">
      <input type="hidden" id="profileAvatarDataUrl" value="${escapeHtml(activeAvatar)}" />
      <input type="hidden" id="profilePaymentQrDataUrl" value="${escapeHtml(profileDraft.payment_qr_data_url || '')}" />
      <div>
        <label class="label" for="profileName">Regisztrációs név</label>
        <input id="profileName" type="text" value="${escapeHtml(profileDraft.name || '')}" required />
      </div>
      <div>
        <label class="label" for="profileNickname">Becenév</label>
        <input id="profileNickname" type="text" value="${escapeHtml(profileDraft.nickname || '')}" placeholder="Ha megadod, ezt használjuk megjelenített névként" />
      </div>
      <div>
        <label class="label" for="profilePhone">Telefonszám</label>
        <input id="profilePhone" type="text" value="${escapeHtml(profileDraft.phone || '')}" placeholder="+36..." />
      </div>
      <div>
        <label class="label" for="profileBirthYear">Születési év</label>
        <input id="profileBirthYear" type="text" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="${escapeHtml(profileDraft.birth_year || '')}" placeholder="pl. 1992" />
      </div>
      <div class="event-card">
        <strong>Fizetési profil</strong>
        <div class="small muted top-space">Itt tudod megadni, hova kérjék vagy hova küldjék a pénzt. A QR-kódot az admin és a csapattagok is meg tudják majd nyitni nagyban.</div>
        <div class="grid two-col inner-grid top-space">
          <div>
            <label class="label" for="profilePaymentProvider">Szolgáltató</label>
            <select id="profilePaymentProvider">
              <option value="">Nincs megadva</option>
              <option value="revolut" ${profileDraft.payment_provider === 'revolut' ? 'selected' : ''}>Revolut</option>
              <option value="wise" ${profileDraft.payment_provider === 'wise' ? 'selected' : ''}>Wise</option>
            </select>
          </div>
          <div>
            <label class="label" for="profilePaymentUsername">Felhasználónév / azonosító</label>
            <input id="profilePaymentUsername" type="text" value="${escapeHtml(profileDraft.payment_username || '')}" placeholder="@felhasznalonev vagy azonosító" />
          </div>
        </div>
        <label class="label top-space" for="profilePaymentQrUpload">Revolut / Wise QR-kód</label>
        <input id="profilePaymentQrUpload" type="file" accept="image/png,image/jpeg,image/webp" />
        <div class="small muted">Legfeljebb 4 MB méretű, maximum 600×600 pixeles QR-kód képet tölthetsz fel.</div>
        ${
          profileDraft.payment_qr_data_url
            ? `
              <div class="payment-qr-preview-card top-space">
                <img class="payment-qr-image" src="${escapeHtml(profileDraft.payment_qr_data_url)}" alt="Fizetési QR-kód előnézet" />
                <div class="stack">
                  <div class="small muted">${escapeHtml(getPaymentProviderLabel(profileDraft.payment_provider))}</div>
                  <div class="detail-value">${escapeHtml(profileDraft.payment_username || 'QR-kód feltöltve')}</div>
                  <div class="row gap wrap">
                    <button class="btn btn-secondary" type="button" data-payment-qr-open="self">Megnyitás nagyban</button>
                    <button class="btn btn-ghost" type="button" data-payment-qr-clear="self">QR törlése</button>
                  </div>
                </div>
              </div>
            `
            : '<div class="small muted top-space">Ha feltöltöd a QR-kódot, egy kattintással megnyitható lesz a pénzügyi nézetekből.</div>'
        }
      </div>
      <div class="event-card">
        <div class="row between align-center wrap gap">
          <strong>No-show mutató</strong>
          ${attendanceStatusBadge(overallAttendanceStats.no_show_count > 0 ? 'no_show' : (overallAttendanceStats.present_count > 0 ? 'present' : null))}
        </div>
        <div class="grid three-col inner-grid top-space">
          <div class="detail-box">
            <div class="detail-label">Összes megjelent</div>
            <div class="detail-value">${escapeHtml(String(overallAttendanceStats.present_count || 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Összes no-show</div>
            <div class="detail-value">${escapeHtml(String(overallAttendanceStats.no_show_count || 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Összes jelölt</div>
            <div class="detail-value">${escapeHtml(String(overallAttendanceStats.marked_count || 0))}</div>
          </div>
        </div>
          ${
            currentTeamAttendanceStats
              ? `
                <div class="small muted top-space">
                 Fókuszcsapat: megjelent ${escapeHtml(String(currentTeamAttendanceStats.present_count || 0))} ·
                 no-show ${escapeHtml(String(currentTeamAttendanceStats.no_show_count || 0))} ·
                 jelölt ${escapeHtml(String(currentTeamAttendanceStats.marked_count || 0))}
                </div>
              `
              : '<div class="small muted top-space">Ha van betöltött fókuszcsapatod, itt külön a csapaton belüli no-show összesítőt is látod.</div>'
          }
          ${
            currentTeamFinanceStats
              ? `
                <div class="small muted top-space">
                  Fókuszcsapat pénzügy: egyenleg ${escapeHtml(formatSignedMoney(currentTeamFinanceStats.current_balance_amount || 0))} ·
                  könyvelt esemény ${escapeHtml(String(currentTeamFinanceStats.entry_count || 0))}
                </div>
              `
              : ''
          }
        </div>
      <div class="profile-avatar-section">
        <div class="label">Avatár</div>
        <div class="profile-avatar-presets">
          ${PROFILE_AVATAR_PRESETS.map(preset => `
            <button class="avatar-preset-btn ${activeAvatar === buildPresetAvatarDataUrl(preset.id, getDisplayName(previewUser)) ? 'active' : ''}" type="button" data-avatar-preset="${preset.id}">
              <img src="${escapeHtml(buildPresetAvatarDataUrl(preset.id, getDisplayName(previewUser)))}" alt="${escapeHtml(preset.label)}" />
            </button>
          `).join('')}
        </div>
        <label class="label top-space" for="profileAvatarUpload">Saját profilkép</label>
        <input id="profileAvatarUpload" type="file" accept="image/png,image/jpeg,image/webp" />
        <div class="small muted">Legfeljebb 4 MB méretű, maximum 600×600 pixeles képet tölthetsz fel.</div>
      </div>
      ${adminHiddenToggleRow}
      ${surfaceButtonRow}
      <button class="btn" type="submit">Profil mentése</button>
    </form>
  `;
}

const PROFILE_AVATAR_PRESETS = Object.freeze([
  { id: 'grass', label: 'Fűlabda', colors: ['#16a34a', '#84cc16'] },
  { id: 'goal', label: 'Kapufa', colors: ['#0f172a', '#38bdf8'] },
  { id: 'sunset', label: 'Naplemente', colors: ['#f97316', '#fb7185'] },
  { id: 'night', label: 'Esti meccs', colors: ['#1d4ed8', '#22c55e'] }
]);

const PAYMENT_PROVIDER_LABELS = Object.freeze({
  revolut: 'Revolut',
  wise: 'Wise'
});

function getDisplayName(user = state.user) {
  return user?.nickname || user?.name || 'Névtelen játékos';
}

function getPaymentProviderLabel(provider) {
  return PAYMENT_PROVIDER_LABELS[String(provider || '').trim().toLowerCase()] || 'Fizetési profil';
}

function getUserPaymentProfile(user) {
  if (!user) return null;
  const provider = String(user.payment_provider || '').trim().toLowerCase();
  const username = String(user.payment_username || '').trim();
  const qrDataUrl = String(user.payment_qr_data_url || '').trim();

  if (!provider && !username && !qrDataUrl) {
    return null;
  }

  return {
    provider: provider || null,
    providerLabel: getPaymentProviderLabel(provider),
    username: username || null,
    qrDataUrl: qrDataUrl || null
  };
}

function normalizePaymentLinkProvider(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  return PAYMENT_PROVIDER_LABELS[normalized] ? normalized : '';
}

function normalizePaymentLinkUrl(url) {
  const normalized = String(url || '').trim();
  return normalized || '';
}

function getEventPaymentLinkProfile(event) {
  if (!event) return null;

  const provider = normalizePaymentLinkProvider(
    event.payment_link_provider || event.paymentLinkProvider
  );
  const url = normalizePaymentLinkUrl(
    event.payment_link_url || event.paymentLinkUrl
  );

  if (!provider || !url) {
    return null;
  }

  return {
    provider,
    providerLabel: getPaymentProviderLabel(provider),
    url
  };
}

function getTeamCaptainMember() {
  return (state.teamMembers || []).find(member => member.role === 'team_admin' && member.membership_status === 'active') || null;
}

function buildCaptainQrPaymentSummary() {
  const focusEvent =
    state.selectedUserEventDetail?.event
    || state.selectedUserEvent
    || getNextEvent(state.userTeamEvents || state.myEvents || [])
    || null;
  const paymentSummary = getPaymentSummaryObject(focusEvent);
  if (!paymentSummary || paymentSummary.is_visible_to_user !== true) {
    return null;
  }

  const projection = buildUserEventPaymentProjection(paymentSummary, state.currentTeamFinance);
  const carryLabel = projection.debtCarry > 0
    ? 'Áthozott tartozás'
    : projection.creditCarry > 0
      ? 'Levonható előleg'
      : 'Áthozott egyenleg';
  const carryAmount = projection.debtCarry > 0
    ? projection.debtCarry
    : projection.creditCarry;
  const note = projection.debtCarry > 0
    ? `A QR megnyitásakor már beleszámoltuk a korábbi ${formatMoney(projection.debtCarry)} tartozást is.`
    : projection.creditCarry > 0
      ? `A QR megnyitásakor már levontuk a korábbi ${formatMoney(projection.creditCarry)} előlegedet.`
      : 'Most nincs áthozott tartozásod vagy előleged.';

  return {
    dueNowAmount: projection.projectedDue,
    eventAmount: projection.eventAmount,
    carryLabel,
    carryAmount,
    note
  };
}

function openPaymentQrPreviewForUserId(userId, roleHint = '') {
  const user =
    (state.teamMembers || []).find(member => String(member.user_id) === String(userId)) ||
    (state.selectedAdminEventDetail?.registrations?.going || []).find(member => String(member.user_id) === String(userId)) ||
    (state.selectedAdminEventDetail?.registrations?.waitingList || []).find(member => String(member.user_id) === String(userId)) ||
    (state.selectedAdminEventDetail?.registrations?.rankWaitingList || []).find(member => String(member.user_id) === String(userId)) ||
    null;
  const profile = getUserPaymentProfile(user);

  if (!user || !profile) {
    showMessage('Ehhez a játékoshoz még nincs rögzített fizetési profil.', 'error');
    return;
  }

  openPaymentQrPreview({
    title: user.name || getDisplayName(user),
    subtitle: roleHint === 'captain' ? 'Csapatkapitány fizetési QR-kódja' : 'Játékos fizetési QR-kódja',
    qrDataUrl: profile.qrDataUrl,
    username: profile.username || '',
    provider: profile.providerLabel,
    paymentSummary: roleHint === 'captain' ? buildCaptainQrPaymentSummary() : null
  });
}

function openPaymentQrPreview({ title, subtitle = '', qrDataUrl, username = '', provider = '', paymentSummary = null }) {
  if (!qrDataUrl) {
    showMessage('Ehhez a profilhoz még nincs feltöltött QR-kód.', 'error');
    return;
  }

  state.paymentQrPreview = {
    title,
    subtitle,
    qrDataUrl,
    username,
    provider,
    paymentSummary
  };
  renderPaymentQrPreviewOverlay();
}

function closePaymentQrPreview() {
  state.paymentQrPreview = null;
  renderPaymentQrPreviewOverlay();
}

function renderPaymentQrPreviewOverlay() {
  const existing = document.getElementById('paymentQrPreviewOverlay');
  if (!state.paymentQrPreview) {
    existing?.remove();
    return;
  }

  const markup = `
    <div id="paymentQrPreviewOverlay" class="payment-qr-overlay">
      <div class="payment-qr-dialog">
        <button class="payment-qr-close" type="button" data-payment-qr-close aria-label="Bezárás">×</button>
        <div class="small muted">${escapeHtml(state.paymentQrPreview.provider || 'Fizetési QR-kód')}</div>
        <h3>${escapeHtml(state.paymentQrPreview.title || 'QR-kód')}</h3>
        ${state.paymentQrPreview.subtitle ? `<div class="small muted">${escapeHtml(state.paymentQrPreview.subtitle)}</div>` : ''}
        ${
          state.paymentQrPreview.paymentSummary
            ? `
              <div class="payment-qr-finance-summary">
                <div class="payment-qr-finance-amount">${escapeHtml(formatMoney(state.paymentQrPreview.paymentSummary.dueNowAmount || 0))}</div>
                <div class="small muted">Most rendezendő összeg</div>
                <div class="payment-qr-finance-grid">
                  <div class="detail-box">
                    <div class="detail-label">Esemény díja</div>
                    <div class="detail-value">${escapeHtml(formatMoney(state.paymentQrPreview.paymentSummary.eventAmount || 0))}</div>
                  </div>
                  <div class="detail-box">
                    <div class="detail-label">${escapeHtml(state.paymentQrPreview.paymentSummary.carryLabel || 'Áthozott egyenleg')}</div>
                    <div class="detail-value">${escapeHtml(formatMoney(state.paymentQrPreview.paymentSummary.carryAmount || 0))}</div>
                  </div>
                </div>
                <div class="small muted top-space">${escapeHtml(state.paymentQrPreview.paymentSummary.note || '')}</div>
              </div>
            `
            : ''
        }
        <img class="payment-qr-image-large" src="${escapeHtml(state.paymentQrPreview.qrDataUrl)}" alt="Fizetési QR-kód" />
        ${state.paymentQrPreview.username ? `<div class="payment-qr-username">${escapeHtml(state.paymentQrPreview.username)}</div>` : ''}
        <div class="small muted">Nyisd meg nagyban, és olvasd be a telefonoddal.</div>
      </div>
    </div>
  `;

  if (existing) {
    existing.outerHTML = markup;
    return;
  }

  document.body.insertAdjacentHTML('beforeend', markup);
}

function buildPresetAvatarDataUrl(presetId, labelText) {
  const preset = PROFILE_AVATAR_PRESETS.find(item => item.id === presetId) || PROFILE_AVATAR_PRESETS[0];
  const initials = String(labelText || 'F')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase() || 'F';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${preset.colors[0]}" />
          <stop offset="100%" stop-color="${preset.colors[1]}" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" rx="72" fill="url(#bg)" />
      <circle cx="232" cy="70" r="26" fill="rgba(255,255,255,0.18)" />
      <path d="M46 230c28-38 74-57 137-57 23 0 49 3 79 9" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="10" stroke-linecap="round"/>
      <text x="150" y="168" font-size="104" font-weight="700" text-anchor="middle" fill="white" font-family="Segoe UI, Arial, sans-serif">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getAvatarPreview(user = state.user) {
  if (user?.avatar_data_url) return user.avatar_data_url;
  return buildPresetAvatarDataUrl('grass', getDisplayName(user));
}

const EVENT_PRICING_MODES = Object.freeze({
  FREE: 'free',
  FIXED: 'fixed_per_person',
  SPLIT: 'split_total_cost'
});

const EVENT_FEE_VALUES = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

function ensureEventPricingUi() {
  const createForm = els.createEventForm;
  const editForm = els.editEventForm;

  if (createForm && !document.getElementById('eventPricingMode')) {
    const pricingBlock = document.createElement('div');
    pricingBlock.className = 'pricing-block';
    pricingBlock.innerHTML = `
      <div class="pricing-box">
        <div class="small muted">Kassza</div>
        <div class="grid two-col inner-grid top-space">
          <div>
            <label class="label" for="eventPricingMode">Díjszámítás módja</label>
            <select id="eventPricingMode">
              <option value="free">Ingyenes</option>
              <option value="fixed_per_person">Fix fejpénz</option>
              <option value="split_total_cost">Pályadíj osztása</option>
            </select>
          </div>
          <div>
            <label class="label" for="eventPerPlayerFee">Alapdíj / fő</label>
            <select id="eventPerPlayerFee">
              ${EVENT_FEE_VALUES.map(value => `<option value="${value}">${value} Ft</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="eventFixedPriceWrap" class="top-space">
          <label class="label" for="eventFixedPricePerPerson">Fix fejpénz / fő</label>
          <input id="eventFixedPricePerPerson" type="number" min="0" step="1" placeholder="pl. 1250" />
        </div>
        <div id="eventTotalCostWrap" class="top-space hidden">
          <label class="label" for="eventTotalEventCost">Teljes pályadíj</label>
          <input id="eventTotalEventCost" type="number" min="0" step="1" placeholder="pl. 20000" />
        </div>
        <div class="grid two-col inner-grid top-space">
          <div>
            <label class="label" for="eventPaymentLinkProvider">Fizetési link szolgáltató</label>
            <select id="eventPaymentLinkProvider">
              <option value="">Nincs külön fizetési link</option>
              <option value="revolut">Revolut</option>
              <option value="wise">Wise</option>
            </select>
          </div>
          <div>
            <label class="label" for="eventPaymentLinkUrl">Esemény fizetési linkje</label>
            <input id="eventPaymentLinkUrl" type="url" inputmode="url" placeholder="https://..." />
          </div>
        </div>
        <div class="small muted top-space">Ide a csapatkapitány által az esemény összegére előkészített Revolut vagy Wise kérő link kerülhet.</div>
      </div>
    `;
    const rulesBlock = document.getElementById('eventRulesText')?.closest('div');
    if (rulesBlock) {
      rulesBlock.insertAdjacentElement('afterend', pricingBlock);
    } else {
      createForm.appendChild(pricingBlock);
    }

    const recurringBox = createForm.querySelector('.recurring-box');
    if (recurringBox) {
      pricingBlock.insertAdjacentElement('afterend', recurringBox);
    }
  }

  if (editForm && !document.getElementById('editPricingMode')) {
    const pricingBlock = document.createElement('div');
    pricingBlock.className = 'pricing-block';
    pricingBlock.innerHTML = `
      <div class="pricing-box">
        <div class="small muted">Kassza</div>
        <div class="grid two-col inner-grid top-space">
          <div>
            <label class="label" for="editPricingMode">Díjszámítás módja</label>
            <select id="editPricingMode">
              <option value="free">Ingyenes</option>
              <option value="fixed_per_person">Fix fejpénz</option>
              <option value="split_total_cost">Pályadíj osztása</option>
            </select>
          </div>
          <div>
            <label class="label" for="editPerPlayerFee">Alapdíj / fő</label>
            <select id="editPerPlayerFee">
              ${EVENT_FEE_VALUES.map(value => `<option value="${value}">${value} Ft</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="editFixedPriceWrap" class="top-space">
          <label class="label" for="editFixedPricePerPerson">Fix fejpénz / fő</label>
          <input id="editFixedPricePerPerson" type="number" min="0" step="1" placeholder="pl. 1250" />
        </div>
        <div id="editTotalCostWrap" class="top-space hidden">
          <label class="label" for="editTotalEventCost">Teljes pályadíj</label>
          <input id="editTotalEventCost" type="number" min="0" step="1" placeholder="pl. 20000" />
        </div>
        <div class="grid two-col inner-grid top-space">
          <div>
            <label class="label" for="editPaymentLinkProvider">Fizetési link szolgáltató</label>
            <select id="editPaymentLinkProvider">
              <option value="">Nincs külön fizetési link</option>
              <option value="revolut">Revolut</option>
              <option value="wise">Wise</option>
            </select>
          </div>
          <div>
            <label class="label" for="editPaymentLinkUrl">Esemény fizetési linkje</label>
            <input id="editPaymentLinkUrl" type="url" inputmode="url" placeholder="https://..." />
          </div>
        </div>
        <div class="small muted top-space">Ide a csapatkapitány által az esemény összegére előkészített Revolut vagy Wise kérő link kerülhet.</div>
      </div>
    `;
    const rulesBlock = document.getElementById('editRulesText')?.closest('div');
    if (rulesBlock) {
      rulesBlock.insertAdjacentElement('afterend', pricingBlock);
    } else {
      editForm.appendChild(pricingBlock);
    }
  }

  syncPricingModeUi('event');
  syncPricingModeUi('edit');
  enhanceRecurringCreateUi();
  ensureUnifiedAdminEventFormUi();
}

function enhanceRecurringCreateUi() {
  const recurringBox = els.createEventForm?.querySelector('.recurring-box');
  if (!recurringBox) return;

  const toggleInput = recurringBox.querySelector('#isRecurringToggle');
  if (!toggleInput) return;

  const existingLabel = recurringBox.querySelector('.recurring-toggle-line');
  if (existingLabel && !existingLabel.classList.contains('module-switch')) {
    existingLabel.className = 'module-switch recurring-toggle-line';
    existingLabel.setAttribute('for', 'isRecurringToggle');
    existingLabel.innerHTML = `
      <span>
        <span class="module-switch-label">Ismétlődő eseménysorozat</span>
        <span class="module-switch-description">Ha bekapcsolod, az egyszeri esemény helyett eseménysorozat jön létre.</span>
      </span>
      <span class="module-switch-control">
        <input id="isRecurringToggle" type="checkbox" ${toggleInput.checked ? 'checked' : ''} />
        <span class="module-switch-track" aria-hidden="true"></span>
      </span>
    `;
  }

  const recurringNote = recurringBox.querySelector('.recurring-note');
  recurringNote?.remove();
  els.recurringToggle = document.getElementById('isRecurringToggle');
  els.recurringOptions = document.getElementById('recurringOptions');
}

function ensureUnifiedAdminEventFormUi() {
  const createCard = els.createEventForm?.closest('.card');
  if (!createCard || !els.createEventForm) return;

  const createHeading = createCard.querySelector('h2');
  if (createHeading) {
    createHeading.textContent = 'Esemény létrehozás / szerkesztése';
  }

  if (!document.getElementById('adminEventFormMeta')) {
    const note = createCard.querySelector('.section-note');
    const meta = document.createElement('div');
    meta.id = 'adminEventFormMeta';
    meta.className = 'event-form-mode-note small muted top-space';
    meta.textContent = 'Új esemény mód. Ha a listában a Szerkesztés gombra kattintasz, ez az űrlap töltődik fel.';
    if (note) {
      note.insertAdjacentElement('afterend', meta);
    } else {
      els.createEventForm.prepend(meta);
    }
  }

  if (!document.getElementById('eventSubstitutesEnabled')) {
    const substitutesInput = document.getElementById('eventSubstitutes');
    const substitutesGroup = substitutesInput?.closest('div');
    if (substitutesGroup) {
      const switchWrap = document.createElement('div');
      switchWrap.className = 'top-space';
      switchWrap.innerHTML = `
        <label class="module-switch" for="eventSubstitutesEnabled">
          <span>
            <span class="module-switch-label">Csere engedélyezett</span>
            <span class="module-switch-description">Kapcsold be, ha a pályán lévőkön felül cserékkel is számolsz.</span>
          </span>
          <span class="module-switch-control">
            <input id="eventSubstitutesEnabled" type="checkbox" />
            <span class="module-switch-track" aria-hidden="true"></span>
          </span>
        </label>
      `;
      substitutesGroup.parentElement?.insertAdjacentElement('afterend', switchWrap);
    }
  }

  if (!document.getElementById('adminEventCancelEditBtn')) {
    const submitButton = els.createEventForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.id = 'adminEventSubmitBtn';
      const toolbar = document.createElement('div');
      toolbar.className = 'row gap wrap top-space';
      toolbar.innerHTML = `
        <button id="adminEventNextStepBtn" class="btn btn-secondary" type="button">Tovább</button>
        <button id="adminEventCancelEditBtn" class="btn btn-secondary hidden" type="button">Új esemény mód</button>
      `;
      submitButton.insertAdjacentElement('afterend', toolbar);
    }
  }

  if (!document.getElementById('eventHiddenFromAdminList')) {
    const toolbar = document.getElementById('adminEventCancelEditBtn')?.parentElement;
    const hiddenToggleWrap = document.createElement('div');
    hiddenToggleWrap.className = 'top-space';
    hiddenToggleWrap.innerHTML = `
      <label class="module-switch" for="eventHiddenFromAdminList">
        <span>
          <span class="module-switch-label">Elrejtés a fő listából</span>
          <span class="module-switch-description">Ha bekapcsolod, az esemény eltűnik az admin fő listából, amikor a rejtett elemek elrejtése aktív.</span>
        </span>
        <span class="module-switch-control">
          <input id="eventHiddenFromAdminList" type="checkbox" />
          <span class="module-switch-track" aria-hidden="true"></span>
        </span>
      </label>
    `;
    if (toolbar) {
      toolbar.insertAdjacentElement('beforebegin', hiddenToggleWrap);
    } else {
      els.createEventForm.appendChild(hiddenToggleWrap);
    }
  }

  ensureAdminEventFormSections();
  els.editEventForm?.closest('.card')?.classList.add('hidden');
  syncCreateSubstitutesUi();
  syncUnifiedAdminEventFormMode();
}

function getAdminEventFormSectionButtons() {
  return [...document.querySelectorAll('[data-admin-event-form-section]')];
}

function getAdminEventFormPanels() {
  return [...document.querySelectorAll('[data-admin-event-form-panel]')];
}

function getNextAdminEventFormSection(section = state.adminEventFormSection || 'basics') {
  if (section === 'basics') return 'logistics';
  if (section === 'logistics') return 'extras';
  return '';
}

function getAdminEventFormSectionLabel(section) {
  if (section === 'basics') return 'Alapok';
  if (section === 'logistics') return 'Létszám és pálya';
  if (section === 'extras') return 'Speciális beállítások';
  return '';
}

function getAdminEventFormStepState() {
  const title = document.getElementById('eventTitle')?.value?.trim() || '';
  const startAt = document.getElementById('eventStartAt')?.value?.trim() || '';
  const location = document.getElementById('eventLocation')?.value?.trim() || '';
  const minPlayers = Number(document.getElementById('eventMinPlayers')?.value || 0);
  const playersOnField = Number(document.getElementById('eventPlayersOnField')?.value || 0);
  const rulesText = document.getElementById('eventRulesText')?.value?.trim() || '';
  const pricingMode = document.getElementById('eventPricingMode')?.value || EVENT_PRICING_MODES.FREE;
  const paymentLinkProvider = document.getElementById('eventPaymentLinkProvider')?.value || '';
  const paymentLinkUrl = document.getElementById('eventPaymentLinkUrl')?.value?.trim() || '';
  const hidden = document.getElementById('eventHiddenFromAdminList')?.checked === true;
  const recurring = els.recurringToggle?.checked === true;
  const hasNotifications = [...document.querySelectorAll('[data-notification-pref]')].some(control => control.checked);

  const basicsDone = Boolean(title && isValidDateTimeLocalInput(startAt) && location);
  const logisticsDone = minPlayers > 0 && playersOnField > 0 && Boolean(rulesText);
  const extrasDone = pricingMode !== EVENT_PRICING_MODES.FREE || hidden || recurring || hasNotifications || Boolean(paymentLinkProvider || paymentLinkUrl);

  return {
    basicsDone,
    logisticsDone,
    extrasDone,
    completedCount: [basicsDone, logisticsDone, extrasDone].filter(Boolean).length
  };
}

function syncAdminEventFormProgress() {
  const nav = document.getElementById('adminEventFormSectionNav');
  if (!nav) return;

  const summary = document.getElementById('adminEventFormProgressSummary');
  const stateSummary = getAdminEventFormStepState();
  const currentSection = state.adminEventFormSection || 'basics';
  const isManageablePastEvent = state.adminEventFormMode === 'edit' && canManageAttendanceForEvent(state.selectedAdminEvent);

  getAdminEventFormSectionButtons().forEach(button => {
    const section = button.dataset.adminEventFormSection;
    const done =
      (section === 'basics' && stateSummary.basicsDone) ||
      (section === 'logistics' && stateSummary.logisticsDone) ||
      (section === 'extras' && stateSummary.extrasDone);
    button.classList.toggle('is-done', done);
  });

  if (summary) {
    const nextMissingSection =
      !stateSummary.basicsDone ? 'basics' :
      !stateSummary.logisticsDone ? 'logistics' :
      !stateSummary.extrasDone ? 'extras' :
      '';
    const nextMissingLabel = getAdminEventFormSectionLabel(nextMissingSection);
    summary.innerHTML = isManageablePastEvent
      ? `
        <div class="small muted">
          Ez az esemény már megvalósult. Itt inkább ellenőrzés és elszámolási átvezetés történik, nem új létrehozási flow.
        </div>
      `
      : `
        <div class="row between align-center wrap gap">
          <strong>Lépéskövető</strong>
          <span class="badge badge-muted">${escapeHtml(String(stateSummary.completedCount))}/3 kész</span>
        </div>
        <div class="small muted top-space">
          ${nextMissingLabel
            ? `Most a(z) ${nextMissingLabel.toLowerCase()} blokk a következő fontos lépés.`
            : 'Mindhárom blokk kapott tartalmat, mehet a végső ellenőrzés és a mentés.'}
        </div>
        <div class="small muted">
          Aktuális oldal: ${escapeHtml(getAdminEventFormSectionLabel(currentSection) || 'Alapok')}
        </div>
      `;
  }
}

function syncAdminEventFormStepActions() {
  const nextButton = document.getElementById('adminEventNextStepBtn');
  const submitButton = document.getElementById('adminEventSubmitBtn');
  if (!nextButton && !submitButton) return;

  const currentSection = state.adminEventFormSection || 'basics';
  const nextSection = getNextAdminEventFormSection(currentSection);
  const nextLabel = getAdminEventFormSectionLabel(nextSection);
  const isManageablePastEvent = state.adminEventFormMode === 'edit' && canManageAttendanceForEvent(state.selectedAdminEvent);

  if (nextButton) {
    const showNextButton = Boolean(nextSection) && !isManageablePastEvent;
    nextButton.classList.toggle('hidden', !showNextButton);
    nextButton.disabled = !showNextButton;
    nextButton.dataset.adminEventNextSection = nextSection || '';
    nextButton.textContent = nextLabel ? `Tovább: ${nextLabel}` : 'Tovább';
  }

  if (submitButton) {
    const showSubmitButton = currentSection === 'extras' && !isManageablePastEvent;
    submitButton.classList.toggle('hidden', !showSubmitButton);
    submitButton.disabled = !showSubmitButton;
  }

  syncAdminEventFormProgress();
}

function setAdminEventFormSection(section = 'basics') {
  const nextSection = ['basics', 'logistics', 'extras'].includes(section)
    ? section
    : 'basics';
  state.adminEventFormSection = nextSection;

  getAdminEventFormSectionButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.adminEventFormSection === nextSection);
  });

  getAdminEventFormPanels().forEach(panel => {
    const isActive = panel.dataset.adminEventFormPanel === nextSection;
    panel.classList.toggle('hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
  });

  syncAdminEventFormStepActions();
}

function getSuggestedAdminEventFormSection(event = null, options = {}) {
  const formMode = options.formMode || state.adminEventFormMode || 'create';

  if (formMode === 'create' || !event) {
    return 'basics';
  }

  const hasBasicsGap = !String(event.title || '').trim()
    || !String(event.start_at || '').trim()
    || !String(event.location_name || '').trim();
  if (hasBasicsGap) {
    return 'basics';
  }

  const hasLogisticsGap = !Number(event.min_players || 0)
    || !Number(event.players_on_field_total || 0)
    || !String(event.rules_text || '').trim();
  if (hasLogisticsGap) {
    return 'logistics';
  }

  const usesExtraSettings = event.pricing_mode && event.pricing_mode !== EVENT_PRICING_MODES.FREE
    || Number(event.per_player_fee || 0) > 0
    || Number(event.fixed_price_per_person || event.price_per_player || 0) > 0
    || Number(event.total_event_cost || 0) > 0
    || event.hidden_from_admin_list === true
    || event.recurring_enabled === true
    || event.recurrence_type
    || event.status === 'finished';
  if (usesExtraSettings) {
    return 'extras';
  }

  return event.status === 'published' ? 'basics' : 'logistics';
}

function ensureAdminEventFormSections() {
  const form = els.createEventForm;
  if (!form) return;

  if (!document.getElementById('adminEventFormSectionNav')) {
    const meta = document.getElementById('adminEventFormMeta');
    const nav = document.createElement('div');
    nav.id = 'adminEventFormSectionNav';
    nav.className = 'admin-subnav-card event-form-subnav-card top-space';
    nav.innerHTML = `
      <div id="adminEventFormProgressSummary" class="event-form-progress-summary bottom-space"></div>
      <div class="admin-subnav event-form-subnav">
        <button class="subnav-btn active" type="button" data-admin-event-form-section="basics">1. Alapok</button>
        <button class="subnav-btn" type="button" data-admin-event-form-section="logistics">2. Létszám és pálya</button>
        <button class="subnav-btn" type="button" data-admin-event-form-section="extras">3. Speciális beállítások</button>
      </div>
    `;
    if (meta) {
      meta.insertAdjacentElement('afterend', nav);
    } else {
      form.prepend(nav);
    }
  }

  const ensurePanel = (key, title, description) => {
    let panel = form.querySelector(`[data-admin-event-form-panel="${key}"]`);
    if (!panel) {
      panel = document.createElement('section');
      panel.dataset.adminEventFormPanel = key;
      panel.className = `event-form-panel stack top-space${key === 'basics' ? '' : ' hidden'}`;
      if (key !== 'basics') {
        panel.hidden = true;
      }
      panel.innerHTML = `
        <div class="event-card admin-workspace-guide compact event-form-guide">
          <div class="row between align-center wrap gap">
            <strong>${escapeHtml(title)}</strong>
            <span class="badge badge-muted">aktualis blokk</span>
          </div>
          <div class="small muted top-space">${escapeHtml(description)}</div>
        </div>
        <div class="stack event-form-panel-body"></div>
      `;
      const submitButton = document.getElementById('adminEventSubmitBtn');
      if (submitButton) {
        submitButton.insertAdjacentElement('beforebegin', panel);
      } else {
        form.appendChild(panel);
      }
    }
    return panel.querySelector('.event-form-panel-body');
  };

  const panelMap = {
    basics: ensurePanel('basics', 'Alapok', 'Itt add meg, mi az esemény, mikor kezdődik, és milyen alap státusszal induljon.'),
    logistics: ensurePanel('logistics', 'Létszám és pálya', 'Ebben a blokkban a létszám, a cserék és a játékszabályok kapnak fókuszt.'),
    extras: ensurePanel('extras', 'Speciális beállítások', 'Itt már a kassza, az ismétlődés, az értesítések és a haladó opciók maradnak.')
  };

  const moveToPanel = (element, section) => {
    if (!element || !panelMap[section] || element.closest('[data-admin-event-form-panel]')) return;
    panelMap[section].appendChild(element);
  };

  moveToPanel(document.getElementById('eventTitle')?.closest('.grid'), 'basics');
  moveToPanel(document.getElementById('eventDescription')?.closest('div'), 'basics');
  moveToPanel(document.getElementById('eventStartAt')?.closest('.grid'), 'basics');

  moveToPanel(document.getElementById('eventMinPlayers')?.closest('.grid'), 'logistics');
  moveToPanel(document.getElementById('eventSubstitutesEnabled')?.closest('.top-space'), 'logistics');
  moveToPanel(document.getElementById('eventRulesText')?.closest('div'), 'logistics');

  moveToPanel(document.getElementById('eventPricingMode')?.closest('.pricing-block'), 'extras');
  moveToPanel(form.querySelector('.recurring-box'), 'extras');
  moveToPanel(form.querySelector('.notification-collapse'), 'extras');
  moveToPanel(document.getElementById('eventHiddenFromAdminList')?.closest('.top-space'), 'extras');

  setAdminEventFormSection(state.adminEventFormSection || 'basics');
  syncAdminEventFormProgress();
}

function syncCreateSubstitutesUi() {
  const enabledInput = document.getElementById('eventSubstitutesEnabled');
  const countInput = document.getElementById('eventSubstitutes');
  const countGroup = countInput?.closest('div');
  if (!enabledInput || !countInput) return;

  const enabled = enabledInput.checked;
  countInput.disabled = !enabled;
  if (!enabled) {
    countInput.value = 0;
  } else if (!Number(countInput.value)) {
    countInput.value = 1;
  }
  countGroup?.classList.toggle('is-readonly-field', !enabled);
}

function syncAdminHideHiddenEventsPreference() {
  const toggle = document.getElementById('adminHideHiddenEventsToggle');
  if (!toggle) return;
  state.adminHideHiddenEvents = toggle.checked;
  localStorage.setItem('foci_admin_hide_hidden_events', String(state.adminHideHiddenEvents));
  renderAdminEvents(state.adminEvents || []);
}

function setAdminEventFormMode(mode, eventData = null) {
  state.adminEventFormMode = mode;
  state.adminEditingEventId = mode === 'edit' ? eventData?.id || state.selectedAdminEvent?.id || null : null;

  if (mode === 'edit' && eventData) {
    populateUnifiedAdminEventForm(eventData);
  } else if (mode === 'create') {
    resetUnifiedAdminEventForm();
  }

  syncUnifiedAdminEventFormMode();
}

function resetUnifiedAdminEventForm() {
  if (!els.createEventForm) return;

  els.createEventForm.reset();
  document.getElementById('eventMinPlayers').value = 10;
  document.getElementById('eventPlayersOnField').value = 10;
  document.getElementById('eventSubstitutes').value = 0;
  document.getElementById('eventStatus').value = 'published';
  document.getElementById('eventPricingMode').value = EVENT_PRICING_MODES.FREE;
  document.getElementById('eventPerPlayerFee').value = '0';
  document.getElementById('eventFixedPricePerPerson').value = '';
  document.getElementById('eventTotalEventCost').value = '';
  document.getElementById('eventPaymentLinkProvider').value = '';
  document.getElementById('eventPaymentLinkUrl').value = '';
  const substitutesEnabledInput = document.getElementById('eventSubstitutesEnabled');
  if (substitutesEnabledInput) {
    substitutesEnabledInput.checked = false;
  }
  const hiddenInput = document.getElementById('eventHiddenFromAdminList');
  if (hiddenInput) {
    hiddenInput.checked = false;
  }
  syncCreateSubstitutesUi();
  syncPricingModeUi('event');
  resetRecurringCreateUi();
  state.adminEditingEventId = null;
  setAdminEventFormSection(getSuggestedAdminEventFormSection(null, { formMode: 'create' }));
}

function populateUnifiedAdminEventForm(event) {
  document.getElementById('eventTitle').value = event.title || '';
  document.getElementById('eventDescription').value = event.description || '';
  document.getElementById('eventStartAt').value = toDateTimeLocalInput(event.start_at);
  document.getElementById('eventLocation').value = event.location_name || '';
  document.getElementById('eventMinPlayers').value = event.min_players ?? '';
  document.getElementById('eventPlayersOnField').value = event.players_on_field_total ?? '';
  document.getElementById('eventRulesText').value = event.rules_text || '';
  document.getElementById('eventStatus').value = event.status || 'published';
  document.getElementById('eventPricingMode').value = event.pricing_mode || EVENT_PRICING_MODES.FREE;
  document.getElementById('eventPerPlayerFee').value = String(event.per_player_fee ?? 0);
  document.getElementById('eventFixedPricePerPerson').value = event.fixed_price_per_person ?? event.price_per_player ?? '';
  document.getElementById('eventTotalEventCost').value = event.total_event_cost ?? '';
  document.getElementById('eventPaymentLinkProvider').value = event.payment_link_provider || '';
  document.getElementById('eventPaymentLinkUrl').value = event.payment_link_url || '';
  document.getElementById('eventSubstitutes').value = event.substitutes_count ?? 0;
  const hiddenInput = document.getElementById('eventHiddenFromAdminList');
  if (hiddenInput) {
    hiddenInput.checked = event.hidden_from_admin_list === true;
  }
  const substitutesEnabledInput = document.getElementById('eventSubstitutesEnabled');
  if (substitutesEnabledInput) {
    substitutesEnabledInput.checked = Boolean(event.substitutes_enabled);
  }
  syncCreateSubstitutesUi();
  syncPricingModeUi('event');
  setAdminEventFormSection(getSuggestedAdminEventFormSection(event, { formMode: 'edit' }));
}

function setFieldReadOnlyState(control, disabled) {
  if (!control) return;
  control.disabled = disabled;
  control.closest('div, label, details')?.classList.toggle('is-readonly-field', disabled);
}

function syncUnifiedAdminEventFormMode() {
  const createCard = els.createEventForm?.closest('.card');
  if (!createCard || !els.createEventForm) return;

  const eventsWorkspace = buildAdminEventsWorkspaceState();
  const isEditMode = state.adminEventFormMode === 'edit';
  const selectedEvent = state.selectedAdminEvent || null;
  const isManageablePastEvent = isEditMode && canManageAttendanceForEvent(selectedEvent);
  const isDraftEdit = isEditMode && selectedEvent?.status === 'draft';
  const title = createCard.querySelector('h2');
  const submitBtn = document.getElementById('adminEventSubmitBtn');
  const cancelBtn = document.getElementById('adminEventCancelEditBtn');
  const meta = document.getElementById('adminEventFormMeta');
  const recurringBox = els.createEventForm.querySelector('.recurring-box');
  const notificationBlock = els.createEventForm.querySelector('.notification-collapse');
  const publishedEvent = isEditMode && selectedEvent?.status === 'published';
  const hardLockedForPublished = [
    document.getElementById('eventMinPlayers'),
    document.getElementById('eventPlayersOnField'),
    document.getElementById('eventSubstitutesEnabled'),
    document.getElementById('eventSubstitutes'),
    document.getElementById('eventPricingMode')
  ];

  if (title) {
    title.textContent = isManageablePastEvent
      ? 'Megvalósult esemény ellenőrzése'
      : 'Esemény létrehozás / szerkesztése';
  }
  if (submitBtn) {
    submitBtn.textContent = isDraftEdit
      ? 'Piszkozat mentése'
      : isEditMode
        ? 'Esemény mentése'
        : 'Esemény létrehozása';
  }
  if (cancelBtn) {
    cancelBtn.classList.toggle('hidden', !isEditMode);
  }
  if (meta) {
    meta.innerHTML = isEditMode && selectedEvent
      ? `<strong>${escapeHtml(isManageablePastEvent ? 'Megvalósult esemény:' : isDraftEdit ? 'Piszkozat szerkesztése:' : 'Szerkesztési mód:')}</strong> ${escapeHtml(selectedEvent.title || 'Névtelen esemény')} <span class="small muted">· ID: ${escapeHtml(selectedEvent.id || '-')}</span>`
      : 'Új esemény mód. Ha a listában a Szerkesztés gombra kattintasz, ez az űrlap töltődik fel.';
  }

  if (els.selectedEventMeta) {
    const focusEvent = getAdminFocusEvent();
    const focusEventAttendancePanel = canManageAttendanceForEvent(focusEvent)
      ? `
        <div class="top-space">
          ${renderAdminAttendanceManager()}
        </div>
      `
      : '';
    els.selectedEventMeta.innerHTML = isEditMode && selectedEvent
      ? `
        <div class="event-card admin-workspace-guide">
          <div class="row between align-center wrap gap">
            <strong>${escapeHtml(
              isManageablePastEvent
                ? 'Ez az esemény már megvalósult.'
                : isDraftEdit
                  ? 'Most egy piszkozat eseményt készítesz elő.'
                  : 'Most ezt az eseményt szerkeszted'
            )}</strong>
            <span class="badge ${escapeHtml(
              isManageablePastEvent
                ? 'badge-warning'
                : isDraftEdit
                  ? 'badge-draft'
                  : 'badge-warning'
            )}">${escapeHtml(
              isManageablePastEvent
                ? 'utómunka'
                : isDraftEdit
                  ? 'publikálás előtt'
                  : 'aktív szerkesztés'
            )}</span>
          </div>
          <div class="small muted top-space">
            ${escapeHtml(selectedEvent.title || 'Névtelen esemény')} · ${escapeHtml(formatDateTime(selectedEvent.start_at))}
          </div>
          <div class="small muted">
            ${escapeHtml(
              isManageablePastEvent
                ? 'Itt már nem az esemény létrehozása a lényeg, hanem a jelenlét, a no-show és a befizetések rendezése.'
                : isDraftEdit
                  ? 'A piszkozat mentése után a következő fontos lépés a publikálás lesz, hogy a jelentkezés megnyíljon.'
                  : eventsWorkspace.nextAction.description
            )}
          </div>
          <div class="row gap wrap top-space">
            <button class="btn btn-ghost" type="button" data-admin-reset-event-form="true">Új esemény mód</button>
            ${
              isManageablePastEvent
                ? '<button class="btn btn-secondary" type="button" data-admin-workspace-jump="finance">Elszámolás megnyitása</button>'
                : isDraftEdit
                  ? `<button class="btn btn-secondary" type="button" data-admin-inline-status="published" data-event-id="${escapeHtml(selectedEvent.id)}">Publikálás most</button>`
                  : '<button class="btn btn-secondary" type="button" data-admin-events-section="upcoming">Közelgő lista</button>'
            }
          </div>
        </div>
        ${focusEventAttendancePanel}
      `
      : `
        <div class="event-card admin-workspace-guide">
          <div class="row between align-center wrap gap">
            <strong>${escapeHtml(eventsWorkspace.nextAction.title)}</strong>
            <span class="badge ${escapeHtml(eventsWorkspace.nextAction.badgeClass)}">${escapeHtml(eventsWorkspace.nextAction.badgeText)}</span>
          </div>
          <div class="small muted top-space">
            ${escapeHtml(eventsWorkspace.nextAction.description)}
          </div>
          <div class="row gap wrap top-space">
            <button class="btn btn-secondary" type="button" data-admin-events-section="upcoming">Közelgő események</button>
            <button class="btn btn-ghost" type="button" data-admin-events-section="closed">Megvalósult események</button>
          </div>
        </div>
        ${focusEventAttendancePanel}
      `;
  }

  setFieldReadOnlyState(document.getElementById('eventStatus'), isEditMode);
  createCard.classList.toggle('is-readonly-field', isManageablePastEvent);
  recurringBox?.classList.toggle('is-readonly-field', isEditMode);
  notificationBlock?.classList.toggle('is-readonly-field', isEditMode);

  [
    els.recurringToggle,
    els.recurrenceType,
    els.seriesEndType,
    els.seriesOccurrenceCount,
    els.seriesUntilDate
  ].forEach(control => setFieldReadOnlyState(control, isEditMode));

  document.querySelectorAll('[data-notification-pref]').forEach(control => {
    setFieldReadOnlyState(control, isEditMode);
    control.closest('[data-notification-pref-card]')?.classList.toggle('is-readonly-field', isEditMode);
  });

  syncAdminEventFormStepActions();

  hardLockedForPublished.forEach(control => setFieldReadOnlyState(control, publishedEvent));
}

function syncPricingModeUi(prefix) {
  const mode = document.getElementById(`${prefix}PricingMode`)?.value || EVENT_PRICING_MODES.FREE;
  const fixedWrap = document.getElementById(`${prefix}FixedPriceWrap`);
  const totalWrap = document.getElementById(`${prefix}TotalCostWrap`);
  if (fixedWrap) fixedWrap.classList.toggle('hidden', mode !== EVENT_PRICING_MODES.FIXED);
  if (totalWrap) totalWrap.classList.toggle('hidden', mode !== EVENT_PRICING_MODES.SPLIT);
}

function readPricingPayload(prefix) {
  const pricingMode = document.getElementById(`${prefix}PricingMode`)?.value || EVENT_PRICING_MODES.FREE;
  return {
    pricingMode,
    fixedPricePerPerson:
      pricingMode === EVENT_PRICING_MODES.FIXED
        ? Number(document.getElementById(`${prefix}FixedPricePerPerson`)?.value || 0)
        : null,
    totalEventCost:
      pricingMode === EVENT_PRICING_MODES.SPLIT
        ? Number(document.getElementById(`${prefix}TotalEventCost`)?.value || 0)
        : null,
    perPlayerFee: Number(document.getElementById(`${prefix}PerPlayerFee`)?.value || 0),
    paymentLinkProvider: document.getElementById(`${prefix}PaymentLinkProvider`)?.value || null,
    paymentLinkUrl: document.getElementById(`${prefix}PaymentLinkUrl`)?.value?.trim() || null
  };
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toLocaleString('hu-HU')} Ft`;
}

function formatSignedMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toLocaleString('hu-HU')} Ft`;
}

function getPaymentSummaryObject(source) {
  if (!source) return null;
  if (source.payment_summary) return source.payment_summary;
  if (source.paymentSummary) return source.paymentSummary;
  if (
    source.final_amount_per_person != null
    || source.base_amount_per_person != null
    || source.per_player_fee != null
  ) {
    return source;
  }
  return null;
}

function buildUserEventPaymentProjection(payment, financeOverview = state.currentTeamFinance) {
  const eventAmount = Number(payment?.final_amount_per_person || 0);
  const currentBalance = Number(financeOverview?.current_balance_amount || 0);
  const debtCarry = Math.max(-currentBalance, 0);
  const creditCarry = Math.max(currentBalance, 0);
  const projectedDue = Math.max(eventAmount + debtCarry - creditCarry, 0);

  return {
    eventAmount,
    debtCarry,
    creditCarry,
    projectedDue
  };
}

function renderUserPaymentSummary(source, { forceVisible = false, financeOverview = state.currentTeamFinance } = {}) {
  const payment = getPaymentSummaryObject(source);
  if (!payment) return '';
  if (!forceVisible && payment.is_visible_to_user !== true) return '';
  const projection = buildUserEventPaymentProjection(payment, financeOverview);

  return `
    <div class="payment-summary-box">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Most rendezendő</div>
          <div class="payment-summary-amount">${escapeHtml(formatMoney(projection.projectedDue))}</div>
        </div>
        ${renderFinanceBalanceBadge(Number(financeOverview?.current_balance_amount || 0))}
      </div>
      <div class="grid three-col inner-grid top-space payment-summary-grid">
        <div class="detail-box">
          <div class="detail-label">Esemény díja</div>
          <div class="detail-value">${escapeHtml(formatMoney(projection.eventAmount))}</div>
        </div>
        <div class="detail-box ${projection.debtCarry > 0 ? 'finance-carry-box is-debt' : projection.creditCarry > 0 ? 'finance-carry-box is-credit' : 'finance-carry-box'}">
          <div class="detail-label">${projection.debtCarry > 0 ? 'Áthozott tartozás' : projection.creditCarry > 0 ? 'Levonható előleg' : 'Áthozott egyenleg'}</div>
          <div class="detail-value">${escapeHtml(formatMoney(projection.debtCarry > 0 ? projection.debtCarry : projection.creditCarry))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Ebből most fizetendő</div>
          <div class="detail-value">${escapeHtml(formatMoney(projection.projectedDue))}</div>
        </div>
      </div>
      <div class="small muted top-space">
        ${
          projection.debtCarry > 0
            ? `Az esemény díjához hozzáadódik a korábbi ${escapeHtml(formatMoney(projection.debtCarry))} tartozásod.`
            : projection.creditCarry > 0
              ? `Az esemény díjából levonjuk a korábbi ${escapeHtml(formatMoney(projection.creditCarry))} előlegedet.`
              : 'Most nincs áthozott tartozásod vagy előleged, ezért a teljes eseménydíj rendezendő.'
        }
      </div>
    </div>
  `;
}

function renderRankRegistrationNotice(registrationWindow, { compact = false, currentStatus = null } = {}) {
  const isRankWaiting = currentStatus === 'waiting_list_rank';
  if ((!registrationWindow?.isRestrictedByRank || registrationWindow.isOpen) && !isRankWaiting) {
    return '';
  }

  const offsetHours = Number(registrationWindow.offsetHours || 0);
  const rankLabel = registrationWindow.rankStatus === 'ranked' && registrationWindow.effectiveRankValue
    ? `${registrationWindow.effectiveRankValue}. rang`
    : 'vendég státusz';
  const opensAtLabel = registrationWindow.opensAtLabel
    || new Date(registrationWindow.opensAt).toLocaleString('hu-HU');
  const cardClassName = compact
    ? 'rank-registration-notice compact top-space'
    : 'rank-registration-notice top-space';

  return `
    <div class="${cardClassName}">
      <div class="rank-registration-notice-title">${isRankWaiting ? 'Előjelentkeztél, most rangvárólistán vagy.' : 'A rangmodul most még korlátozza a jelentkezésedet.'}</div>
      <div class="small">
        ${isRankWaiting
          ? `A jelentkezésed már látszik a többieknek is, de a jelenlegi <strong>${escapeHtml(rankLabel)}</strong> alapján csak a saját sávod nyitásakor kerülsz be automatikusan a normál sorrendbe.`
          : `A csapatkapitány aktiválta a rangmodult, ezért a jelenlegi <strong>${escapeHtml(rankLabel)}</strong> alapján legkorábban <strong>${escapeHtml(String(offsetHours))} óra</strong> után nyílik a saját sávod. Addig is előjelentkezhetsz, ilyenkor rangvárólistára kerülsz.`}
      </div>
      <div class="small muted">A te sávod nyitása: <strong>${escapeHtml(opensAtLabel)}</strong></div>
      <div class="rank-registration-countdown">
        <span class="small muted">Hátralévő idő:</span>
        <strong>${renderCountdown(registrationWindow.opensAt)}</strong>
      </div>
    </div>
  `;
}

function clearAuth() {
  clearPendingInvitePulseTimer();
  clearPendingInviteJumpHighlight();
  clearUserNewEventsPulseTimer();
  state.token = '';
  state.user = null;
  state.teamRole = null;
  state.currentTeamId = '';
  state.selectedAdminEvent = null;
  state.selectedAdminEventDetail = null;
  state.selectedUserEvent = null;
  state.selectedUserEventDetail = null;
  state.userEventDetailsById = {};
  state.adminEventDetailsById = {};
  state.myTeams = [];
  state.myInvites = [];
  state.myEvents = [];
  state.userTeamEvents = [];
  state.teamMembers = [];
  state.currentTeamFinance = null;
  state.teamFinanceEntries = [];
  state.teamInvites = [];
  state.adminEvents = [];
  state.teamSkillSettings = null;
  state.rankSettingsSaving = false;
  state.teamDrawPreview = null;
  state.savedEventDraw = null;
  state.savedEventDrawEventId = null;
  state.adminSavedEventDraw = null;
  state.adminSavedEventDrawEventId = null;
  state.currentTeam = null;
  state.skillSettingsSaving = false;
  state.sidebarCollapsed = false;
  state.userInvitePulseUntil = 0;
  state.userNewEventsPulseUntil = 0;

  localStorage.removeItem('foci_token');
  localStorage.removeItem('foci_user');
  localStorage.setItem('foci_sidebar_collapsed', 'false');

  if (els.teamSummary) els.teamSummary.innerHTML = '';
  if (els.teamAdvancedContent) els.teamAdvancedContent.innerHTML = '';
  if (els.myTeamsList) els.myTeamsList.innerHTML = '';
  if (els.myEventsList) els.myEventsList.innerHTML = '';
  if (els.myInvitesList) els.myInvitesList.innerHTML = '';
  if (els.teamInvitesAdminList) els.teamInvitesAdminList.innerHTML = '';
  if (els.adminEventsList) els.adminEventsList.innerHTML = '';
  if (els.userEventsList) els.userEventsList.innerHTML = '';
  if (els.userEventDetail) els.userEventDetail.innerHTML = '';
  if (els.teamMembersAdminList) els.teamMembersAdminList.innerHTML = '';
  if (els.selectedEventMeta) els.selectedEventMeta.innerHTML = '';
  if (els.adminOverviewCards) els.adminOverviewCards.innerHTML = '';
  if (els.userOverviewCards) els.userOverviewCards.innerHTML = '';
  if (els.nextEventHero) els.nextEventHero.innerHTML = '';
  if (els.userTeamDrawPreview) els.userTeamDrawPreview.innerHTML = '';
  if (els.userRankModule) els.userRankModule.innerHTML = '';
  if (els.userFinanceModule) els.userFinanceModule.innerHTML = '';
  if (els.userWeatherModule) els.userWeatherModule.innerHTML = '';
  state.platformSummary = null;

  if (els.teamIdInput) els.teamIdInput.value = '';
  if (els.userTeamIdInput) els.userTeamIdInput.value = '';
  syncTeamSelectors();

  resetAuthForms({ preserveInviteToken: true });
  setAuthMode('login');
  updateSessionUi();
  applyRoleAwareUi();
}

function saveTeamId(teamId) {
  state.currentTeamId = teamId;
  const storageKey = getTeamStorageKeyForUser(state.user?.id);
  if (storageKey) {
    localStorage.setItem(storageKey, teamId);
  }

  if (els.teamIdInput) els.teamIdInput.value = teamId;
  if (els.userTeamIdInput) els.userTeamIdInput.value = teamId;
  syncTeamSelectors();
}

function clearCurrentTeamContext({ clearStored = false } = {}) {
  if (clearStored) {
    clearStoredTeamIdForUser(state.user?.id);
  }

  state.currentTeamId = '';
  state.teamRole = null;
  state.currentTeam = null;
  state.teamMembers = [];
  state.currentTeamFinance = null;
  state.teamFinanceEntries = [];
  state.teamInvites = [];
  state.adminEvents = [];
  state.userTeamEvents = [];
  state.teamSkillSettings = null;
  state.teamDrawPreview = null;
  state.savedEventDraw = null;
  state.savedEventDrawEventId = null;
  state.adminSavedEventDraw = null;
  state.adminSavedEventDrawEventId = null;
  state.selectedAdminEvent = null;
  state.selectedAdminEventDetail = null;
  state.selectedUserEvent = null;
  state.selectedUserEventDetail = null;
  state.userEventDetailsById = {};
  state.adminEventDetailsById = {};

  if (els.teamIdInput) els.teamIdInput.value = '';
  if (els.userTeamIdInput) els.userTeamIdInput.value = '';
  syncTeamSelectors();
  if (els.teamSummary) els.teamSummary.innerHTML = '';
  if (els.teamAdvancedContent) els.teamAdvancedContent.innerHTML = '';
  if (els.teamMembersAdminList) els.teamMembersAdminList.innerHTML = '';
  if (els.teamInvitesAdminList) els.teamInvitesAdminList.innerHTML = '';
  if (els.adminEventsList) els.adminEventsList.innerHTML = '<div class="muted">Nincs betöltött csapat.</div>';
  if (els.userEventsList) els.userEventsList.innerHTML = '<div class="muted">Adj meg vagy tölts be egy csapatot.</div>';
  if (els.userEventDetail) {
    els.userEventDetail.innerHTML = emptyState(
      'Nincs fókuszálható esemény.',
      'Ehhez a csapathoz jelenleg nincs olyan kiválasztott esemény, amelyet meg tudnál nyitni.'
    );
  }
  if (els.selectedEventMeta) els.selectedEventMeta.innerHTML = '';
  if (els.nextEventHero) els.nextEventHero.innerHTML = '';
  if (els.userTeamDrawPreview) els.userTeamDrawPreview.innerHTML = '';
  if (els.userRankModule) els.userRankModule.innerHTML = '';
  if (els.userFinanceModule) els.userFinanceModule.innerHTML = '';

  renderAdminOverview();
  renderUserOverview();
  applyRoleAwareUi();
}

function updateSessionUi() {
  if (state.user && state.token) {
    els.sessionBadge.textContent = 'Belépve';
    els.sessionBadge.className = 'badge badge-success';
    els.sessionInfo.innerHTML = `
      <strong>${escapeHtml(getDisplayName(state.user))}</strong><br />
      <span>${escapeHtml(state.user.email || '')}</span><br />
      <span class="small">ID: ${escapeHtml(state.user.id || '')}</span>
    `;
    els.logoutBtn.disabled = false;
  } else {
    els.sessionBadge.textContent = 'Nincs belépve';
    els.sessionBadge.className = 'badge badge-muted';
    els.sessionInfo.textContent = 'Nincs aktív felhasználó.';
    els.logoutBtn.disabled = true;
  }

  renderProfilePanel();
  syncAuthLayout();
}

function formatVersionTimestamp(value) {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toLocaleString('hu-HU');
  } catch {
    return String(value);
  }
}

function buildVersionSummary(versionInfo) {
  if (!versionInfo) {
    return 'Verzióadatok nem elérhetők.';
  }

  const version = versionInfo.version || 'ismeretlen';
  const commit = versionInfo.commit || 'unknown';
  const environment = versionInfo.environment || 'unknown';
  const builtAt = formatVersionTimestamp(versionInfo.builtAt);
  const startedAt = formatVersionTimestamp(versionInfo.startedAt);

  const lines = [
    `Verzió: ${version}`,
    `Commit: ${commit}`,
    `Környezet: ${environment}`
  ];

  if (builtAt) {
    lines.push(`Build: ${builtAt}`);
  } else if (startedAt) {
    lines.push(`Indult: ${startedAt}`);
  }

  return lines.join(' • ');
}

function renderVersionInfo() {
  const summary = buildVersionSummary(state.versionInfo);

  if (els.sidebarVersionInfo) {
    els.sidebarVersionInfo.textContent = summary;
  }

  if (els.authVersionInfo) {
    els.authVersionInfo.textContent = summary;
  }
}

function apiUrl(path) {
  return `${state.apiBase.replace(/\/$/, '')}${path}`;
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof body === 'object' && body?.message
        ? body.message
        : `HTTP ${res.status}`;

    if (res.status === 401) {
      clearAuth();
    }

    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function loadGoogleAuthConfig() {
  try {
    const result = await api('/auth/google/config', {
      method: 'GET',
      headers: state.token ? undefined : {}
    });
    state.googleAuthConfig = result;
    renderGoogleAuthButtons();
  } catch {
    state.googleAuthConfig = { enabled: false, clientId: null };
  }
}

async function loadVersionInfo() {
  try {
    const result = await api('/version', {
      method: 'GET',
      headers: state.token ? undefined : {}
    });
    state.versionInfo = result.version || null;
  } catch {
    state.versionInfo = null;
  }

  renderVersionInfo();
}

async function loadInvitePreview() {
  if (!state.pendingInviteToken) {
    state.pendingInvitePreview = null;
    renderInviteLanding();
    return;
  }

  try {
    const result = await api(`/invite-links/${encodeURIComponent(state.pendingInviteToken)}`, {
      method: 'GET',
      headers: state.token ? undefined : {}
    });
    state.pendingInvitePreview = result;
  } catch (error) {
    state.pendingInvitePreview = {
      invite: {
        status: 'expired',
        team_name: 'Érvénytelen vagy lejárt meghívó',
        role: 'member',
        expires_at: null,
        message: error.message
      }
    };
  }

  renderInviteLanding();
}

async function tryAcceptPendingInviteToken() {
  if (!state.token || !state.pendingInviteToken) return;

  try {
    const result = await api(`/invite-links/${encodeURIComponent(state.pendingInviteToken)}/accept`, {
      method: 'POST'
    });

    showMessage(result.message || 'Sikeresen csatlakoztál a meghívott csapathoz.', 'success');
    state.pendingInviteToken = '';
    state.pendingInvitePreview = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
    renderInviteLanding();
  } catch (error) {
    if (error.status !== 409 && error.status !== 403) {
      showMessage(error.message, 'error');
    }
  }
}

async function loadPlatformSummary() {
  if (!state.token || !isPlatformOwner()) {
    state.platformSummary = null;
    renderPlatformOwnerOverview();
    return;
  }

  try {
    const result = await api('/my/platform-summary', { method: 'GET' });
    state.platformSummary = result;
  } catch (error) {
    state.platformSummary = null;
    console.error('Platform summary betöltési hiba:', error);
  }

  renderPlatformOwnerOverview();
}

function renderGooglePlaceholder(containerId, mode) {
  const mount = document.getElementById(containerId);
  if (!mount) return;

  if (!state.googleAuthConfig?.enabled) {
    mount.innerHTML = '';
    return;
  }

  mount.innerHTML = `<div class="small muted">Google-belépés betöltése…</div>`;

  if (!window.google?.accounts?.id) {
    mount.innerHTML = '<div class="small muted">A Google belépési gomb akkor jelenik meg, ha a klienskulcs be van állítva.</div>';
    return;
  }

  window.google.accounts.id.initialize({
    client_id: state.googleAuthConfig.clientId,
    callback: response => handleGoogleCredential(response, mode)
  });

  mount.innerHTML = '';
  window.google.accounts.id.renderButton(mount, {
    theme: 'outline',
    size: 'large',
    text: mode === 'register' ? 'signup_with' : 'signin_with',
    shape: 'pill',
    width: 260
  });
}

function renderGoogleAuthButtons() {
  renderGooglePlaceholder('googleLoginMount', 'login');
  renderGooglePlaceholder('googleRegisterMount', 'register');
}

async function handleGoogleCredential(response, mode) {
  clearMessage();

  try {
    const inviteToken = document.getElementById('registerInviteToken')?.value.trim() || state.pendingInviteToken || null;
    const registrationPath = getSelectedRegistrationPath();
    if (!registrationPath) {
      showMessage('Előbb válassz egy belépési kártyát.', 'error');
      return;
    }
    const registerAsOrganizer = registrationPath !== 'invited_participant';
    const phone = document.getElementById('registerPhone')?.value.trim() || null;

    const result = await api('/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: response.credential,
        inviteToken,
        registrationPath,
        registerAsOrganizer,
        phone
      })
    });

    setAuth(result.token, result.user);
    await tryAcceptPendingInviteToken();

    await loadMyTeams();
    await loadMyEvents();
    await loadMyInvites();
    await loadPlatformSummary();

    if (state.currentTeamId) {
      await loadTeam(state.currentTeamId);
    }

    const targetView = getPostAuthDefaultView();

    showMessage(
      mode === 'register'
        ? 'Sikeres Google-regisztráció és belépés.'
        : 'Sikeres Google-belépés.',
      'success'
    );
    switchView(targetView);
    if (targetView === 'tournamentView') {
      setTournamentWorkspace('home');
    }
    if (targetView === 'userView') {
      triggerPendingInvitePulse();
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nem sikerült beolvasni a képfájlt.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function validateAvatarFile(file) {
  if (!file) {
    throw new Error('Nincs kiválasztott fájl.');
  }

  if (file.size > 4 * 1024 * 1024) {
    throw new Error('A profilkép legfeljebb 4 MB lehet.');
  }

  const dataUrl = await readImageFileAsDataUrl(file);

  await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.width > 600 || image.height > 600) {
        reject(new Error('A profilkép legfeljebb 600×600 pixeles lehet.'));
        return;
      }

      resolve();
    };
    image.onerror = () => reject(new Error('A kiválasztott fájl nem érvényes kép.'));
    image.src = dataUrl;
  });

  return dataUrl;
}

function toDateTimeLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isValidDateTimeLocalInput(value) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value).trim())) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

const EVENT_STATUS_LABELS = {
  draft: 'piszkozat',
  published: 'publikált',
  cancelled: 'törölt',
  finished: 'lezárt'
};

const INVITE_STATUS_LABELS = {
  pending: 'függőben',
  accepted: 'elfogadva',
  declined: 'elutasítva',
  revoked: 'visszavonva',
  expired: 'lejárt'
};

const REGISTRATION_STATUS_LABELS = {
  going: 'megyek',
  waiting_list: 'várólistán',
  waiting_list_rank: 'rangvárólistán',
  cancelled: 'lemondva'
};

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

const WEATHER_CODE_MAP = Object.freeze({
  0: { label: 'Tiszta ég', icon: '☀️' },
  1: { label: 'Derült', icon: '🌤️' },
  2: { label: 'Enyhén felhős', icon: '⛅' },
  3: { label: 'Borult', icon: '☁️' },
  45: { label: 'Ködös', icon: '🌫️' },
  48: { label: 'Zúzmarás köd', icon: '🌫️' },
  51: { label: 'Gyenge szitálás', icon: '🌦️' },
  53: { label: 'Szitálás', icon: '🌦️' },
  55: { label: 'Erős szitálás', icon: '🌧️' },
  61: { label: 'Gyenge eső', icon: '🌦️' },
  63: { label: 'Eső', icon: '🌧️' },
  65: { label: 'Erős eső', icon: '🌧️' },
  71: { label: 'Gyenge havazás', icon: '🌨️' },
  73: { label: 'Havazás', icon: '🌨️' },
  75: { label: 'Erős havazás', icon: '❄️' },
  80: { label: 'Zápor', icon: '🌦️' },
  81: { label: 'Záporos eső', icon: '🌧️' },
  82: { label: 'Erős zápor', icon: '⛈️' },
  95: { label: 'Zivatar', icon: '⛈️' },
  96: { label: 'Zivatar jéggel', icon: '⛈️' },
  99: { label: 'Erős zivatar', icon: '⛈️' }
});

const weatherCache = new Map();
const weatherLocationCache = new Map();

function statusBadge(status) {
  const map = {
    draft: 'badge badge-draft',
    published: 'badge badge-success',
    cancelled: 'badge badge-danger',
    finished: 'badge badge-warning'
  };
  return `<span class="${map[status] || 'badge badge-muted'}">${escapeHtml(EVENT_STATUS_LABELS[status] || status)}</span>`;
}

function getEventStartTimestamp(event) {
  const raw = event?.start_at;
  if (!raw) return null;
  if (raw instanceof Date) {
    const ts = raw.getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  const directTs = new Date(raw).getTime();
  if (!Number.isNaN(directTs)) {
    return directTs;
  }

  if (typeof raw === 'string') {
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const normalizedTs = new Date(normalized).getTime();
    return Number.isNaN(normalizedTs) ? null : normalizedTs;
  }

  return null;
}

function isPastPublishedEvent(event, now = Date.now()) {
  if (!event || event.status !== 'published') return false;
  const ts = getEventStartTimestamp(event);
  if (ts == null) return false;
  return ts < now;
}

function isAwaitingAdminClosureEvent(event, now = Date.now()) {
  return isPastPublishedEvent(event, now);
}

function renderAdminLifecycleBadge(event, now = Date.now()) {
  if (isPastPublishedEvent(event, now)) {
    return '<span class="badge badge-warning">megvalósult</span>';
  }

  return statusBadge(event.status);
}

function inviteStatusBadge(status) {
  const map = {
    pending: 'badge badge-draft',
    accepted: 'badge badge-success',
    declined: 'badge badge-warning',
    revoked: 'badge badge-danger',
    expired: 'badge badge-danger'
  };

  return `<span class="${map[status] || 'badge badge-muted'}">${escapeHtml(INVITE_STATUS_LABELS[status] || status)}</span>`;
}

function inviteActionHint(status) {
  const map = {
    accepted: 'Ez a meghívás már elfogadott.',
    declined: 'Ez a meghívás már elutasított.',
    revoked: 'A meghívást a csapat visszavonta.',
    expired: 'A meghívás lejárt.'
  };

  return map[status] || '';
}

function inviteEmailDeliveryBadge(status) {
  const map = {
    sent: { className: 'badge badge-success', label: 'email kiküldve' },
    skipped: { className: 'badge badge-warning', label: 'email kihagyva' },
    failed: { className: 'badge badge-danger', label: 'email hiba' }
  };

  const item = map[status];
  if (!item) {
    return '<span class="badge badge-muted">email státusz ismeretlen</span>';
  }

  return `<span class="${item.className}">${escapeHtml(item.label)}</span>`;
}

function buildInviteEmailDeliveryLine(invite) {
  const status = invite.email_delivery_status || null;
  const parts = [inviteEmailDeliveryBadge(status)];

  if (invite.email_delivery_reason) {
    parts.push(`<span>${escapeHtml(invite.email_delivery_reason)}</span>`);
  }

  if (invite.email_delivery_message_id) {
    parts.push(`<span>messageId: ${escapeHtml(invite.email_delivery_message_id)}</span>`);
  }

  if (invite.email_delivery_updated_at) {
    parts.push(`<span>frissítve: ${escapeHtml(formatDateTime(invite.email_delivery_updated_at))}</span>`);
  }

  return parts.join(' ');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('hu-HU');
}

function formatHeroEventDate(value) {
  if (!value) {
    return { weekday: '-', dateText: '-', timeText: '-' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { weekday: '-', dateText: '-', timeText: '-' };
  }

  return {
    weekday: date.toLocaleDateString('hu-HU', { weekday: 'long' }),
    dateText: date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }),
    timeText: date.toLocaleTimeString('hu-HU', {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
}

function formatWeatherForecastTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('hu-HU', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getEventWeatherQuery(event) {
  return String(event?.location_address || event?.location_name || '').trim();
}

function getEventWeatherCacheKey(event) {
  return `${event?.id || 'event'}::${getEventWeatherQuery(event)}::${event?.start_at || ''}`;
}

function getWeatherCodeMeta(code) {
  return WEATHER_CODE_MAP[Number(code)] || { label: 'Ismeretlen időjárás', icon: '🌤️' };
}

async function geocodeWeatherLocation(query) {
  if (weatherLocationCache.has(query)) {
    return weatherLocationCache.get(query);
  }

  const promise = (async () => {
    const params = new URLSearchParams({
      name: query,
      count: '1',
      language: 'hu',
      format: 'json'
    });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error('A helyszín geokódolása most nem sikerült.');
    }

    const payload = await response.json();
    const firstResult = payload?.results?.[0];
    if (!firstResult) {
      throw new Error('Ehhez a helyszínhez nem találtam időjárási koordinátát.');
    }

    return {
      latitude: firstResult.latitude,
      longitude: firstResult.longitude,
      name: firstResult.name,
      country: firstResult.country
    };
  })();

  weatherLocationCache.set(query, promise);
  return promise;
}

async function fetchEventWeather(event) {
  const cacheKey = getEventWeatherCacheKey(event);
  if (weatherCache.has(cacheKey)) {
    return weatherCache.get(cacheKey);
  }

  const promise = (async () => {
    const query = getEventWeatherQuery(event);
    if (!query) {
      throw new Error('Az eseményhez nincs megadva használható helyszín.');
    }

    const eventDate = new Date(event.start_at);
    if (Number.isNaN(eventDate.getTime())) {
      throw new Error('Az esemény kezdési időpontja nem értelmezhető.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const forecastLimit = new Date(today);
    forecastLimit.setDate(forecastLimit.getDate() + 15);
    if (eventDate > forecastLimit) {
      throw new Error('Az előrejelzés ehhez az eseményhez még túl távoli, később lesz elérhető.');
    }

    const location = await geocodeWeatherLocation(query);
    const startDate = today.toISOString().slice(0, 10);
    const endDate = eventDate.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Az időjárási előrejelzés betöltése sikertelen.');
    }

    const payload = await response.json();
    const times = payload?.hourly?.time || [];
    if (!times.length) {
      throw new Error('Ehhez az eseményhez most nincs elérhető időjárási adat.');
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    times.forEach((time, index) => {
      const distance = Math.abs(new Date(time).getTime() - eventDate.getTime());
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const weatherCode = payload.hourly.weather_code?.[nearestIndex];
    const weatherMeta = getWeatherCodeMeta(weatherCode);

    return {
      locationLabel: [location.name, location.country].filter(Boolean).join(', '),
      forecastTime: times[nearestIndex],
      temperature: payload.hourly.temperature_2m?.[nearestIndex],
      precipitationProbability: payload.hourly.precipitation_probability?.[nearestIndex],
      windSpeed: payload.hourly.wind_speed_10m?.[nearestIndex],
      weatherCode,
      weatherLabel: weatherMeta.label,
      weatherIcon: weatherMeta.icon
    };
  })();

  weatherCache.set(cacheKey, promise);
  return promise;
}

function getHolidayWarningsFromResult(result) {
  if (!result) return [];

  if (Array.isArray(result.holidayWarnings)) {
    return result.holidayWarnings.filter(Boolean);
  }

  if (result.holidayWarning) {
    return [result.holidayWarning].filter(Boolean);
  }

  return [];
}

function getHolidayWarningFromEvent(event) {
  return event?.holidayWarning || null;
}

function buildHolidaySuccessMessage(baseMessage, result) {
  const warnings = getHolidayWarningsFromResult(result);

  if (!warnings.length) {
    return baseMessage;
  }

  if (warnings.length === 1) {
    return `${baseMessage} Figyelmeztetés: a dátum ünnepnapra vagy munkaszüneti napra esik (${warnings[0].occursOn}).`;
  }

  return `${baseMessage} Figyelmeztetés: ${warnings.length} generált alkalom ünnepnapra vagy munkaszüneti napra esik.`;
}

function getHolidayConfirmationMessage(errorBody) {
  return (
    errorBody?.confirmationMessage ||
    'Figyelem! Az esemény ünnepnapra vagy munkaszüneti napra esik. Mindenképpen létre kívánod hozni az eseményt?'
  );
}

function shouldConfirmHolidayCreation(error) {
  return error?.status === 409 && Boolean(error?.body?.requiresHolidayConfirmation);
}

function renderHolidayWarning(warning, options = {}) {
  if (!warning) return '';

  const { compact = false } = options;

  return `
    <div class="holiday-warning ${compact ? 'compact' : ''}">
      <strong>Figyelmeztetés</strong>
      <div class="small">${escapeHtml(warning.message || 'Az esemény ünnepnapra vagy munkaszüneti napra esik.')}</div>
      <div class="small muted">${escapeHtml(warning.occursOn || '')}${warning.name ? ` · ${escapeHtml(warning.name)}` : ''}</div>
    </div>
  `;
}


function emptyState(title, description) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <div class="small muted">${escapeHtml(description)}</div>
    </div>
  `;
}

function shortId(value) {
  const text = String(value || '');
  return text.length > 8 ? text.slice(0, 8) : text;
}

function formatRegistrationStatus(status) {
  return REGISTRATION_STATUS_LABELS[status] || 'még nincs jelentkezés';
}

function registrationStatusBadge(status) {
  if (!status) {
    return '<span class="badge badge-muted">még nem jelentkeztél</span>';
  }

  const map = {
    going: 'badge badge-success',
    waiting_list: 'badge badge-warning',
    waiting_list_rank: 'badge badge-rank',
    cancelled: 'badge badge-danger'
  };

  return `<span class="${map[status] || 'badge badge-muted'}">${escapeHtml(formatRegistrationStatus(status))}</span>`;
}

function formatAttendanceStatus(status) {
  const map = {
    present: 'megjelent',
    no_show: 'no-show'
  };

  return map[status] || 'nincs jelölve';
}

function attendanceStatusBadge(status) {
  if (!status) {
    return '<span class="badge badge-muted">nincs jelölve</span>';
  }

  const map = {
    present: 'badge badge-success',
    no_show: 'badge badge-danger'
  };

  return `<span class="${map[status] || 'badge badge-muted'}">${escapeHtml(formatAttendanceStatus(status))}</span>`;
}

function findMyAttendanceRegistration(detail) {
  const going = detail?.registrations?.going || [];
  return going.find(item => item.user_id === state.user?.id) || null;
}

function renderAttendanceSummary(summary = {}, options = {}) {
  const { title = 'Jelenléti összesítő', compact = false } = options;
  const presentCount = Number(summary.presentCount ?? summary.present_count ?? 0);
  const noShowCount = Number(summary.noShowCount ?? summary.no_show_count ?? 0);
  const unmarkedCount = Number(summary.unmarkedCount ?? summary.unmarked_count ?? 0);
  const totalPaidAmount = Number(summary.totalPaidAmount ?? summary.total_paid_amount ?? 0);

  return `
    <div class="event-card top-space attendance-summary-card ${compact ? 'compact' : ''}">
      <div class="row between align-center wrap gap">
        <strong>${escapeHtml(title)}</strong>
        <span class="badge badge-muted">lezárt esemény</span>
      </div>
      <div class="grid four-col inner-grid top-space attendance-summary-grid">
        <div class="detail-box">
          <div class="detail-label">Megjelent</div>
          <div class="detail-value">${escapeHtml(String(presentCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">No-show</div>
          <div class="detail-value">${escapeHtml(String(noShowCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Még nincs jelölve</div>
          <div class="detail-value">${escapeHtml(String(unmarkedCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Lekönyvelt befizetés</div>
          <div class="detail-value">${escapeHtml(formatMoney(totalPaidAmount))}</div>
        </div>
      </div>
    </div>
  `;
}

function canManageAttendanceForEvent(event, now = Date.now()) {
  if (!event) return false;
  return event.status === 'finished' || isAwaitingAdminClosureEvent(event, now);
}

function hasCompletedAttendanceBookkeeping(detail) {
  const going = detail?.registrations?.going || [];
  if (!going.length) return true;
  return going.every(player => ['present', 'no_show'].includes(player.attendance_status));
}

function getAdminAttendanceFocusStage(detail) {
  const event = detail?.event;
  const going = detail?.registrations?.going || [];
  const paymentSummary = detail?.summary?.paymentSummary || {};
  const financeSummary = detail?.summary?.financeSummary || {};
  const pendingAttendanceCount = going.filter(player => !['present', 'no_show'].includes(player.attendance_status)).length;
  const presentCount = going.filter(player => player.attendance_status === 'present').length;
  const expectedTotal = Number(
    financeSummary.expected_total_amount
      ?? paymentSummary.expected_total_amount
      ?? paymentSummary.final_amount_per_person * presentCount
      ?? 0
  );
  const actualTotal = Number(
    financeSummary.actual_paid_total_amount
      ?? paymentSummary.recorded_total_amount
      ?? paymentSummary.collected_total_amount
      ?? 0
  );
  const hasPaymentGap = presentCount > 0 && Math.abs(actualTotal - expectedTotal) > 0;

  if (pendingAttendanceCount > 0) {
    return {
      stage: 'attendance',
      title: 'Most a jelenlét jelölése van soron.',
      description: 'Előbb minden going játékosnál rögzítsd, hogy megjelent vagy no-show lett.'
    };
  }

  if (event?.status !== 'finished' && isAwaitingAdminClosureEvent(event) && hasPaymentGap) {
    return {
      stage: 'payments',
      title: 'Most a befizetések ellenőrzése van soron.',
      description: 'A jelenlét már rögzítve van, most nézd át a befizetés mezőket és az összesített eltérést.'
    };
  }

  if (event?.status !== 'finished' && isAwaitingAdminClosureEvent(event)) {
    return {
      stage: 'finish',
      title: 'Most már lezárhatod az eseményt.',
      description: 'A jelenlét és a pénzügyi rész rendben van, innen már csak a kézi lezárás maradt.'
    };
  }

  return {
    stage: 'review',
    title: 'Itt már csak az ellenőrzés maradt.',
    description: 'A lezárt eseménynél itt látod a rögzített jelenlétet és a könyvelt pénzügyi állapotot.'
  };
}

function getAdminFocusEvent() {
  return state.selectedAdminEventDetail?.event || state.selectedAdminEvent || null;
}

function getAdminWorkspaceFocusEvent(events = state.adminEvents || []) {
  const selectedEvent = getAdminFocusEvent();
  if (selectedEvent) {
    return selectedEvent;
  }

  const upcomingEvent = getNextUpcomingAdminEvent(events);
  if (upcomingEvent) {
    return upcomingEvent;
  }

  const now = Date.now();
  const pastPublishedEvents = [...events]
    .filter(event => isPastPublishedEvent(event, now))
    .sort((a, b) => getEventStartTimestamp(b) - getEventStartTimestamp(a));
  if (pastPublishedEvents[0]) {
    return pastPublishedEvents[0];
  }

  const finishedEvents = [...events]
    .filter(event => event?.status === 'finished')
    .sort((a, b) => getEventStartTimestamp(b) - getEventStartTimestamp(a));
  return finishedEvents[0] || null;
}

function getAttendanceDefaultPaymentAmount(detail) {
  const paymentSummary = detail?.summary?.paymentSummary || {};
  const amount = Number(paymentSummary.final_amount_per_person || 0);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0;
}

function getAttendanceSettlementTargetAmount(player, detail) {
  const explicitTarget = Number(player?.finance_settlement_target_amount);
  if (Number.isFinite(explicitTarget) && explicitTarget >= 0) {
    return Math.round(explicitTarget);
  }

  const balanceBefore = Number(player?.finance_balance_before_event || 0);
  return Math.max(getAttendanceDefaultPaymentAmount(detail) - balanceBefore, 0);
}

function getAttendanceExpectedTotalAmount(player, detail) {
  const explicitTotal = Number(player?.finance_expected_total_amount);
  if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
    return Math.round(explicitTotal);
  }

  return getAttendanceDefaultPaymentAmount(detail);
}

function getAttendancePaymentInputValue(player, detail) {
  if (player?.attendance_payment_amount != null && player.attendance_payment_amount !== '') {
    return String(player.attendance_payment_amount);
  }

  return String(getAttendanceSettlementTargetAmount(player, detail));
}

function getAttendanceProjectedBalanceAfter(player, detail, paidAmount = null) {
  const balanceBefore = Number(player?.finance_balance_before_event || 0);
  const expectedTotal = getAttendanceExpectedTotalAmount(player, detail);
  const actualPaid =
    paidAmount == null
      ? Number(getAttendancePaymentInputValue(player, detail) || 0)
      : Number(paidAmount || 0);
  return balanceBefore + actualPaid - expectedTotal;
}

function getAttendanceProjectedDelta(player, detail, paidAmount = null) {
  const settlementTarget = getAttendanceSettlementTargetAmount(player, detail);
  const actualPaid =
    paidAmount == null
      ? Number(getAttendancePaymentInputValue(player, detail) || 0)
      : Number(paidAmount || 0);
  return actualPaid - settlementTarget;
}

function getSignedMoneyClass(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return 'finance-delta-positive';
  if (numeric < 0) return 'finance-delta-negative';
  return 'finance-delta-neutral';
}

function readAttendancePaymentAmountForUser(userId) {
  const input = document.querySelector(`[data-attendance-payment][data-attendance-user-id="${String(userId)}"]`);
  if (!input) return null;
  const raw = String(input.value || '').trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

function syncAttendancePaymentPreview(userId) {
  const detail = state.selectedAdminEventDetail;
  const player = detail?.registrations?.going?.find(item => String(item.user_id) === String(userId));
  if (!player) return;

  const paidAmount = readAttendancePaymentAmountForUser(userId) ?? 0;
  const projectedAfter = getAttendanceProjectedBalanceAfter(player, detail, paidAmount);
  const projectedDelta = getAttendanceProjectedDelta(player, detail, paidAmount);

  const actualPaidNode = document.querySelector(`[data-attendance-actual-paid][data-attendance-user-id="${String(userId)}"]`);
  if (actualPaidNode) {
    actualPaidNode.textContent = formatMoney(paidAmount);
  }

  const afterNode = document.querySelector(`[data-attendance-projected-after][data-attendance-user-id="${String(userId)}"]`);
  if (afterNode) {
    afterNode.textContent = formatSignedMoney(projectedAfter);
    afterNode.classList.remove('finance-delta-positive', 'finance-delta-negative', 'finance-delta-neutral');
    afterNode.classList.add(getSignedMoneyClass(projectedAfter));
  }

  const deltaNode = document.querySelector(`[data-attendance-payment-delta][data-attendance-user-id="${String(userId)}"]`);
  if (deltaNode) {
    deltaNode.textContent = formatSignedMoney(projectedDelta);
    deltaNode.classList.remove('finance-delta-positive', 'finance-delta-negative', 'finance-delta-neutral');
    deltaNode.classList.add(getSignedMoneyClass(projectedDelta));
  }
}

function readFinanceAdjustmentAmountForUser(userId) {
  const input = document.querySelector(`[data-finance-adjustment-amount][data-finance-user-id="${String(userId)}"]`);
  if (!input) return null;
  const raw = String(input.value || '').trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && Number.isInteger(amount) && amount !== 0
    ? Math.round(amount)
    : null;
}

function readFinanceAdjustmentNoteForUser(userId) {
  const input = document.querySelector(`[data-finance-adjustment-note][data-finance-user-id="${String(userId)}"]`);
  if (!input) return null;
  const raw = String(input.value || '').trim();
  return raw || null;
}

function renderAttendanceFinanceSummary(detail, going = []) {
  const paymentSummary = detail?.summary?.paymentSummary || {};
  const basePerPerson = Number(paymentSummary.base_amount_per_person || 0);
  const feePerPerson = Number(paymentSummary.per_player_fee || 0);
  const finalPerPerson = Number(paymentSummary.final_amount_per_person || (basePerPerson + feePerPerson) || 0);
  const recordedTotalFallback = Number(
    detail?.summary?.financeSummary?.actualPaidTotalAmount
      ?? detail?.summary?.financeSummary?.actual_paid_total_amount
      ?? detail?.summary?.attendanceSummary?.totalPaidAmount
      ?? detail?.summary?.attendanceSummary?.total_paid_amount
      ?? 0
  );
  const rows = Array.isArray(going)
    ? going.map(player => {
        const balanceBefore = Number(player.finance_balance_before_event || 0);
        const expectedBase = Number.isFinite(Number(player.finance_expected_base_amount))
          ? Number(player.finance_expected_base_amount)
          : basePerPerson;
        const expectedFee = Number.isFinite(Number(player.finance_expected_fee_amount))
          ? Number(player.finance_expected_fee_amount)
          : feePerPerson;
        const expectedTotal = Number.isFinite(Number(player.finance_expected_total_amount))
          ? Number(player.finance_expected_total_amount)
          : finalPerPerson;
        const settlementTarget = Number.isFinite(Number(player.finance_settlement_target_amount))
          ? Number(player.finance_settlement_target_amount)
          : Math.max(expectedTotal - balanceBefore, 0);
        const actualPaid = Number.isFinite(Number(player.finance_actual_paid_amount))
          ? Number(player.finance_actual_paid_amount)
          : Number(player.attendance_payment_amount || 0);
        const eventDelta = Number.isFinite(Number(player.finance_event_delta_amount))
          ? Number(player.finance_event_delta_amount)
          : actualPaid - expectedTotal;
        const balanceAfter = Number.isFinite(Number(player.finance_balance_after_event))
          ? Number(player.finance_balance_after_event)
          : balanceBefore + eventDelta;

        return {
          balanceBefore,
          expectedBase,
          expectedFee,
          expectedTotal,
          settlementTarget,
          actualPaid,
          eventDelta,
          balanceAfter
        };
      })
    : [];
  const hasRecordedFinanceData = Array.isArray(going)
    ? going.some(player =>
        player?.finance_expected_total_amount != null ||
        player?.finance_actual_paid_amount != null ||
        player?.attendance_payment_amount != null ||
        player?.finance_balance_before_event != null
      )
    : false;
  const participantCount = rows.length;
  const baseTotal = hasRecordedFinanceData
    ? rows.reduce((sum, row) => sum + row.expectedBase, 0)
    : basePerPerson * participantCount;
  const feeTotal = hasRecordedFinanceData
    ? rows.reduce((sum, row) => sum + row.expectedFee, 0)
    : feePerPerson * participantCount;
  const plannedTotal = hasRecordedFinanceData
    ? rows.reduce((sum, row) => sum + row.expectedTotal, 0)
    : finalPerPerson * participantCount;
  const settlementTargetTotal = hasRecordedFinanceData
    ? rows.reduce((sum, row) => sum + row.settlementTarget, 0)
    : finalPerPerson * participantCount;
  const actualPaidTotal = hasRecordedFinanceData
    ? rows.reduce((sum, row) => sum + row.actualPaid, 0)
    : recordedTotalFallback;
  const variance = actualPaidTotal - plannedTotal;
  const varianceClass = variance > 0 ? 'finance-delta-positive' : variance < 0 ? 'finance-delta-negative' : 'finance-delta-neutral';

  return `
    <div class="event-card top-space attendance-finance-card">
      <div class="row between align-center wrap gap">
        <strong>Pénzügyi sor</strong>
        <span class="badge badge-muted">${escapeHtml(String(participantCount))} fő</span>
      </div>
      <div class="grid four-col inner-grid top-space attendance-summary-grid">
        <div class="detail-box">
          <div class="detail-label">Fejpénz / fő terv</div>
          <div class="detail-value">${escapeHtml(formatMoney(basePerPerson))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Alapdíj / fő terv</div>
          <div class="detail-value">${escapeHtml(formatMoney(feePerPerson))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Fejpénz összesen terv</div>
          <div class="detail-value">${escapeHtml(formatMoney(baseTotal))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Alapdíj összesen terv</div>
          <div class="detail-value">${escapeHtml(formatMoney(feeTotal))}</div>
        </div>
      </div>
        <div class="grid four-col inner-grid top-space attendance-summary-grid">
          <div class="detail-box">
            <div class="detail-label">Most rendezendő</div>
            <div class="detail-value">${escapeHtml(formatMoney(settlementTargetTotal))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Várt összesen</div>
            <div class="detail-value">${escapeHtml(formatMoney(plannedTotal))}</div>
          </div>
        <div class="detail-box">
          <div class="detail-label">Befolyt összesen</div>
          <div class="detail-value">${escapeHtml(formatMoney(actualPaidTotal))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Eltérés</div>
          <div class="detail-value ${varianceClass}">${escapeHtml(formatSignedMoney(variance))}</div>
        </div>
      </div>
    </div>
  `;
}

function isEventClosedForFinance(event) {
  return event?.status === 'finished';
}

function renderTeamCashLedgerSummary(events = []) {
  const closedEvents = (events || []).filter(isEventClosedForFinance);
  const memberFinanceStats = (state.teamMembers || []).map(member => member.finance_stats || {});
  const openDebtTotal = memberFinanceStats.reduce((sum, stats) => sum + Number(stats.debt_amount || 0), 0);
  const openCreditTotal = memberFinanceStats.reduce((sum, stats) => sum + Number(stats.credit_amount || 0), 0);

  if (!closedEvents.length) {
    return `
      <div class="small muted top-space">Még nincs lezárt vagy megvalósult esemény, amelyhez könyvelt befizetés kapcsolódna.</div>
    `;
  }

  const rows = closedEvents.map(event => {
    const attendanceSummary = event.attendance_summary || {};
    const paymentSummary = event.payment_summary || {};
    const financeSummary = event.finance_summary || {};
    const participantCount = Number(attendanceSummary.going_count_basis ?? event.going_count ?? 0);
    const basePerPerson = Number(paymentSummary.base_amount_per_person || 0);
    const feePerPerson = Number(paymentSummary.per_player_fee || 0);
    const plannedTotal = Number(financeSummary.expected_total_amount || (Number(paymentSummary.final_amount_per_person || 0) * participantCount));
    const baseTotal = Number(financeSummary.expected_base_total_amount || (basePerPerson * participantCount));
    const feeTotal = Number(financeSummary.expected_fee_total_amount || (feePerPerson * participantCount));
    const actualPaidTotal = Number(financeSummary.actual_paid_total_amount || attendanceSummary.total_paid_amount || 0);
    const variance = actualPaidTotal - plannedTotal;

    return {
      id: event.id,
      title: event.title || 'Névtelen esemény',
      startAt: event.start_at,
      locationName: event.location_name || '-',
      baseTotal,
      feeTotal,
      actualPaidTotal,
      variance
    };
  }).sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  const totalBase = rows.reduce((sum, row) => sum + row.baseTotal, 0);
  const totalFee = rows.reduce((sum, row) => sum + row.feeTotal, 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actualPaidTotal, 0);
  const totalVariance = rows.reduce((sum, row) => sum + row.variance, 0);

  return `
    <div class="event-card top-space attendance-finance-card">
      <div class="row between align-center wrap gap">
        <strong>Könyvelt lezárt események</strong>
        <span class="badge badge-muted">${escapeHtml(String(rows.length))} esemény</span>
      </div>
        <div class="grid four-col inner-grid top-space attendance-summary-grid">
          <div class="detail-box">
            <div class="detail-label">Fejpénz összesen</div>
            <div class="detail-value">${escapeHtml(formatMoney(totalBase))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Alapdíj összesen</div>
          <div class="detail-value">${escapeHtml(formatMoney(totalFee))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Befolyt összesen</div>
          <div class="detail-value">${escapeHtml(formatMoney(totalActual))}</div>
        </div>
          <div class="detail-box">
            <div class="detail-label">Eltérés összesen</div>
            <div class="detail-value ${totalVariance > 0 ? 'finance-delta-positive' : totalVariance < 0 ? 'finance-delta-negative' : 'finance-delta-neutral'}">${escapeHtml(formatSignedMoney(totalVariance))}</div>
          </div>
        </div>
        <div class="grid two-col inner-grid top-space attendance-summary-grid">
          <div class="detail-box">
            <div class="detail-label">Nyitott tartozás</div>
            <div class="detail-value finance-delta-negative">${escapeHtml(formatMoney(openDebtTotal))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Nyitott többlet</div>
            <div class="detail-value finance-delta-positive">${escapeHtml(formatMoney(openCreditTotal))}</div>
          </div>
        </div>
        <details class="admin-collapse top-space">
        <summary>
          <span>Esemény részletek</span>
          <span class="badge badge-draft">${escapeHtml(String(rows.length))}</span>
        </summary>
        <div class="admin-collapse-body stack">
          ${rows.map(row => `
            <div class="attendance-row attendance-ledger-row">
              <div class="attendance-row-main">
                <div class="attendance-row-name">${escapeHtml(row.title)}</div>
                <div class="small muted">${escapeHtml(formatDateTime(row.startAt))}</div>
                <div class="small muted">${escapeHtml(row.locationName)}</div>
              </div>
              <div class="detail-box">
                <div class="detail-label">Fejpénz összesen</div>
                <div class="detail-value">${escapeHtml(formatMoney(row.baseTotal))}</div>
              </div>
              <div class="detail-box">
                <div class="detail-label">Alapdíj összesen</div>
                <div class="detail-value">${escapeHtml(formatMoney(row.feeTotal))}</div>
              </div>
              <div class="detail-box">
                <div class="detail-label">Befolyt összesen</div>
                <div class="detail-value">${escapeHtml(formatMoney(row.actualPaidTotal))}</div>
              </div>
              <div class="detail-box">
                <div class="detail-label">Eltérés</div>
                <div class="detail-value ${row.variance > 0 ? 'finance-delta-positive' : row.variance < 0 ? 'finance-delta-negative' : 'finance-delta-neutral'}">${escapeHtml(formatSignedMoney(row.variance))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </details>
    </div>
  `;
}

function getAdminFinanceFilterMeta(member) {
  const balance = Number(member?.finance_stats?.current_balance_amount || 0);
  if (balance < 0) return 'debt';
  if (balance > 0) return 'credit';
  return 'settled';
}

function getFilteredFinanceMembers() {
  const statusFilter = state.adminFinanceFilters?.status || 'all';
  const searchFilter = String(state.adminFinanceFilters?.search || '').trim().toLowerCase();

  return (state.teamMembers || []).filter(member => {
    if (member.membership_status !== 'active') return false;
    const financeStats = member.finance_stats || {};
    const balanceType = getAdminFinanceFilterMeta(member);

    if (statusFilter !== 'all' && balanceType !== statusFilter) {
      return false;
    }

    if (!searchFilter) {
      return true;
    }

    const haystack = `${member.name || ''} ${member.email || ''}`.toLowerCase();
    return haystack.includes(searchFilter);
  });
}

function renderFinanceMemberStatusBadge(member) {
  const balanceType = getAdminFinanceFilterMeta(member);
  if (balanceType === 'debt') {
    return '<span class="badge badge-danger">tartozik</span>';
  }
  if (balanceType === 'credit') {
    return '<span class="badge badge-success">többlete van</span>';
  }
  return '<span class="badge badge-muted">rendezett</span>';
}

function renderTeamFinanceBalances() {
  const filteredMembers = getFilteredFinanceMembers();
  const totalMembers = (state.teamMembers || []).filter(member => member.membership_status === 'active').length;

  return `
    <div class="event-card top-space attendance-finance-card">
      <div class="row between align-center wrap gap">
        <strong>Tagonkénti egyenlegek</strong>
        <span class="badge badge-muted">${escapeHtml(String(filteredMembers.length))}/${escapeHtml(String(totalMembers))} játékos</span>
      </div>
      <div class="finance-filter-bar top-space">
        <label class="finance-filter-field">
          <span class="small muted">Szűrés</span>
          <select data-finance-filter="status">
            <option value="all" ${state.adminFinanceFilters.status === 'all' ? 'selected' : ''}>Mindenki</option>
            <option value="debt" ${state.adminFinanceFilters.status === 'debt' ? 'selected' : ''}>Tartozók</option>
            <option value="credit" ${state.adminFinanceFilters.status === 'credit' ? 'selected' : ''}>Többletesek</option>
            <option value="settled" ${state.adminFinanceFilters.status === 'settled' ? 'selected' : ''}>Rendezettek</option>
          </select>
        </label>
        <label class="finance-filter-field finance-filter-search">
          <span class="small muted">Keresés</span>
          <input type="search" data-finance-filter="search" value="${escapeHtml(state.adminFinanceFilters.search || '')}" placeholder="név vagy email" />
        </label>
      </div>
      ${
        filteredMembers.length
          ? `<div class="stack top-space">
              ${filteredMembers.map(member => {
                const stats = member.finance_stats || {};
                const entries = (state.teamFinanceEntries || []).filter(entry => entry.user_id === member.user_id);
                return `
                  <details class="admin-collapse finance-member-collapse">
                    <summary>
                      <span>${escapeHtml(member.name || 'Ismeretlen játékos')}</span>
                      <span class="row gap wrap align-center">
                        ${renderFinanceMemberStatusBadge(member)}
                        <span class="badge badge-draft">${escapeHtml(formatSignedMoney(stats.current_balance_amount || 0))}</span>
                      </span>
                    </summary>
                    <div class="admin-collapse-body stack">
                      <div class="grid four-col inner-grid attendance-summary-grid">
                        <div class="detail-box">
                          <div class="detail-label">Aktuális egyenleg</div>
                          <div class="detail-value">${escapeHtml(formatSignedMoney(stats.current_balance_amount || 0))}</div>
                        </div>
                        <div class="detail-box">
                          <div class="detail-label">Könyvelt esemény</div>
                          <div class="detail-value">${escapeHtml(String(stats.entry_count || 0))}</div>
                        </div>
                        <div class="detail-box">
                          <div class="detail-label">Elvárt összesen</div>
                          <div class="detail-value">${escapeHtml(formatMoney(stats.total_expected_amount || 0))}</div>
                        </div>
                        <div class="detail-box">
                          <div class="detail-label">Befizetett összesen</div>
                          <div class="detail-value">${escapeHtml(formatMoney(stats.total_actual_paid_amount || 0))}</div>
                        </div>
                      </div>
                      <div class="grid three-col inner-grid top-space attendance-summary-grid">
                        <div class="detail-box finance-carry-box ${stats.debt_amount ? 'is-debt' : ''}">
                          <div class="detail-label">Nyitott tartozás</div>
                          <div class="detail-value">${escapeHtml(formatMoney(stats.debt_amount || 0))}</div>
                        </div>
                        <div class="detail-box finance-carry-box ${stats.credit_amount ? 'is-credit' : ''}">
                          <div class="detail-label">Felhasználható előleg</div>
                          <div class="detail-value">${escapeHtml(formatMoney(stats.credit_amount || 0))}</div>
                        </div>
                        <div class="detail-box finance-carry-box">
                          <div class="detail-label">Kézi korrekciók</div>
                          <div class="detail-value">${escapeHtml(formatMoney(stats.total_adjustment_amount || 0))}</div>
                        </div>
                      </div>
                      ${
                        getUserPaymentProfile(member)
                          ? `
                            <div class="event-card top-space">
                              <div class="row between align-center wrap gap">
                                <strong>Játékos fizetési profilja</strong>
                                <span class="badge badge-draft">${escapeHtml(getPaymentProviderLabel(member.payment_provider))}</span>
                              </div>
                              <div class="grid two-col inner-grid top-space attendance-summary-grid">
                                <div class="detail-box">
                                  <div class="detail-label">Felhasználónév / azonosító</div>
                                  <div class="detail-value">${escapeHtml(member.payment_username || 'Nincs megadva')}</div>
                                </div>
                                <div class="detail-box">
                                  <div class="detail-label">QR-kód</div>
                                  <div class="detail-value">${member.payment_qr_data_url ? 'Elérhető' : 'Nincs feltöltve'}</div>
                                </div>
                              </div>
                              ${member.payment_qr_data_url ? `<div class="row gap wrap top-space"><button class="btn btn-secondary" type="button" data-payment-qr-user-id="${escapeHtml(member.user_id)}" data-payment-qr-role="member">QR-kód megnyitása</button></div>` : ''}
                            </div>
                          `
                          : ''
                      }
                      <div class="attendance-row attendance-ledger-row">
                        <div class="attendance-row-main">
                          <div class="attendance-row-name">Külön pénzügyi korrekció</div>
                          <div class="small muted">Pozitív összeg: befizetés vagy jóváírás. Negatív összeg: visszaterhelés vagy admin korrekció.</div>
                        </div>
                        <div class="attendance-row-payment">
                          <label class="label small" for="financeAdjustment_${escapeHtml(member.user_id)}">Összeg</label>
                          <input
                            id="financeAdjustment_${escapeHtml(member.user_id)}"
                            class="attendance-payment-input"
                            type="number"
                            step="1"
                            data-finance-adjustment-amount
                            data-finance-user-id="${escapeHtml(member.user_id)}"
                            value="${stats.debt_amount ? escapeHtml(String(stats.debt_amount)) : ''}"
                            placeholder="pl. 1700 vagy -500"
                          />
                        </div>
                        <div class="attendance-row-payment">
                          <label class="label small" for="financeAdjustmentNote_${escapeHtml(member.user_id)}">Megjegyzés</label>
                          <input
                            id="financeAdjustmentNote_${escapeHtml(member.user_id)}"
                            class="attendance-payment-input"
                            type="text"
                            data-finance-adjustment-note
                            data-finance-user-id="${escapeHtml(member.user_id)}"
                            placeholder="pl. utólagos átutalás"
                          />
                        </div>
                        <div class="attendance-row-actions">
                          <button
                            class="btn"
                            type="button"
                            data-team-summary-action="record-finance-adjustment"
                            data-finance-user-id="${escapeHtml(member.user_id)}"
                          >
                            Korrekció rögzítése
                          </button>
                        </div>
                      </div>
                      ${
                        entries.length
                          ? entries.map(entry => `
                              <div class="attendance-row attendance-ledger-row">
                                <div class="attendance-row-main">
                                  <div class="row between align-center wrap gap">
                                    <div class="attendance-row-name">${escapeHtml(entry.event_title || 'Névtelen esemény')}</div>
                                    ${renderFinanceEntryTypeBadge(entry.entry_type)}
                                  </div>
                                  <div class="small muted">${escapeHtml(formatDateTime(entry.event_start_at))}</div>
                                  <div class="small muted">${renderFinanceEntryLocationLine(entry)}</div>
                                </div>
                                <div class="detail-box">
                                  <div class="detail-label">${escapeHtml(entry.entry_type === 'adjustment' ? 'Korrekció összege' : 'Rendezendő')}</div>
                                  <div class="detail-value">${escapeHtml(formatMoney(entry.entry_type === 'adjustment' ? Math.abs(entry.actual_paid_amount || 0) : (entry.settlement_target_amount || 0)))}</div>
                                </div>
                                <div class="detail-box">
                                  <div class="detail-label">Befizetett</div>
                                  <div class="detail-value">${escapeHtml(formatMoney(entry.actual_paid_amount || 0))}</div>
                                </div>
                                <div class="detail-box">
                                  <div class="detail-label">Eltérés</div>
                                  <div class="detail-value ${Number(entry.event_delta_amount || entry.delta_amount || 0) > 0 ? 'finance-delta-positive' : Number(entry.event_delta_amount || entry.delta_amount || 0) < 0 ? 'finance-delta-negative' : 'finance-delta-neutral'}">${escapeHtml(formatSignedMoney(entry.event_delta_amount ?? entry.delta_amount ?? 0))}</div>
                                </div>
                                <div class="detail-box">
                                  <div class="detail-label">Egyenleg utána</div>
                                  <div class="detail-value">${escapeHtml(formatSignedMoney(entry.balance_after_event ?? entry.balance_after_amount ?? 0))}</div>
                                </div>
                              </div>
                            `).join('')
                          : '<div class="small muted">Ehhez a játékoshoz még nincs könyvelt pénzügyi sor.</div>'
                      }
                    </div>
                  </details>
                `;
              }).join('')}
            </div>`
          : '<div class="small muted top-space">A mostani szűrővel nincs megjeleníthető játékos.</div>'
      }
    </div>
  `;
}

function renderAdminAttendanceManager() {
  const detail = state.selectedAdminEventDetail;
  const event = detail?.event;
  if (!event || !canManageAttendanceForEvent(event)) return '';

  const going = detail?.registrations?.going || [];
  const summary = detail?.summary?.attendanceSummary || {};
  const isAwaitingFinish = event.status !== 'finished' && isAwaitingAdminClosureEvent(event);
  const canFinishNow = hasCompletedAttendanceBookkeeping(detail);
  const focusStage = getAdminAttendanceFocusStage(detail);
  const isAttendanceStage = focusStage.stage === 'attendance';
  const isPaymentsStage = focusStage.stage === 'payments';
  const isFinishStage = focusStage.stage === 'finish';
  const focusStageLabel =
    isAttendanceStage ? 'jelenlét' :
    isPaymentsStage ? 'könyvelés' :
    isFinishStage ? 'lezárás' :
    'ellenőrzés';
  const settlementSummaryLabel =
    isAttendanceStage ? 'Előbb a jelenlétet rögzítsd mindenkinél.' :
    isPaymentsStage ? 'Most a tényleges befizetéseket ellenőrizd és írd át, ha kell.' :
    isFinishStage ? 'A jelenlét és a pénzügy rendben van, most zárhatod az eseményt.' :
    'A lezárt eseménynél itt már csak ellenőrzöd a rögzített állapotot.';

  return `
    <div class="event-card admin-workspace-guide top-space">
      <div class="row between align-center wrap gap">
        <strong>${escapeHtml(focusStage.title)}</strong>
        <span class="badge ${isAttendanceStage ? 'badge-warning' : isPaymentsStage ? 'badge-draft' : isFinishStage ? 'badge-success' : 'badge-muted'}">${escapeHtml(focusStage.stage)}</span>
      </div>
      <div class="small muted top-space">${escapeHtml(focusStage.description)}</div>
    </div>
    <div class="event-card finance-settlement-hero top-space">
      <div class="row between align-center wrap gap">
        <div>
          <strong>Aktuális elszámolási fókusz</strong>
          <div class="small muted top-space">${escapeHtml(settlementSummaryLabel)}</div>
        </div>
        <span class="badge ${isAttendanceStage ? 'badge-warning' : isPaymentsStage ? 'badge-draft' : isFinishStage ? 'badge-success' : 'badge-muted'}">${escapeHtml(focusStageLabel)}</span>
      </div>
      <div class="grid three-col inner-grid top-space attendance-summary-grid">
        <div class="detail-box">
          <div class="detail-label">Megjelent</div>
          <div class="detail-value">${escapeHtml(String(Number(summary.presentCount ?? summary.present_count ?? 0)))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">No-show</div>
          <div class="detail-value">${escapeHtml(String(Number(summary.noShowCount ?? summary.no_show_count ?? 0)))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Még nincs jelölve</div>
          <div class="detail-value">${escapeHtml(String(Number(summary.unmarkedCount ?? summary.unmarked_count ?? 0)))}</div>
        </div>
      </div>
    </div>
    <div class="finance-task-block${isAttendanceStage ? ' is-current' : ''}">
      ${renderAttendanceSummary(summary, { title: 'Jelenlét / no-show összesítő' })}
    </div>
    <div class="finance-task-block${isPaymentsStage ? ' is-current' : ''}">
      ${renderAttendanceFinanceSummary(detail, going)}
    </div>
    <div class="event-card top-space finance-task-block${isAttendanceStage || isFinishStage ? ' is-current' : ''}">
      <div class="row between align-center wrap gap">
        <strong>No-show jelölés</strong>
        <div class="row gap wrap align-center">
          <span class="badge badge-warning">csak going játékosok</span>
          <button
            class="btn btn-secondary"
            type="button"
            data-team-summary-action="mark-all-present"
          >
            Mind megjelent
          </button>
        </div>
      </div>
      <div class="small muted top-space">
        ${isAwaitingFinish
          ? 'Ez az esemény már megvalósult. Előbb adminisztráld a jelenlétet és a befizetéseket, majd kézzel zárd le az eseményt.'
          : 'Lezárt eseménynél itt látod a rögzített jelenlétet és a pénzügyi könyvelést.'}
      </div>
      <div class="stack top-space">
          ${
            going.length
              ? going.map(player => `
                <div class="attendance-row">
                  <div class="attendance-row-main">
                    <div class="attendance-row-name">${escapeHtml(player.name || 'Ismeretlen játékos')}</div>
                    <div class="small muted">${escapeHtml(player.email || '-')}</div>
                    <div class="grid four-col inner-grid top-space attendance-summary-grid finance-player-summary-grid">
                      <div class="detail-box">
                        <div class="detail-label">Esemény díja</div>
                        <div class="detail-value">${escapeHtml(formatMoney(getAttendanceExpectedTotalAmount(player, detail)))}</div>
                      </div>
                      <div class="detail-box">
                        <div class="detail-label">Előző egyenleg</div>
                        <div class="detail-value">${escapeHtml(formatSignedMoney(Number(player.finance_balance_before_event || 0)))}</div>
                      </div>
                      <div class="detail-box">
                        <div class="detail-label">Most rendezendő</div>
                        <div class="detail-value">${escapeHtml(formatMoney(getAttendanceSettlementTargetAmount(player, detail)))}</div>
                      </div>
                      <div class="detail-box">
                        <div class="detail-label">Utána egyenleg</div>
                        <div class="detail-value ${escapeHtml(getSignedMoneyClass(Number.isFinite(Number(player.finance_balance_after_event)) ? Number(player.finance_balance_after_event) : getAttendanceProjectedBalanceAfter(player, detail)))}" data-attendance-projected-after data-attendance-user-id="${escapeHtml(player.user_id)}">${escapeHtml(formatSignedMoney(Number.isFinite(Number(player.finance_balance_after_event)) ? Number(player.finance_balance_after_event) : getAttendanceProjectedBalanceAfter(player, detail)))}</div>
                      </div>
                    </div>
                    <div class="finance-player-settlement-strip top-space">
                      <div class="finance-player-settlement-item">
                        <span class="detail-label">Állapot most</span>
                        <span class="detail-value">${attendanceStatusBadge(player.attendance_status)}</span>
                      </div>
                      <div class="finance-player-settlement-item">
                        <span class="detail-label">Tényleges befizetés</span>
                        <span class="detail-value" data-attendance-actual-paid data-attendance-user-id="${escapeHtml(player.user_id)}">${escapeHtml(formatMoney(Number(readAttendancePaymentAmountForUser(player.user_id) ?? getAttendancePaymentInputValue(player, detail) ?? 0)))}</span>
                      </div>
                      <div class="finance-player-settlement-item">
                        <span class="detail-label">Eltérés most</span>
                        <span class="detail-value ${escapeHtml(getSignedMoneyClass(getAttendanceProjectedDelta(player, detail)))}" data-attendance-payment-delta data-attendance-user-id="${escapeHtml(player.user_id)}">${escapeHtml(formatSignedMoney(getAttendanceProjectedDelta(player, detail)))}</span>
                      </div>
                    </div>
                    ${
                      getUserPaymentProfile(player)
                        ? `
                          <div class="row gap wrap top-space">
                            <span class="badge badge-draft">${escapeHtml(getPaymentProviderLabel(player.payment_provider))}</span>
                            <span class="small muted">${escapeHtml(player.payment_username || 'QR-kód elérhető')}</span>
                            ${player.payment_qr_data_url ? `<button class="btn btn-ghost" type="button" data-payment-qr-user-id="${escapeHtml(player.user_id)}" data-payment-qr-role="member">QR megnyitása</button>` : ''}
                          </div>
                        `
                        : ''
                    }
                  </div>
                  <div class="attendance-row-payment">
                    <label class="label small" for="attendancePayment_${escapeHtml(player.user_id)}">Befizetés</label>
                    <input
                      id="attendancePayment_${escapeHtml(player.user_id)}"
                      class="attendance-payment-input"
                      type="number"
                      min="0"
                      step="100"
                      data-attendance-payment
                      data-attendance-user-id="${escapeHtml(player.user_id)}"
                      value="${escapeHtml(getAttendancePaymentInputValue(player, detail))}"
                    />
                    <div class="small muted" data-attendance-payment-hint data-attendance-user-id="${escapeHtml(player.user_id)}">
                      Célösszeg most: ${escapeHtml(formatMoney(getAttendanceSettlementTargetAmount(player, detail)))}
                    </div>
                  </div>
                  <div class="attendance-row-actions">
                    <button
                      class="btn btn-secondary"
                      type="button"
                    data-team-summary-action="set-attendance"
                    data-attendance-user-id="${escapeHtml(player.user_id)}"
                    data-attendance-status="present"
                  >
                    Megjelent
                  </button>
                  <button
                    class="btn btn-danger"
                    type="button"
                    data-team-summary-action="set-attendance"
                    data-attendance-user-id="${escapeHtml(player.user_id)}"
                    data-attendance-status="no_show"
                  >
                    No-show
                  </button>
                </div>
              </div>
            `).join('')
            : '<div class="small muted">Ehhez a lezárt eseményhez nincs going játékos, ezért nincs kit jelölni.</div>'
        }
      </div>
      ${
        isAwaitingFinish
          ? `
            <div class="top-space row between align-center wrap gap finance-finish-row${isFinishStage ? ' is-current' : ''}">
              <div class="small muted">
                ${canFinishNow
                  ? 'Minden going játékos adminisztrálva van. Az esemény most már lezárható.'
                  : 'Az esemény addig nem zárható le, amíg minden going játékosnál nincs rögzítve a megjelent vagy no-show állapot.'}
              </div>
              <button
                class="btn"
                type="button"
                data-team-summary-action="finish-attendance-event"
                data-event-id="${escapeHtml(event.id)}"
                ${canFinishNow ? '' : 'disabled'}
              >
                Esemény lezárása
              </button>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function formatEventReadiness(readiness) {
  const labels = {
    open: 'jelentkezés nyitva',
    draw_published: 'csapatok kihirdetve',
    draw_stale: 'újraleosztás kell',
    below_minimum: 'minimum alatt',
    cancelled: 'elmarad',
    finished: 'lezárt'
  };

  return labels[readiness] || 'szervezes alatt';
}

function eventReadinessBadge(readiness) {
  const map = {
    open: 'badge badge-draft',
    draw_published: 'badge badge-success',
    draw_stale: 'badge badge-warning',
    below_minimum: 'badge badge-danger',
    cancelled: 'badge badge-danger',
    finished: 'badge badge-muted'
  };

  return `<span class="${map[readiness] || 'badge badge-muted'}">${escapeHtml(formatEventReadiness(readiness))}</span>`;
}

function getEventReadinessTone(readiness) {
  if (readiness === 'draw_published') return 'is-good';
  if (readiness === 'draw_stale') return 'is-warning';
  if (readiness === 'below_minimum' || readiness === 'cancelled') return 'is-danger';
  return 'is-neutral';
}

function buildEventReadinessMessage(event) {
  const readiness = event?.event_readiness || event?.eventReadiness;

  if (readiness === 'draw_published') {
    return 'A csapatok jelenleg kihirdetett, stabil állapotban vannak.';
  }

  if (readiness === 'draw_stale') {
    return 'Változott a névsor, új csapatleosztás szükséges.';
  }

  if (readiness === 'below_minimum') {
    return 'A létszám a minimum alá esett, az esemény bizonytalanná vált.';
  }

  if (readiness === 'cancelled') {
    return 'Az esemény elmarad, új jelentkezés már nem várható.';
  }

  if (readiness === 'finished') {
    return 'Az esemény lezárult.';
  }

  return 'Az esemény szervezése aktív, a jelentkezések nyitottak.';
}

function renderEventReadinessPanel(event, options = {}) {
  const readiness = event?.event_readiness || event?.eventReadiness;
  if (!readiness) return '';

  const { compact = false } = options;
  return `
    <div class="readiness-panel ${getEventReadinessTone(readiness)} ${compact ? 'compact' : ''}">
      <div class="row between align-center wrap gap">
        <strong>Állapot</strong>
        ${eventReadinessBadge(readiness)}
      </div>
      <div class="small">${escapeHtml(buildEventReadinessMessage(event))}</div>
    </div>
  `;
}

function formatParticipantPosition(index) {
  return `${index + 1}.`;
}

function renderParticipantList(items = [], options = {}) {
  const {
    emptyText = 'Nincs adat.',
    compact = false,
    maxVisible = null,
    numbered = false
  } = options;

  if (!Array.isArray(items) || !items.length) {
    return `<div class="muted small">${escapeHtml(emptyText)}</div>`;
  }

  const visibleItems = Number.isInteger(maxVisible) ? items.slice(0, maxVisible) : items;

  return `
    <div class="participant-list ${compact ? 'compact' : ''}">
      ${visibleItems.map((item, index) => `
        <div class="participant-chip ${compact ? 'compact' : ''}">
          ${numbered ? `<span class="participant-position">${escapeHtml(formatParticipantPosition(index))}</span>` : ''}
          <span class="participant-name">${escapeHtml(item.name || 'Ismeretlen játékos')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function getDetailResultForEvent(eventId, role = 'user') {
  const selectedDetail = role === 'admin' ? state.selectedAdminEventDetail : state.selectedUserEventDetail;
  if (selectedDetail?.event?.id === eventId) {
    return selectedDetail;
  }

  const cachedDetails = role === 'admin' ? state.adminEventDetailsById : state.userEventDetailsById;
  return cachedDetails[String(eventId)] || null;
}

function renderEventParticipantPreview(event, options = {}) {
  const { role = 'user', compact = false } = options;
  const detail = getDetailResultForEvent(event.id, role);
  if (!detail?.registrations) return '';

  const going = detail.registrations.going || [];
  const waiting = detail.registrations.waitingList || [];
  const rankWaiting = detail.registrations.rankWaitingList || [];

  return `
    <div class="participant-preview ${compact ? 'compact' : ''}">
      <div class="participant-preview-section">
        <div class="participant-preview-label">Kik jönnek</div>
        ${renderParticipantList(going, {
          emptyText: 'Még nincs going jelentkező.',
          compact,
          numbered: true
        })}
      </div>
      <div class="participant-preview-section">
        <div class="participant-preview-label">Várólista</div>
        ${renderParticipantList(waiting, {
          emptyText: 'Nincs várólista.',
          compact,
          numbered: true
        })}
      </div>
      <div class="participant-preview-section">
        <div class="participant-preview-label">Rangvárólista</div>
        ${renderParticipantList(rankWaiting, {
          emptyText: 'Nincs rangvárólista.',
          compact,
          numbered: true
        })}
      </div>
    </div>
  `;
}

function readNotificationPreferencesFromForm() {
  const preferences = {};

  document.querySelectorAll('[data-notification-pref]').forEach(input => {
    preferences[input.dataset.notificationPref] = Boolean(input.checked);
  });

  return preferences;
}

function resetNotificationPreferencesForm() {
  document.querySelectorAll('[data-notification-pref]').forEach(input => {
    const key = input.dataset.notificationPref;
    input.checked = DEFAULT_NOTIFICATION_PREFERENCES[key] ?? false;
  });

  syncNotificationPreferenceCards();
}

function syncNotificationPreferenceCards() {
  document.querySelectorAll('[data-notification-pref-card]').forEach(card => {
    const input = card.querySelector('[data-notification-pref]');
    if (!input) return;

    card.classList.toggle('is-enabled', Boolean(input.checked));
    card.classList.toggle('is-disabled', !input.checked);
  });
}

function sortEventsByStart(events = []) {
  return [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

function getUpcomingEvents(events = []) {
  const now = Date.now();
  return sortEventsByStart(events).filter(event => {
    const ts = new Date(event.start_at).getTime();
    if (Number.isNaN(ts)) return false;
    if (event.status === 'cancelled' || event.status === 'finished') return false;
    return ts >= now;
  });
}

const USER_FOCUS_HORIZON_MS = 72 * 60 * 60 * 1000;

function getUserEventFocusRank(event, now = Date.now()) {
  const ts = new Date(event?.start_at).getTime();
  if (Number.isNaN(ts)) return null;
  if (event?.status === 'cancelled' || event?.status === 'finished') return null;

  const isUpcoming = ts >= now;
  const isPublished = event?.status === 'published';
  const hasActiveRegistration = ['going', 'waiting_list', 'waiting_list_rank'].includes(event?.my_registration_status);
  const isWithinFocusHorizon = isUpcoming && ts - now <= USER_FOCUS_HORIZON_MS;

  if (isUpcoming && hasActiveRegistration && isPublished && isWithinFocusHorizon) return 0;
  if (isUpcoming && hasActiveRegistration && isPublished) return 1;
  if (isUpcoming && hasActiveRegistration) return 2;
  if (isUpcoming && isPublished && isWithinFocusHorizon) return 3;
  if (isUpcoming && isPublished) return 4;
  if (isUpcoming) return 5;
  return 6;
}

function pickRelevantUserEvent(events = [], options = {}) {
  const { allowPastFallback = false } = options;
  const now = Date.now();

  const candidates = (events || [])
    .map(event => ({
      event,
      rank: getUserEventFocusRank(event, now),
      ts: new Date(event?.start_at).getTime(),
      createdTs: new Date(event?.created_at || 0).getTime()
    }))
    .filter(item => item.rank != null && !Number.isNaN(item.ts) && (allowPastFallback || item.rank < 6))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.createdTs - b.createdTs;
    });

  return candidates[0]?.event || null;
}

function getNextEvent(events = []) {
  return pickRelevantUserEvent(events) || getUpcomingEvents(events)[0] || null;
}

function padCountdownPart(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
}

function formatCountdown(value) {
  if (!value) return '-';
  const diffMs = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return '-';

  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days} nap ${padCountdownPart(hours)}:${padCountdownPart(minutes)}:${padCountdownPart(seconds)}`;
}

function renderCountdown(value) {
  const isoValue = value ? new Date(value).toISOString() : '';
  return `<span class="live-countdown" data-countdown-to="${escapeHtml(isoValue)}">${escapeHtml(formatCountdown(value))}</span>`;
}

function refreshLiveCountdowns(root = document) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('.live-countdown[data-countdown-to]').forEach(node => {
    const target = node.getAttribute('data-countdown-to');
    node.textContent = formatCountdown(target);
  });
}

function ensureCountdownTicker() {
  if (state.countdownTimer) return;

  state.countdownTimer = window.setInterval(() => {
    refreshLiveCountdowns(document);
  }, 1000);
}

function buildMapsUrl(event) {
  const raw = event?.location_address || event?.location_name || '';
  if (!raw) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
}

function formatTeamRole(role) {
  const map = {
    team_admin: 'csapatkapitány',
    team_manager: 'csapatkapitány-helyettes',
    member: 'tag',
    platform_owner: 'platform gazda'
  };

  return map[role] || role || '-';
}

function buildEventInsightChips(event) {
  const maxPlayers = Number(event.max_players || 0);
  const goingCount = Number(event.going_count || 0);
  const waitingCount = Number(event.waiting_count || 0);
  const rankWaitingCount = Number(event.rank_waiting_count || 0);
  const spotsLeft = Number(event.spots_left || Math.max(maxPlayers - goingCount, 0));

  return [
    { label: 'Jelentkezett', value: `${goingCount}/${maxPlayers || '?'} fő` },
    { label: 'Várólista', value: `${waitingCount} fő` },
    { label: 'Rangvárólista', value: `${rankWaitingCount} fő` },
    { label: 'Szabad hely', value: `${spotsLeft} fő` },
    { label: 'Hátralévő idő', valueHtml: renderCountdown(event.start_at) }
  ];
}

function renderMapsLink(event) {
  const mapsUrl = buildMapsUrl(event);
  if (!mapsUrl) return '<span class="muted small">Nincs útvonal adat.</span>';
  return `<a class="btn btn-ghost btn-inline-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Útvonalterv</a>`;
}

function buildGoogleCalendarUrl(event) {
  const start = new Date(event?.start_at);
  if (Number.isNaN(start.getTime())) return '';

  const end = new Date(start.getTime() + (90 * 60 * 1000));
  const formatCalendarDate = value => value.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
  const details = [
    event?.description || '',
    event?.rules_text ? `Szabályok: ${event.rules_text}` : '',
    event?.team_name ? `Csapat: ${event.team_name}` : ''
  ].filter(Boolean).join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event?.title || 'Foci esemény',
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details,
    location: event?.location_name || ''
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderGoogleCalendarLink(event) {
  const calendarUrl = buildGoogleCalendarUrl(event);
  if (!calendarUrl) return '';

  return `<a class="btn btn-ghost btn-inline-link" href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener noreferrer">Google Naptár</a>`;
}

function buildIcsDownloadUrl(event) {
  const start = new Date(event?.start_at);
  if (Number.isNaN(start.getTime())) return '';

  const end = new Date(start.getTime() + (90 * 60 * 1000));
  const formatIcsDate = value => value.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Foci App//HU',
    'BEGIN:VEVENT',
    `UID:${event.id || `event-${start.getTime()}`}@foci-app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${String(event.title || 'Foci esemény').replace(/\n/g, ' ')}`,
    `LOCATION:${String(event.location_name || event.location_address || '').replace(/\n/g, ' ')}`,
    `DESCRIPTION:${String(event.description || '').replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

function renderIcsExportLink(event) {
  const icsUrl = buildIcsDownloadUrl(event);
  if (!icsUrl) return '';

  const fileName = `${String(event.title || 'foci-esemeny')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-') || 'foci-esemeny'}.ics`;

  return `<a class="btn btn-ghost btn-inline-link" href="${icsUrl}" download="${escapeHtml(fileName)}">ICS export</a>`;
}

function getEventCancellationCount(event) {
  return Number(event?.my_cancelled_count || 0);
}

function hasReachedEventCancellationLimit(event) {
  return Boolean(event?.registration_limit_reached) || getEventCancellationCount(event) >= 2;
}

function canAttemptEventRegistration(event) {
  const status = event?.my_registration_status;
  const isOpen = Boolean(event?.is_registration_open) && event?.status === 'published';
  return (status == null || status === 'cancelled') && isOpen && !hasReachedEventCancellationLimit(event);
}

function buildEventRegistrationLimitMessage(event) {
  const cancellationCount = Math.max(getEventCancellationCount(event), 2);
  return `Erre az eseményre már ${cancellationCount} alkalommal is lemondtad a részvételedet. Fordulj az adminhoz, ha újra szeretnél jelentkezni.`;
}

function renderBlockedRegistrationAction(event) {
  if (!hasReachedEventCancellationLimit(event)) return '';

  return `
    <button
      class="btn btn-secondary"
      type="button"
      data-register-limit-event-id="${event.id}"
      aria-disabled="true"
      title="${escapeHtml(buildEventRegistrationLimitMessage(event))}"
    >
      Jelentkezem
    </button>
  `;
}

function renderMyEventActionButtons(event) {
  const actions = [];
  const status = event.my_registration_status;

  if (canAttemptEventRegistration(event)) {
    actions.push(`<button class="btn" type="button" data-register-event-id="${event.id}">Jelentkezem</button>`);
  } else if (status === 'cancelled' && hasReachedEventCancellationLimit(event)) {
    actions.push(renderBlockedRegistrationAction(event));
  }

  if (status === 'going' || status === 'waiting_list' || status === 'waiting_list_rank') {
    actions.push(`<button class="btn btn-danger" type="button" data-cancel-event-id="${event.id}">Lemondom</button>`);
  }

  actions.push(renderGoogleCalendarLink(event));
  actions.push(renderIcsExportLink(event));
  actions.push(`<button class="btn btn-secondary" type="button" data-open-event-id="${event.id}">Részletes nézet</button>`);
  return actions.filter(Boolean).join('');
}

function renderEventAccordionBody(event) {
  const fieldBits = [event.field_size, event.surface_type, event.field_quality].filter(Boolean).join(' · ');
  const paymentBits = [];

  if (event.payment_notes) {
    paymentBits.push(event.payment_notes);
  }

  return `
    <div class="accordion-body stack">
      ${renderHolidayWarning(getHolidayWarningFromEvent(event))}
      <div class="grid two-col inner-grid event-detail-grid">
        <div class="detail-box">
          <div class="detail-label">Pálya / helyszín</div>
          <div class="detail-value">${escapeHtml(event.location_name || '-')}</div>
          <div class="small muted">${escapeHtml(event.location_address || 'Nincs pontos cím megadva.')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Saját státusz</div>
          <div class="detail-value">${registrationStatusBadge(event.my_registration_status)}</div>
          <div class="small muted">${escapeHtml(
            event.my_registration_status === 'waiting_list'
              ? 'Jelenleg a kapacitás-várólistán várakozol, automatikus felpromóció lehetséges.'
              : event.my_registration_status === 'waiting_list_rank'
                ? 'Már előjelentkeztél, de a rangsávod nyitásáig rangvárólistán maradsz.'
                : 'A saját jelenléti státuszod az eseményen.'
          )}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Leírás</div>
          <div class="detail-value detail-multiline">${escapeHtml(event.description || 'Nincs külön leírás.')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Játékinfó</div>
          <div class="detail-value detail-multiline">${escapeHtml(fieldBits || 'Nincs részletes pályaadat.')}</div>
          <div class="small muted">Szabályok: ${escapeHtml(event.rules_text || 'nincs megadva')}</div>
        </div>
      </div>
      <div class="row gap wrap align-center">
        ${renderMapsLink(event)}
        ${renderGoogleCalendarLink(event)}
        ${renderIcsExportLink(event)}
        ${paymentBits.length ? `<span class="small muted">Fizetési megjegyzés: ${escapeHtml(paymentBits.join(' · '))}</span>` : '<span class="small muted">Nincs külön fizetési megjegyzés.</span>'}
      </div>
    </div>
  `;
}

function renderHeroEvent(event) {
  if (!els.nextEventHero) return;

  if (!event) {
    els.nextEventHero.innerHTML = emptyState(
      'Nincs közelgő eseményed.',
      'Ha a csapataidhoz új esemény készül vagy jelentkezel egyre, itt fogod látni a legközelebbit.'
    );
    return;
  }

  const chips = buildEventInsightChips(event);
  const heroDate = formatHeroEventDate(event.start_at);
  const heroWeatherWidgetId = 'heroEventWeatherWidget';

  els.nextEventHero.innerHTML = `
    <div class="focus-event-card">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">${escapeHtml(event.team_name || 'Ismeretlen csapat')}</div>
          <h3 class="focus-event-title">${escapeHtml(event.title)}</h3>
          <div class="focus-event-date-block">
            <div class="focus-event-weekday">${escapeHtml(heroDate.weekday)}</div>
            <div class="focus-event-subtitle">${escapeHtml(heroDate.dateText)} · ${escapeHtml(heroDate.timeText)}</div>
          </div>
        </div>
        <div class="stack hero-status-stack">
          ${statusBadge(event.status)}
          ${registrationStatusBadge(event.my_registration_status)}
        </div>
      </div>

      ${renderEventReadinessPanel(event, { compact: true })}
${renderRankRegistrationNotice(event.registration_window, { compact: true, currentStatus: event.my_registration_status })}

      <div class="hero-metrics top-space">
        ${chips.map(item => `
          <div class="mini-stat">
            <div class="mini-stat-label">${escapeHtml(item.label)}</div>
            <div class="mini-stat-value">${item.valueHtml || escapeHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>

      <div class="top-space">
        ${renderEventWeatherModule(event, { compact: true, widgetId: heroWeatherWidgetId })}
      </div>

      ${renderEventParticipantPreview(event, { role: 'user', compact: true })}

      <div class="row between wrap gap top-space align-center">
        <div class="small muted">Helyszín: ${escapeHtml(event.location_name || '-')} · ${escapeHtml(event.location_address || 'nincs pontos cím')}</div>
        <div class="row gap wrap event-actions-inline">
          ${renderMyEventActionButtons(event)}
          ${renderMapsLink(event)}
        </div>
      </div>

      <details class="event-accordion top-space" open>
        <summary>Részletek lenyitása</summary>
        ${renderEventAccordionBody(event)}
      </details>
    </div>
  `;

  hydrateEventWeatherWidget(heroWeatherWidgetId, event, { compact: true });
}

function renderUserOverview() {
  if (!els.userOverviewCards) return;

  const pendingInvites = state.myInvites.filter(invite => invite.status === 'pending').length;
  const activeTeams = state.myTeams.filter(team => team.membership_status === 'active').length;
  const nextEvent = getNextEvent(state.myEvents);
  const isInvitePulseActive = pendingInvites > 0 && state.userInvitePulseUntil > Date.now();
  const newEvents = getUserNewEvents(state.myEvents);
  const isNewEventsPulseActive = newEvents.length > 0 && state.userNewEventsPulseUntil > Date.now();

  els.userOverviewCards.innerHTML = [
    { label: 'Következő kezdés', value: nextEvent ? formatDateTime(nextEvent.start_at) : 'nincs' },
    { label: 'Saját státusz', value: nextEvent ? formatRegistrationStatus(nextEvent.my_registration_status) : 'nincs közelgő esemény' },
    {
      label: 'Új esemény',
      value: newEvents.length,
      action: newEvents.length > 0 ? 'new-events' : '',
      clickable: newEvents.length > 0,
      highlight: isNewEventsPulseActive,
      helper: newEvents.length > 0 ? 'Kattints a legközelebbi új eseményhez' : ''
    },
    {
      label: 'Függő meghívás',
      value: pendingInvites,
      action: pendingInvites > 0 ? 'pending-invites' : '',
      clickable: pendingInvites > 0,
      highlight: isInvitePulseActive,
      helper: pendingInvites > 0 ? 'Kattints az elfogadáshoz' : ''
    },
    { label: 'Aktív csapat', value: activeTeams }
  ].map(item => `
    <button
      class="stat-card ${item.clickable ? 'stat-card-button user-invite-alert-card' : ''} ${item.highlight ? 'is-pulsing' : ''}"
      type="button"
      ${item.action ? `data-user-overview-action="${escapeHtml(item.action)}"` : ''}
      ${item.clickable ? '' : 'disabled'}
    >
      <div class="stat-label">${escapeHtml(item.label)}</div>
      <div class="stat-value">${escapeHtml(item.value)}</div>
      ${item.helper ? `<div class="stat-helper">${escapeHtml(item.helper)}</div>` : ''}
    </button>
  `).join('');
}

function clearPendingInvitePulseTimer() {
  if (state.userInvitePulseTimer) {
    clearTimeout(state.userInvitePulseTimer);
    state.userInvitePulseTimer = null;
  }
}

function clearUserNewEventsPulseTimer() {
  if (state.userNewEventsPulseTimer) {
    clearTimeout(state.userNewEventsPulseTimer);
    state.userNewEventsPulseTimer = null;
  }
}

function clearPendingInviteJumpHighlight() {
  if (state.userInviteJumpHighlightTimer) {
    clearTimeout(state.userInviteJumpHighlightTimer);
    state.userInviteJumpHighlightTimer = null;
  }

  const inviteCard = els.myInvitesList?.closest('.card');
  inviteCard?.classList.remove('invite-jump-highlight');
  els.myInvitesList?.querySelectorAll('.invite-card.is-pending').forEach(card => {
    card.classList.remove('invite-card-highlight');
  });
}

function triggerPendingInvitePulse() {
  clearPendingInvitePulseTimer();

  const pendingInvites = state.myInvites.filter(invite => invite.status === 'pending').length;
  if (!pendingInvites) {
    state.userInvitePulseUntil = 0;
    renderUserOverview();
    return;
  }

  state.userInvitePulseUntil = Date.now() + 5000;
  renderUserOverview();
  state.userInvitePulseTimer = setTimeout(() => {
    state.userInvitePulseUntil = 0;
    state.userInvitePulseTimer = null;
    renderUserOverview();
  }, 5000);
}

function getUserNewEvents(events = state.myEvents) {
  const now = Date.now();
  const seenIds = new Set(getSeenUserEventIds(state.user?.id));

  return (events || [])
    .filter(event => {
      const startAtMs = new Date(event?.start_at).getTime();
      if (Number.isNaN(startAtMs) || startAtMs < now) return false;
      if (event?.status !== 'published') return false;
      if (!canAttemptEventRegistration(event)) return false;
      return !seenIds.has(String(event.id));
    })
    .sort((a, b) => {
      const aTs = new Date(a.start_at).getTime();
      const bTs = new Date(b.start_at).getTime();
      return aTs - bTs;
    });
}

function markUserEventAsSeen(eventId) {
  if (!eventId || !state.user?.id) return;
  const seenIds = new Set(getSeenUserEventIds(state.user.id));
  seenIds.add(String(eventId));
  saveSeenUserEventIds(state.user.id, [...seenIds]);
}

function triggerUserNewEventsPulse() {
  clearUserNewEventsPulseTimer();

  const newEvents = getUserNewEvents(state.myEvents);
  if (!newEvents.length) {
    state.userNewEventsPulseUntil = 0;
    renderUserOverview();
    return;
  }

  state.userNewEventsPulseUntil = Date.now() + 5000;
  renderUserOverview();
  state.userNewEventsPulseTimer = setTimeout(() => {
    state.userNewEventsPulseUntil = 0;
    state.userNewEventsPulseTimer = null;
    renderUserOverview();
  }, 5000);
}

async function jumpToNewestUnregisteredEvent() {
  const nextNewEvent = getUserNewEvents(state.myEvents)[0]
    || [...(state.myEvents || [])]
      .filter(event => canAttemptEventRegistration(event))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];

  if (!nextNewEvent?.id) {
    showMessage('Jelenleg nincs új vagy nyitott esemény, amire még nem jelentkeztél.', 'info');
    return;
  }

  markUserEventAsSeen(nextNewEvent.id);
  state.userNewEventsPulseUntil = 0;
  renderUserOverview();
  await openEventForUser(nextNewEvent.id);
  els.userEventDetail?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function jumpToPendingInvites() {
  if (!els.myInvitesList) return;

  clearPendingInviteJumpHighlight();

  if (typeof els.myInvitesList.scrollIntoView === 'function') {
    els.myInvitesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const inviteCard = els.myInvitesList.closest('.card');
  inviteCard?.classList.add('invite-jump-highlight');
  els.myInvitesList.querySelectorAll('.invite-card.is-pending').forEach(card => {
    card.classList.add('invite-card-highlight');
  });
  const firstAcceptButton = els.myInvitesList.querySelector('[data-my-invite-action="accept"]');
  if (typeof firstAcceptButton?.focus === 'function') {
    firstAcceptButton.focus({ preventScroll: true });
  }

  state.userInviteJumpHighlightTimer = setTimeout(() => {
    clearPendingInviteJumpHighlight();
  }, 3200);
}

function renderUserRankModule() {
  if (!els.userRankModule) return;

  const currentMember = getCurrentTeamMember();
  const rankModuleEnabled = isCurrentUserRankModuleEnabled();
  const currentProfile = getMemberRankProfile(currentMember);
  const rankSnapshot = currentMember?.rank_snapshot || null;
  const participationRatio = rankSnapshot?.stats?.participationRatio != null
    ? `${Math.round(rankSnapshot.stats.participationRatio * 100)}%`
    : 'még nincs adat';

  if (!currentMember) {
    els.userRankModule.innerHTML = emptyState(
      'Nincs aktív rangprofil.',
      'Amint van betöltött fókuszcsapatod, itt látod a saját rangodat és a ranglépcsőket.'
    );
    return;
  }

  els.userRankModule.innerHTML = `
    <div class="stack">
      <div class="rank-hero-card ${rankModuleEnabled ? 'is-enabled' : 'is-disabled'}">
        <div class="row between align-center wrap gap">
          <div>
            <div class="small muted">Saját rangprofil</div>
            <div class="rank-hero-headline">
              <span class="rank-hero-emoji">${currentProfile.emoji}</span>
              <div>
                <div class="rank-hero-title">${escapeHtml(currentProfile.label)}</div>
                <div class="small muted">${rankModuleEnabled ? 'A rangmodul aktív ennél a csapatnál.' : 'A rangmodul jelenleg ki van kapcsolva.'}</div>
              </div>
            </div>
          </div>
          <div class="stack hero-status-stack">
            <span class="badge ${rankModuleEnabled ? 'badge-success' : 'badge-muted'}">${rankModuleEnabled ? 'RANG MODUL ON' : 'RANG MODUL OFF'}</span>
            ${currentProfile.value ? `<span class="badge badge-draft">Aktív rang: ${escapeHtml(String(currentProfile.value))}</span>` : '<span class="badge badge-warning">Vendég státusz</span>'}
            ${rankSnapshot?.baseRankValue ? `<span class="badge badge-muted">Alap rang: ${escapeHtml(String(rankSnapshot.baseRankValue))}</span>` : ''}
          </div>
        </div>
        <div class="small top-space">${escapeHtml(currentProfile.description)}</div>
        <div class="small muted top-space">Ez a modul azt mutatja, hogy a csapaton belül melyik jelentkezési hullámba tartozol. A vendég státusz külön jelölés, nem sorszámos rang.</div>
        <div class="grid three-col inner-grid top-space">
          <div class="detail-box">
            <div class="detail-label">Értékelt esemény</div>
            <div class="detail-value">${escapeHtml(String(rankSnapshot?.stats?.evaluatedEvents ?? 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Megvalósult részvétel</div>
            <div class="detail-value">${escapeHtml(String(rankSnapshot?.stats?.attendedEvents ?? 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Részvételi arány</div>
            <div class="detail-value">${escapeHtml(participationRatio)}</div>
          </div>
        </div>
      </div>

      <div class="rank-list-grid">
        ${Object.values(USER_RANK_LABELS)
          .sort((a, b) => b.value - a.value)
          .map(rank => `
            <div class="rank-list-card ${currentProfile.value === rank.value && currentProfile.status === 'ranked' ? 'is-current-card' : ''}">
              <div class="rank-list-emoji">${rank.emoji}</div>
              <div class="rank-list-title">${escapeHtml(String(rank.value))} = ${escapeHtml(rank.label)}</div>
              <div class="small muted">${escapeHtml(rank.description)}</div>
            </div>
          `).join('')}
        <div class="rank-list-card ${currentProfile.status === 'guest' ? 'is-current-card' : ''}">
          <div class="rank-list-emoji">${GUEST_RANK_LABEL.emoji}</div>
          <div class="rank-list-title">${escapeHtml(GUEST_RANK_LABEL.label)}</div>
          <div class="small muted">${escapeHtml(GUEST_RANK_LABEL.description)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderEventWeatherModule(event, options = {}) {
  const { compact = false, widgetId = '' } = options;
  const title = compact ? 'Időjárás az eseményhez' : 'Időjárás';
  const subtitle = event?.start_at
    ? `Előrejelzés a kezdés idejére: ${formatDateTime(event.start_at)}.`
    : 'Az előrejelzés a kiválasztott esemény kezdéséhez fog igazodni.';
  const locationText = getEventWeatherQuery(event)
    ? `Helyszín: ${getEventWeatherQuery(event)}.`
    : 'A pontos helyszín még nincs megadva.';

  return `
    <div id="${escapeHtml(widgetId)}" class="weather-placeholder-card ${compact ? 'compact' : ''}">
      <div class="weather-placeholder-icon">☀️</div>
      <div>
        <div class="rank-hero-title">${escapeHtml(title)}</div>
        <div class="small muted">${escapeHtml(subtitle)}</div>
        <div class="small muted">${escapeHtml(locationText)} Időjárási adat betöltése...</div>
      </div>
    </div>
  `;
}

function renderFinanceBalanceBadge(balanceAmount) {
  const amount = Number(balanceAmount || 0);
  if (amount > 0) {
    return '<span class="badge badge-success">többleted van</span>';
  }
  if (amount < 0) {
    return '<span class="badge badge-danger">tartozás</span>';
  }
  return '<span class="badge badge-muted">rendezett</span>';
}

function renderFinanceCarryCard(finance) {
  const balanceAmount = Number(finance?.current_balance_amount || 0);
  if (balanceAmount < 0) {
    return `
      <div class="detail-box finance-carry-box is-debt">
        <div class="detail-label">Nyitott tartozás</div>
        <div class="detail-value">${escapeHtml(formatMoney(Math.abs(balanceAmount)))}</div>
        <div class="small muted">Ezt az összeget a következő rendezésnél még pótolnod kell.</div>
      </div>
    `;
  }

  if (balanceAmount > 0) {
    return `
      <div class="detail-box finance-carry-box is-credit">
        <div class="detail-label">Felhasználható előleg</div>
        <div class="detail-value">${escapeHtml(formatMoney(balanceAmount))}</div>
        <div class="small muted">Ez az összeg a következő eseménynél levonható a fizetendőből.</div>
      </div>
    `;
  }

  return `
    <div class="detail-box finance-carry-box">
      <div class="detail-label">Nyitott egyenleg</div>
      <div class="detail-value">${escapeHtml(formatMoney(0))}</div>
      <div class="small muted">Most nincs áthozott tartozásod vagy előleged.</div>
    </div>
  `;
}

function renderFinanceEntryTypeBadge(entryType) {
  return entryType === 'adjustment'
    ? '<span class="badge badge-draft">kézi korrekció</span>'
    : '<span class="badge badge-muted">esemény könyvelés</span>';
}

function renderFinanceEntryExpectedLabel(entry) {
  return entry?.entry_type === 'adjustment' ? 'Korrekció összege' : 'Elvárt';
}

function renderFinanceEntryLocationLine(entry) {
  if (entry?.entry_type === 'adjustment') {
    return escapeHtml(entry.note || 'Nem eseményhez kötött pénzügyi korrekció.');
  }
  return escapeHtml(entry?.event_location_name || '-');
}

function renderCaptainPaymentCard(focusEvent = null) {
  const captain = getTeamCaptainMember();
  const captainProfile = getUserPaymentProfile(captain);
  const eventPaymentLink = getEventPaymentLinkProfile(focusEvent);
  const paymentSummary = getPaymentSummaryObject(focusEvent);
  const currentBalance = Number(state.currentTeamFinance?.current_balance_amount || 0);
  const projection = paymentSummary
    ? buildUserEventPaymentProjection(paymentSummary, state.currentTeamFinance)
    : null;

  if (!captain || (!captainProfile && !eventPaymentLink)) {
    return '';
  }

  const hint = currentBalance < 0
    ? 'Tartozásod van a fókuszcsapat felé. Innen azonnal megnyithatod az eseményhez megadott fizetési linket vagy a csapatkapitány QR-kódját.'
    : currentBalance > 0
      ? 'Többleted van a fókuszcsapatnál. Innen akkor is eléred a fizetési adatokat, ha rendezni szeretnétek valamit.'
      : 'Innen eléred az eseményhez tartozó fizetési linket és a csapatkapitány fizetési profilját.';
  const amountBlock = paymentSummary?.is_visible_to_user === true && projection
    ? `
      <div class="detail-box">
        <div class="detail-label">Esemény díja</div>
        <div class="detail-value">${escapeHtml(formatMoney(projection.eventAmount || 0))}</div>
      </div>
      <div class="detail-box ${projection.debtCarry > 0 ? 'finance-carry-box is-debt' : projection.creditCarry > 0 ? 'finance-carry-box is-credit' : 'finance-carry-box'}">
        <div class="detail-label">${projection.debtCarry > 0 ? 'Áthozott tartozás' : projection.creditCarry > 0 ? 'Levonható előleg' : 'Áthozott egyenleg'}</div>
        <div class="detail-value">${escapeHtml(formatMoney(projection.debtCarry > 0 ? projection.debtCarry : projection.creditCarry))}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Most rendezendő</div>
        <div class="detail-value">${escapeHtml(formatMoney(projection.projectedDue || 0))}</div>
      </div>
    `
    : eventPaymentLink
      ? `
        <div class="detail-box">
          <div class="detail-label">Esemény fizetése</div>
          <div class="detail-value">Az összeg a fizetési linken van előkészítve.</div>
        </div>
      `
      : '';

  return `
    <div class="event-card payment-target-card top-space">
      <div class="row between align-center wrap gap">
        <div>
          <strong>${eventPaymentLink ? 'Esemény fizetése' : 'Csapatkapitány fizetési profilja'}</strong>
          <div class="small muted top-space">${escapeHtml(hint)}</div>
        </div>
        <span class="badge badge-draft">${escapeHtml(eventPaymentLink?.providerLabel || captainProfile?.providerLabel || 'Fizetési profil')}</span>
      </div>
      <div class="grid three-col inner-grid top-space attendance-summary-grid">
        <div class="detail-box">
          <div class="detail-label">Kedvezményezett</div>
          <div class="detail-value">${escapeHtml(captain.name || 'Csapatkapitány')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Felhasználónév / azonosító</div>
          <div class="detail-value">${escapeHtml(captainProfile?.username || 'Nincs megadva')}</div>
        </div>
        ${amountBlock}
      </div>
      ${
        projection
          ? `<div class="small muted top-space">${
              projection.debtCarry > 0
                ? `A fizetési gomb megnyitása előtt már beleszámoltuk a korábbi ${escapeHtml(formatMoney(projection.debtCarry))} tartozásodat.`
                : projection.creditCarry > 0
                  ? `A fizetési összegből már levontuk a korábbi ${escapeHtml(formatMoney(projection.creditCarry))} előlegedet.`
                  : 'A fizetési összeg most pontosan az esemény díjával egyezik meg.'
            }</div>`
          : ''
      }
      <div class="row gap wrap top-space">
        ${eventPaymentLink ? `<a class="btn btn-inline-link" href="${escapeHtml(eventPaymentLink.url)}" target="_blank" rel="noopener noreferrer">Fizetés ${escapeHtml(eventPaymentLink.providerLabel)} linkkel${projection ? ` · ${escapeHtml(formatMoney(projection.projectedDue || 0))}` : ''}</a>` : ''}
        ${captainProfile?.qrDataUrl ? `<button class="btn ${eventPaymentLink ? 'btn-secondary' : ''}" type="button" data-payment-qr-user-id="${escapeHtml(captain.user_id)}" data-payment-qr-role="captain">QR-kód megnyitása</button>` : ''}
      </div>
    </div>
  `;
}

function renderUserFinanceModule() {
  if (!els.userFinanceModule) return;

  const finance = state.currentTeamFinance;

  if (!state.currentTeam) {
    els.userFinanceModule.innerHTML = emptyState(
      'Nincs fókuszcsapat.',
      'Tölts be egy csapatot, és itt fogod látni a csapatszintű pénzügyi egyenlegedet.'
    );
    return;
  }

  const focusEvent =
    state.selectedUserEventDetail?.event
    || state.selectedUserEvent
    || getNextEvent(state.userTeamEvents || state.myEvents || [])
    || null;
  const captainPaymentCard = renderCaptainPaymentCard(focusEvent);

  if (!finance || !Array.isArray(finance.entries) || finance.entries.length === 0) {
    els.userFinanceModule.innerHTML = emptyState(
      'Még nincs könyvelt pénzügyi sorod.',
      'Ha egy lezárt eseménynél az admin rögzíti a jelenlétedet és a befizetésedet, itt megjelenik a futó egyenleged.'
    ) + captainPaymentCard;
    return;
  }

  const visibleEntries = finance.entries.slice(0, 5);

  els.userFinanceModule.innerHTML = `
    <div class="stack">
      <div class="rank-hero-card ${finance.current_balance_amount < 0 ? 'is-disabled' : 'is-enabled'}">
        <div class="row between align-center wrap gap">
          <div>
            <div class="small muted">Fókuszcsapat egyenleg</div>
            <div class="rank-value">${escapeHtml(formatSignedMoney(finance.current_balance_amount || 0))}</div>
          </div>
          ${renderFinanceBalanceBadge(finance.current_balance_amount)}
        </div>
        <div class="grid three-col inner-grid top-space">
          <div class="detail-box">
            <div class="detail-label">Könyvelt esemény</div>
            <div class="detail-value">${escapeHtml(String(finance.entry_count || 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Elvárt összesen</div>
            <div class="detail-value">${escapeHtml(formatMoney(finance.total_expected_amount || 0))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Befizetett összesen</div>
            <div class="detail-value">${escapeHtml(formatMoney(finance.total_actual_paid_amount || 0))}</div>
          </div>
        </div>
        <div class="grid two-col inner-grid top-space">
          ${renderFinanceCarryCard(finance)}
          <div class="detail-box finance-carry-box">
            <div class="detail-label">Kézi korrekciók</div>
            <div class="detail-value">${escapeHtml(formatMoney(finance.total_adjustment_amount || 0))}</div>
            <div class="small muted">${escapeHtml(String(finance.adjustment_count || 0))} külön pénzügyi korrekció lett eddig rögzítve nálad.</div>
          </div>
        </div>
      </div>
      ${captainPaymentCard}
      ${visibleEntries.map(entry => `
        <div class="event-card attendance-ledger-row">
          <div class="attendance-row-main">
            <div class="row between align-center wrap gap">
              <div class="attendance-row-name">${escapeHtml(entry.event_title || 'Névtelen esemény')}</div>
              ${renderFinanceEntryTypeBadge(entry.entry_type)}
            </div>
            <div class="small muted">${escapeHtml(formatDateTime(entry.event_start_at))}</div>
            <div class="small muted">${renderFinanceEntryLocationLine(entry)}</div>
          </div>
          <div class="grid four-col inner-grid top-space attendance-summary-grid">
            <div class="detail-box">
              <div class="detail-label">${escapeHtml(renderFinanceEntryExpectedLabel(entry))}</div>
              <div class="detail-value">${escapeHtml(formatMoney(entry.entry_type === 'adjustment' ? Math.abs(entry.actual_paid_amount || 0) : (entry.expected_total_amount || 0)))}</div>
            </div>
            <div class="detail-box">
              <div class="detail-label">Befizetett</div>
              <div class="detail-value">${escapeHtml(formatMoney(entry.actual_paid_amount || 0))}</div>
            </div>
            <div class="detail-box">
              <div class="detail-label">Eltérés</div>
              <div class="detail-value ${Number(entry.event_delta_amount ?? entry.delta_amount ?? 0) > 0 ? 'finance-delta-positive' : Number(entry.event_delta_amount ?? entry.delta_amount ?? 0) < 0 ? 'finance-delta-negative' : 'finance-delta-neutral'}">${escapeHtml(formatSignedMoney(entry.event_delta_amount ?? entry.delta_amount ?? 0))}</div>
            </div>
            <div class="detail-box">
              <div class="detail-label">Új egyenleg</div>
              <div class="detail-value">${escapeHtml(formatSignedMoney(entry.balance_after_event ?? entry.balance_after_amount ?? 0))}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function hydrateEventWeatherWidget(widgetId, event, options = {}) {
  const { compact = false } = options;
  const element = document.getElementById(widgetId);
  if (!element) return;

  try {
    const weather = await fetchEventWeather(event);
    const forecastTime = formatWeatherForecastTime(weather.forecastTime);
    element.innerHTML = `
      <div class="weather-placeholder-icon">${escapeHtml(weather.weatherIcon)}</div>
      <div class="weather-widget-content">
        <div class="rank-hero-title">${escapeHtml(weather.weatherLabel)}</div>
        <div class="small muted">${escapeHtml(weather.locationLabel)} · ${escapeHtml(forecastTime)}</div>
        <div class="weather-widget-metrics ${compact ? 'compact' : ''}">
          <span class="weather-metric"><strong>${escapeHtml(String(Math.round(Number(weather.temperature ?? 0))))}°C</strong> hőmérséklet</span>
          <span class="weather-metric"><strong>${escapeHtml(String(Math.round(Number(weather.precipitationProbability ?? 0))))}%</strong> csapadék</span>
          <span class="weather-metric"><strong>${escapeHtml(String(Math.round(Number(weather.windSpeed ?? 0))))} km/h</strong> szél</span>
        </div>
      </div>
    `;
  } catch (error) {
    element.innerHTML = `
      <div class="weather-placeholder-icon">🌤️</div>
      <div class="weather-widget-content">
        <div class="rank-hero-title">Időjárás most még nem elérhető</div>
        <div class="small muted">${escapeHtml(error.message)}</div>
        <div class="small muted">A helyszín az eseményből jön: ${escapeHtml(getEventWeatherQuery(event) || '-')}</div>
      </div>
    `;
  }
}

function renderAdminOverview() {
  if (!els.adminOverviewCards) return;

  const activeMembers = state.teamMembers.filter(member => member.membership_status === 'active').length;
  const pendingInvites = state.teamInvites.filter(invite => invite.status === 'pending').length;
  const eventCount = state.adminEvents.length;
  const roleLabel = isPlatformOwner()
    ? 'platform owner'
    : state.teamRole
      ? formatTeamRole(state.teamRole)
      : (shouldShowCreateTeam() ? 'uj szervezo' : formatTeamRole('member'));

  els.adminOverviewCards.innerHTML = [
    { label: 'Saját szerep', value: roleLabel },
    { label: 'Aktív tag', value: activeMembers },
    { label: 'Függő meghívó', value: pendingInvites },
    { label: 'Csapat esemény', value: eventCount }
  ].map(item => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(item.label)}</div>
      <div class="stat-value">${escapeHtml(item.value)}</div>
    </div>
  `).join('');
}

function canManageInvites() {
  return state.teamRole === 'team_admin' || state.teamRole === 'team_manager';
}

function isPlatformOwner() {
  return state.user?.platform_role === 'platform_owner';
}

function canAccessAdminView() {
  return (
    isPlatformOwner() ||
    state.teamRole === 'team_admin' ||
    state.teamRole === 'team_manager' ||
    shouldShowCreateTeam()
  );
}

function getAdminWorkspaceButtons() {
  return [...document.querySelectorAll('[data-admin-workspace]')];
}

function getAdminWorkspacePanels() {
  return [...document.querySelectorAll('[data-admin-workspace-panel]')];
}

function getAdminTeamSectionButtons() {
  return [...document.querySelectorAll('[data-admin-team-section]')];
}

function getAdminTeamSectionPanels() {
  return [...document.querySelectorAll('[data-admin-team-panel]')];
}

function getAdminTeamSectionProgressState() {
  const onboarding = buildAdminOnboardingState();
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const activeGoalkeepers = onboarding.activeGoalkeepersCount;
  const hasFocusEvent = Boolean(onboarding.focusEvent);
  const hasDraw = Boolean(state.adminSavedEventDraw || state.teamDrawPreview);

  return {
    invitesDone: activeMembers > 1 && pendingInvites === 0,
    membersDone: activeMembers > 1,
    advancedDone: activeGoalkeepers >= 2,
    drawDone: hasFocusEvent && hasDraw,
    completedCount: [
      activeMembers > 1 && pendingInvites === 0,
      activeMembers > 1,
      activeGoalkeepers >= 2,
      hasFocusEvent && hasDraw
    ].filter(Boolean).length
  };
}

function syncAdminTeamSectionProgress() {
  const progress = getAdminTeamSectionProgressState();
  const smartSection = getSmartAdminTeamSection();

  getAdminTeamSectionButtons().forEach(button => {
    const section = button.dataset.adminTeamSection;
    const done =
      (section === 'invites' && progress.invitesDone) ||
      (section === 'members' && progress.membersDone) ||
      (section === 'advanced' && progress.advancedDone) ||
      (section === 'draw' && progress.drawDone);
    button.classList.toggle('is-done', done);
    button.classList.toggle('is-current-focus', section === smartSection);
  });

  const summary = document.getElementById('adminTeamProgressSummary');
  if (!summary) return;

  const nextLabel =
    smartSection === 'invites' ? 'Meghívások' :
    smartSection === 'members' ? 'Tagok' :
    smartSection === 'advanced' ? 'Haladó beállítások' :
    'Csapatsorsolás';

  summary.innerHTML = `
    <div class="row between align-center wrap gap">
      <strong>Csapatépítési készültség</strong>
      <span class="badge badge-muted">${escapeHtml(String(progress.completedCount))}/4 kész</span>
    </div>
    <div class="small muted top-space">
      Most a(z) ${escapeHtml(nextLabel.toLowerCase())} rész a következő fontos állomás.
    </div>
    <div class="small muted">
      Aktuális fókusz: ${escapeHtml(nextLabel)}
    </div>
  `;
}

function setAdminTeamSection(section = 'invites') {
  const nextSection = ['invites', 'members', 'draw', 'advanced'].includes(section)
    ? section
    : 'invites';
  state.adminTeamSection = nextSection;

  getAdminTeamSectionButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.adminTeamSection === nextSection);
  });

  getAdminTeamSectionPanels().forEach(panel => {
    const isActive = panel.dataset.adminTeamPanel === nextSection;
    panel.classList.toggle('hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
  });

  const activePanel = document.querySelector(`[data-admin-team-panel="${nextSection}"]`);
  if (activePanel && nextSection === 'members') {
    activePanel.querySelectorAll('details').forEach(details => {
      details.open = true;
    });
  }

  syncAdminTeamSectionProgress();
}

function getAdminFinanceSectionButtons() {
  return [...document.querySelectorAll('[data-admin-finance-section]')];
}

function getAdminFinanceProgressState() {
  const detail = state.selectedAdminEventDetail;
  const event = detail?.event || getAdminFocusEvent() || null;
  const focusStage = detail ? getAdminAttendanceFocusStage(detail) : null;
  const hasSelectedEvent = Boolean(event);
  const inSettlementFlow = Boolean(event && canManageAttendanceForEvent(event));
  const isFinished = event?.status === 'finished';

  return {
    hasSelectedEvent,
    inSettlementFlow,
    stage: focusStage?.stage || (isFinished ? 'review' : hasSelectedEvent ? 'attendance' : 'select'),
    selectedDone: hasSelectedEvent,
    attendanceDone: ['payments', 'finish', 'review'].includes(focusStage?.stage || ''),
    paymentsDone: ['finish', 'review'].includes(focusStage?.stage || ''),
    finishDone: isFinished,
    completedCount: [
      hasSelectedEvent,
      ['payments', 'finish', 'review'].includes(focusStage?.stage || ''),
      ['finish', 'review'].includes(focusStage?.stage || ''),
      isFinished
    ].filter(Boolean).length
  };
}

function syncAdminFinanceSectionProgress() {
  const progress = getAdminFinanceProgressState();
  const summary = document.getElementById('adminFinanceProgressSummary');

  getAdminFinanceSectionButtons().forEach(button => {
    const section = button.dataset.adminFinanceSection;
    const done = (section === 'settlement' && progress.inSettlementFlow) || (section === 'balances' && progress.finishDone);
    const isCurrentFocus =
      (section === 'settlement' && progress.inSettlementFlow && !progress.finishDone) ||
      (section === 'balances' && (!progress.inSettlementFlow || progress.finishDone));
    button.classList.toggle('is-done', done);
    button.classList.toggle('is-current-focus', isCurrentFocus);
  });

  if (!summary) return;

  const nextLabel =
    !progress.hasSelectedEvent ? 'Elszámolás' :
    progress.stage === 'attendance' ? 'Jelenlét rögzítése' :
    progress.stage === 'payments' ? 'Befizetések könyvelése' :
    progress.stage === 'finish' ? 'Esemény lezárása' :
    'Egyenlegek áttekintése';

  summary.innerHTML = `
    <div class="row between align-center wrap gap">
      <strong>Pénzügyi készültség</strong>
      <span class="badge badge-muted">${escapeHtml(String(progress.completedCount))}/4 kész</span>
    </div>
    <div class="small muted top-space">
      Most a(z) ${escapeHtml(nextLabel.toLowerCase())} a következő fontos lépés.
    </div>
    <div class="small muted">
      Aktuális fókusz: ${escapeHtml(nextLabel)}
    </div>
  `;
}

function setAdminFinanceSection(section = 'settlement') {
  const nextSection = ['settlement', 'balances'].includes(section)
    ? section
    : 'settlement';
  state.adminFinanceSection = nextSection;

  getAdminFinanceSectionButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.adminFinanceSection === nextSection);
  });

  if (els.adminFinanceSettlementCard) {
    const showSettlement = nextSection === 'settlement';
    els.adminFinanceSettlementCard.classList.toggle('hidden', !showSettlement);
    els.adminFinanceSettlementCard.toggleAttribute('hidden', !showSettlement);
  }

  if (els.adminFinanceBalancesCard) {
    const showBalances = nextSection === 'balances';
    els.adminFinanceBalancesCard.classList.toggle('hidden', !showBalances);
    els.adminFinanceBalancesCard.toggleAttribute('hidden', !showBalances);
  }

  syncAdminFinanceSectionProgress();
}

function getAdminEventsSectionButtons() {
  return [...document.querySelectorAll('[data-admin-events-section]')];
}

function getAdminEventsSectionPanels() {
  return [...document.querySelectorAll('[data-admin-events-panel]')];
}

function setAdminEventsSection(section = 'upcoming') {
  const nextSection = ['upcoming', 'closed'].includes(section)
    ? section
    : 'upcoming';
  state.adminEventsSection = nextSection;

  getAdminEventsSectionButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.adminEventsSection === nextSection);
  });

  getAdminEventsSectionPanels().forEach(panel => {
    const isActive = panel.dataset.adminEventsPanel === nextSection;
    panel.classList.toggle('hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
  });

  if (els.adminEventEditorCard) {
    const showEditor = nextSection === 'upcoming';
    els.adminEventEditorCard.classList.toggle('hidden', !showEditor);
    els.adminEventEditorCard.toggleAttribute('hidden', !showEditor);
  }

  syncAdminEventsSectionProgress();
}

function getAdminEventsProgressState() {
  const workspace = buildAdminEventsWorkspaceState();
  const hasUpcoming = workspace.upcomingEvents.length > 0;
  const hasPublishedUpcoming = workspace.publishedUpcomingEvents.length > 0;
  const hasManageablePast = workspace.manageablePastEvents.length > 0;

  return {
    hasUpcoming,
    hasPublishedUpcoming,
    hasManageablePast,
    completedCount: [
      hasUpcoming,
      hasPublishedUpcoming,
      hasManageablePast
    ].filter(Boolean).length
  };
}

function syncAdminEventsSectionProgress() {
  const progress = getAdminEventsProgressState();
  const currentSection = state.adminEventsSection || getSmartAdminEventsSection();
  const summary = document.getElementById('adminEventsProgressSummary');

  getAdminEventsSectionButtons().forEach(button => {
    const section = button.dataset.adminEventsSection;
    const done =
      (section === 'upcoming' && progress.hasPublishedUpcoming) ||
      (section === 'closed' && !progress.hasManageablePast && progress.hasPublishedUpcoming);
    button.classList.toggle('is-done', done);
    button.classList.toggle('is-current-focus', section === currentSection);
  });

  if (!summary) return;

  const nextLabel =
    progress.hasManageablePast ? 'Megvalósult események' :
    progress.hasPublishedUpcoming ? 'Közelgő események karbantartása' :
    progress.hasUpcoming ? 'Publikálás' :
    'Első esemény létrehozása';

  summary.innerHTML = `
    <div class="row between align-center wrap gap">
      <strong>Eseményszervezési készültség</strong>
      <span class="badge badge-muted">${escapeHtml(String(progress.completedCount))}/3 kész</span>
    </div>
    <div class="small muted top-space">
      Most a(z) ${escapeHtml(nextLabel.toLowerCase())} a következő fontos lépés.
    </div>
    <div class="small muted">
      Aktuális fókusz: ${escapeHtml(nextLabel)}
    </div>
  `;
}

function getSmartAdminTeamSection() {
  const onboarding = buildAdminOnboardingState();
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const activeGoalkeepers = onboarding.activeGoalkeepersCount;
  const drawReadyEvents = onboarding.drawReadyEvents;
  const adminFocusEvent = onboarding.focusEvent;

  if (!state.currentTeam || activeMembers <= 1 || pendingInvites > 0) {
    return 'invites';
  }

  if (activeGoalkeepers < 2) {
    return 'advanced';
  }

  if (adminFocusEvent || drawReadyEvents.length || state.teamDrawPreview || state.adminSavedEventDraw) {
    return 'draw';
  }

  return 'members';
}

function buildAdminEventsWorkspaceState(events = state.adminEvents || []) {
  const now = Date.now();
  const visibleEvents = state.adminHideHiddenEvents
    ? events.filter(event => event.hidden_from_admin_list !== true)
    : events;
  const draftEvents = visibleEvents.filter(event => event.status === 'draft');
  const publishedUpcomingEvents = visibleEvents.filter(
    event => event.status === 'published' && !isPastPublishedEvent(event, now)
  );
  const manageablePastEvents = visibleEvents.filter(event => isPastPublishedEvent(event, now));
  const finishedEvents = visibleEvents.filter(event => event.status === 'finished');
  const hiddenEvents = state.adminHideHiddenEvents
    ? []
    : visibleEvents.filter(event => event.hidden_from_admin_list === true);
  const upcomingEvents = [...publishedUpcomingEvents, ...draftEvents];
  const selectedEvent = getAdminFocusEvent();
  const selectedEventId = selectedEvent?.id ? String(selectedEvent.id) : '';
  const isEditing = state.adminEventFormMode === 'edit';
  const selectedUpcomingEvent = selectedEventId
    ? upcomingEvents.find(event => String(event.id) === selectedEventId) || null
    : null;
  const selectedClosedEvent = selectedEventId
    ? manageablePastEvents.find(event => String(event.id) === selectedEventId) || null
    : null;
  const nextUpcomingEvent = getNextUpcomingAdminEvent(visibleEvents);
  const focusEvent = selectedEvent
    || nextUpcomingEvent
    || draftEvents[0]
    || manageablePastEvents[0]
    || finishedEvents[0]
    || null;

  let suggestedSection = 'upcoming';
  if (
    selectedClosedEvent
    || (!upcomingEvents.length && manageablePastEvents.length)
    || (!publishedUpcomingEvents.length && !draftEvents.length && manageablePastEvents.length)
  ) {
    suggestedSection = 'closed';
  }

  let nextAction = {
    mode: 'create',
    title: 'Itt szervezed meg a következő focit.',
    description: 'Először hozd létre vagy finomítsd a következő eseményt. Ha a listában a Szerkesztés gombra kattintasz, ugyanaz az űrlap töltődik fel.',
    badgeClass: 'badge-success',
    badgeText: 'aktuális fókusz',
    targetSection: 'upcoming'
  };

  if (!visibleEvents.length) {
    nextAction = {
      mode: 'first-event',
      title: 'Itt indul az első eseményed.',
      description: 'Kezdésnek hozz létre egy eseményt, add meg az alapadatokat, majd mentsd el vagy publikáld tovább a szervezéshez.',
      badgeClass: 'badge-success',
      badgeText: 'első lépés',
      targetSection: 'upcoming'
    };
  } else if (isEditing && selectedEvent) {
    nextAction = {
      mode: 'edit',
      title: 'Most egy meglévő eseményt szerkesztesz.',
      description: 'A jobb oldali űrlap most a kiválasztott eseményhez kötődik. A mentés után ugyanebben a munkafolyamatban maradsz.',
      badgeClass: 'badge-warning',
      badgeText: 'szerkesztési mód',
      targetSection: selectedClosedEvent ? 'closed' : 'upcoming'
    };
  } else if (draftEvents.length && !publishedUpcomingEvents.length) {
    nextAction = {
      mode: 'publish-draft',
      title: 'Van már piszkozatod, most publikálás következik.',
      description: 'Nyisd meg a piszkozat eseményt, ellenőrizd az adatokat, majd publikáld, hogy elindulhasson a jelentkezés.',
      badgeClass: 'badge-warning',
      badgeText: 'publikálás jön',
      targetSection: 'upcoming'
    };
  } else if (publishedUpcomingEvents.length) {
    nextAction = {
      mode: 'manage-upcoming',
      title: 'A közelgő eseményed már él, most ezt finomíthatod.',
      description: 'A publikált listában követheted a jelentkezéseket, szerkesztheted a még módosítható mezőket, és innen indíthatod a csapatleosztást.',
      badgeClass: 'badge-success',
      badgeText: 'aktuális fókusz',
      targetSection: 'upcoming'
    };
  } else if (manageablePastEvents.length) {
    nextAction = {
      mode: 'post-event',
      title: 'Most a megvalósult esemény adminisztrálása a fontos.',
      description: 'A meccs már lement. Itt már nem szervezel, hanem jelenlétet, no-show-t és befizetéseket rendezel, majd a pénzügyben lezárod a folyamatot.',
      badgeClass: 'badge-warning',
      badgeText: 'utómunka',
      targetSection: 'closed'
    };
  } else if (finishedEvents.length) {
    nextAction = {
      mode: 'review-finished',
      title: 'Az aktív szervezés rendben van, most az összesítést nézheted át.',
      description: 'Nincs nyitott utómunka. A lezárt események pénzügyi képe a Pénzügy menüben látható.',
      badgeClass: 'badge-muted',
      badgeText: 'ellenőrzés',
      targetSection: 'closed'
    };
  }

  return {
    now,
    visibleEvents,
    draftEvents,
    publishedUpcomingEvents,
    manageablePastEvents,
    finishedEvents,
    hiddenEvents,
    upcomingEvents,
    selectedEvent,
    selectedUpcomingEvent,
    selectedClosedEvent,
    nextUpcomingEvent,
    focusEvent,
    suggestedSection,
    nextAction
  };
}

function getSmartAdminEventsSection() {
  return buildAdminEventsWorkspaceState().suggestedSection;
}

function setAdminWorkspace(workspace = 'home') {
  const nextWorkspace = ['home', 'team', 'events', 'finance', 'statistics'].includes(workspace)
    ? workspace
    : 'home';
  state.adminWorkspace = nextWorkspace;

  getAdminWorkspaceButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.adminWorkspace === nextWorkspace);
  });

  getAdminWorkspacePanels().forEach(panel => {
    const isActive = panel.dataset.adminWorkspacePanel === nextWorkspace;
    panel.classList.toggle('hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
  });

  const createEventCard = els.createEventForm?.closest('.card');
  if (createEventCard) {
    const showCreateEventCard = nextWorkspace === 'events';
    createEventCard.classList.toggle('hidden', !showCreateEventCard);
    createEventCard.toggleAttribute('hidden', !showCreateEventCard);
  }

  if (nextWorkspace === 'team') {
    setAdminTeamSection(getSmartAdminTeamSection());
  }

  if (nextWorkspace === 'events') {
    setAdminEventsSection(getSmartAdminEventsSection());
  }

  if (nextWorkspace === 'finance') {
    setAdminFinanceSection(getAdminFocusEvent() ? 'settlement' : 'balances');
  }
}

function scrollAdminFocusTargetIntoView(target) {
  const selectorMap = {
    'event-basics': '[data-admin-event-form-panel="basics"]',
    'event-logistics': '[data-admin-event-form-panel="logistics"]',
    'event-extras': '[data-admin-event-form-panel="extras"]',
    'team-invites': '#teamInvitesAdminList',
    'team-members': '#teamMembersAdminList',
    'team-advanced': '#teamAdvancedContent',
    'team-draw': '#teamDrawContent',
    'finance-current': '.finance-task-block.is-current, .finance-finish-row.is-current',
    'finance-balances': '#adminFinanceContent',
    'events-upcoming': '#adminEventsList',
    'events-closed': '#adminClosedEventsList'
  };

  const selector = selectorMap[target];
  if (!selector) return;

  const element = document.querySelector(selector);
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function applyAdminJump(workspace, section = '', focusTarget = '') {
  setAdminWorkspace(workspace);

  if (workspace === 'finance') {
    await ensureAdminFinanceFocusEvent();
  }

  if (section) {
    if (workspace === 'team') setAdminTeamSection(section);
    if (workspace === 'events') setAdminEventsSection(section);
    if (workspace === 'finance') setAdminFinanceSection(section);
  }

  if (focusTarget === 'event-basics') setAdminEventFormSection('basics');
  if (focusTarget === 'event-logistics') setAdminEventFormSection('logistics');
  if (focusTarget === 'event-extras') setAdminEventFormSection('extras');

  if (focusTarget) {
    scrollAdminFocusTargetIntoView(focusTarget);
    return;
  }

  if (workspace === 'finance' && state.adminFinanceSection === 'settlement') {
    scrollAdminFocusTargetIntoView('finance-current');
  }
}

function getAdminSuggestedNextStep() {
  const onboarding = buildAdminOnboardingState();

  if (!state.currentTeam) {
    return {
      title: 'Hozd létre vagy töltsd be az első csapatodat.',
      description: 'A csapat lesz minden további admin művelet alapja: tagok, események és elszámolás.',
      workspace: 'team',
      section: 'invites',
      focusTarget: '',
      cta: shouldShowCreateTeam() ? 'Csapat létrehozása' : 'Csapat betöltése'
    };
  }

  if (onboarding.activeMembersCount <= 1) {
    return {
      title: 'Hívj meg játékosokat a csapatba.',
      description: 'A következő értelmes lépés, hogy felépüljön a keret és legyen kivel eseményt szervezni.',
      workspace: 'team',
      section: 'invites',
      focusTarget: 'team-invites',
      cta: 'Tagok és meghívások'
    };
  }

  if (onboarding.createdEventCount === 0) {
    return {
      title: 'Hozd létre az első eseményt.',
      description: 'Ha már van csapat és vannak tagok, a következő fókusz az első meccs megszervezése.',
      workspace: 'events',
      section: 'upcoming',
      focusTarget: 'event-basics',
      cta: 'Új esemény'
    };
  }

  if (onboarding.publishedEventCount === 0) {
    return {
      title: 'Publikáld az első eseményt.',
      description: 'A létrehozott eseményt előbb tedd publikálttá, hogy a csapat ténylegesen látni és szervezni tudja.',
      workspace: 'events',
      section: 'upcoming',
      focusTarget: 'events-upcoming',
      cta: 'Publikált események'
    };
  }

  if (onboarding.activeGoalkeepersCount < 2) {
    return {
      title: 'Jelölj ki legalább két kapust.',
      description: 'Csapatleosztást csak akkor tudsz készíteni, ha a going kerethez van legalább két kapusnak jelölt játékos.',
      workspace: 'team',
      section: 'members',
      focusTarget: 'team-members',
      cta: 'Kapusok beállítása'
    };
  }

  if (onboarding.drawReadyCount === 0) {
    return {
      title: 'Készíts csapatsorsolást a következő eseményhez.',
      description: 'A generálás és mentés után a játékosok user oldalon is látják a kihirdetett leosztást.',
      workspace: 'team',
      section: 'draw',
      focusTarget: 'team-draw',
      cta: 'Csapatsorsolás'
    };
  }

  if (onboarding.pastUnclosedCount > 0) {
    return {
      title: 'Adminisztráld a megvalósult eseményt.',
      description: 'Rögzítsd, ki jelent meg, könyveld a befizetéseket, és csak utána zárd le kézzel az eseményt.',
      workspace: 'finance',
      section: 'settlement',
      focusTarget: 'finance-current',
      cta: 'Elszámolás megnyitása'
    };
  }

  if (onboarding.finishedEventCount > 0) {
    return {
      title: 'Nézd át a pénzügyi összesítést.',
      description: 'A lezárt események könyvelt adatai már bent vannak, most egy helyen tudod ellenőrizni az egyenlegeket és az összesítést.',
      workspace: 'finance',
      section: 'balances',
      focusTarget: 'finance-balances',
      cta: 'Pénzügy'
    };
  }

  return {
    title: 'Minden fontos alap a helyén van.',
    description: 'Most már a közelgő események finomhangolására és a csapat működtetésére fókuszálhatsz.',
    workspace: 'events',
    section: 'upcoming',
    focusTarget: 'events-upcoming',
    cta: 'Közelgő események'
  };
}

function getAdminGuideSecondaryActions(nextStep) {
  const onboarding = buildAdminOnboardingState();
  const actions = [];
  const addAction = action => {
    if (!action) return;
    if (actions.some(existing => existing.workspace === action.workspace && existing.section === action.section)) return;
    if (action.workspace === nextStep.workspace && (action.section || '') === (nextStep.section || '')) return;
    actions.push(action);
  };

  addAction({
    workspace: 'team',
    section: getSmartAdminTeamSection(),
    focusTarget: getSmartAdminTeamSection() === 'draw' ? 'team-draw' : '',
    label: 'Csapat rendezése'
  });

  addAction({
    workspace: 'events',
    section: 'upcoming',
    focusTarget: 'event-basics',
    label: 'Közelgő események'
  });

  addAction({
    workspace: hasAttendanceActivity(onboarding.focusEvent) || onboarding.events.some(event => canManageAttendanceForEvent(event))
      ? 'finance'
      : 'statistics',
    section: hasAttendanceActivity(onboarding.focusEvent) || onboarding.events.some(event => canManageAttendanceForEvent(event))
      ? 'settlement'
      : '',
    focusTarget: hasAttendanceActivity(onboarding.focusEvent) || onboarding.events.some(event => canManageAttendanceForEvent(event))
      ? 'finance-current'
      : '',
    label: hasAttendanceActivity(onboarding.focusEvent) || onboarding.events.some(event => canManageAttendanceForEvent(event))
      ? 'Elszámolás'
      : 'Statisztikák'
  });

  return actions.slice(0, 2);
}

function getAdminExperienceTier() {
  const activeMembers = (state.teamMembers || []).filter(member => member.membership_status === 'active').length;
  const eventCount = (state.adminEvents || []).length;
  const finishedCount = (state.adminEvents || []).filter(event => event.status === 'finished').length;

  if (!state.currentTeam || (shouldShowCreateTeam() && activeMembers <= 1 && eventCount === 0)) {
    return 'starter';
  }
  if (activeMembers <= 6 || eventCount <= 2 || finishedCount === 0) {
    return 'growing';
  }
  return 'advanced';
}

function renderAdminPersonaCard() {
  const tier = getAdminExperienceTier();
  const configs = {
    starter: {
      badge: 'új kapitány mód',
      title: 'Most épül fel az első csapatod.',
      description: 'Itt végigvezetünk az alapokon: csapat létrehozása, első meghívók, első esemény és az első lezárás.',
      bullets: [
        'Először hozz létre vagy tölts be egy csapatot.',
        'Utána a Meghívások fülön építsd fel az első keretet.',
        'Ha megvannak a játékosok, az Események részen szervezd meg az első focit.'
      ]
    },
    growing: {
      badge: 'növekvő csapat',
      title: 'A csapat már mozog, most a működést kell stabilizálni.',
      description: 'Itt már nem csak indulsz, hanem finomhangolsz: szerepkörök, eseményritmus, lezárás és elszámolás.',
      bullets: [
        'Nézd át, hogy minden aktív ember jó szerepkörben van-e.',
        'A közelgő eseményeket tartsd tisztán, a megvalósult eseményeket pedig adminisztráld le időben.',
        'Az első könyvelt lezárások után már a Pénzügy nézet adja a legjobb rálátást.'
      ]
    },
    advanced: {
      badge: 'haladó admin',
      title: 'A csapat alapjai már készen vannak.',
      description: 'Ebben a szakaszban a rendszer már inkább irányítópult: gyors ellenőrzés, finomhangolás, haladó modulok.',
      bullets: [
        'A Kezdőlapon csak a következő szűk keresztmetszetre figyelj.',
        'A Haladó beállítások alatt kezeld a rang- és skill-logikát.',
        'A megvalósult eseményeket előbb adminisztráld, és csak utána zárd le kézzel.'
      ]
    }
  };

  const config = configs[tier];
  return `
    <div class="event-card admin-guide-card">
      <div class="row between align-center wrap gap">
        <strong>${escapeHtml(config.title)}</strong>
        <span class="badge badge-muted">${escapeHtml(config.badge)}</span>
      </div>
      <div class="small muted top-space">${escapeHtml(config.description)}</div>
      <div class="stack top-space">
        ${config.bullets.map(item => `
          <div class="small muted row gap align-center">
            <span class="admin-checklist-dot">•</span>
            <span>${escapeHtml(item)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function hasSavedOrPublishedDraw(event) {
  if (!event) return false;

  const drawStatus = event.draw_status || event.drawStatus || null;
  if (['saved', 'published', 'stale'].includes(String(drawStatus || '').toLowerCase())) {
    return true;
  }

  return ['draw_published', 'draw_stale'].includes(event.event_readiness);
}

function hasAttendanceActivity(event) {
  if (!event) return false;

  const summary = event.attendance_summary || event.attendanceSummary || {};
  const presentCount = Number(summary.present_count ?? summary.presentCount ?? 0);
  const noShowCount = Number(summary.no_show_count ?? summary.noShowCount ?? 0);
  const totalPaidAmount = Number(summary.total_paid_amount ?? summary.totalPaidAmount ?? 0);

  return presentCount > 0 || noShowCount > 0 || totalPaidAmount > 0;
}

function buildAdminOnboardingState() {
  const events = state.adminEvents || [];
  const activeMembersList = (state.teamMembers || []).filter(member => member.membership_status === 'active');
  const activeMembersCount = activeMembersList.length;
  const pendingInviteCount = (state.teamInvites || []).filter(invite => invite.status === 'pending').length;
  const activeGoalkeepersCount = countActiveGoalkeepers(activeMembersList);
  const createdEventCount = events.length;
  const publishedEvents = events.filter(event => ['published', 'finished'].includes(event.status));
  const publishedEventCount = publishedEvents.length;
  const finishedEvents = events.filter(event => event.status === 'finished');
  const finishedEventCount = finishedEvents.length;
  const pastUnclosedEvents = events.filter(event => isPastPublishedEvent(event));
  const pastUnclosedCount = pastUnclosedEvents.length;
  const drawReadyEvents = events.filter(event => hasSavedOrPublishedDraw(event));
  const drawReadyCount = drawReadyEvents.length;
  const attendanceStartedEvents = events.filter(event => hasAttendanceActivity(event));
  const attendanceStartedCount = attendanceStartedEvents.length;
  const upcomingFocusEvent = getNextUpcomingAdminEvent(events);
  const selectedFocusEvent = getAdminFocusEvent();
  const focusEvent = selectedFocusEvent || upcomingFocusEvent || pastUnclosedEvents[0] || finishedEvents[0] || null;

  return {
    events,
    activeMembersList,
    activeMembersCount,
    pendingInviteCount,
    activeGoalkeepersCount,
    createdEventCount,
    publishedEvents,
    publishedEventCount,
    finishedEvents,
    finishedEventCount,
    pastUnclosedEvents,
    pastUnclosedCount,
    drawReadyEvents,
    drawReadyCount,
    attendanceStartedEvents,
    attendanceStartedCount,
    hasStartedPostEventAdmin: pastUnclosedCount > 0 || finishedEventCount > 0 || attendanceStartedCount > 0,
    upcomingFocusEvent,
    selectedFocusEvent,
    focusEvent
  };
}

function getAdminHomePanelStorageKey(panelId) {
  const userId = state.user?.id || 'guest';
  const teamId = state.currentTeam?.id || state.currentTeamId || 'no-team';
  return `foci_admin_home_panel_${panelId}_${userId}_${teamId}`;
}

function isAdminHomePanelDismissed(panelId) {
  try {
    return localStorage.getItem(getAdminHomePanelStorageKey(panelId)) === 'hidden';
  } catch {
    return false;
  }
}

function setAdminHomePanelDismissed(panelId, hidden) {
  try {
    localStorage.setItem(getAdminHomePanelStorageKey(panelId), hidden ? 'hidden' : 'visible');
  } catch {}
}

function getNextUpcomingAdminEvent(events = []) {
  const now = Date.now();
  return [...events]
    .filter(event => {
      const ts = getEventStartTimestamp(event);
      if (ts == null) return false;
      if (['cancelled', 'finished'].includes(event.status)) return false;
      return ts >= now;
    })
    .sort((a, b) => getEventStartTimestamp(a) - getEventStartTimestamp(b))[0] || null;
}

function renderAdminHomeFocusEventPanel(events = []) {
  const nextEvent = getNextUpcomingAdminEvent(events);

  if (!nextEvent) {
    return `
      <div class="event-card admin-guide-card admin-focus-panel">
        <div class="row between align-center wrap gap">
          <strong>Fókusz esemény</strong>
          <span class="badge badge-muted">nincs közelgő</span>
        </div>
        <div class="small muted top-space">
          Ha lesz új közelgő eseményed, itt fogod látni a következő fontos admin fókuszt.
        </div>
      </div>
    `;
  }

  return `
    <div class="event-card admin-guide-card admin-focus-panel">
      <div class="row between align-center wrap gap">
        <strong>Fókusz esemény</strong>
        ${eventReadinessBadge(nextEvent.event_readiness || 'open')}
      </div>
      <div class="admin-guide-title top-space">${escapeHtml(nextEvent.title || 'Névtelen esemény')}</div>
      <div class="small muted">${escapeHtml(formatDateTime(nextEvent.start_at))}</div>
      <div class="small muted">Hátralévő idő: ${renderCountdown(nextEvent.start_at)}</div>
      <div class="small muted">${escapeHtml(nextEvent.location_name || 'Nincs helyszín')}</div>
      <div class="grid two-col inner-grid top-space">
        <div class="detail-box">
          <div class="detail-label">Jelentkezett</div>
          <div class="detail-value">${escapeHtml(String(Number(nextEvent.going_count || 0)))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Várólista</div>
          <div class="detail-value">${escapeHtml(String(Number(nextEvent.waiting_count || 0)))}</div>
        </div>
      </div>
      <div class="row gap wrap top-space">
        <button
          class="btn"
          type="button"
          data-admin-workspace-jump="events"
          data-admin-section-jump="upcoming"
          data-admin-focus-target="events-upcoming"
        >Események megnyitása</button>
      </div>
    </div>
  `;
}

function renderAdminHomeDrawPanel() {
  const drawCard = renderTeamDrawPreviewCard();
  if (!drawCard) {
    return `
      <div class="event-card admin-home-sidecard">
        <div class="row between align-center wrap gap">
          <strong>Csapatleosztás</strong>
          <span class="badge badge-muted">még nincs</span>
        </div>
        <div class="small muted top-space">
          Ha már készült preview vagy mentett leosztás az aktuális fókusz eseményhez, itt fog megjelenni.
        </div>
      </div>
    `;
  }

  return `
    <div class="admin-home-sidecard">
      <div class="small muted bottom-space">Csapatleosztás</div>
      ${drawCard}
    </div>
  `;
}

function renderAdminHomeCashPanel(events = []) {
  return `
    <div class="event-card admin-home-sidecard">
      <div class="row between align-center wrap gap">
        <strong>Csapatpénztár</strong>
        <span class="badge badge-muted">gyors áttekintés</span>
      </div>
      <div class="small muted top-space">
        Itt látod röviden a kézzel lezárt eseményekből származó könyvelt pénzügyi állapotot.
      </div>
      <div class="top-space">
        ${renderTeamCashLedgerSummary(events)}
      </div>
    </div>
  `;
}

function getAdminHomeMode(onboarding, completedChecklistCount, checklistLength) {
  const tier = getAdminExperienceTier();
  const hasOperationalLoad = onboarding.pastUnclosedCount > 0 || onboarding.upcomingFocusEvent || onboarding.finishedEventCount > 0;
  const checklistMostlyDone = checklistLength > 0 && completedChecklistCount >= Math.min(7, checklistLength - 1);

  if (tier === 'advanced' && hasOperationalLoad && checklistMostlyDone) {
    return 'operational';
  }

  return 'setup';
}

function renderAdminHomeOperationalCard(nextStep, onboarding) {
  const focusEvent = onboarding.upcomingFocusEvent || onboarding.focusEvent || null;
  const finishedCount = onboarding.finishedEventCount;
  const pastUnclosedCount = onboarding.pastUnclosedCount;

  return `
    <div class="event-card admin-guide-card">
      <div class="row between align-center wrap gap">
        <strong>Napi admin fókusz</strong>
        <span class="badge badge-success">operatív mód</span>
      </div>
      <div class="admin-guide-title top-space">${escapeHtml(nextStep.title)}</div>
      <div class="small muted">${escapeHtml(nextStep.description)}</div>
      <div class="grid three-col inner-grid top-space">
        <div class="detail-box">
          <div class="detail-label">Következő fókusz</div>
          <div class="detail-value">${escapeHtml(focusEvent?.title || 'nincs közelgő')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Nyitott utómunka</div>
          <div class="detail-value">${escapeHtml(String(pastUnclosedCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Lezárt esemény</div>
          <div class="detail-value">${escapeHtml(String(finishedCount))}</div>
        </div>
      </div>
      <div class="row gap wrap top-space">
        <button
          class="btn"
          type="button"
          data-admin-workspace-jump="${escapeHtml(nextStep.workspace)}"
          ${nextStep.section ? `data-admin-section-jump="${escapeHtml(nextStep.section)}"` : ''}
          ${nextStep.focusTarget ? `data-admin-focus-target="${escapeHtml(nextStep.focusTarget)}"` : ''}
        >${escapeHtml(nextStep.cta)}</button>
        <button class="btn btn-ghost" type="button" data-admin-home-dismiss="checklist">Checklist háttérbe</button>
      </div>
    </div>
  `;
}

function renderAdminHomePrimaryActionCard(nextStep, secondaryActions = []) {
  return `
    <div class="event-card admin-home-primary-card">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Most ezzel foglalkozz</div>
          <div class="admin-home-primary-title">${escapeHtml(nextStep.title)}</div>
        </div>
        <span class="badge badge-success">következő lépés</span>
      </div>
      <div class="small muted top-space">${escapeHtml(nextStep.description)}</div>
      <div class="row gap wrap top-space">
        <button
          class="btn"
          type="button"
          data-admin-workspace-jump="${escapeHtml(nextStep.workspace)}"
          ${nextStep.section ? `data-admin-section-jump="${escapeHtml(nextStep.section)}"` : ''}
          ${nextStep.focusTarget ? `data-admin-focus-target="${escapeHtml(nextStep.focusTarget)}"` : ''}
        >${escapeHtml(nextStep.cta)}</button>
      </div>
      ${secondaryActions.length ? `
        <details class="admin-home-shelf top-space">
          <summary class="small muted">Polcon még van pár hasznos út</summary>
          <div class="row gap wrap top-space">
            ${secondaryActions.map(action => `
              <button
                class="btn btn-ghost"
                type="button"
                data-admin-workspace-jump="${escapeHtml(action.workspace)}"
                ${action.section ? `data-admin-section-jump="${escapeHtml(action.section)}"` : ''}
                ${action.focusTarget ? `data-admin-focus-target="${escapeHtml(action.focusTarget)}"` : ''}
              >${escapeHtml(action.label)}</button>
            `).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderAdminHomeSimpleProgress(onboarding) {
  const steps = [
    {
      label: 'Csapat kész',
      done: Boolean(state.currentTeam) && onboarding.activeMembersCount > 1,
      hint: !state.currentTeam
        ? 'előbb tölts be vagy hozz létre csapatot'
        : onboarding.activeMembersCount > 1
          ? `${onboarding.activeMembersCount} aktív tag`
          : 'még kell legalább 1 játékos'
    },
    {
      label: 'Közelgő esemény kész',
      done: onboarding.publishedEventCount > 0,
      hint: onboarding.publishedEventCount > 0
        ? `${onboarding.publishedEventCount} publikált esemény`
        : onboarding.createdEventCount > 0
          ? 'van esemény, még publikáld'
          : 'még nincs esemény'
    },
    {
      label: 'Utómunka rendben',
      done: onboarding.finishedEventCount > 0 && onboarding.pastUnclosedCount === 0,
      hint: onboarding.pastUnclosedCount > 0
        ? `${onboarding.pastUnclosedCount} megvalósult esemény vár rád`
        : onboarding.finishedEventCount > 0
          ? `${onboarding.finishedEventCount} lezárt esemény`
          : 'még nem jutottál el idáig'
    }
  ];

  return `
    <div class="event-card admin-home-progress-card">
      <div class="row between align-center wrap gap">
        <strong>Itt tartasz most</strong>
        <span class="badge badge-muted">${escapeHtml(String(steps.filter(step => step.done).length))}/3 kész</span>
      </div>
      <div class="stack top-space">
        ${steps.map(step => `
          <div class="admin-home-progress-row ${step.done ? 'is-done' : ''}">
            <span class="admin-home-progress-mark">${step.done ? '✓' : '•'}</span>
            <div>
              <div class="admin-home-progress-label">${escapeHtml(step.label)}</div>
              <div class="small muted">${escapeHtml(step.hint)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminHome() {
  if (!els.adminHomeContent || !els.adminHomeSummary) return;

  const onboarding = buildAdminOnboardingState();
  const events = onboarding.events;
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const eventCount = onboarding.createdEventCount;
  const finishedCount = onboarding.finishedEventCount;
  const pastUnclosedCount = onboarding.pastUnclosedCount;
  const nextStep = getAdminSuggestedNextStep();
  const secondaryActions = getAdminGuideSecondaryActions(nextStep);

  els.adminHomeContent.innerHTML = `
    <div class="stack">
      ${renderAdminHomePrimaryActionCard(nextStep, secondaryActions)}
      ${renderAdminHomeFocusEventPanel(events)}
      ${renderAdminHomeSimpleProgress(onboarding)}
    </div>
  `;

  els.adminHomeSummary.innerHTML = `
    <div class="stack">
      <div class="event-card admin-home-sidecard">
        <div class="row between align-center wrap gap">
          <strong>Állapotkép</strong>
          <span class="badge badge-muted">egy pillantás</span>
        </div>
        <div class="grid two-col inner-grid top-space">
          <div class="detail-box">
            <div class="detail-label">Aktív csapat</div>
            <div class="detail-value">${escapeHtml(state.currentTeam?.name || 'nincs')}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Aktív tagok</div>
            <div class="detail-value">${escapeHtml(String(activeMembers))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Függő meghívók</div>
            <div class="detail-value">${escapeHtml(String(pendingInvites))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Csapat események</div>
            <div class="detail-value">${escapeHtml(String(eventCount))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Megvalósult, de nyitott</div>
            <div class="detail-value">${escapeHtml(String(pastUnclosedCount))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Kézzel lezárt események</div>
            <div class="detail-value">${escapeHtml(String(finishedCount))}</div>
          </div>
        </div>
      </div>
      <details class="admin-home-shelf">
        <summary class="small muted">Polcra tett extra panelek</summary>
        <div class="stack top-space">
          ${renderAdminHomeDrawPanel()}
          ${renderAdminHomeCashPanel(events)}
        </div>
      </details>
    </div>
  `;
}

function getMemberRegistrationStats(member) {
  return member?.registration_stats || {};
}

function getMemberAttendanceStats(member) {
  return member?.attendance_stats || {};
}

function getMemberFinanceStats(member) {
  return member?.finance_stats || {};
}

function getMemberRankSnapshot(member) {
  return member?.rank_snapshot || {};
}

function formatPercentValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '—';
  }
  return `${Math.round(numericValue * 100)}%`;
}

function getStatisticsBalanceStatus(balanceAmount) {
  const numericBalance = Number(balanceAmount || 0);
  if (numericBalance < 0) return 'tartozik';
  if (numericBalance > 0) return 'tobblet';
  return 'rendezett';
}

function renderStatisticsBalanceBadge(balanceAmount) {
  const status = getStatisticsBalanceStatus(balanceAmount);
  if (status === 'tartozik') {
    return '<span class="badge badge-danger">tartozik</span>';
  }
  if (status === 'tobblet') {
    return '<span class="badge badge-success">tobblete van</span>';
  }
  return '<span class="badge badge-muted">rendezett</span>';
}

function renderStatisticsRankMovement(member) {
  const rankSnapshot = getMemberRankSnapshot(member);
  if (!rankSnapshot?.rankModuleEnabled) {
    return '<span class="statistics-movement is-neutral">—</span>';
  }
  return '<span class="statistics-movement is-neutral">—</span>';
}

function renderStatisticsRankValue(member) {
  const rankSnapshot = getMemberRankSnapshot(member);
  if (rankSnapshot?.rankStatus === 'ranked' && Number.isFinite(Number(rankSnapshot?.effectiveRankValue))) {
    return `${rankSnapshot.effectiveRankValue}. rang`;
  }
  return 'vendeg';
}

function buildAdminStatisticsViewModel() {
  const members = (state.teamMembers || [])
    .filter(member => member.membership_status === 'active')
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'hu-HU'));

  const rankDistribution = new Map();
  members.forEach(member => {
    const rankSnapshot = getMemberRankSnapshot(member);
    const key = rankSnapshot?.rankStatus === 'ranked' && Number.isFinite(Number(rankSnapshot?.effectiveRankValue))
      ? String(rankSnapshot.effectiveRankValue)
      : 'vendeg';
    rankDistribution.set(key, (rankDistribution.get(key) || 0) + 1);
  });

  const totalDebtAmount = members.reduce((sum, member) => sum + Math.abs(Math.min(0, Number(getMemberFinanceStats(member).current_balance_amount || 0))), 0);
  const totalCreditAmount = members.reduce((sum, member) => sum + Math.max(0, Number(getMemberFinanceStats(member).current_balance_amount || 0)), 0);
  const totalPaidAmount = members.reduce((sum, member) => sum + Number(getMemberFinanceStats(member).total_actual_paid_amount || 0), 0);
  const nonResponders = members.filter(member => Number(getMemberRegistrationStats(member).non_response_count || 0) >= 3);
  const noShowRiskMembers = members.filter(member => Number(getMemberAttendanceStats(member).no_show_count || 0) > 0);
  const debtors = members.filter(member => Number(getMemberFinanceStats(member).current_balance_amount || 0) < 0);
  const creditMembers = members.filter(member => Number(getMemberFinanceStats(member).current_balance_amount || 0) > 0);

  return {
    members,
    rankDistribution,
    nonResponders,
    noShowRiskMembers,
    debtors,
    creditMembers,
    totalDebtAmount,
    totalCreditAmount,
    totalPaidAmount
  };
}

function renderStatisticsOverviewCards(viewModel) {
  const items = [
    { label: 'Aktiv tagok', value: String(viewModel.members.length) },
    { label: 'Tartozok', value: String(viewModel.debtors.length) },
    { label: 'Tobblettel rendelkezok', value: String(viewModel.creditMembers.length) },
    { label: '3+ esemenyre nem reagalok', value: String(viewModel.nonResponders.length) },
    { label: 'No-show kockazatos', value: String(viewModel.noShowRiskMembers.length) },
    { label: 'Teljes csapat tartozas', value: formatMoney(viewModel.totalDebtAmount) },
    { label: 'Teljes csapat tobblet', value: formatMoney(viewModel.totalCreditAmount) },
    { label: 'Osszes befizetett', value: formatMoney(viewModel.totalPaidAmount) }
  ];

  return `
    <div class="overview-grid compact-overview statistics-overview-grid">
      ${items.map(item => `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(item.label)}</div>
          <div class="stat-value">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderStatisticsRankDistribution(viewModel) {
  const orderedKeys = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'vendeg'];
  return `
    <div class="event-card">
      <div class="row between align-center wrap gap">
        <strong>Rangeloszlas</strong>
        <span class="badge badge-muted">aktualis allapot</span>
      </div>
      <div class="statistics-rank-grid top-space">
        ${orderedKeys.map(key => `
          <div class="detail-box statistics-rank-box">
            <div class="detail-label">${escapeHtml(key === 'vendeg' ? 'Vendeg' : `${key}. rang`)}</div>
            <div class="detail-value">${escapeHtml(String(viewModel.rankDistribution.get(key) || 0))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderStatisticsAttentionPanel(viewModel) {
  const items = viewModel.members
    .filter(member =>
      Number(getMemberRegistrationStats(member).non_response_count || 0) >= 3 ||
      Number(getMemberAttendanceStats(member).no_show_count || 0) > 0 ||
      Number(getMemberFinanceStats(member).current_balance_amount || 0) < 0
    )
    .slice(0, 8);

  return `
    <div class="event-card">
      <div class="row between align-center wrap gap">
        <strong>Figyelmet igenyel</strong>
        <span class="badge badge-warning">${escapeHtml(String(items.length))} fo</span>
      </div>
      ${
        items.length
          ? `<div class="stack top-space">
              ${items.map(member => {
                const registrationStats = getMemberRegistrationStats(member);
                const attendanceStats = getMemberAttendanceStats(member);
                const financeStats = getMemberFinanceStats(member);
                const flags = [];
                if (Number(registrationStats.non_response_count || 0) >= 3) {
                  flags.push(`${registrationStats.non_response_count} nem reagalas`);
                }
                if (Number(attendanceStats.no_show_count || 0) > 0) {
                  flags.push(`${attendanceStats.no_show_count} no-show`);
                }
                if (Number(financeStats.current_balance_amount || 0) < 0) {
                  flags.push(`tartozas: ${formatMoney(Math.abs(financeStats.current_balance_amount || 0))}`);
                }
                return `
                  <div class="statistics-list-row">
                    <div>
                      <div class="attendance-row-name">${escapeHtml(member.name || member.email || 'Ismeretlen tag')}</div>
                      <div class="small muted">${escapeHtml(flags.join(' · ') || 'Nincs kiemelt kockazat')}</div>
                    </div>
                    ${renderStatisticsBalanceBadge(financeStats.current_balance_amount || 0)}
                  </div>
                `;
              }).join('')}
            </div>`
          : `<div class="small muted top-space">Jelenleg nincs kiemelt kockazatu jatekos.</div>`
      }
    </div>
  `;
}

function renderStatisticsAttendanceTable(viewModel) {
  return `
    <div class="event-card">
      <div class="row between align-center wrap gap">
        <strong>Jelenlet es reakcio</strong>
        <span class="badge badge-muted">${escapeHtml(String(viewModel.members.length))} tag</span>
      </div>
      <div class="statistics-table top-space">
        <div class="statistics-table-row statistics-table-head">
          <div>Jatekos</div>
          <div>Rang</div>
          <div>Jelentkezes</div>
          <div>Megjelent</div>
          <div>Lemondas</div>
          <div>No-show</div>
          <div>Arany</div>
        </div>
        ${viewModel.members.map(member => {
          const registrationStats = getMemberRegistrationStats(member);
          const attendanceStats = getMemberAttendanceStats(member);
          const rankSnapshot = getMemberRankSnapshot(member);
          return `
            <div class="statistics-table-row">
              <div>
                <div class="attendance-row-name">${escapeHtml(member.name || member.email || 'Ismeretlen tag')}</div>
                <div class="small muted">${escapeHtml(member.email || '')}</div>
              </div>
              <div class="statistics-rank-inline">
                ${renderStatisticsRankMovement(member)}
                <span>${escapeHtml(renderStatisticsRankValue(member))}</span>
              </div>
              <div>${escapeHtml(String(registrationStats.joined_count || 0))}</div>
              <div>${escapeHtml(String(attendanceStats.present_count || 0))}</div>
              <div>${escapeHtml(String(registrationStats.cancelled_count || 0))}</div>
              <div>${escapeHtml(String(attendanceStats.no_show_count || 0))}</div>
              <div>${escapeHtml(formatPercentValue(rankSnapshot?.stats?.participationRatio))}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderStatisticsFinanceTable(viewModel) {
  return `
    <div class="event-card">
      <div class="row between align-center wrap gap">
        <strong>Penzugyi egyenlegek</strong>
        <span class="badge badge-muted">ledger alapu</span>
      </div>
      <div class="statistics-table top-space">
        <div class="statistics-table-row statistics-table-head">
          <div>Jatekos</div>
          <div>Befizetett</div>
          <div>Elvart</div>
          <div>Egyenleg</div>
          <div>Allapot</div>
          <div>Konyvelt sor</div>
          <div>Utolso mozgas</div>
        </div>
        ${viewModel.members.map(member => {
          const financeStats = getMemberFinanceStats(member);
          return `
            <div class="statistics-table-row">
              <div>
                <div class="attendance-row-name">${escapeHtml(member.name || member.email || 'Ismeretlen tag')}</div>
                <div class="small muted">${escapeHtml(member.email || '')}</div>
              </div>
              <div>${escapeHtml(formatMoney(financeStats.total_actual_paid_amount || 0))}</div>
              <div>${escapeHtml(formatMoney(financeStats.total_expected_amount || 0))}</div>
              <div>${escapeHtml(formatSignedMoney(financeStats.current_balance_amount || 0))}</div>
              <div>${renderStatisticsBalanceBadge(financeStats.current_balance_amount || 0)}</div>
              <div>${escapeHtml(String(financeStats.entry_count || 0))}</div>
              <div>${escapeHtml(financeStats.last_recorded_at ? formatDateTime(financeStats.last_recorded_at) : '—')}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderAdminStatisticsPanel() {
  if (!els.adminStatisticsContent) return;

  if (!state.currentTeam) {
    els.adminStatisticsContent.innerHTML = emptyState(
      'Még nincs kiválasztott csapat.',
      'Tölts be egy csapatot, és itt rögtön látni fogod a rang, jelenlét és pénzügyi statisztikákat.'
    );
    return;
  }

  const viewModel = buildAdminStatisticsViewModel();

  els.adminStatisticsContent.innerHTML = `
    <div class="stack">
      <div class="event-card admin-home-primary-card">
        <div class="row between align-center wrap gap">
          <div class="small muted">Most ezt nézd meg</div>
          <span class="badge badge-muted">nem napi operáció</span>
        </div>
        <div class="admin-home-primary-title top-space">Ez vezetői rálátás.</div>
        <div class="small muted top-space">
          Itt gyorsan észreveheted, kikre lehet stabilan számítani, kik kezdenek lemorzsolódni, és hol van pénzügyi vagy no-show kockázat.
        </div>
      </div>
      ${renderStatisticsOverviewCards(viewModel)}
      <div class="stack">
        ${renderStatisticsAttentionPanel(viewModel)}
      </div>
      <details class="admin-home-shelf">
        <summary>Polcra tett rangkép</summary>
        <div class="top-space">
          ${renderStatisticsRankDistribution(viewModel)}
        </div>
      </details>
      <details class="admin-home-shelf">
        <summary>Polcra tett jelenléti bontás</summary>
        <div class="top-space">
          ${renderStatisticsAttendanceTable(viewModel)}
        </div>
      </details>
      <details class="admin-home-shelf">
        <summary>Polcra tett pénzügyi bontás</summary>
        <div class="top-space">
          ${renderStatisticsFinanceTable(viewModel)}
        </div>
      </details>
    </div>
  `;
}

function renderAdminFinancePanel() {
  if (!els.adminFinanceContent || !els.adminAttendanceContent) return;

  const adminFocusEvent = getAdminWorkspaceFocusEvent();
  const selectedDetailEvent = state.selectedAdminEventDetail?.event || adminFocusEvent || null;
  const selectedPaymentSummary = state.selectedAdminEventDetail?.summary?.paymentSummary || {};
  const hasRecordedAttendance = Boolean(
    Number(selectedPaymentSummary.recorded_count || 0)
      || Number(selectedPaymentSummary.present_count || 0)
      || Number(selectedPaymentSummary.no_show_count || 0)
  );
  const hasRecordedPayments = Boolean(
    Number(selectedPaymentSummary.recorded_total_amount || 0)
      || Number(selectedPaymentSummary.collected_total_amount || 0)
  );

  const financeFlowSteps = [
    {
      label: '1. Válassz eseményt',
      hint: selectedDetailEvent ? (selectedDetailEvent.title || 'Esemény kiválasztva') : 'Nyisd meg a megvalósult meccset',
      state: selectedDetailEvent ? 'done' : 'current',
      workspace: 'events',
      section: 'closed'
    },
    {
      label: '2. Jelenlét',
      hint: hasRecordedAttendance ? 'Van rögzített megjelent vagy no-show' : 'Jelöld a megjelenteket',
      state: !selectedDetailEvent ? 'upcoming' : hasRecordedAttendance ? 'done' : 'current',
      workspace: 'finance',
      section: 'settlement'
    },
    {
      label: '3. Könyvelés',
      hint: hasRecordedPayments ? 'Van rögzített befizetés' : 'Írd be a tényleges befizetéseket',
      state: !selectedDetailEvent ? 'upcoming' : hasRecordedPayments ? 'done' : hasRecordedAttendance ? 'current' : 'upcoming',
      workspace: 'finance',
      section: 'settlement'
    },
    {
      label: '4. Lezárás',
      hint: selectedDetailEvent?.status === 'finished' ? 'Az esemény már le van zárva' : 'Zárd le, ha minden el van könyvelve',
      state: !selectedDetailEvent ? 'upcoming' : selectedDetailEvent?.status === 'finished' ? 'done' : hasRecordedPayments ? 'current' : 'upcoming',
      workspace: 'finance',
      section: 'settlement'
    }
  ];

  const financeGuideCard = `
    <div class="event-card admin-home-primary-card">
      <div id="adminFinanceProgressSummary" class="event-form-progress-summary bottom-space"></div>
      <div class="row between align-center wrap gap">
        <div class="small muted">Most ezzel foglalkozz</div>
        <span class="badge badge-warning">elszámolás</span>
      </div>
      <div class="admin-home-primary-title top-space">Ez már utómunka, nem szervezés.</div>
      <div class="small muted top-space">
        Itt a már megvalósult események adminisztrációja történik: jelenlét, no-show, befizetés és végül a kézi lezárás.
      </div>
      <div class="row gap wrap top-space">
        <button class="btn" type="button" data-admin-finance-section="settlement">Elszámolás</button>
      </div>
      <details class="admin-home-shelf top-space">
        <summary>Polcon még van pár pénzügyes út</summary>
        <div class="row gap wrap top-space">
          <button class="btn btn-ghost" type="button" data-admin-finance-section="balances">Egyenlegek</button>
        </div>
      </details>
      <details class="admin-home-shelf top-space">
        <summary>Polcra tett pénzügyi folyamat</summary>
        <div class="top-space">
          ${renderWorkspaceFlowCard('Pénzügyi munkafolyamat', 'Egy megvalósult eseménynél mindig ebben a sorrendben érdemes haladni.', financeFlowSteps)}
        </div>
      </details>
    </div>
  `;

  if (!state.currentTeam) {
    const empty = emptyState(
      'Még nincs kiválasztott csapat.',
      'A pénzügyi nézet akkor lesz hasznos, ha előbb betöltöd a csapatot és lesznek eseményeid.'
    );
    els.adminFinanceContent.innerHTML = empty;
    els.adminAttendanceContent.innerHTML = emptyState(
      'Még nincs kiválasztott esemény.',
      'Válassz ki vagy hozz létre egy csapatot, majd szervezz eseményt az elszámoláshoz.'
    );
    return;
  }

  const balancesShelf = `
    <details class="admin-home-shelf">
      <summary>Polcra tett pénzügyi háttér</summary>
      <div class="stack top-space">
        <div class="event-card finance-prep-card">
          <div class="row between align-center wrap gap">
            <strong>Pénzügy / kassza áttekintés</strong>
            <span class="badge ${state.currentTeam.cash_module_enabled ? 'badge-success' : 'badge-muted'}">${state.currentTeam.cash_module_enabled ? 'előkészítve' : 'még inaktív'}</span>
          </div>
          <div class="small muted top-space">
            Itt látod egy helyen a már kézzel lezárt eseményekből származó könyvelt összegeket.
          </div>
          ${renderTeamCashLedgerSummary(state.adminEvents)}
        </div>
        ${renderTeamFinanceBalances()}
      </div>
    </details>
  `;

  els.adminFinanceContent.innerHTML = `
    <div class="stack">
      ${financeGuideCard}
      ${balancesShelf}
    </div>
  `;

  if (!adminFocusEvent) {
    els.adminAttendanceContent.innerHTML = emptyState(
      'Még nincs kijelölt esemény az elszámoláshoz.',
      'Az események menüben nyisd meg a megvalósult eseményt, majd itt adminisztráld a jelenlétet és a befizetéseket.'
    );
    syncAdminFinanceSectionProgress();
    return;
  }

  const settlementGuideCard = `
    <div class="event-card admin-home-primary-card">
      <div class="row between align-center wrap gap">
        <div class="small muted">Most ezzel foglalkozz</div>
        <span class="badge badge-muted">1 → 2 → 3</span>
      </div>
      <div class="admin-home-primary-title top-space">Elszámolási sorrend</div>
      <div class="small muted top-space">
        1. Jelöld, ki jelent meg vagy lett no-show. 2. Rögzítsd a befizetéseket. 3. Ha minden kész, csak utána zárd le kézzel az eseményt.
      </div>
      <details class="admin-home-shelf top-space">
        <summary>Polcra tett elszámolási folyamat</summary>
        <div class="top-space">
          ${renderWorkspaceFlowCard('Aktuális elszámolási lépések', 'A rendszer mutatja, hol tartasz a könyvelésben.', financeFlowSteps)}
        </div>
      </details>
    </div>
  `;

  const selectedEventCard = `
      <div class="event-card">
        <div class="row between align-center wrap gap">
          <strong>Kiválasztott esemény</strong>
          <span class="badge ${canManageAttendanceForEvent(adminFocusEvent) ? 'badge-warning' : 'badge-draft'}">${canManageAttendanceForEvent(adminFocusEvent) ? (adminFocusEvent.status === 'finished' ? 'lezárt' : 'megvalósult / adminisztrálható') : 'közelgő'}</span>
        </div>
        <div class="small muted top-space">${escapeHtml(adminFocusEvent.title || 'Névtelen esemény')}</div>
        <div class="small muted">${escapeHtml(formatDateTime(adminFocusEvent.start_at))}</div>
        <div class="small muted">${escapeHtml(adminFocusEvent.location_name || 'Nincs helyszín')}</div>
      </div>
  `;

  els.adminAttendanceContent.innerHTML = `
    <div class="stack">
      ${settlementGuideCard}
      ${selectedEventCard}
      ${renderAdminAttendanceManager()}
    </div>
  `;

  setAdminFinanceSection(state.adminFinanceSection);
  syncAdminFinanceSectionProgress();
}

async function ensureAdminFinanceFocusEvent() {
  const currentDetailEvent = state.selectedAdminEventDetail?.event;
  if (currentDetailEvent && canManageAttendanceForEvent(currentDetailEvent)) {
    return;
  }

  const selectedEvent = state.selectedAdminEvent;
  if (selectedEvent && canManageAttendanceForEvent(selectedEvent)) {
    await openEventForAdmin(selectedEvent.id);
    return;
  }

  const firstManageableEvent = (state.adminEvents || []).find(event => canManageAttendanceForEvent(event));
  if (firstManageableEvent?.id) {
    await openEventForAdmin(firstManageableEvent.id);
  }
}

function canManageRoles() {
  return isPlatformOwner() || state.teamRole === 'team_admin';
}

function canAssignManagerRole() {
  return isPlatformOwner() || state.teamRole === 'team_admin';
}

function shouldShowCreateTeam() {
  return state.user?.can_create_team === true;
}

function getUserRegistrationPath() {
  return String(state.user?.registration_path || '').trim();
}

function isTournamentOrganizer() {
  return getUserRegistrationPath() === 'tournament_organizer';
}

function isActivityOrganizer() {
  return getUserRegistrationPath() === 'activity_organizer';
}

function isTeamSportOrganizer() {
  return getUserRegistrationPath() === 'team_sport_organizer';
}

function shouldShowTournamentWorkspace() {
  return Boolean(state.token && isTournamentOrganizer());
}

function shouldShowTeamAdminView() {
  return canAccessAdminView() && !isTournamentOrganizer();
}

function getPostAuthDefaultView() {
  if (!state.token) return 'authView';
  if (isPlatformOwner()) return 'platformView';
  if (shouldShowTournamentWorkspace()) return 'tournamentView';
  if (shouldShowTeamAdminView()) return 'adminView';
  return 'userView';
}

function applyRoleAwareUi() {
  const tournamentNav = document.querySelector('[data-view="tournamentView"]');
  const adminNav = document.querySelector('[data-view="adminView"]');
  const userNav = document.querySelector('[data-view="userView"]');
  const authNav = document.querySelector('[data-view="authView"]');
  const platformNav = document.querySelector('[data-view="platformView"]');
  const tournamentView = document.getElementById('tournamentView');
  const adminView = document.getElementById('adminView');
  const platformView = document.getElementById('platformView');

  if (authNav) authNav.style.display = state.token ? 'none' : '';
  if (userNav) userNav.style.display = state.token ? '' : 'none';
  if (tournamentNav) tournamentNav.style.display = shouldShowTournamentWorkspace() ? '' : 'none';
  if (adminNav) adminNav.style.display = shouldShowTeamAdminView() ? '' : 'none';
  if (platformNav) platformNav.style.display = isPlatformOwner() ? '' : 'none';

  if (tournamentView) {
    tournamentView.hidden = !shouldShowTournamentWorkspace();
  }

  if (adminView) {
    adminView.hidden = !shouldShowTeamAdminView();
  }

  if (platformView) {
    platformView.hidden = !isPlatformOwner();
  }

  const createTeamPanel = document.getElementById('createTeamPanel');
  if (createTeamPanel) {
    createTeamPanel.hidden = !shouldShowCreateTeam();
  }

  if (els.createInviteForm) {
    const inviteBlock = els.createInviteForm.closest('.top-space');
    if (inviteBlock) inviteBlock.hidden = !canManageInvites();
  }

  if (els.addMemberForm) {
    const addMemberBlock = els.addMemberForm.closest('.admin-collapse');
    if (addMemberBlock) addMemberBlock.hidden = !canAccessAdminView();
  }

  if (els.inviteRole) {
    els.inviteRole.innerHTML = `
      <option value="member">tag</option>
      ${canAssignManagerRole() ? '<option value="team_manager">csapatkapitány-helyettes</option>' : ''}
    `;
  }

  if (els.joinLinkRole) {
    els.joinLinkRole.innerHTML = `
      <option value="member">tag</option>
      ${canAssignManagerRole() ? '<option value="team_manager">csapatkapitány-helyettes</option>' : ''}
    `;
  }

  if (els.memberRole) {
    els.memberRole.innerHTML = `
      <option value="member">tag</option>
      ${canAssignManagerRole() ? '<option value="team_manager">csapatkapitány-helyettes</option>' : ''}
    `;
  }

  renderTournamentWorkspace();
  renderAdminHome();
  renderAdminFinancePanel();
  renderAdminStatisticsPanel();
  if (shouldShowTeamAdminView()) {
    setAdminWorkspace(state.adminWorkspace);
  }
  if (shouldShowTournamentWorkspace()) {
    setTournamentWorkspace(state.tournamentWorkspace);
  }
}

function renderInviteLanding() {
  if (!els.inviteLandingCard) return;

  if (!state.pendingInviteToken || state.authMode === 'register') {
    els.inviteLandingCard.hidden = true;
    els.inviteLandingCard.innerHTML = '';
    return;
  }

  const invite = state.pendingInvitePreview?.invite;
  els.inviteLandingCard.hidden = false;

  if (!invite) {
    els.inviteLandingCard.innerHTML = `
      <div class="small muted">Meghívó adatainak betöltése…</div>
    `;
    return;
  }

  els.inviteLandingCard.innerHTML = `
    <div class="invite-landing-shell">
      <div class="invite-landing-copy">
        <div class="invite-eyebrow">Meghívólink</div>
        <h2 class="invite-landing-title">Csatlakozás a csapathoz</h2>
        <div class="invite-landing-subtitle">Ezzel a linkkel közvetlenül beléphetsz a szervezett csapatod felületére, nincs szükség külön kódkérdezgetésre.</div>
      </div>
      <div class="invite-landing-card">
        <div class="row between align-center wrap gap">
          <div>
            <div class="small muted">Csapat</div>
            <strong class="invite-team-name">${escapeHtml(invite.team_name || 'Ismeretlen csapat')}</strong>
          </div>
          ${inviteStatusBadge(invite.status)}
        </div>
        <div class="invite-meta-grid top-space">
          <div class="invite-meta-box">
            <div class="invite-meta-label">Szerepkör</div>
            <div class="invite-meta-value">${escapeHtml(formatTeamRole(invite.role || 'member'))}</div>
          </div>
          <div class="invite-meta-box">
            <div class="invite-meta-label">Lejárat</div>
            <div class="invite-meta-value">${escapeHtml(formatDateTime(invite.expires_at))}</div>
          </div>
        </div>
        <div class="invite-message-strip top-space">${escapeHtml(invite.message || 'Nincs külön üzenet, ez a meghívó közvetlen csatlakozásra szolgál.')}</div>
      </div>
    </div>
    <div class="invite-landing-footnote top-space">
      Ha már van fiókod, belépés után automatikusan megpróbáljuk beváltani a meghívót. Ha még nincs, regisztrálj alább ugyanazzal az email címmel, amire a meghívó érkezett.
    </div>
  `;
}

function renderPlatformOwnerOverview() {
  if (!els.platformOverviewCards || !els.platformTeamsList || !els.platformEventsList) return;

  if (!isPlatformOwner()) {
    els.platformOverviewCards.innerHTML = '';
    els.platformTeamsList.innerHTML = '';
    els.platformEventsList.innerHTML = '';
    return;
  }

  if (!state.platformSummary) {
    els.platformOverviewCards.innerHTML = emptyState('Nincs platform adat.', 'A platform összkép akkor jelenik meg itt, ha már vannak élő csapatok és események.');
    els.platformTeamsList.innerHTML = '';
    els.platformEventsList.innerHTML = '';
    return;
  }

  const counts = state.platformSummary.counts || {};
  els.platformOverviewCards.innerHTML = [
    { label: 'Aktív user', value: counts.active_users ?? 0 },
    { label: 'Aktív csapat', value: counts.active_teams ?? 0 },
    { label: 'Publikált esemény', value: counts.published_events ?? 0 },
    { label: 'Aktív going', value: counts.active_going_registrations ?? 0 }
  ].map(item => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(item.label)}</div>
      <div class="stat-value">${escapeHtml(String(item.value))}</div>
    </div>
  `).join('');

  els.platformTeamsList.innerHTML = (state.platformSummary.recent_teams || []).map(team => `
    <div class="event-card compact-team-card">
      <strong>${escapeHtml(team.name)}</strong>
      <div class="small muted">Csapatalapító: ${escapeHtml(team.owner_name || '-')}</div>
      <div class="small muted">Aktív tag: ${escapeHtml(String(team.active_members ?? 0))}</div>
      <div class="small muted">Létrehozva: ${escapeHtml(formatDateTime(team.created_at))}</div>
    </div>
  `).join('') || emptyState('Nincs csapat adat.', 'Még nincs megjeleníthető csapat.');

  els.platformEventsList.innerHTML = (state.platformSummary.recent_events || []).map(event => `
    <div class="event-card compact-team-card">
      <strong>${escapeHtml(event.title)}</strong>
      <div class="small muted">${escapeHtml(event.team_name || '-')}</div>
      <div class="small muted">Kezdés: ${escapeHtml(formatDateTime(event.start_at))}</div>
      <div class="small muted">Jelentkezett: ${escapeHtml(String(event.going_count ?? 0))}</div>
      <div class="row gap wrap top-space">
        ${statusBadge(event.status)}
      </div>
    </div>
  `).join('') || emptyState('Nincs esemény adat.', 'Még nincs megjeleníthető esemény.');
}

function getTournamentWorkspaceButtons() {
  return [...document.querySelectorAll('[data-tournament-workspace]')];
}

function getTournamentWorkspacePanels() {
  return [...document.querySelectorAll('[data-tournament-workspace-panel]')];
}

function renderTournamentWorkspace() {
  if (!els.tournamentOverviewCards || !els.tournamentHomeContent || !els.tournamentWorkspaceSummary) return;

  if (!shouldShowTournamentWorkspace()) {
    els.tournamentOverviewCards.innerHTML = '';
    els.tournamentHomeContent.innerHTML = '';
    els.tournamentWorkspaceSummary.innerHTML = '';
    return;
  }

  const tournamentDraft = loadTournamentSetupDraft();
  const hasTeams = (state.myTeams || []).length > 0;
  const pendingInvites = (state.myInvites || []).filter(invite => invite?.status === 'pending').length;
  const upcomingEvents = (state.myEvents || []).filter(event => isFuturePublishedEvent(event)).length;
  const hasTournamentBasics = Boolean(
    String(tournamentDraft.title || '').trim()
    && String(tournamentDraft.locationName || '').trim()
    && Number(tournamentDraft.teamCount || 0) >= 2
    && Number(tournamentDraft.fieldCount || 0) >= 1
  );
  const formatLabel = tournamentDraft.formatHint === 'round_robin'
    ? 'körmérkőzés'
    : tournamentDraft.formatHint === 'knockout'
      ? 'egyenes kiesés'
      : 'csoportkör + kieséses ág';

  els.tournamentOverviewCards.innerHTML = [
    { label: 'Tornaalapok', value: hasTournamentBasics ? 'készül' : 'még üres' },
    { label: 'Saját csapatok', value: state.myTeams?.length ?? 0 },
    { label: 'Függő meghívók', value: pendingInvites },
    { label: 'Látható események', value: upcomingEvents }
  ].map(item => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(item.label)}</div>
      <div class="stat-value">${escapeHtml(String(item.value))}</div>
    </div>
  `).join('');

  els.tournamentHomeContent.innerHTML = `
    <div class="event-card admin-home-sidecard">
      <div class="row between align-center wrap gap">
        <div>
          <strong>Most ezzel foglalkozz</strong>
          <div class="admin-guide-title top-space">A tornaszervezői munkatér külön világra váltott.</div>
        </div>
        <span class="badge badge-live">főmodul</span>
      </div>
      <div class="small muted top-space">Előbb hozd létre az első tornát, utána hívd meg a csapatkapitányokat, majd építsd fel a lebonyolítást. A részletes meccs-, pénzügy- és kommunikációs modulok innen nőnek tovább.</div>
      <div class="row gap wrap top-space">
        <button class="btn btn-secondary" type="button" data-tournament-workspace-jump="tournaments">Torna alapjai</button>
        <button class="btn btn-ghost" type="button" data-tournament-workspace-jump="registrations">Nevezések</button>
        <button class="btn btn-ghost" type="button" data-tournament-workspace-jump="format">Lebonyolítás</button>
      </div>
    </div>
    <div class="grid two-col inner-grid top-space">
      <div class="detail-box">
        <div class="detail-label">Mi kész van már?</div>
        <div class="detail-value">${hasTournamentBasics ? 'Az első torna alapjai már rögzítve vannak.' : (hasTeams ? 'Van saját szervezői jelenléted a rendszerben.' : 'Még nincs saját csapat vagy meghívott kör.')}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">Mi jön most?</div>
        <div class="detail-value">${hasTournamentBasics ? 'Következhetnek a csapatkapitányok és a nevezések.' : 'A torna alapadatait érdemes most összerakni: helyszín, csapatszám, pályaszám, meccshossz.'}</div>
      </div>
    </div>
  `;

  els.tournamentWorkspaceSummary.innerHTML = `
    <div class="event-card compact-team-card">
      <strong>Itt tart most a struktúra</strong>
      <div class="small muted top-space">Ez már nem a csapatsportos admin starter. A tornaszervező külön menüt, külön kezdőpultot és külön folyamatot kap.</div>
      <div class="row gap wrap top-space">
        <span class="badge ${hasTournamentBasics ? 'badge-live' : 'badge-draft'}">${hasTournamentBasics ? 'van tornaalap' : 'még indul a főmodul'}</span>
        <span class="badge badge-muted">${pendingInvites} függő meghívó</span>
      </div>
    </div>
    <div class="event-card compact-team-card top-space">
      <strong>${escapeHtml(tournamentDraft.title || 'Még nincs elnevezett torna')}</strong>
      <div class="small muted top-space">
        ${hasTournamentBasics
          ? `${escapeHtml(String(tournamentDraft.teamCount))} csapat · ${escapeHtml(String(tournamentDraft.fieldCount))} pálya · ${escapeHtml(String(tournamentDraft.matchDurationMinutes))} perces meccsek`
          : 'Ha kitöltöd az alapokat, itt rögtön látni fogod a torna fő paramétereit.'}
      </div>
      <div class="small muted">${escapeHtml(tournamentDraft.locationName || 'Még nincs helyszín megadva.')} · ${escapeHtml(formatLabel)}</div>
      <div class="small muted">${escapeHtml(tournamentDraft.startDate ? formatDateTime(tournamentDraft.startDate) : 'Még nincs kezdő időpont megadva.')}</div>
    </div>
    <details class="admin-collapse top-space">
      <summary><span>Polcon maradt fejlesztési útvonalak</span></summary>
      <div class="admin-collapse-body stack">
        <div class="small muted">Tornák: alapbeállítások, csapatszám, pályák, helyszín, meccshossz.</div>
        <div class="small muted">Csapatok és nevezések: meghívott csapatkapitányok, keretek, visszaigazolások.</div>
        <div class="small muted">Lebonyolítás és mérkőzések: csoportok, pályabeosztás, eredmények, statisztika.</div>
      </div>
    </details>
  `;

  const tournamentsPanel = document.getElementById('tournamentTournamentsPanel');
  if (tournamentsPanel) {
    tournamentsPanel.innerHTML = `
      <div class="event-card admin-home-sidecard">
        <div class="row between align-center wrap gap">
          <div>
            <strong>Torna alapjai</strong>
            <div class="admin-guide-title top-space">${escapeHtml(tournamentDraft.title || 'Itt indul az első torna váza')}</div>
          </div>
          <span class="badge ${hasTournamentBasics ? 'badge-live' : 'badge-draft'}">${hasTournamentBasics ? 'mentve' : 'első kör'}</span>
        </div>
        <div class="small muted top-space">Add meg a torna nevét, a csapatok számát, a pályák számát, a helyszínt és a meccsek hosszát. Ez lesz a teljes későbbi lebonyolítás alapja.</div>
      </div>
      <form id="tournamentSetupForm" class="stack top-space">
        <div class="grid two-col inner-grid">
          <div>
            <label class="label" for="tournamentTitle">Torna neve</label>
            <input id="tournamentTitle" name="title" type="text" placeholder="Tavaszi Városi Kupa" value="${escapeAttribute(tournamentDraft.title || '')}" required />
          </div>
          <div>
            <label class="label" for="tournamentLocationName">Helyszín</label>
            <input id="tournamentLocationName" name="locationName" type="text" placeholder="Budapest, Vasas pálya" value="${escapeAttribute(tournamentDraft.locationName || '')}" required />
          </div>
        </div>
        <div class="grid three-col inner-grid">
          <div>
            <label class="label" for="tournamentTeamCount">Hány csapatos?</label>
            <input id="tournamentTeamCount" name="teamCount" type="number" min="2" max="128" value="${escapeAttribute(String(tournamentDraft.teamCount || 16))}" required />
          </div>
          <div>
            <label class="label" for="tournamentFieldCount">Egyszerre hány pálya van?</label>
            <input id="tournamentFieldCount" name="fieldCount" type="number" min="1" max="24" value="${escapeAttribute(String(tournamentDraft.fieldCount || 2))}" required />
          </div>
          <div>
            <label class="label" for="tournamentMatchDuration">Egy mérkőzés hány perces?</label>
            <input id="tournamentMatchDuration" name="matchDurationMinutes" type="number" min="5" max="180" value="${escapeAttribute(String(tournamentDraft.matchDurationMinutes || 20))}" required />
          </div>
        </div>
        <div class="grid two-col inner-grid">
          <div>
            <label class="label" for="tournamentStartDate">Kezdő időpont</label>
            <input id="tournamentStartDate" name="startDate" type="datetime-local" value="${escapeAttribute(tournamentDraft.startDate || '')}" />
          </div>
          <div>
            <label class="label" for="tournamentFormatHint">Milyen irányban gondolkodsz?</label>
            <select id="tournamentFormatHint" name="formatHint">
              <option value="group_knockout"${tournamentDraft.formatHint === 'group_knockout' ? ' selected' : ''}>Csoportkör + kieséses ág</option>
              <option value="round_robin"${tournamentDraft.formatHint === 'round_robin' ? ' selected' : ''}>Körmérkőzés</option>
              <option value="knockout"${tournamentDraft.formatHint === 'knockout' ? ' selected' : ''}>Egyenes kiesés</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label" for="tournamentNotes">Szervezői megjegyzés</label>
          <textarea id="tournamentNotes" name="notes" rows="3" placeholder="Például: vasárnap délelőtt, 2 pályán párhuzamosan, büfé külön, döntő 17:00-kor.">${escapeHtml(tournamentDraft.notes || '')}</textarea>
        </div>
        <div class="row gap wrap">
          <button class="btn" type="submit">Tornaalapok mentése</button>
          <button class="btn btn-ghost" type="button" data-tournament-workspace-jump="registrations">Tovább a nevezésekhez</button>
        </div>
      </form>
    `;
  }

  const placeholderMap = {
    tournamentRegistrationsPanel: ['Itt jönnek a nevezések.', 'A csapatkapitányok meghívása és a benevezett keretek külön kezelést kapnak.'],
    tournamentFormatPanel: ['Itt épül fel a lebonyolítás.', 'Csoportkör, kieséses ág és pálya-idő logika kerül ide.'],
    tournamentMatchesPanel: ['Itt lesznek a mérkőzések.', 'Eredmények, gólok, asszisztok és élő állapotok jönnek ide.'],
    tournamentFinancePanel: ['Itt lesz a torna pénzügye.', 'Nevezési díj, csapatonkénti befizetés és lezárás kerül ide.'],
    tournamentCommsPanel: ['Itt lesz a kommunikáció.', 'Központi tájékoztatás, csapatkapitányi üzenetek és értesítések ide kerülnek.'],
    tournamentStatsPanel: ['Itt lesz a torna statisztikája.', 'Tabella, játékosmutatók és összesített zárókép jelenik meg itt.']
  };

  Object.entries(placeholderMap).forEach(([elementId, [title, hint]]) => {
    const mount = document.getElementById(elementId);
    if (!mount) return;
    mount.innerHTML = emptyState(title, hint);
  });
}

function setTournamentWorkspace(workspace = 'home') {
  const nextWorkspace = ['home', 'tournaments', 'registrations', 'format', 'matches', 'finance', 'comms', 'stats'].includes(workspace)
    ? workspace
    : 'home';
  state.tournamentWorkspace = nextWorkspace;

  getTournamentWorkspaceButtons().forEach(button => {
    button.classList.toggle('active', button.dataset.tournamentWorkspace === nextWorkspace);
  });

  getTournamentWorkspacePanels().forEach(panel => {
    const isActive = panel.dataset.tournamentWorkspacePanel === nextWorkspace;
    panel.classList.toggle('hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
  });
}

async function handleTournamentSetupSubmit(event) {
  event.preventDefault();
  clearMessage();

  const form = event.target;
  if (!form || form.id !== 'tournamentSetupForm') return;

  const formData = new FormData(form);
  const title = String(formData.get('title') || '').trim();
  const locationName = String(formData.get('locationName') || '').trim();
  const teamCount = Number(formData.get('teamCount') || 0);
  const fieldCount = Number(formData.get('fieldCount') || 0);
  const matchDurationMinutes = Number(formData.get('matchDurationMinutes') || 0);
  const startDate = String(formData.get('startDate') || '').trim();
  const formatHint = String(formData.get('formatHint') || 'group_knockout').trim();
  const notes = String(formData.get('notes') || '').trim();

  if (!title) {
    showMessage('Adj nevet a tornának.', 'error');
    document.getElementById('tournamentTitle')?.focus();
    return;
  }

  if (!locationName) {
    showMessage('Add meg a torna helyszínét.', 'error');
    document.getElementById('tournamentLocationName')?.focus();
    return;
  }

  if (!Number.isFinite(teamCount) || teamCount < 2) {
    showMessage('Legalább 2 csapattal számolj a torna indulásához.', 'error');
    document.getElementById('tournamentTeamCount')?.focus();
    return;
  }

  if (!Number.isFinite(fieldCount) || fieldCount < 1) {
    showMessage('Legalább 1 pálya szükséges a torna felépítéséhez.', 'error');
    document.getElementById('tournamentFieldCount')?.focus();
    return;
  }

  if (!Number.isFinite(matchDurationMinutes) || matchDurationMinutes < 5) {
    showMessage('A mérkőzés hossza legalább 5 perc legyen.', 'error');
    document.getElementById('tournamentMatchDuration')?.focus();
    return;
  }

  saveTournamentSetupDraft({
    title,
    locationName,
    teamCount,
    fieldCount,
    matchDurationMinutes,
    startDate,
    formatHint,
    notes
  });

  renderTournamentWorkspace();
  setTournamentWorkspace('tournaments');
  showMessage('A torna alapjai elmentve. Következhetnek a csapatkapitányok és a nevezések.', 'success');
}

function switchView(viewId) {
  if (viewId === 'tournamentView' && !shouldShowTournamentWorkspace()) {
    viewId = getPostAuthDefaultView();
  }

  if (viewId === 'platformView' && !isPlatformOwner()) {
    viewId = state.token ? getPostAuthDefaultView() : 'authView';
  }

  if (viewId === 'adminView' && !shouldShowTeamAdminView()) {
    viewId = state.token ? getPostAuthDefaultView() : 'authView';
  }

  if (state.layoutEditor.isEditing && state.layoutEditor.viewId && state.layoutEditor.viewId !== viewId) {
    cancelSurfaceLayoutDraft();
  }

  els.views.forEach(view => view.classList.toggle('active', view.id === viewId));
  els.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
  document.querySelectorAll('[data-surface-layout="true"]').forEach(view => {
    view.classList.toggle('surface-layout-active', view.id === viewId);
    if (view.id !== viewId) {
      view.classList.remove('surface-layout-editing');
    }
  });

  const activeSurfaceView = getSurfaceViewById(viewId);
  if (activeSurfaceView) {
    applySurfaceLayout(viewId);
  }

  if (viewId === 'tournamentView') {
    setTournamentWorkspace(state.tournamentWorkspace);
  }

  renderProfilePanel(getProfileDraftFromForm());
  syncAuthLayout();
}

async function bootSession() {
  ensureSidebarShell();
  ensureAuthShell();
  ensureAuthOnboardingUi();
  ensureAdminStatisticsUi();
  setAuthMode(state.pendingInviteToken ? 'register' : 'login');
  syncAuthLayout();
  ensureEventPricingUi();
  els.userWeatherModule?.closest('.card')?.remove();
  ['tournamentView', 'adminView', 'userView'].forEach(viewId => applySurfaceLayout(viewId));
  if (els.apiBase) {
    els.apiBase.value = state.apiBase;
  }
  await loadVersionInfo();
  await loadGoogleAuthConfig();
  await loadInvitePreview();

  if (state.currentTeamId) {
    els.teamIdInput.value = state.currentTeamId;
    els.userTeamIdInput.value = state.currentTeamId;
  }

  if (!state.token) {
    updateSessionUi();
    applyRoleAwareUi();
    return;
  }

  try {
    const me = await api('/auth/me', { method: 'GET' });
    setAuth(state.token, me.user);
    await tryAcceptPendingInviteToken();

    await loadMyTeams();
    await loadMyEvents();
    await loadMyInvites();
    await loadPlatformSummary();

    if (state.currentTeamId) {
      await loadTeam(state.currentTeamId);
    }

    switchView(getPostAuthDefaultView());
  } catch {
    clearAuth();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessage();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setAuth(result.token, result.user);
    await refreshCurrentUser();
    els.loginForm.reset();
    await tryAcceptPendingInviteToken();

    await loadMyTeams();
    await loadMyEvents();
    await loadMyInvites();
    await loadPlatformSummary();

    if (state.currentTeamId) {
      await loadTeam(state.currentTeamId);
    }

    const targetView = getPostAuthDefaultView();

    showMessage('Sikeres bejelentkezés.', 'success');
    switchView(
      targetView
    );
    if (targetView === 'tournamentView') {
      setTournamentWorkspace('home');
    }
    if (targetView === 'adminView') {
      setAdminWorkspace('home');
    }
    if (targetView === 'userView') {
      triggerPendingInvitePulse();
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearMessage();

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const phone = document.getElementById('registerPhone')?.value.trim() || null;
  const password = document.getElementById('registerPassword').value;
  const inviteToken = document.getElementById('registerInviteToken')?.value.trim() || state.pendingInviteToken || null;
  const registrationPath = getSelectedRegistrationPath();
  if (!registrationPath) {
    showMessage('Előbb válassz egy belépési kártyát.', 'error');
    return;
  }
  const registerAsOrganizer = registrationPath !== 'invited_participant';

  try {
    const result = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        inviteToken,
        registrationPath,
        registerAsOrganizer
      })
    });

    setAuth(result.token, result.user);
    await refreshCurrentUser();
    els.registerForm.reset();

    await loadMyTeams();
    await loadMyEvents();
    await loadMyInvites();
    await loadPlatformSummary();

    if (state.currentTeamId) {
      await loadTeam(state.currentTeamId);
    }

    const targetView = getPostAuthDefaultView();

    showMessage(result.message || 'Sikeres regisztráció és automatikus belépés.', 'success');
    switchView(
      targetView
    );
    if (targetView === 'tournamentView') {
      setTournamentWorkspace('home');
    }
    if (targetView === 'adminView') {
      setAdminWorkspace('home');
    }
    if (targetView === 'userView') {
      triggerPendingInvitePulse();
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function loadMyTeams() {
  if (!state.token) return;

  try {
    const result = await api('/my/teams', { method: 'GET' });
    state.myTeams = result.teams || [];
    syncTeamSelectors();
    const hasCurrentTeam = state.myTeams.some(team => team.id === state.currentTeamId);
    if (state.currentTeamId && !hasCurrentTeam) {
      clearCurrentTeamContext({ clearStored: true });
    }
    renderMyTeams(state.myTeams);
    renderUserOverview();

    if (!state.currentTeamId && result.teams && result.teams.length > 0) {
      await loadTeam(result.teams[0].id);
    }
  } catch (error) {
    console.error('Saját csapatok betöltési hiba:', error);
  }
}

function renderMyTeams(teams) {
  if (!els.myTeamsList) return;

  if (!teams.length) {
    els.myTeamsList.innerHTML = emptyState('Még nincs aktív csapatod.', 'Hozz létre csapatot vagy fogadj el egy meghívást.');
    return;
  }

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === state.currentTeamId) return -1;
    if (b.id === state.currentTeamId) return 1;
    return a.name.localeCompare(b.name, 'hu');
  });

  els.myTeamsList.innerHTML = sortedTeams.map(team => {
    const isCurrent = team.id === state.currentTeamId;
    return `
      <div class="event-card compact-team-card ${isCurrent ? 'is-current-card' : ''}">
        <div class="row between align-center wrap gap">
          <div>
            <strong>${escapeHtml(team.name)}</strong>
            <div class="small muted">${escapeHtml(formatTeamRole(team.role))} · azonosító: ${escapeHtml(shortId(team.id))}</div>
          </div>
          <div class="row gap align-center wrap">
            ${isCurrent ? '<span class="badge badge-draft">fókuszcsapat</span>' : ''}
            <button class="btn btn-secondary" type="button" data-my-team-id="${team.id}">
              Megnyitás
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function syncTeamSelectors() {
  const teams = Array.isArray(state.myTeams) ? [...state.myTeams] : [];
  const sortedTeams = teams.sort((a, b) => {
    if (a.id === state.currentTeamId) return -1;
    if (b.id === state.currentTeamId) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'hu');
  });

  [els.teamIdInput, els.userTeamIdInput].forEach(select => {
    if (!select || String(select.tagName).toUpperCase() !== 'SELECT') return;

    const selectedValue = state.currentTeamId || select.value || '';
    select.innerHTML = `
      <option value="">Válassz csapatot...</option>
      ${sortedTeams.map(team => `
        <option value="${escapeHtml(team.id)}" ${team.id === selectedValue ? 'selected' : ''}>
          ${escapeHtml(team.name || 'Névtelen csapat')}
        </option>
      `).join('')}
    `;

    if (selectedValue) {
      select.value = selectedValue;
    }
  });
}


async function loadMyInvites() {
  if (!state.token || !els.myInvitesList) return;

  try {
    const result = await api('/my/invites', { method: 'GET' });
    state.myInvites = result.invites || [];
    renderMyInvites(state.myInvites);
    renderUserOverview();
    if (!state.myInvites.some(invite => invite.status === 'pending')) {
      clearPendingInvitePulseTimer();
      state.userInvitePulseUntil = 0;
    }
  } catch (error) {
    console.error('Saját meghívások betöltési hiba:', error);
    els.myInvitesList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
  }
}

function renderMyInvites(invites) {
  if (!els.myInvitesList) return;

  if (!invites.length) {
    els.myInvitesList.innerHTML = emptyState('Nincs meghívásod.', 'Ha valaki meghív egy csapatba, itt fog megjelenni.');
    return;
  }

  const sortedInvites = [...invites].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const pendingInvites = sortedInvites.filter(invite => invite.status === 'pending');
  const closedInvites = sortedInvites.filter(invite => invite.status !== 'pending');

  const renderInviteCard = invite => {
    const isPending = invite.status === 'pending';
    const hint = inviteActionHint(invite.status);

    return `
      <div class="event-card invite-card ${isPending ? 'is-pending' : 'is-closed'}">
        <div class="row between align-center wrap gap">
          <div>
            <strong>${escapeHtml(invite.team_name || 'Ismeretlen csapat')}</strong>
            <div class="small muted">Szerepkör: ${escapeHtml(formatTeamRole(invite.role || 'member'))}</div>
          </div>
          ${inviteStatusBadge(invite.status)}
        </div>
        <div class="small muted top-space">Meghívó: ${escapeHtml(invite.invited_by_name || invite.invited_by_email || '-')}</div>
        <div class="small muted">Lejárat: ${escapeHtml(formatDateTime(invite.expires_at))}</div>
        <div class="small muted">Üzenet: ${escapeHtml(invite.message || 'Nincs külön üzenet')}</div>
        ${isPending ? `
          <div class="event-actions">
            <button class="btn" type="button" data-my-invite-action="accept" data-invite-id="${invite.id}" data-invite-team-id="${invite.team_id}">
              Elfogadás
            </button>
            <button class="btn btn-danger" type="button" data-my-invite-action="decline" data-invite-id="${invite.id}" data-invite-team-id="${invite.team_id}">
              Elutasítás
            </button>
          </div>
        ` : `<div class="small muted top-space invite-note">${escapeHtml(hint || 'Ehhez a meghíváshoz már nincs teendő.')}</div>`}
      </div>
    `;
  };

  const closedBlock = closedInvites.length ? `
    <details class="event-accordion collapsed-group">
      <summary>Lezárt meghívások (${closedInvites.length})</summary>
      <div class="stack top-space">
        ${closedInvites.map(renderInviteCard).join('')}
      </div>
    </details>
  ` : '';

  els.myInvitesList.innerHTML = `
    ${pendingInvites.length ? pendingInvites.map(renderInviteCard).join('') : emptyState('Nincs függő meghívásod.', 'Jelenleg nincs olyan csapatmeghívó, amelyre reagálnod kellene.')}
    ${closedBlock}
  `;
}

async function loadMyEvents() {
  if (!state.token) return;

  try {
    const result = await api('/my/events', { method: 'GET' });
    state.myEvents = result.events || [];
    await hydrateUserEventDetailsCache(state.myEvents);
    renderMyEvents(state.myEvents);
    renderUserOverview();
    triggerUserNewEventsPulse();
  } catch (error) {
    console.error('Saját események betöltési hiba:', error);
    renderHeroEvent(null);
    if (els.myEventsList) {
      els.myEventsList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
    }
  }
}

function getUserEventsToHydrate(events = []) {
  const nextEvent = getNextEvent(events);
  const remainingEvents = events.filter(event => event.id !== nextEvent?.id);
  const upcoming = getUpcomingEvents(remainingEvents);
  const fallback = sortEventsByStart(remainingEvents);
  const list = (upcoming.length ? upcoming : fallback).slice(0, 6);
  return [nextEvent, ...list].filter(Boolean);
}

async function hydrateUserEventDetailsCache(events = []) {
  const eventsToHydrate = getUserEventsToHydrate(events);
  const uncached = eventsToHydrate.filter(event => !state.userEventDetailsById[String(event.id)]);

  if (!uncached.length) return;

  await Promise.all(uncached.map(async event => {
    try {
      const detail = await api(`/events/${event.id}`, { method: 'GET' });
      state.userEventDetailsById[String(event.id)] = detail;
    } catch (error) {
      console.error('Felhasználói esemény részlet cache hiba:', error);
    }
  }));
}

function renderMyEvents(events) {
  if (!els.myEventsList) return;

  const nextEvent = getNextEvent(events);
  renderHeroEvent(nextEvent);

  if (!events.length) {
    els.myEventsList.innerHTML = emptyState('Még nincs saját eseményed.', 'Ha a csapataidhoz tartozik esemény vagy jelentkezel egyre, itt látod.');
    return;
  }

  const remainingEvents = events.filter(event => event.id !== nextEvent?.id);

  if (!remainingEvents.length) {
    els.myEventsList.innerHTML = emptyState(
      'Nincs több közelgő eseményed.',
      'A legfontosabb fókusz eseményt felül látod, jelenleg nincs mellette másik esemény a listában.'
    );
    return;
  }

  const upcoming = getUpcomingEvents(remainingEvents);
  const fallback = sortEventsByStart(remainingEvents);
  const list = (upcoming.length ? upcoming : fallback).slice(0, 6);

  els.myEventsList.innerHTML = list.map(event => {
    const insightChips = buildEventInsightChips(event);

    return `
      <div class="event-card user-event-card">
        <div class="row between align-center wrap gap">
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <div class="small muted">${escapeHtml(event.team_name || '-')}</div>
          </div>
          <div class="row gap wrap align-center">
            ${statusBadge(event.status)}
            ${registrationStatusBadge(event.my_registration_status)}
          </div>
        </div>

        ${renderEventReadinessPanel(event, { compact: true })}

        <div class="hero-metrics compact-metrics top-space">
          ${insightChips.map(item => `
            <div class="mini-stat compact-mini-stat">
              <div class="mini-stat-label">${escapeHtml(item.label)}</div>
              <div class="mini-stat-value">${item.valueHtml || escapeHtml(item.value)}</div>
            </div>
          `).join('')}
        </div>

        <div class="small muted top-space">Kezdés: ${escapeHtml(formatDateTime(event.start_at))}</div>
        <div class="small muted">Helyszín: ${escapeHtml(event.location_name || '-')}</div>

        ${renderEventParticipantPreview(event, { role: 'user', compact: true })}

        <details class="event-accordion top-space">
          <summary>Részletek lenyitása</summary>
          ${renderEventAccordionBody(event)}
        </details>

        <div class="event-actions top-space">
          ${renderMyEventActionButtons(event)}
        </div>
      </div>
    `;
  }).join('');
}

async function handleDashboardClicks(event) {
  const teamId = event.target.dataset.myTeamId;
  const eventId = event.target.dataset.openEventId;
  const registerEventId = event.target.dataset.registerEventId;
  const registerLimitEventId = event.target.dataset.registerLimitEventId;
  const cancelEventId = event.target.dataset.cancelEventId;

  if (teamId) {
    await loadTeam(teamId);
    return;
  }

  if (registerEventId) {
    await registerForEvent(registerEventId);
    return;
  }

  if (registerLimitEventId) {
    const blockedEvent = state.myEvents.find(item => item.id === registerLimitEventId)
      || state.userTeamEvents.find(item => item.id === registerLimitEventId)
      || state.selectedUserEventDetail?.event
      || state.selectedUserEvent;
    showMessage(buildEventRegistrationLimitMessage(blockedEvent), 'error');
    return;
  }

  if (cancelEventId) {
    await cancelRegistration(cancelEventId);
    return;
  }

  if (eventId) {
    await openEventForUser(eventId);
  }
}

async function loadTeam(teamId) {
  if (!teamId) {
    showMessage('Adj meg egy csapat ID-t.', 'error');
    return;
  }

  try {
    const result = await api(`/teams/${teamId}`, { method: 'GET' });
    saveTeamId(teamId);

    state.currentTeam = result.team;
    state.currentTeamFinance = result.current_user_finance || null;
    state.teamFinanceEntries = result.team_finance_entries || [];
    state.teamDrawPreview = null;
    state.adminSavedEventDraw = null;
    state.adminSavedEventDrawEventId = null;
    state.teamMembers = result.members || [];
    const currentMember = state.teamMembers.find(m => m.user_id === state.user?.id);
    state.teamRole = currentMember?.role || null;
    state.teamSkillSettings = null;

    if (canAccessAdminView()) {
      try {
        const skillSettingsResult = await api(`/teams/${teamId}/skill-settings`, { method: 'GET' });
        state.teamSkillSettings = skillSettingsResult.settings || null;
      } catch (error) {
        console.error('Skill settings betöltési hiba:', error);
      }
    }

    renderTeamSummary(result.team);
    renderUserTeamDrawPreview();
      renderUserRankModule();
      renderUserFinanceModule();
    renderTeamMembersAdmin(state.teamMembers);
    renderAdminOverview();
    applyRoleAwareUi();

    if (canManageInvites()) {
      await loadTeamInvites();
    } else if (els.teamInvitesAdminList) {
      state.teamInvites = [];
      els.teamInvitesAdminList.innerHTML = emptyState('Nincs hozzáférésed a meghívókhoz.', 'Csak a csapatkapitány vagy a csapatkapitány-helyettes láthatja a csapat meghívóit.');
      renderAdminOverview();
    }

    await Promise.all([
      canAccessAdminView() ? loadAdminEvents() : Promise.resolve(),
      loadUserEvents(),
      loadMyEvents(),
      loadMyInvites()
    ]);
    if (state.currentTeam) {
      renderTeamSummary(state.currentTeam);
    }
    showMessage('Csapat betöltve.', 'success');
  } catch (error) {
    clearCurrentTeamContext({ clearStored: true });
    showMessage(error.message, 'error');
  }
}


async function loadTeamInvites() {
  if (!state.currentTeamId || !els.teamInvitesAdminList) return;

  try {
    const result = await api(`/teams/${state.currentTeamId}/invites`, { method: 'GET' });
    state.teamInvites = result.invites || [];
    renderTeamInvitesAdmin(state.teamInvites);
    renderAdminOverview();
  } catch (error) {
    els.teamInvitesAdminList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
  }
}

function renderTeamInviteAdminCard(invite) {
  const isPending = invite.status === 'pending';
  const hint = inviteActionHint(invite.status);
  const isJoinLink = invite.invite_kind === 'join_link';
  const shareUrl = `${window.location.origin}${invite.invite_link || ''}`;
  const title = isJoinLink
    ? 'Messengeres csatlakozó link'
    : (invite.invited_email || 'Tokenes meghívó');

  return `
    <div class="event-card invite-card ${isPending ? 'is-pending' : 'is-closed'}">
      <div class="row between align-center gap wrap">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="small muted">Szerepkör: ${escapeHtml(formatTeamRole(invite.role || 'member'))}</div>
        </div>
        ${inviteStatusBadge(invite.status)}
      </div>
      <div class="small muted top-space">Meghívta: ${escapeHtml(invite.invited_by_name || invite.invited_by_email || '-')}</div>
      <div class="small muted">Lejárat: ${escapeHtml(formatDateTime(invite.expires_at))}</div>
      <div class="small muted">Kód: ${escapeHtml(invite.invite_code || '-')}</div>
      <div class="small muted">Link: <span class="detail-multiline">${escapeHtml(shareUrl)}</span></div>
      ${isJoinLink ? `<div class="small muted">Felhasználás: ${escapeHtml(String(invite.used_count || 0))}/${escapeHtml(String(invite.max_uses || 0))}</div>` : ''}
      <div class="small muted">Üzenet: ${escapeHtml(invite.message || 'Nincs külön üzenet')}</div>
      <div class="small muted">Email állapot: ${buildInviteEmailDeliveryLine(invite)}</div>
      ${invite.email_delivery_error ? `<div class="small muted">Hiba: ${escapeHtml(invite.email_delivery_error)}</div>` : ''}
      ${isPending ? `
        <div class="event-actions">
          <button class="btn btn-secondary" type="button" data-team-invite-action="copy-link" data-share-url="${escapeAttribute(shareUrl)}">
            Link másolása
          </button>
          <button class="btn btn-danger" type="button" data-team-invite-action="revoke" data-invite-id="${invite.id}">
            Visszavonás
          </button>
        </div>
      ` : `<div class="small muted top-space invite-note">${escapeHtml(hint || 'Ehhez a meghíváshoz már nincs teendő.')}</div>`}
    </div>
  `;
}

function renderInviteAdminGroup(title, invites, options = {}) {
  const { open = false, emptyMessage = 'Nincs elem ebben a csoportban.' } = options;
  const count = invites.length;

  return `
    <details class="admin-collapse" ${open ? 'open' : ''}>
      <summary>
        <span>${escapeHtml(title)}</span>
        <span class="badge badge-muted">${count}</span>
      </summary>
      <div class="admin-collapse-body">
        ${count ? invites.map(renderTeamInviteAdminCard).join('') : emptyState(title, emptyMessage)}
      </div>
    </details>
  `;
}

function renderTeamDrawPreviewCard() {
  const draw = state.teamDrawPreview || state.adminSavedEventDraw;

  if (!draw) return '';

  const withinTolerance = Boolean(draw.withinTolerance);
  const generationMode = draw.settings?.generationMode || (draw.settings?.skillBalancingEnabled ? 'skill' : 'random');
  const isRandomMode = generationMode === 'random';

  function renderTeamColumn(title, shirtEmoji, members, total, teamClassName) {
    return `
      <div class="event-card ${teamClassName}">
        <div class="row between align-center wrap gap">
          <strong>${escapeHtml(shirtEmoji)} ${escapeHtml(title)}</strong>
          <span class="badge badge-muted">összpont: ${escapeHtml(String(total ?? 0))}</span>
        </div>

        <div class="top-space">
          ${(members || []).map(member => `
            <div class="row between align-center wrap gap top-space">
              <div>
                <strong>
                  ${escapeHtml(member.name)}${member.is_goalkeeper ? ' (K)' : ''}
                </strong>
                <div class="small muted">${escapeHtml(member.email || '-')}</div>
              </div>
              <span class="badge badge-draft">${escapeHtml(String(member.overall_skill ?? 0))}</span>
            </div>
          `).join('') || '<div class="small muted top-space">Nincs játékos ebben a csapatban.</div>'}
        </div>
      </div>
    `;
  }

  return `
    <div class="event-card top-space">
      <div class="row between align-center wrap gap">
        <strong>Csapatsorsolás preview</strong>
        <div class="row gap wrap align-center">
          <span class="badge ${isRandomMode ? 'badge-warning' : 'badge-draft'}">
            ${isRandomMode ? 'random mód' : 'skill mód'}
          </span>
          <span class="${withinTolerance ? 'badge badge-success' : 'badge badge-warning'}">
            ${withinTolerance ? 'tolerancián belül' : 'tolerancián kívül'}
          </span>
        </div>
      </div>

      <div class="small muted top-space">
        Forrás játékosok: ${escapeHtml(String(draw.source_member_count ?? 0))}
      </div>

      <div class="row gap wrap top-space">
        <span class="badge badge-muted">A: ${escapeHtml(String(draw.totals?.teamA ?? 0))}</span>
        <span class="badge badge-muted">B: ${escapeHtml(String(draw.totals?.teamB ?? 0))}</span>
        <span class="badge badge-muted">Diff: ${escapeHtml(String(draw.totals?.difference ?? 0))}</span>
        <span class="badge badge-muted">Diff %: ${escapeHtml(String(draw.totals?.differencePercent ?? 0))}%</span>
      </div>

      <div class="small muted top-space">
        ${isRandomMode
          ? 'A skill modul ki van kapcsolva, ezért ez a leosztás 50-50-50 semleges alapállapotból, random módon készült.'
          : `Skill balance: aktív · tolerance: ${escapeHtml(String(draw.settings?.skillBalanceTolerancePercent ?? 15))}%`}
      </div>

      <div class="grid two-col inner-grid top-space">
        ${renderTeamColumn('Fehér csapat', '⚪', draw.teamA || [], draw.totals?.teamA ?? 0, 'team-preview-white')}
        ${renderTeamColumn('Piros csapat', '🔴', draw.teamB || [], draw.totals?.teamB ?? 0, 'team-preview-red')}
      </div>
    </div>
  `;
}


function renderUserTeamDrawPreview() {
  if (!els.userTeamDrawPreview) return;

  if (!state.teamDrawPreview) {
    els.userTeamDrawPreview.innerHTML = '';
    return;
  }

  const draw = state.teamDrawPreview;
  const withinTolerance = Boolean(draw.withinTolerance);

  function renderTeamColumn(title, shirtEmoji, members, teamClassName) {
    return `
      <div class="event-card ${teamClassName}">
        <div class="row between align-center wrap gap">
          <strong>${escapeHtml(shirtEmoji)} ${escapeHtml(title)}</strong>
          <span class="badge badge-muted">${escapeHtml(String(members?.length || 0))} fő</span>
        </div>

        <div class="top-space">
          ${(members || []).map(member => `
            <div class="row between align-center wrap gap top-space">
              <div>
                <strong>${escapeHtml(member.name)}${member.is_goalkeeper ? ' (K)' : ''}</strong>
                <div class="small muted">${escapeHtml(member.email || '-')}</div>
              </div>
              <span class="badge badge-draft">${escapeHtml(String(member.overall_skill ?? 0))}</span>
            </div>
          `).join('') || '<div class="small muted top-space">Nincs játékos ebben a csapatban.</div>'}
        </div>
      </div>
    `;
  }

  els.userTeamDrawPreview.innerHTML = `
    <div class="focus-event-card top-space">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Várható beosztás</div>
          <h3 class="focus-event-title">Csapatleosztás preview</h3>
          <div class="focus-event-subtitle">
            ${withinTolerance ? 'Kiegyensúlyozott párosítás' : 'Tolerancián kívüli párosítás'}
          </div>
        </div>
        <span class="${withinTolerance ? 'badge badge-success' : 'badge badge-warning'}">
          ${withinTolerance ? 'tolerancián belül' : 'tolerancián kívül'}
        </span>
      </div>

      <div class="hero-metrics top-space">
        <div class="mini-stat">
          <div class="mini-stat-label">Fehér</div>
          <div class="mini-stat-value">${escapeHtml(String(draw.totals?.teamA ?? 0))}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">Piros</div>
          <div class="mini-stat-value">${escapeHtml(String(draw.totals?.teamB ?? 0))}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">Diff</div>
          <div class="mini-stat-value">${escapeHtml(String(draw.totals?.difference ?? 0))}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">Diff %</div>
          <div class="mini-stat-value">${escapeHtml(String(draw.totals?.differencePercent ?? 0))}%</div>
        </div>
      </div>

      <div class="grid two-col inner-grid top-space">
        ${renderTeamColumn('Fehér csapat', '⚪', draw.teamA || [], 'team-preview-white')}
        ${renderTeamColumn('Piros csapat', '🔴', draw.teamB || [], 'team-preview-red')}
      </div>
    </div>
  `;
}

function renderTeamDrawAdminSection(adminFocusEvent) {
  const drawMode = getTeamDrawMode();

  if (!state.currentTeam) {
    return emptyState('Még nincs kiválasztott csapat.', 'Előbb töltsd be a csapatot, utána tudsz eseményhez csapatsorsolást készíteni.');
  }

  return `
    <div class="event-card admin-workspace-guide">
      <div class="row between align-center wrap gap">
        <strong>Csapatsorsolás</strong>
        <span class="badge ${adminFocusEvent ? 'badge-success' : 'badge-warning'}">${adminFocusEvent ? 'esemény kiválasztva' : 'válassz eseményt'}</span>
      </div>
      <div class="small muted top-space">
        ${adminFocusEvent
          ? 'Itt csak a következő leosztási feladatod látszik: preview készítés, ellenőrzés és mentés.'
          : 'Előbb válassz egy közelgő eseményt az Események menüben. Utána itt jelenik meg a csapatgenerálás egyszerűsített vezérlése.'}
      </div>
      <div class="row gap wrap top-space">
        <button
          class="btn"
          type="button"
          data-team-summary-action="preview-team-draw"
          ${!adminFocusEvent || state.skillSettingsSaving ? 'disabled' : ''}
        >
          ${drawMode === 'skill' ? 'Csapatok generálása (skill preview)' : 'Csapatok generálása (random preview)'}
        </button>
        ${
          state.teamDrawPreview && state.selectedAdminEvent
            ? `
              <button
                class="btn btn-secondary"
                type="button"
                data-team-summary-action="save-event-draw"
                ${state.skillSettingsSaving ? 'disabled' : ''}
              >
                ${drawMode === 'skill' ? 'Leosztás mentése' : 'Random leosztás mentése'}
              </button>
            `
            : ''
        }
      </div>
    </div>
    ${
      adminFocusEvent
        ? `
          <div class="event-card top-space">
            <div class="row between align-center wrap gap">
              <strong>Kiválasztott esemény</strong>
              <span class="badge ${canManageAttendanceForEvent(adminFocusEvent) ? 'badge-warning' : 'badge-draft'}">${canManageAttendanceForEvent(adminFocusEvent) ? 'megvalósult / adminisztrálható' : 'következő'}</span>
            </div>
            <div class="small muted top-space">${escapeHtml(adminFocusEvent.title || 'Névtelen esemény')}</div>
            <div class="small muted">${escapeHtml(formatDateTime(adminFocusEvent.start_at))}</div>
            <div class="small muted">Hátralévő idő: ${renderCountdown(adminFocusEvent.start_at)}</div>
            <div class="small muted">${escapeHtml(adminFocusEvent.location_name || 'Nincs helyszín')}</div>
          </div>
        `
        : ''
    }
    ${renderTeamDrawPreviewCard()}
  `;
}

function getRenderableSavedUserDraw() {
  const activeEventId = state.selectedUserEventDetail?.event?.id
    || state.selectedUserEvent?.id
    || null;

  if (!state.savedEventDraw || !activeEventId) {
    return null;
  }

  if (state.savedEventDrawEventId && state.savedEventDrawEventId !== activeEventId) {
    return null;
  }

  return state.savedEventDraw;
}

function renderSavedUserEventDraw() {
  if (!els.userTeamDrawPreview) return;

  const draw = getRenderableSavedUserDraw();

  if (!draw) {
    els.userTeamDrawPreview.innerHTML = '';
    return;
  }
  const paymentSummary = state.selectedUserEventDetail?.summary?.paymentSummary || null;

  function renderTeamColumn(title, shirtEmoji, members, teamClassName) {
    return `
      <div class="event-card ${teamClassName}">
        <div class="row between align-center wrap gap">
          <strong>${escapeHtml(shirtEmoji)} ${escapeHtml(title)}</strong>
          <span class="badge badge-muted">${escapeHtml(String(members?.length || 0))} fő</span>
        </div>

        <div class="top-space">
          ${(members || []).map(member => `
            <div class="row between align-center wrap gap top-space">
              <div>
                <strong>${escapeHtml(member.name)}${member.is_goalkeeper ? ' (K)' : ''}</strong>
              </div>
            </div>
          `).join('') || '<div class="small muted top-space">Nincs játékos ebben a csapatban.</div>'}
        </div>
      </div>
    `;
  }

  els.userTeamDrawPreview.innerHTML = `
    <div class="focus-event-card top-space">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Mentett csapatleosztás</div>
          <h3 class="focus-event-title">Csapat leosztás</h3>
        </div>
        ${paymentSummary ? renderUserPaymentSummary({ paymentSummary }) : ''}
      </div>

      <div class="grid two-col inner-grid top-space">
        ${renderTeamColumn('Fehér csapat', '⚪', draw.teamA || [], 'team-preview-white')}
        ${renderTeamColumn('Piros csapat', '🔴', draw.teamB || [], 'team-preview-red')}
      </div>
    </div>
  `;
}

function getTeamWorkspaceGuideModel() {
  const onboarding = buildAdminOnboardingState();
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const activeGoalkeepers = onboarding.activeGoalkeepersCount;
  const hasDrawFocus = Boolean(onboarding.focusEvent || state.teamDrawPreview || state.adminSavedEventDraw);

  if (!state.currentTeam || activeMembers <= 1 || pendingInvites > 0) {
    return {
      title: 'Most a keret építése a fő feladat.',
      description: 'Kezdd a meghívásokkal, hogy legyen elég aktív játékosod a következő eseményhez.',
      primary: { workspace: 'team', section: 'invites', focusTarget: 'team-invites', label: 'Meghívások' },
      secondary: [
        { workspace: 'team', section: 'members', focusTarget: 'team-members', label: 'Tagok' }
      ],
      badge: 'csapatépítés'
    };
  }

  if (activeGoalkeepers < 2) {
    return {
      title: 'Előbb jelölj ki legalább két kapust.',
      description: 'A csapatsorsolás csak akkor lesz stabil, ha a keretben megvannak a kapusok is.',
      primary: { workspace: 'team', section: 'members', focusTarget: 'team-members', label: 'Kapusok beállítása' },
      secondary: [
        { workspace: 'team', section: 'advanced', focusTarget: 'team-advanced', label: 'Haladó beállítások' }
      ],
      badge: 'kapusok hiányoznak'
    };
  }

  if (hasDrawFocus) {
    return {
      title: 'Most a csapatsorsolás a fókusz.',
      description: 'Itt már a kiválasztott eseményhez tudsz preview-t készíteni, ellenőrizni és menteni.',
      primary: { workspace: 'team', section: 'draw', focusTarget: 'team-draw', label: 'Csapatsorsolás' },
      secondary: [
        { workspace: 'team', section: 'members', focusTarget: 'team-members', label: 'Tagok' },
        { workspace: 'team', section: 'advanced', focusTarget: 'team-advanced', label: 'Haladó beállítások' }
      ],
      badge: 'sorsolási szakasz'
    };
  }

  return {
    title: 'A csapat már épül, most nézd át az embereket.',
    description: 'Itt már inkább a bent lévő tagok, szerepkörök és az esemény előkészítése a fontos.',
    primary: { workspace: 'team', section: 'members', focusTarget: 'team-members', label: 'Tagok' },
    secondary: [
      { workspace: 'team', section: 'invites', focusTarget: 'team-invites', label: 'Meghívások' },
      { workspace: 'team', section: 'advanced', focusTarget: 'team-advanced', label: 'Haladó beállítások' }
    ],
    badge: 'aktív csapat'
  };
}

function getTeamWorkspaceFlowSteps() {
  const onboarding = buildAdminOnboardingState();
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const activeGoalkeepers = onboarding.activeGoalkeepersCount;
  const adminFocusEvent = onboarding.focusEvent;
  const hasSavedDraw = Boolean(state.adminSavedEventDraw || state.teamDrawPreview);
  const currentTeamSection = getSmartAdminTeamSection();

  const steps = [
    {
      key: 'invites',
      label: '1. Keretépítés',
      hint: pendingInvites > 0
        ? `${pendingInvites} függő meghívó`
        : activeMembers > 1
          ? `${activeMembers} aktív tag`
          : 'Hívj meg embereket',
      done: activeMembers > 1 && pendingInvites === 0,
      workspace: 'team',
      section: 'invites'
    },
    {
      key: 'goalkeepers',
      label: '2. Kapusok',
      hint: `${activeGoalkeepers}/2 kijelölve`,
      done: activeGoalkeepers >= 2,
      workspace: 'team',
      section: 'members'
    },
    {
      key: 'focus-event',
      label: '3. Fókusz esemény',
      hint: adminFocusEvent
        ? (adminFocusEvent.title || 'Következő esemény kiválasztva')
        : 'Válassz közelgő eseményt',
      done: Boolean(adminFocusEvent),
      workspace: 'events',
      section: 'upcoming'
    },
    {
      key: 'draw',
      label: '4. Csapatsorsolás',
      hint: hasSavedDraw ? 'Preview vagy mentett leosztás van' : 'Generálj és ments leosztást',
      done: hasSavedDraw,
      workspace: 'team',
      section: 'draw'
    }
  ];

  let currentAssigned = false;
  return steps.map(step => {
    const shouldMarkCurrent = !currentAssigned && !step.done;
    const isCurrent = shouldMarkCurrent
      || (currentAssigned === false && step.key === currentTeamSection)
      || (step.key === 'goalkeepers' && currentTeamSection === 'advanced' && !step.done)
      || (step.key === 'draw' && currentTeamSection === 'draw' && !step.done);

    if (isCurrent) {
      currentAssigned = true;
    }

    return {
      ...step,
      state: step.done ? 'done' : isCurrent ? 'current' : 'upcoming'
    };
  });
}

function renderTeamWorkspaceFlow() {
  const steps = getTeamWorkspaceFlowSteps();

  return `
    <div class="event-card admin-workspace-flow top-space">
      <div class="row between align-center wrap gap">
        <strong>Csapatépítési sorrend</strong>
        <span class="badge badge-muted">1-2 perc alatt átlátható út</span>
      </div>
      <div class="small muted top-space">
        Az új kapitány itt látja, mi a következő értelmes lépés. A többi rész marad elérhető, de nem ezeken van most a fókusz.
      </div>
      <div class="admin-flow-grid top-space">
        ${steps.map(step => `
          <button
            class="admin-flow-step is-${escapeHtml(step.state)}"
            type="button"
            data-admin-workspace-jump="${escapeHtml(step.workspace)}"
            ${step.section ? `data-admin-section-jump="${escapeHtml(step.section)}"` : ''}
          >
            <span class="admin-flow-step-title">${escapeHtml(step.label)}</span>
            <span class="admin-flow-step-hint">${escapeHtml(step.hint)}</span>
            <span class="admin-flow-step-state">${escapeHtml(
              step.state === 'done'
                ? 'kész'
                : step.state === 'current'
                  ? 'most ez jön'
                  : 'később'
            )}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTeamPrimaryActionCard(teamGuide) {
  return `
    <div class="event-card admin-home-primary-card">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Most ezzel foglalkozz</div>
          <div class="admin-home-primary-title">${escapeHtml(teamGuide.title)}</div>
        </div>
        <span class="badge badge-success">${escapeHtml(teamGuide.badge)}</span>
      </div>
      <div class="small muted top-space">${escapeHtml(teamGuide.description)}</div>
      <div class="row gap wrap top-space">
        <button
          class="btn"
          type="button"
          data-admin-workspace-jump="${escapeHtml(teamGuide.primary.workspace || 'team')}"
          data-admin-section-jump="${escapeHtml(teamGuide.primary.section)}"
          ${teamGuide.primary.focusTarget ? `data-admin-focus-target="${escapeHtml(teamGuide.primary.focusTarget)}"` : ''}
        >${escapeHtml(teamGuide.primary.label)}</button>
      </div>
      ${teamGuide.secondary.length ? `
        <details class="admin-home-shelf top-space">
          <summary class="small muted">Polcon még van pár csapatos lépés</summary>
          <div class="row gap wrap top-space">
            ${teamGuide.secondary.map(action => `
              <button
                class="btn btn-ghost"
                type="button"
                data-admin-workspace-jump="${escapeHtml(action.workspace || 'team')}"
                data-admin-section-jump="${escapeHtml(action.section)}"
                ${action.focusTarget ? `data-admin-focus-target="${escapeHtml(action.focusTarget)}"` : ''}
              >${escapeHtml(action.label)}</button>
            `).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderTeamSimpleProgress(onboarding) {
  const activeMembers = onboarding.activeMembersCount;
  const pendingInvites = onboarding.pendingInviteCount;
  const activeGoalkeepers = onboarding.activeGoalkeepersCount;
  const hasFocusEvent = Boolean(onboarding.focusEvent);
  const hasDraw = Boolean(state.adminSavedEventDraw || state.teamDrawPreview);
  const rows = [
    {
      label: 'Keret épül',
      done: activeMembers > 1 && pendingInvites === 0,
      hint: pendingInvites > 0
        ? `${pendingInvites} függő meghívó`
        : activeMembers > 1
          ? `${activeMembers} aktív tag`
          : 'még kell legalább 1 játékos'
    },
    {
      label: 'Kapusok rendben',
      done: activeGoalkeepers >= 2,
      hint: `${activeGoalkeepers}/2 kijelölve`
    },
    {
      label: 'Sorsolásra kész',
      done: hasFocusEvent && hasDraw,
      hint: !hasFocusEvent
        ? 'előbb válassz fókusz eseményt'
        : hasDraw
          ? 'van preview vagy mentett leosztás'
          : 'még nincs leosztás'
    }
  ];

  return `
    <div class="event-card admin-home-progress-card">
      <div class="row between align-center wrap gap">
        <strong>Itt tart a csapat</strong>
        <span class="badge badge-muted">${escapeHtml(String(rows.filter(row => row.done).length))}/3 kész</span>
      </div>
      <div class="stack top-space">
        ${rows.map(row => `
          <div class="admin-home-progress-row ${row.done ? 'is-done' : ''}">
            <span class="admin-home-progress-mark">${row.done ? '✓' : '•'}</span>
            <div>
              <div class="admin-home-progress-label">${escapeHtml(row.label)}</div>
              <div class="small muted">${escapeHtml(row.hint)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTeamSummary(team) {
  if (!els.teamSummary) return;

  const onboarding = buildAdminOnboardingState();
  const skillModuleEnabled = isTeamSkillModuleEnabled();
  const rankModuleEnabled = isRankModuleEnabled();
  const drawMode = getTeamDrawMode();
  const adminFocusEvent = getAdminWorkspaceFocusEvent();
  const activeGoalkeeperCount = countActiveGoalkeepers(state.teamMembers);
  const activeMembersCount = onboarding.activeMembersCount;
  const pendingInviteCount = onboarding.pendingInviteCount;
  const teamGuide = getTeamWorkspaceGuideModel();
  const summaryHtml = `
    <div id="adminTeamProgressSummary" class="event-form-progress-summary bottom-space"></div>
    ${renderTeamPrimaryActionCard(teamGuide)}
    ${renderTeamSimpleProgress(onboarding)}

    <div class="event-card admin-home-sidecard top-space">
      <div class="row between align-center wrap gap">
        <div>
          <strong>Csapatkép</strong>
          <div class="admin-guide-title top-space">${escapeHtml(team.name)}</div>
        </div>
        <span class="badge badge-draft">szerep: ${escapeHtml(isPlatformOwner() ? 'platform owner' : formatTeamRole(state.teamRole || 'member'))}</span>
      </div>
      <div class="grid two-col inner-grid top-space">
        <div class="detail-box">
          <div class="detail-label">Aktív játékosok</div>
          <div class="detail-value">${escapeHtml(String(activeMembersCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Függő meghívók</div>
          <div class="detail-value">${escapeHtml(String(pendingInviteCount))}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Kapusnak jelölve</div>
          <div class="detail-value">${escapeHtml(String(activeGoalkeeperCount))}/2</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Fókusz esemény</div>
          <div class="detail-value">${escapeHtml(adminFocusEvent?.title || 'még nincs kijelölve')}</div>
        </div>
      </div>
      <details class="admin-home-shelf top-space">
        <summary class="small muted">Polcra tett csapatinfók</summary>
        <div class="small muted top-space">Belső csapatazonosító: ${escapeHtml(team.id)}</div>
        <div class="small muted">A kiválasztott csapat jelenleg minden admin művelet célpontja.</div>
        <div class="small muted">A sorsolás csak akkor fut le, ha a kiválasztott esemény going résztvevői között legalább 2 kapusnak jelölt játékos van.</div>
      </details>
    </div>

    <details class="admin-home-shelf top-space">
      <summary class="small muted">Polcra tett csapatfolyamat</summary>
      ${renderTeamWorkspaceFlow()}
    </details>
  `;

  const advancedHtml = `
    ${
      state.teamSkillSettings
        ? `
          <div class="event-card top-space">
            <div class="row between align-center wrap gap">
              <strong>Skill balance beállítások</strong>
              <span class="badge ${skillModuleEnabled ? 'badge-success' : 'badge-warning'}">${skillModuleEnabled ? 'SKILL MODUL ON' : 'SKILL MODUL OFF'}</span>
            </div>

            <label class="module-switch top-space ${state.skillSettingsSaving ? 'is-saving' : ''}" for="teamSkillBalanceEnabledToggle">
              <span>
                <span class="module-switch-label">Skill modul ON / OFF</span>
                <span class="module-switch-description">
                  ${skillModuleEnabled
                    ? 'Bekapcsolva a korábbi skill alapú kiegyensúlyozó logika fut.'
                    : 'Kikapcsolva minden játékos 50-50-50 semleges alapállapotból, teljesen random módon kerül leosztásra.'}
                </span>
              </span>
              <span class="module-switch-control">
                <input
                  id="teamSkillBalanceEnabledToggle"
                  type="checkbox"
                  data-skill-balance-enabled
                  ${state.teamSkillSettings.skill_balancing_enabled ? 'checked' : ''}
                  ${state.skillSettingsSaving ? 'disabled' : ''}
                >
                <span class="module-switch-track" aria-hidden="true"></span>
              </span>
            </label>

            <div class="small muted top-space">
              ${state.skillSettingsSaving ? 'A skill modul állapota mentés alatt van...' : 'A kapcsoló állapota azonnal mentésre kerül és rögtön átváltja a generálási módot.'}
            </div>

            <div class="top-space row gap align-center">
              <span class="small muted">Tolerance</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                data-skill-balance-tolerance
                value="${escapeHtml(String(state.teamSkillSettings.skill_balance_tolerance_percent ?? 15))}"
                ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
                oninput="this.nextElementSibling.textContent = this.value + '%'"
              >
              <span class="small muted">${escapeHtml(String(state.teamSkillSettings.skill_balance_tolerance_percent ?? 15))}%</span>
            </div>

            <div class="small muted top-space">
              ${skillModuleEnabled
                ? 'ON állapotban a tolerance csúszka aktív, és a korábbi skill-alapú kiegyensúlyozó logika osztja le a csapatokat.'
                : 'OFF állapotban a tolerance és a játékos skill csúszkák inaktívak. A generálás továbbra is elérhető, de 50-50-50 semleges alapállapotból, random módban fut.'}
            </div>

            <div class="row gap wrap top-space">
              <button
                class="btn btn-secondary"
                type="button"
                data-team-summary-action="save-skill-settings"
                ${state.skillSettingsSaving || !skillModuleEnabled ? 'disabled' : ''}
              >
                Tolerance mentése
              </button>

              <button
                class="btn"
                type="button"
                data-team-summary-action="preview-team-draw"
                ${state.skillSettingsSaving ? 'disabled' : ''}
              >
              ${drawMode === 'skill' ? 'Csapatok generálása (skill preview)' : 'Csapatok generálása (random preview)'}
              </button>
              
              ${
                state.teamDrawPreview && state.selectedAdminEvent
                  ? `
                    <button
                      class="btn btn-secondary"
                      type="button"
                      data-team-summary-action="save-event-draw"
                      ${state.skillSettingsSaving ? 'disabled' : ''}
                    >
                      ${drawMode === 'skill' ? 'Leosztás mentése' : 'Random leosztás mentése'}
                    </button>
                  `
                  : ''
              }
            </div>
          </div>

          <div class="event-card top-space">
            <div class="row between align-center wrap gap">
              <strong>Rangmodul</strong>
              <span class="badge ${rankModuleEnabled ? 'badge-success' : 'badge-warning'}">${rankModuleEnabled ? 'RANG MODUL ON' : 'RANG MODUL OFF'}</span>
            </div>

            <label class="module-switch top-space ${state.rankSettingsSaving ? 'is-saving' : ''}" for="teamRankModuleEnabledToggle">
              <span>
                <span class="module-switch-label">RANG MODUL ON / OFF</span>
                <span class="module-switch-description">
                  ${rankModuleEnabled
                    ? 'Bekapcsolva a csapat kézi rangolása, vendég státusza és a későbbi jelentkezési prioritás alapja.'
                    : 'Kikapcsolva a rangok csak tárolt adatként maradnak meg, de a csapatnál nem relevánsak.'}
                </span>
              </span>
              <span class="module-switch-control">
                <input
                  id="teamRankModuleEnabledToggle"
                  type="checkbox"
                  data-rank-module-enabled
                  ${state.teamSkillSettings.rank_module_enabled ? 'checked' : ''}
                  ${state.rankSettingsSaving ? 'disabled' : ''}
                >
                <span class="module-switch-track" aria-hidden="true"></span>
              </span>
            </label>

              <div class="small muted top-space">
                ${state.rankSettingsSaving
                  ? 'A rangmodul állapota mentés alatt van...'
                  : 'Ez a nézet már csak a rang- és skilllogikát tartalmazza. A sorsolási munka külön a Csapatsorsolás fülön történik.'}
            </div>
          </div>
        `
          : ''
    }

  `;

  els.teamSummary.innerHTML = summaryHtml;
  if (els.teamDrawContent) {
    els.teamDrawContent.innerHTML = renderTeamDrawAdminSection(adminFocusEvent);
  }
  if (els.teamAdvancedContent) {
    els.teamAdvancedContent.innerHTML = advancedHtml.trim()
      ? advancedHtml
      : emptyState('Még nincs haladó beállítás.', 'Itt fognak megjelenni a rang- és skill-alapú csapatműködési kapcsolók.');
  }

  document.querySelectorAll('#teamSummary [data-team-summary-action], #teamDrawContent [data-team-summary-action], #teamAdvancedContent [data-team-summary-action]').forEach(button => {
    if (button.dataset.boundTeamSummaryAction !== 'true') {
      button.addEventListener('click', handleTeamSummaryAction);
      button.dataset.boundTeamSummaryAction = 'true';
    }
  });

  syncAdminTeamSectionProgress();
}

function renderTeamInvitesAdmin(invites) {
  if (!els.teamInvitesAdminList) return;

  const intro = `
    <div class="event-card admin-workspace-guide">
      <div class="row between align-center wrap gap">
        <strong>Első lépés: hívd meg a keretet</strong>
        <span class="badge badge-success">ajánlott út</span>
      </div>
      <div class="small muted top-space">
        Új csapatnál ez legyen az első mozdulat. A meghívás a tiszta beléptetés, mert utána a játékos maga fejezi be a csatlakozást.
      </div>
    </div>
  `;

  if (!invites.length) {
    els.teamInvitesAdminList.innerHTML = intro + emptyState('Nincs meghívó ehhez a csapathoz.', 'Új meghívó küldéséhez használd a fenti űrlapot.');
    return;
  }

  const sortedInvites = [...invites].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const joinLinks = sortedInvites.filter(invite => invite.invite_kind === 'join_link');
  const emailInvites = sortedInvites.filter(invite => invite.invite_kind !== 'join_link');
  const pendingInvites = emailInvites.filter(invite => invite.status === 'pending');
  const acceptedInvites = emailInvites.filter(invite => invite.status === 'accepted');
  const closedInvites = emailInvites.filter(invite => !['pending', 'accepted'].includes(invite.status));
  const activeJoinLinks = joinLinks.filter(invite => invite.status === 'pending');
  const closedJoinLinks = joinLinks.filter(invite => invite.status !== 'pending');

  els.teamInvitesAdminList.innerHTML = [
    intro,
    renderInviteAdminGroup('Messengeres csatlakozó linkek', activeJoinLinks, {
      open: true,
      emptyMessage: 'Még nincs aktív csatlakozó linked ehhez a csapathoz.'
    }),
    renderInviteAdminGroup('Függőben lévő meghívók', pendingInvites, {
      open: false,
      emptyMessage: 'Jelenleg nincs függőben lévő meghívó.'
    }),
    renderInviteAdminGroup('Elfogadott meghívók', acceptedInvites, {
      open: false,
      emptyMessage: 'Még nincs elfogadott meghívó.'
    }),
    renderInviteAdminGroup('Lezárt meghívók', closedInvites, {
      open: false,
      emptyMessage: 'Nincs lezárt meghívó ebben a csapatban.'
    }),
    renderInviteAdminGroup('Lezárt csatlakozó linkek', closedJoinLinks, {
      open: false,
      emptyMessage: 'Nincs lezárt csatlakozó link ebben a csapatban.'
    })
  ].join('');
}

function renderTeamMembersAdmin(members) {
  if (!els.teamMembersAdminList) return;

  if (!canAccessAdminView()) {
    els.teamMembersAdminList.innerHTML = emptyState('Nincs admin hozzáférésed.', 'Ezt a nézetet csak csapatkapitány, helyettes vagy platform owner használhatja.');
    return;
  }

  const skillModuleEnabled = isTeamSkillModuleEnabled();
  const rankModuleEnabled = isRankModuleEnabled();
  const membersGuide = `
    <div class="event-card admin-workspace-guide">
      <div class="row between align-center wrap gap">
        <strong>Tagok kezelése</strong>
        <span class="badge badge-muted">haladóbb lépés</span>
      </div>
      <div class="small muted top-space">
        Itt már a bent lévő embereket rendezheted: szerepkör, rang, vendég státusz, kapitányváltás. Első használatnál inkább a Meghívások fülről érdemes indulni.
      </div>
    </div>
  `;

  if (!members.length) {
    els.teamMembersAdminList.innerHTML = membersGuide + emptyState('Nincs aktív csapattag.', 'A csapatba meghívással vagy közvetlen admin felvétellel kerülhetnek tagok.');
    return;
  }

  els.teamMembersAdminList.innerHTML = membersGuide + members.map(member => {
    const lockedCaptain = member.role === 'team_admin';
    const isMe = member.user_id === state.user?.id;
    const canTransferCaptain = canManageRoles() && state.teamRole === 'team_admin' && !lockedCaptain && member.membership_status === 'active';
    const canEditRole = canManageRoles() && member.membership_status === 'active';
    const rankProfile = getMemberRankProfile(member);

    return `
      <div class="event-card">
        <div class="row between align-center">
          <div>
            <strong>${escapeHtml(member.name)}</strong> ${isMe ? '<span class="badge badge-draft">te</span>' : ''}
            <div class="small muted">${escapeHtml(member.email)}</div>
          </div>
        <span class="badge badge-muted">${escapeHtml(formatTeamRole(member.role))}</span>
        </div>

        <div class="small muted top-space">
          Poszt: ${escapeHtml(member.primary_position || '-')}
        </div>
        <div class="row gap wrap top-space">
          <span class="badge ${member.rank_status === 'guest' ? 'badge-warning' : 'badge-draft'}">${escapeHtml(rankProfile.emoji)} ${escapeHtml(rankProfile.label)}</span>
          ${member.rank_status === 'ranked'
            ? `<span class="badge badge-muted">alap: ${escapeHtml(String(member.rank_value || '-'))} · aktív: ${escapeHtml(String(member.effective_rank_value || member.rank_value || '-'))}</span>`
            : '<span class="badge badge-muted">vendég státusz</span>'}
        </div>
        <div class="small muted top-space">${escapeHtml(rankProfile.description)}</div>
        <div class="small muted">Értékelt események: ${escapeHtml(String(member.rank_snapshot?.stats?.evaluatedEvents ?? 0))} · Részvételi arány: ${escapeHtml(member.rank_snapshot?.stats?.participationRatio != null ? `${Math.round(member.rank_snapshot.stats.participationRatio * 100)}%` : 'nincs adat')}</div>
        <div class="row gap wrap top-space">
          <span class="badge badge-success">megjelent: ${escapeHtml(String(member.attendance_stats?.present_count ?? 0))}</span>
          <span class="badge ${(Number(member.attendance_stats?.no_show_count || 0) > 0) ? 'badge-danger' : 'badge-muted'}">no-show: ${escapeHtml(String(member.attendance_stats?.no_show_count ?? 0))}</span>
          <span class="badge badge-muted">jelölt: ${escapeHtml(String(member.attendance_stats?.marked_count ?? 0))}</span>
        </div>
        <div class="small muted">
          Skill: Védő ${escapeHtml(String(member.defense_score ?? 50))} ·
          Támadó ${escapeHtml(String(member.attack_score ?? 50))} ·
          Kapus ${escapeHtml(String(member.goalkeeper_score ?? 0))}
        </div>
        <div class="row gap wrap top-space">
          <span class="badge ${member.is_goalkeeper ? 'badge-success' : 'badge-muted'}">${member.is_goalkeeper ? 'Kapusnak jelölve' : 'Mezőnyjátékos'}</span>
          <button
            class="btn btn-secondary"
            type="button"
            data-member-action="toggle-goalkeeper"
            data-member-id="${member.member_id}"
            data-member-next-goalkeeper="${member.is_goalkeeper ? 'false' : 'true'}"
          >
            ${member.is_goalkeeper ? 'Átváltás mezőnyjátékosra' : 'Kapusnak jelölöm'}
          </button>
        </div>
        <div class="small muted top-space">
          A sorsoláshoz legalább 2 kapusnak jelölt játékos kell a going résztvevők között.
        </div>
        
        ${
          lockedCaptain
            ? `<div class="small muted top-space">Az aktuális csapatkapitány szerepe itt nem módosítható. Átadáshoz használd a kapitányváltás gombot másik aktív tagnál.</div>`
            : canEditRole
            ? `
              <div class="row gap wrap top-space">
                  <select data-member-role-select="${member.member_id}">
                    <option value="member" ${member.role === 'member' ? 'selected' : ''}>tag</option>
                    <option value="team_manager" ${member.role === 'team_manager' ? 'selected' : ''}>csapatkapitány-helyettes</option>
                  </select>
                <button class="btn btn-secondary" type="button" data-member-action="save-role" data-member-id="${member.member_id}">
                  Szerepkör mentése
                </button>
                ${canTransferCaptain ? `
                  <button class="btn btn-ghost" type="button" data-member-action="transfer-captain" data-member-user-id="${member.user_id}">
                    Kapitányváltás
                  </button>
                ` : ''}
                <button class="btn btn-danger" type="button" data-member-action="remove" data-member-id="${member.member_id}">
                  Eltávolítás
                </button>
              </div>
            `
            : `<div class="small muted top-space">A szerepköröket csak a csapatkapitány módosíthatja.</div>`
        }

        <div class="top-space rank-admin-box">
          <div class="small muted">Rang és vendég státusz</div>
          <div class="row gap wrap top-space">
            <select data-member-rank-status="${member.member_id}" ${!rankModuleEnabled ? 'disabled' : ''}>
              <option value="guest" ${member.rank_status === 'guest' ? 'selected' : ''}>vendég</option>
              <option value="ranked" ${member.rank_status === 'ranked' ? 'selected' : ''}>rangolt tag</option>
            </select>
            <select data-member-rank-value="${member.member_id}" ${!rankModuleEnabled || member.rank_status === 'guest' ? 'disabled' : ''}>
              ${Object.values(USER_RANK_LABELS)
                .sort((a, b) => b.value - a.value)
                .map(rank => `<option value="${rank.value}" ${Number(member.rank_value) === rank.value ? 'selected' : ''}>${rank.value} = ${escapeHtml(rank.label)}</option>`)
                .join('')}
            </select>
            <button
              class="btn btn-secondary"
              type="button"
              data-member-action="save-rank"
              data-member-id="${member.member_id}"
              ${!rankModuleEnabled ? 'disabled' : ''}
            >
              Rang mentése
            </button>
          </div>
        </div>

        <div class="top-space">
          <label class="small muted">
            <input
              type="checkbox"
              data-member-skill-enabled="${member.member_id}"
              ${member.skills_enabled !== false ? 'checked' : ''}
              ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
            >
            Skill aktív
          </label>

          <div class="top-space row gap align-center">
            <span class="small muted">Kapus</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              data-member-skill-gk="${member.member_id}"
              value="${escapeHtml(String(member.goalkeeper_score ?? 0))}"
              ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
              oninput="this.nextElementSibling.textContent = this.value"
            >
            <span class="small muted">${escapeHtml(String(member.goalkeeper_score ?? 0))}</span>
          </div>

          <div class="top-space row gap align-center">
            <span class="small muted">Védő</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              data-member-skill-def="${member.member_id}"
              value="${escapeHtml(String(member.defense_score ?? 50))}"
              ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
              oninput="this.nextElementSibling.textContent = this.value"
            >
            <span class="small muted">${escapeHtml(String(member.defense_score ?? 50))}</span>
          </div>

          <div class="top-space row gap align-center">
            <span class="small muted">Támadó</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              data-member-skill-att="${member.member_id}"
              value="${escapeHtml(String(member.attack_score ?? 50))}"
              ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
              oninput="this.nextElementSibling.textContent = this.value"
            >
            <span class="small muted">${escapeHtml(String(member.attack_score ?? 50))}</span>
          </div>

          <div class="small muted top-space">
            ${skillModuleEnabled
              ? 'A játékos skill értékei aktívak és beleszámítanak a skill alapú sorsolásba.'
              : 'A skill modul OFF állapotban van, ezért ezek a csúszkák most csak referenciaértékek, a random leosztás nem ezeket használja.'}
          </div>

          <div class="top-space">
            <button
              class="btn btn-secondary"
              type="button"
              data-member-action="save-skills"
              data-member-id="${member.member_id}"
              ${!skillModuleEnabled || state.skillSettingsSaving ? 'disabled' : ''}
            >
              Skill mentése
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


async function handleCreateInvite(event) {
  event.preventDefault();
  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

  const inviteEmail = String(els.inviteEmail?.value || '').trim();
  if (!inviteEmail) {
    els.inviteEmail?.focus();
    showMessage('A meghívó küldéséhez email cím megadása kötelező.', 'error');
    return;
  }

  try {
    const result = await api(`/teams/${state.currentTeamId}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        email: inviteEmail,
        role: els.inviteRole.value,
        message: els.inviteMessage.value.trim() || null
      })
    });

    els.createInviteForm.reset();
    els.inviteRole.value = 'member';

    await Promise.all([loadTeamInvites(), loadMyInvites()]);
    const deliveryStatus = result.emailDelivery?.status || '';
    const deliverySuffix =
      deliveryStatus === 'sent'
        ? ' Az email kiküldése sikeres volt.'
        : deliveryStatus === 'failed'
          ? ' A meghívó létrejött, de az email küldése hibára futott.'
          : deliveryStatus === 'skipped'
            ? ' A meghívó létrejött, de email nem lett kiküldve.'
            : '';
    showMessage(`${result.message}${deliverySuffix}`, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleAddMember(event) {
  event.preventDefault();
  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

  try {
    const result = await api(`/teams/${state.currentTeamId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        email: els.memberEmail.value.trim(),
        role: els.memberRole.value
      })
    });

    els.addMemberForm.reset();
    els.memberRole.value = 'member';

    await loadTeam(state.currentTeamId);
    await loadMyTeams();
    showMessage(result.message, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}


async function handleTeamInviteAdminAction(event) {
  const action = event.target.dataset.teamInviteAction;
  const inviteId = event.target.dataset.inviteId;
  const shareUrl = event.target.dataset.shareUrl;

  if (!action) return;

  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

  try {
    if (action === 'copy-link') {
      await copyTextToClipboard(shareUrl);
      showMessage('A csatlakozó linket kimásoltam a vágólapra.', 'success');
      return;
    }

    if (!inviteId) return;

    if (action === 'revoke') {
      const confirmed = window.confirm('Biztosan visszavonod ezt a meghívót?');
      if (!confirmed) return;

      const result = await api(`/teams/${state.currentTeamId}/invites/${inviteId}/revoke`, {
        method: 'POST'
      });

      await Promise.all([loadTeamInvites(), loadMyInvites()]);
      showMessage(result.message, 'success');
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleMyInviteAction(event) {
  const action = event.target.dataset.myInviteAction;
  const inviteId = event.target.dataset.inviteId;
  const inviteTeamId = event.target.dataset.inviteTeamId;

  if (!action || !inviteId) return;

  clearMessage();

  try {
    const result = await api(`/invites/${inviteId}/${action}`, {
      method: 'POST'
    });

    if (action === 'accept' && inviteTeamId) {
      saveTeamId(inviteTeamId);
    }

    await Promise.all([loadMyInvites(), loadMyTeams(), loadMyEvents()]);

    if (state.currentTeamId) {
      await loadTeam(state.currentTeamId);
    }

    showMessage(result.message, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}


async function handleSkillModuleToggleChange(event) {
  const skillToggle = event.target.closest('[data-skill-balance-enabled]');
  const rankToggle = event.target.closest('[data-rank-module-enabled]');
  const toggle = skillToggle || rankToggle;

  if (!toggle || !state.currentTeamId || !state.teamSkillSettings || state.skillSettingsSaving || state.rankSettingsSaving) {
    return;
  }

  clearMessage();

  const previousSettings = { ...state.teamSkillSettings };
  const isSkillToggle = Boolean(skillToggle);
  const nextEnabled = Boolean(toggle.checked);
  const toleranceRaw =
    document.querySelector('[data-skill-balance-tolerance]')?.value ??
    state.teamSkillSettings.skill_balance_tolerance_percent ??
    15;
  const nextTolerance = Number(toleranceRaw);

  if (isSkillToggle) {
    state.skillSettingsSaving = true;
  } else {
    state.rankSettingsSaving = true;
  }

  state.teamSkillSettings = {
    ...state.teamSkillSettings,
    skill_balancing_enabled: isSkillToggle ? nextEnabled : state.teamSkillSettings.skill_balancing_enabled,
    rank_module_enabled: isSkillToggle ? state.teamSkillSettings.rank_module_enabled : nextEnabled,
    skill_balance_tolerance_percent: nextTolerance
  };
  state.teamDrawPreview = null;
  renderTeamSummary(state.currentTeam);
  renderTeamMembersAdmin(state.teamMembers);
  renderUserRankModule();

  try {
    const result = await api(`/teams/${state.currentTeamId}/skill-settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        skillBalancingEnabled: isSkillToggle ? nextEnabled : state.teamSkillSettings.skill_balancing_enabled,
        skillBalanceTolerancePercent: nextTolerance,
        rankModuleEnabled: isSkillToggle ? state.teamSkillSettings.rank_module_enabled : nextEnabled
      })
    });

    state.teamSkillSettings = result.settings || state.teamSkillSettings;
    const toggleMessage = isSkillToggle
      ? (nextEnabled
        ? 'Skill modul bekapcsolva. A preview mostantól újra skill alapú logikával fut.'
        : 'Skill modul kikapcsolva. A preview mostantól 50-50-50 semleges alapú random módban fut.')
      : (nextEnabled
        ? 'RANG MODUL bekapcsolva. A csapattagoknál mostantól megjelenik és szerkeszthető a rangprofil.'
        : 'RANG MODUL kikapcsolva. A rangok megmaradnak, de a felületen most nem lesznek aktívak.');
    showMessage(toggleMessage, 'success');
  } catch (error) {
    state.teamSkillSettings = previousSettings;
    showMessage(error.message, 'error');
  } finally {
    state.skillSettingsSaving = false;
    state.rankSettingsSaving = false;
    renderTeamSummary(state.currentTeam);
    renderTeamMembersAdmin(state.teamMembers);
    renderUserRankModule();
  }
}

async function handleTeamSummaryAction(event) {
  const action = event.target.dataset.teamSummaryAction;
  if (!action) return;

  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

      try {
        if (action === 'finish-attendance-event') {
        const eventId = event.target.dataset.eventId || state.selectedAdminEventDetail?.event?.id || state.selectedAdminEvent?.id;

        if (!eventId) {
          showMessage('Előbb válassz ki egy megvalósult eseményt.', 'error');
          return;
        }

        const result = await api(`/events/${eventId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'finished' })
        });

        await Promise.all([loadAdminEvents(), loadUserEvents(), loadMyEvents()]);
        await openEventForAdmin(eventId);
          showMessage(result.message || 'Az esemény lezárva, a no-show jelölés megnyílt.', 'success');
          return;
        }

        if (action === 'mark-all-present') {
          const currentEventId = state.selectedAdminEventDetail?.event?.id || state.selectedAdminEvent?.id;
          const going = state.selectedAdminEventDetail?.registrations?.going || [];

          if (!currentEventId || !going.length) {
            showMessage('Ehhez a lezárt eseményhez nincs going játékos.', 'error');
            return;
          }

          for (const player of going) {
            await api(`/events/${currentEventId}/attendance/${player.user_id}`, {
              method: 'POST',
              body: JSON.stringify({
                status: 'present',
                paymentAmount: readAttendancePaymentAmountForUser(player.user_id)
              })
            });
          }

          await openEventForAdmin(currentEventId);
          showMessage('Minden going játékos megjelentként és befizetéssel rögzítve.', 'success');
          return;
        }

        if (action === 'set-attendance') {
          const targetUserId = event.target.dataset.attendanceUserId;
          const status = event.target.dataset.attendanceStatus;
          const currentEventId = state.selectedAdminEventDetail?.event?.id || state.selectedAdminEvent?.id;

      if (!currentEventId) {
        showMessage('Előbb válassz ki egy lezárt eseményt.', 'error');
        return;
      }

        const result = await api(`/events/${currentEventId}/attendance/${targetUserId}`, {
          method: 'POST',
          body: JSON.stringify({
            status,
            paymentAmount: status === 'present' ? readAttendancePaymentAmountForUser(targetUserId) : null
          })
        });

      await openEventForAdmin(currentEventId);
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'record-finance-adjustment') {
      const targetUserId = event.target.dataset.financeUserId;
      const adjustmentAmount = readFinanceAdjustmentAmountForUser(targetUserId);
      const note = readFinanceAdjustmentNoteForUser(targetUserId);

      if (!targetUserId) {
        showMessage('A játékos azonosítója hiányzik.', 'error');
        return;
      }

      if (adjustmentAmount == null) {
        showMessage('Adj meg egy 0-tól különböző egész összeget a rögzítéshez.', 'error');
        return;
      }

      const result = await api(`/teams/${state.currentTeamId}/finance-adjustments/${targetUserId}`, {
        method: 'POST',
        body: JSON.stringify({
          adjustmentAmount,
          note
        })
      });

      await loadTeam(state.currentTeamId);
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'save-skill-settings') {
      const skillBalancingEnabled =
        document.querySelector('[data-skill-balance-enabled]')?.checked ?? true;

      const toleranceRaw =
        document.querySelector('[data-skill-balance-tolerance]')?.value ?? '';

      if (toleranceRaw === '') {
        showMessage('A tolerance érték hiányzik.', 'error');
        return;
      }

      const result = await api(`/teams/${state.currentTeamId}/skill-settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          skillBalancingEnabled,
          skillBalanceTolerancePercent: Number(toleranceRaw)
        })
      });

      state.teamSkillSettings = result.settings || null;
      if (state.teamSkillSettings?.skill_balancing_enabled === false) {
        state.teamDrawPreview = null;
      }
      state.teamDrawPreview = null;
      await loadTeam(state.currentTeamId);

      if (state.selectedAdminEvent?.id) {
        await loadAdminSavedEventDraw(state.selectedAdminEvent.id);
        renderTeamSummary(state.currentTeam);
      }

      showMessage(result.message, 'success');
      return;
    }

    if (action === 'preview-team-draw') {
      const drawEvent = state.selectedAdminEvent || getAdminWorkspaceFocusEvent();
      if (!drawEvent?.id) {
        showMessage('Nincs kiválasztott közelgő esemény a csapatgeneráláshoz.', 'error');
        return;
      }

      state.selectedAdminEvent = drawEvent;
      const result = await api(`/events/${drawEvent.id}/team-draw/preview`, {
        method: 'POST'
      });

      state.teamDrawPreview = result.draw || null;
      renderTeamSummary(state.currentTeam);
      setAdminTeamSection('draw');
      scrollAdminFocusTargetIntoView('team-draw');
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'save-event-draw') {
      const drawEvent = state.selectedAdminEvent || getAdminWorkspaceFocusEvent();
      if (!drawEvent?.id) {
        showMessage('Nincs kiválasztott esemény a mentéshez.', 'error');
        return;
      }

      if (!state.teamDrawPreview) {
        showMessage('Előbb készíts preview leosztást.', 'error');
        return;
      }

      state.selectedAdminEvent = drawEvent;
      const result = await api(`/events/${drawEvent.id}/team-draw/save`, {
        method: 'POST',
        body: JSON.stringify({ draw: state.teamDrawPreview })
      });

      state.savedEventDraw = result.draw || null;
      state.savedEventDrawEventId = result.draw ? drawEvent.id : null;
      state.adminSavedEventDraw = result.draw || null;
      state.adminSavedEventDrawEventId = result.draw ? drawEvent.id : null;
      await loadAdminSavedEventDraw(drawEvent.id);
      renderTeamSummary(state.currentTeam);
      if (state.selectedAdminEventDetail?.event || drawEvent) {
        setAdminEventFormMode('edit', state.selectedAdminEventDetail?.event || drawEvent);
      }
      setAdminTeamSection('draw');
      scrollAdminFocusTargetIntoView('team-draw');
      showMessage(result.message, 'success');
      return;
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleCreateJoinLink(event) {
  event.preventDefault();
  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

  try {
    const result = await api(`/teams/${state.currentTeamId}/join-links`, {
      method: 'POST',
      body: JSON.stringify({
        role: els.joinLinkRole?.value || 'member',
        message: els.joinLinkMessage?.value.trim() || null
      })
    });

    els.createJoinLinkForm?.reset();
    if (els.joinLinkRole) {
      els.joinLinkRole.value = 'member';
    }

    await loadTeamInvites();

    const shareUrl = `${window.location.origin}${result.invite?.invite_link || ''}`;
    if (shareUrl) {
      await copyTextToClipboard(shareUrl);
      showMessage(`${result.message} A linket kimásoltam a vágólapra.`, 'success');
    } else {
      showMessage(result.message, 'success');
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function handleAdminFinanceFilterInput(event) {
  const filterKey = event.target.dataset.financeFilter;
  if (!filterKey) return;

  if (filterKey === 'status') {
    state.adminFinanceFilters.status = event.target.value || 'all';
  }

  if (filterKey === 'search') {
    state.adminFinanceFilters.search = event.target.value || '';
  }

  renderAdminFinancePanel();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  clearMessage();

  if (!state.token || !state.user) {
    showMessage('Ehhez előbb be kell jelentkezned.', 'error');
    return;
  }

  const avatarDataUrl = document.getElementById('profileAvatarDataUrl')?.value || null;

  try {
    const result = await api('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        name: document.getElementById('profileName')?.value.trim(),
        nickname: document.getElementById('profileNickname')?.value.trim() || null,
        phone: document.getElementById('profilePhone')?.value.trim() || null,
        birthYear: document.getElementById('profileBirthYear')?.value.trim() || null,
        avatarDataUrl,
        paymentProvider: document.getElementById('profilePaymentProvider')?.value || null,
        paymentUsername: document.getElementById('profilePaymentUsername')?.value.trim() || null,
        paymentQrDataUrl: document.getElementById('profilePaymentQrDataUrl')?.value || null
      })
    });

    setAuth(state.token, result.user);
    showMessage(result.message || 'Profil sikeresen frissítve.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleProfilePanelClick(event) {
  if (event.target.closest('[data-payment-qr-close]')) {
    closePaymentQrPreview();
    return;
  }

  const layoutAction = event.target.closest('[data-layout-action]')?.dataset.layoutAction;
  if (layoutAction) {
    if (layoutAction === 'edit') {
      startSurfaceLayoutEditing();
      return;
    }
    if (layoutAction === 'save') {
      saveSurfaceLayoutDraft();
      return;
    }
    if (layoutAction === 'cancel') {
      cancelSurfaceLayoutDraft();
      return;
    }
    if (layoutAction === 'reset') {
      resetSurfaceLayoutDraft();
      return;
    }
  }

  const paymentQrClear = event.target.closest('[data-payment-qr-clear]')?.dataset.paymentQrClear;
  if (paymentQrClear === 'self') {
    const paymentQrInput = document.getElementById('profilePaymentQrDataUrl');
    if (paymentQrInput) {
      paymentQrInput.value = '';
    }
    const draft = getProfileDraftFromForm();
    draft.payment_qr_data_url = '';
    if (state.user) {
      state.user.payment_qr_data_url = '';
    }
    renderProfilePanel(draft);
    showMessage('A fizetési QR-kód törölve lett. Mentéshez kattints a Profil mentése gombra.', 'success');
    return;
  }

  const paymentQrOpen = event.target.closest('[data-payment-qr-open]')?.dataset.paymentQrOpen;
  if (paymentQrOpen === 'self') {
    const draft = getProfileDraftFromForm();
    openPaymentQrPreview({
      title: getDisplayName({ ...state.user, ...draft }),
      subtitle: 'Saját fizetési QR-kód',
      qrDataUrl: draft.payment_qr_data_url || state.user?.payment_qr_data_url || '',
      username: draft.payment_username || state.user?.payment_username || '',
      provider: getPaymentProviderLabel(draft.payment_provider || state.user?.payment_provider || '')
    });
    return;
  }

  const presetId = event.target.closest('[data-avatar-preset]')?.dataset.avatarPreset;
  if (!presetId) return;

  const avatarDataUrlInput = document.getElementById('profileAvatarDataUrl');
  if (!avatarDataUrlInput) return;
  const draft = getProfileDraftFromForm();
  const labelText = draft.nickname || draft.name || getDisplayName(state.user);
  const avatarDataUrl = buildPresetAvatarDataUrl(presetId, labelText);

  avatarDataUrlInput.value = avatarDataUrl;
  if (state.user) {
    state.user.avatar_data_url = avatarDataUrl;
  }
  draft.avatar_data_url = avatarDataUrl;
  renderProfilePanel(draft);
}

async function handleProfileAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const dataUrl = await validateAvatarFile(file);
    const avatarDataUrlInput = document.getElementById('profileAvatarDataUrl');
      if (avatarDataUrlInput) {
        avatarDataUrlInput.value = dataUrl;
      }
      const draft = getProfileDraftFromForm();
      if (state.user) {
        state.user.avatar_data_url = dataUrl;
      }
      draft.avatar_data_url = dataUrl;
      renderProfilePanel(draft);
      showMessage('Profilkép betöltve. Mentéshez kattints a Profil mentése gombra.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
  } finally {
    event.target.value = '';
  }
}

async function handleProfilePaymentQrChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const dataUrl = await validateAvatarFile(file);
    const paymentQrDataUrlInput = document.getElementById('profilePaymentQrDataUrl');
    if (paymentQrDataUrlInput) {
      paymentQrDataUrlInput.value = dataUrl;
    }
    const draft = getProfileDraftFromForm();
    if (state.user) {
      state.user.payment_qr_data_url = dataUrl;
    }
    draft.payment_qr_data_url = dataUrl;
    renderProfilePanel(draft);
    showMessage('Fizetési QR-kód betöltve. Mentéshez kattints a Profil mentése gombra.', 'success');
  } catch (error) {
    showMessage(
      String(error.message || 'Ismeretlen hiba')
        .replace('A profilkép', 'A fizetési QR-kód')
        .replace('profilkép', 'fizetési QR-kód'),
      'error'
    );
  } finally {
    event.target.value = '';
  }
}

async function handleTeamMemberAdminAction(event) {
  const action = event.target.dataset.memberAction;
  const memberId = event.target.dataset.memberId;
  const targetUserId = event.target.dataset.memberUserId;

  if (!action || !memberId) return;

  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be egy csapatot.', 'error');
    return;
  }

  try {
    if (action === 'save-role') {
      const select = document.querySelector(`[data-member-role-select="${memberId}"]`);
      const role = select?.value;

      const result = await api(`/teams/${state.currentTeamId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });

      await loadTeam(state.currentTeamId);
      await loadMyTeams();
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'toggle-goalkeeper') {
      const nextIsGoalkeeper = event.target.dataset.memberNextGoalkeeper === 'true';

      const result = await api(`/teams/${state.currentTeamId}/members/${memberId}/goalkeeper-role`, {
        method: 'PATCH',
        body: JSON.stringify({
          isGoalkeeper: nextIsGoalkeeper
        })
      });

      await loadTeam(state.currentTeamId);
      setAdminTeamSection('members');
      scrollAdminFocusTargetIntoView('team-members');
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'save-rank') {
      if (!isRankModuleEnabled()) {
        showMessage('A RANG MODUL jelenleg ki van kapcsolva ennél a csapatnál.', 'error');
        return;
      }

      const rankStatus = document.querySelector(`[data-member-rank-status="${memberId}"]`)?.value || 'guest';
      const rankValueRaw = document.querySelector(`[data-member-rank-value="${memberId}"]`)?.value || '10';

      const result = await api(`/teams/${state.currentTeamId}/members/${memberId}/rank`, {
        method: 'PATCH',
        body: JSON.stringify({
          rankStatus,
          rankValue: Number(rankValueRaw)
        })
      });

      await loadTeam(state.currentTeamId);
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'save-skills') {
      if (!isTeamSkillModuleEnabled()) {
        showMessage('A skill modul OFF állapotban van, ezért a játékos skill csúszkák most nem szerkeszthetők.', 'error');
        return;
      }

      const skillsEnabled = document.querySelector(`[data-member-skill-enabled="${memberId}"]`)?.checked ?? true;
      const goalkeeperRaw = document.querySelector(`[data-member-skill-gk="${memberId}"]`)?.value ?? '';
      const defenseRaw = document.querySelector(`[data-member-skill-def="${memberId}"]`)?.value ?? '';
      const attackRaw = document.querySelector(`[data-member-skill-att="${memberId}"]`)?.value ?? '';

      if (goalkeeperRaw === '' || defenseRaw === '' || attackRaw === '') {
        showMessage('Minden skill mezőt tölts ki 0 és 100 között.', 'error');
        return;
      }

      const result = await api(`/teams/${state.currentTeamId}/members/${memberId}/skills`, {
        method: 'PATCH',
        body: JSON.stringify({
          skillsEnabled,
          goalkeeperSkill: Number(goalkeeperRaw),
          defenseSkill: Number(defenseRaw),
          attackSkill: Number(attackRaw)
        })
      });

      await loadTeam(state.currentTeamId);
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'transfer-captain') {
      const confirmed = window.confirm('Biztosan átadod a csapatkapitányi szerepet ennek a tagnak?');
      if (!confirmed) return;

      const result = await api(`/teams/${state.currentTeamId}/captain-transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });

      await Promise.all([loadTeam(state.currentTeamId), loadMyTeams()]);
      showMessage(result.message, 'success');
      return;
    }

    if (action === 'remove') {
      const confirmed = window.confirm('Biztosan eltávolítod ezt a tagot a csapatból?');
      if (!confirmed) return;

      const result = await api(`/teams/${state.currentTeamId}/members/${memberId}`, {
        method: 'DELETE'
      });

      await loadTeam(state.currentTeamId);
      await loadMyTeams();
      await loadMyEvents();
      showMessage(result.message, 'success');
    }
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function syncMemberRankControls(event) {
  const rankStatusSelect = event.target.closest('[data-member-rank-status]');
  if (!rankStatusSelect) return;

  const memberId = rankStatusSelect.dataset.memberRankStatus;
  const rankValueSelect = document.querySelector(`[data-member-rank-value="${memberId}"]`);
  if (!rankValueSelect) return;

  rankValueSelect.disabled = !isRankModuleEnabled() || rankStatusSelect.value !== 'ranked';
}

async function handleCreateTeam(event) {
  event.preventDefault();
  clearMessage();

  const name = document.getElementById('teamName').value.trim();

  try {
    const result = await api('/teams', {
      method: 'POST',
      body: JSON.stringify({ name })
    });

    saveTeamId(result.team.id);
    document.getElementById('teamName').value = '';

    await loadMyTeams();
    await loadTeam(result.team.id);
    showMessage(`Csapat létrehozva: ${result.team.name}`, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function syncRecurringCreateUi() {
  if (!els.recurringOptions || !els.recurringToggle) return;

  const recurringEnabled = Boolean(els.recurringToggle.checked);
  els.recurringOptions.classList.toggle('hidden-block', !recurringEnabled);

  const endType = els.seriesEndType?.value || 'occurrence_count';
  const useCount = endType === 'occurrence_count';

  if (els.occurrenceCountWrapper) {
    els.occurrenceCountWrapper.classList.toggle('hidden-block', !useCount);
  }

  if (els.untilDateWrapper) {
    els.untilDateWrapper.classList.toggle('hidden-block', useCount);
  }
}

function resetRecurringCreateUi() {
  if (els.recurringToggle) els.recurringToggle.checked = false;
  if (els.recurrenceType) els.recurrenceType.value = 'weekly';
  if (els.seriesEndType) els.seriesEndType.value = 'occurrence_count';
  if (els.seriesOccurrenceCount) els.seriesOccurrenceCount.value = 6;
  if (els.seriesUntilDate) els.seriesUntilDate.value = '';
  resetNotificationPreferencesForm();
  syncRecurringCreateUi();
}


async function handleCreateEvent(event) {
  event.preventDefault();
  clearMessage();

  if (!state.currentTeamId) {
    showMessage('Előbb tölts be vagy hozz létre egy csapatot.', 'error');
    return;
  }

  const substitutesEnabled = document.getElementById('eventSubstitutesEnabled')?.checked === true;
  const substitutesCount = substitutesEnabled ? Number(document.getElementById('eventSubstitutes').value || 0) : 0;
  const initialStatus = document.getElementById('eventStatus').value;
  const isRecurring = Boolean(els.recurringToggle?.checked);
  const wasEditMode = state.adminEventFormMode === 'edit';
  const editingEventId = state.adminEditingEventId;
  const startAtInputValue = document.getElementById('eventStartAt').value.trim();

  if (!isValidDateTimeLocalInput(startAtInputValue)) {
    showMessage('A kezdés érvénytelen dátum. Ellenőrizd az év, hónap, nap és idő értékét.', 'error');
    document.getElementById('eventStartAt')?.focus();
    setAdminEventFormSection('basics');
    return;
  }

  const basePayload = {
    title: document.getElementById('eventTitle').value.trim(),
    description: document.getElementById('eventDescription').value.trim() || null,
    startAt: toIsoFromInput(startAtInputValue),
    locationName: document.getElementById('eventLocation').value.trim(),
    minPlayers: Number(document.getElementById('eventMinPlayers').value),
    playersOnFieldTotal: Number(document.getElementById('eventPlayersOnField').value),
    substitutesEnabled,
    substitutesCount,
    rulesText: document.getElementById('eventRulesText').value.trim() || null,
    initialStatus,
    ...readPricingPayload('event'),
    notificationPreferences: readNotificationPreferencesFromForm()
  };

  try {
    const submitCreateRequest = async confirmHolidayOverride => {
      if (isRecurring) {
        const seriesPayload = {
          ...basePayload,
          confirmHolidayOverride,
          recurrenceType: els.recurrenceType?.value || 'weekly',
          seriesEndType: els.seriesEndType?.value || 'occurrence_count'
        };

        if (seriesPayload.seriesEndType === 'occurrence_count') {
          seriesPayload.seriesOccurrenceCount = Number(els.seriesOccurrenceCount?.value || 6);
        } else {
          seriesPayload.seriesUntilDate = els.seriesUntilDate?.value || null;
        }

        return api(`/teams/${state.currentTeamId}/event-series`, {
          method: 'POST',
          body: JSON.stringify(seriesPayload)
        });
      }

      return api(`/teams/${state.currentTeamId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          ...basePayload,
          confirmHolidayOverride
        })
      });
    };

    let result;

    if (state.adminEventFormMode === 'edit' && state.adminEditingEventId) {
      const isPublishedEdit = state.selectedAdminEvent?.status === 'published';
      const editPayload = isPublishedEdit
        ? {
            title: basePayload.title,
            description: basePayload.description,
            startAt: basePayload.startAt,
            locationName: basePayload.locationName,
            rulesText: basePayload.rulesText,
            fixedPricePerPerson: basePayload.fixedPricePerPerson,
            totalEventCost: basePayload.totalEventCost,
            perPlayerFee: basePayload.perPlayerFee,
            paymentLinkProvider: basePayload.paymentLinkProvider,
            paymentLinkUrl: basePayload.paymentLinkUrl,
            hiddenFromAdminList: document.getElementById('eventHiddenFromAdminList')?.checked === true
          }
        : {
            title: basePayload.title,
            description: basePayload.description,
            startAt: basePayload.startAt,
            locationName: basePayload.locationName,
            minPlayers: basePayload.minPlayers,
            playersOnFieldTotal: basePayload.playersOnFieldTotal,
            substitutesEnabled: basePayload.substitutesEnabled,
            substitutesCount: basePayload.substitutesCount,
            rulesText: basePayload.rulesText,
            pricingMode: basePayload.pricingMode,
            fixedPricePerPerson: basePayload.fixedPricePerPerson,
            totalEventCost: basePayload.totalEventCost,
            perPlayerFee: basePayload.perPlayerFee,
            paymentLinkProvider: basePayload.paymentLinkProvider,
            paymentLinkUrl: basePayload.paymentLinkUrl,
            hiddenFromAdminList: document.getElementById('eventHiddenFromAdminList')?.checked === true
          };

      Object.keys(editPayload).forEach(key => {
        if (editPayload[key] === undefined) {
          delete editPayload[key];
        }
      });

      await api(`/events/${state.adminEditingEventId}`, {
        method: 'PATCH',
        body: JSON.stringify(editPayload)
      });
      result = { message: 'Esemény mentve.' };
    } else {
      try {
        result = await submitCreateRequest(false);
      } catch (error) {
        if (!shouldConfirmHolidayCreation(error)) {
          throw error;
        }

        const confirmed = window.confirm(getHolidayConfirmationMessage(error.body));
        if (!confirmed) {
          showMessage('Az esemény létrehozása megszakítva.', 'info');
          return;
        }

        result = await submitCreateRequest(true);
      }
    }

    await Promise.all([loadAdminEvents(), loadUserEvents(), loadMyEvents()]);
    if (wasEditMode && editingEventId) {
      await openEventForAdmin(editingEventId);
    } else {
      resetUnifiedAdminEventForm();
      setAdminEventFormMode('create');
    }
    showMessage(
      buildHolidaySuccessMessage(
        wasEditMode
          ? 'Esemény mentve.'
          : (isRecurring ? 'Eseménysorozat létrehozva.' : 'Esemény létrehozva.'),
        result
      ),
      'success'
    );
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function loadAdminEvents() {
  if (!canAccessAdminView()) {
    state.adminEvents = [];
    els.adminEventsList.innerHTML = emptyState('Nincs admin hozzáférésed.', 'Ezt a nézetet csak csapatkapitány, helyettes vagy platform owner használhatja.');
    if (els.adminClosedEventsList) {
      els.adminClosedEventsList.innerHTML = emptyState('Nincs admin hozzáférésed.', 'A lezárt események listája is csak admin jogosultsággal érhető el.');
    }
    return;
  }

  if (!state.currentTeamId || !state.token) {
    els.adminEventsList.innerHTML = shouldShowCreateTeam()
      ? emptyState('Még nincs csapatod.', 'Hozd létre az első csapatodat a bal oldali blokkban, és utána itt már az admin események jelennek meg.')
      : '<div class="muted">Nincs betoltott csapat.</div>';
    if (els.adminClosedEventsList) {
      els.adminClosedEventsList.innerHTML = emptyState('Még nincs lezárt esemény.', 'Ha lesz megvalósult vagy lezárt eseményed, itt fogod látni.');
    }
    return;
  }

  try {
    const result = await api(`/teams/${state.currentTeamId}/events`, { method: 'GET' });
    state.adminEvents = result.events || [];
    const nextAdminEvent = pickNextAdminEvent(state.adminEvents);
    state.selectedAdminEvent = nextAdminEvent;
    state.selectedAdminEventDetail = null;

    state.adminSavedEventDraw = null;
    state.adminSavedEventDrawEventId = null;

    if (state.selectedAdminEvent?.id) {
      await loadAdminSavedEventDraw(state.selectedAdminEvent.id);
    }
    renderAdminEvents(state.adminEvents);
    renderAdminOverview();
    renderAdminHome();
    renderAdminFinancePanel();
    if (state.currentTeam) {
      renderTeamSummary(state.currentTeam);
    }
  } catch (error) {
    els.adminEventsList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
    if (els.adminClosedEventsList) {
      els.adminClosedEventsList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
    }
  }
}

function pickNextAdminEvent(events = []) {
  const now = Date.now();

  const candidates = (events || [])
    .filter(event => {
      const ts = new Date(event.start_at).getTime();
      if (Number.isNaN(ts)) return false;
      if (event.status === 'cancelled' || event.status === 'finished') return false;
      return ts >= now;
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  return candidates[0] || null;
}

function renderAdminEventGroup(title, events, options = {}) {
  const {
    open = false,
    hiddenGroup = false,
    allowEmpty = false,
    mode = 'upcoming',
    focusEventId = ''
  } = options;
  if (!events.length && !allowEmpty) return '';

  const now = Date.now();
  const sortedEvents = [...events].sort((a, b) => {
    const aTs = getEventStartTimestamp(a);
    const bTs = getEventStartTimestamp(b);
    const aIsUpcoming = aTs != null && aTs >= now;
    const bIsUpcoming = bTs != null && bTs >= now;

    if (aIsUpcoming !== bIsUpcoming) {
      return aIsUpcoming ? -1 : 1;
    }

    if (aIsUpcoming && bIsUpcoming) {
      return aTs - bTs;
    }

    return bTs - aTs;
  });

  return `
    <details class="admin-collapse" ${open ? 'open' : ''}>
      <summary>
        <span>${escapeHtml(title)}</span>
        <span class="badge badge-draft">${escapeHtml(events.length)}</span>
      </summary>
      <div class="admin-collapse-body stack">
          ${
            !sortedEvents.length
              ? `<div class="small muted">${hiddenGroup ? 'Nincs külön elrejtett esemény.' : 'Ebben a csoportban most nincs esemény.'}</div>`
              : ''
          }
          ${sortedEvents.map(event => `
            <div class="event-card ${event.hidden_from_admin_list ? 'is-hidden-admin-event' : ''} ${String(event.id) === String(focusEventId) ? 'is-current-focus' : ''}">
              <div class="row between align-center">
                <h4>${escapeHtml(event.title)}</h4>
                <div class="row gap wrap align-center">
                  ${String(event.id) === String(focusEventId) ? '<span class="badge badge-warning">most ez a fókusz</span>' : ''}
                  ${renderAdminLifecycleBadge(event, now)}
                  ${eventReadinessBadge(event.event_readiness || event.eventReadiness)}
                  ${event.hidden_from_admin_list ? '<span class="badge badge-muted">rejtett</span>' : ''}
                </div>
              </div>
            ${renderHolidayWarning(getHolidayWarningFromEvent(event), { compact: true })}
            ${renderEventReadinessPanel(event, { compact: true })}
            <div class="event-meta">
              <div><strong>Kezdés:</strong> ${escapeHtml(new Date(event.start_at).toLocaleString('hu-HU'))}</div>
              <div><strong>Helyszín:</strong> ${escapeHtml(event.location_name || '-')}</div>
              <div><strong>Jelentkezett:</strong> ${escapeHtml(event.going_count)}</div>
              <div><strong>Várólista:</strong> ${escapeHtml(event.waiting_count)}</div>
              <div><strong>Hátralévő idő:</strong> ${renderCountdown(event.start_at)}</div>
            </div>
            ${renderEventParticipantPreview(event, { role: 'admin', compact: true })}
            <div class="event-actions">
              <button class="btn btn-secondary" type="button" data-admin-open="${event.id}">${mode === 'closed' ? 'Utómunka' : 'Szerkesztés'}</button>
              ${
                mode === 'closed'
                  ? ''
                  : `<button class="btn btn-ghost" type="button" ${event.status === 'published' ? 'disabled' : ''} data-admin-status="published" data-event-id="${event.id}">Publikálás</button>
                     <button class="btn btn-ghost" type="button" ${event.status === 'cancelled' ? 'disabled' : ''} data-admin-status="cancelled" data-event-id="${event.id}">Törlés</button>`
              }
            </div>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderAdminEvents(events) {
  if (!els.adminEventsList || !els.adminClosedEventsList) return;

  const eventsWorkspace = buildAdminEventsWorkspaceState(events);
  const {
    draftEvents,
    publishedUpcomingEvents,
    manageablePastEvents,
    finishedEvents,
    hiddenEvents,
    upcomingEvents,
    nextAction
  } = eventsWorkspace;
  const primaryUpcomingLabel =
    nextAction.mode === 'first-event' ? 'Első esemény létrehozása' :
    nextAction.mode === 'publish-draft' ? 'Piszkozat megnyitása' :
    nextAction.mode === 'manage-upcoming' ? 'Közelgő esemény kezelése' :
    nextAction.mode === 'edit' ? 'Szerkesztés folytatása' :
    'Új esemény';
  const secondaryUpcomingLabel =
    nextAction.mode === 'publish-draft' ? 'Publikált lista' :
    nextAction.mode === 'manage-upcoming' ? 'Megvalósult események' :
    'Közelgő lista';

  if (!eventsWorkspace.visibleEvents.length) {
    els.adminEventsList.innerHTML = emptyState('Nincs esemény.', 'Hozz létre új eseményt a jobb oldali űrlapon.');
    els.adminClosedEventsList.innerHTML = emptyState('Nincs megvalósult esemény.', 'Ha egy esemény már lezajlott, de még adminisztrálásra vár, itt fog megjelenni.');
    return;
  }

  const isEditing = state.adminEventFormMode === 'edit';
  const eventFlowSteps = [
    {
      label: '1. Létrehozás',
      hint: upcomingEvents.length ? `${upcomingEvents.length} aktív esemény` : 'Hozz létre vagy szerkessz egy eseményt',
      state: upcomingEvents.length ? 'done' : 'current',
      workspace: 'events',
      section: 'upcoming'
    },
    {
      label: '2. Publikálás',
      hint: publishedUpcomingEvents.length ? `${publishedUpcomingEvents.length} publikált esemény` : 'Nyisd meg a jelentkezést',
      state: publishedUpcomingEvents.length ? 'done' : upcomingEvents.length ? 'current' : 'upcoming',
      workspace: 'events',
      section: 'upcoming'
    },
    {
      label: '3. Karbantartás',
      hint: isEditing ? 'Most egy konkrét eseményt szerkesztesz' : 'A közelgő listában követheted a szervezést',
      state: isEditing ? 'current' : publishedUpcomingEvents.length ? 'done' : 'upcoming',
      workspace: 'events',
      section: 'upcoming'
    },
    {
      label: '4. Utómunka',
      hint: manageablePastEvents.length ? `${manageablePastEvents.length} adminisztrálandó esemény` : 'Ha lement a meccs, innen mész tovább a pénzügyre',
      state: manageablePastEvents.length ? 'current' : finishedEvents.length ? 'done' : 'upcoming',
      workspace: manageablePastEvents.length ? 'finance' : 'events',
      section: manageablePastEvents.length ? 'settlement' : 'closed'
    }
  ];

  const upcomingGuide = `
    <div class="event-card admin-home-primary-card">
      <div id="adminEventsProgressSummary" class="event-form-progress-summary bottom-space"></div>
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Most ezzel foglalkozz</div>
          <div class="admin-home-primary-title">${escapeHtml(isEditing ? 'Most egy meglévő eseményt szerkesztesz.' : nextAction.title)}</div>
        </div>
        <span class="badge ${escapeHtml(isEditing ? 'badge-warning' : nextAction.badgeClass)}">${escapeHtml(isEditing ? 'szerkesztési mód' : nextAction.badgeText)}</span>
      </div>
      <div class="small muted top-space">
        ${isEditing
          ? 'A jobb oldali űrlap most a kiválasztott eseményt szerkeszti. Ha végeztél, ments, vagy válts vissza új esemény módra.'
          : escapeHtml(nextAction.description)}
      </div>
      ${
        eventsWorkspace.focusEvent && nextAction.targetSection === 'upcoming'
          ? `
            <div class="detail-box top-space">
              <div class="detail-label">Fókusz esemény</div>
              <div class="detail-value">${escapeHtml(eventsWorkspace.focusEvent.title || 'Névtelen esemény')}</div>
              <div class="small muted">${escapeHtml(formatDateTime(eventsWorkspace.focusEvent.start_at))}</div>
              <div class="small muted">Most ezzel foglalkozol: a szerkesztés, publikálás és jelentkezéskövetés ehhez az eseményhez kapcsolódik.</div>
            </div>
          `
          : ''
      }
      <div class="row gap wrap top-space">
        ${
          isEditing
            ? '<button class="btn btn-ghost" type="button" data-admin-reset-event-form="true">Új esemény mód</button>'
            : ''
        }
        <button class="btn" type="button" data-admin-events-section="upcoming">${escapeHtml(primaryUpcomingLabel)}</button>
      </div>
      <details class="admin-home-shelf top-space">
        <summary class="small muted">Polcon még van pár eseményes út</summary>
        <div class="row gap wrap top-space">
          <button class="btn btn-ghost" type="button" data-admin-events-section="${nextAction.mode === 'manage-upcoming' ? 'closed' : 'upcoming'}">${escapeHtml(secondaryUpcomingLabel)}</button>
          <button class="btn btn-ghost" type="button" data-admin-workspace-jump="finance">Elszámolás</button>
        </div>
      </details>
      <details class="admin-home-shelf top-space">
        <summary class="small muted">Polcra tett eseményfolyamat</summary>
        <div class="top-space">
          ${renderWorkspaceFlowCard('Eseményszervezési sor', 'A közelgő meccsek szervezése legyen lineáris és átlátható.', eventFlowSteps)}
        </div>
      </details>
    </div>
  `;
  const closedGuide = `
    <div class="event-card admin-home-primary-card">
      <div class="row between align-center wrap gap">
        <div>
          <div class="small muted">Most ezzel foglalkozz</div>
          <div class="admin-home-primary-title">${escapeHtml(
            manageablePastEvents.length
              ? 'Itt vannak a megvalósult, de még adminisztrálásra váró eseményeid.'
              : finishedEvents.length
                ? 'Itt látod a már lezárt események utáni állapotot.'
                : 'Itt jelennek meg a megvalósult eseményeid.'
          )}</div>
        </div>
        <span class="badge ${manageablePastEvents.length ? 'badge-warning' : 'badge-muted'}">${escapeHtml(manageablePastEvents.length ? 'utómunka' : 'ellenőrzés')}</span>
      </div>
      <div class="small muted top-space">
        ${escapeHtml(
          manageablePastEvents.length
            ? 'Itt tudod rögzíteni a megjelenteket, a no-show-t és a befizetéseket. A lezárás csak ezek után történjen meg.'
            : finishedEvents.length
              ? 'Nyitott utómunka most nincs. Ha újra lesz megvalósult esemény, itt fog megjelenni adminisztrálásra.'
            : 'Ha egy esemény már lezajlott, de még pénzügyi és jelenléti adminisztrációra vár, itt jelenik meg.'
        )}
      </div>
      ${
        manageablePastEvents[0]
          ? `
            <div class="detail-box top-space">
              <div class="detail-label">Most adminisztrálandó esemény</div>
              <div class="detail-value">${escapeHtml(manageablePastEvents[0].title || 'Névtelen esemény')}</div>
              <div class="small muted">${escapeHtml(formatDateTime(manageablePastEvents[0].start_at))}</div>
            </div>
          `
          : ''
      }
      <div class="row gap wrap top-space">
        <button class="btn" type="button" data-admin-workspace-jump="finance">Elszámolás megnyitása</button>
      </div>
      <details class="admin-home-shelf top-space">
        <summary class="small muted">Polcon még van pár eseményes út</summary>
        <div class="row gap wrap top-space">
          <button class="btn btn-ghost" type="button" data-admin-events-section="upcoming">Vissza a közelgőkhöz</button>
        </div>
      </details>
      <details class="admin-home-shelf top-space">
        <summary class="small muted">Polcra tett eseményfolyamat</summary>
        <div class="top-space">
          ${renderWorkspaceFlowCard('Megvalósult esemény folyamata', 'Itt már nem szervezés, hanem adminisztráció történik.', eventFlowSteps)}
        </div>
      </details>
    </div>
  `;

  els.adminEventsList.innerHTML = [
    upcomingGuide,
    renderAdminEventGroup('Publikált események', publishedUpcomingEvents, {
      open: nextAction.mode === 'manage-upcoming' || (isEditing && Boolean(eventsWorkspace.selectedUpcomingEvent)),
      allowEmpty: true,
      mode: 'upcoming',
      focusEventId: eventsWorkspace.focusEvent?.id || ''
    }),
    renderAdminEventGroup('Piszkozat események', draftEvents, {
      open: nextAction.mode === 'publish-draft' || nextAction.mode === 'first-event',
      allowEmpty: true,
      mode: 'upcoming',
      focusEventId: eventsWorkspace.focusEvent?.id || ''
    }),
    renderAdminEventGroup('Rejtett események', hiddenEvents, { open: false, hiddenGroup: true })
  ].filter(Boolean).join('');

  els.adminClosedEventsList.innerHTML = [
    closedGuide,
    renderAdminEventGroup('Megvalósult események', manageablePastEvents, {
      open: true,
      allowEmpty: true,
      mode: 'closed',
      focusEventId: eventsWorkspace.focusEvent?.id || ''
    })
  ].filter(Boolean).join('');

  document.querySelectorAll('[data-admin-open]').forEach(btn => {
    btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await handleAdminOpenAction(btn.dataset.adminOpen, {
        preferFinanceForClosed: manageablePastEvents.some(item => item.id === btn.dataset.adminOpen)
      });
    });
  });

  document.querySelectorAll('[data-admin-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await changeEventStatus(btn.dataset.eventId, btn.dataset.adminStatus);
    });
  });

  syncAdminEventsSectionProgress();
}

function renderWorkspaceFlowCard(title, description, steps) {
  return `
    <div class="admin-workspace-flow embedded-flow">
      <div class="row between align-center wrap gap">
        <strong>${escapeHtml(title)}</strong>
        <span class="badge badge-muted">követhető sorrend</span>
      </div>
      <div class="small muted top-space">${escapeHtml(description)}</div>
      <div class="admin-flow-grid top-space">
        ${(steps || []).map(step => `
          <button
            class="admin-flow-step is-${escapeHtml(step.state || 'upcoming')}"
            type="button"
            data-admin-workspace-jump="${escapeHtml(step.workspace || 'home')}"
            ${step.section ? `data-admin-section-jump="${escapeHtml(step.section)}"` : ''}
          >
            <span class="admin-flow-step-title">${escapeHtml(step.label || '')}</span>
            <span class="admin-flow-step-hint">${escapeHtml(step.hint || '')}</span>
            <span class="admin-flow-step-state">${escapeHtml(
              step.state === 'done'
                ? 'kész'
                : step.state === 'current'
                  ? 'most ez jön'
                  : 'később'
            )}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function openEventForAdmin(eventId) {
  try {
    const result = await api(`/events/${eventId}`, { method: 'GET' });
    state.selectedAdminEvent = result.event;
    state.selectedAdminEventDetail = result;
    state.adminEventDetailsById[String(eventId)] = result;
    state.teamDrawPreview = null;
    await loadAdminSavedEventDraw(eventId);
    setAdminEventFormMode('edit', result.event);
    renderTeamSummary(state.currentTeam);
    renderAdminFinancePanel();
    const isClosedFlow = canManageAttendanceForEvent(result.event);
    setAdminEventsSection(isClosedFlow ? 'closed' : 'upcoming');
    const scrollTarget = isClosedFlow
      ? els.selectedEventMeta || els.adminClosedEventsList
      : els.createEventForm;
    scrollTarget?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    return result;
  } catch (error) {
    showMessage(error.message, 'error');
    return null;
  }
}

async function handleAdminOpenAction(eventId, options = {}) {
  if (!eventId) {
    return;
  }

  const result = await openEventForAdmin(eventId);
  const shouldOpenFinance =
    options.preferFinanceForClosed === true ||
    (options.preferFinanceForClosed !== false && canManageAttendanceForEvent(result?.event));

  if (shouldOpenFinance) {
    await applyAdminJump('finance', 'settlement', 'finance-current');
    return;
  }

  setAdminWorkspace('events');
}

async function changeEventStatus(eventId, status) {
  clearMessage();
  try {
    await api(`/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    await Promise.all([loadAdminEvents(), loadUserEvents(), loadMyEvents()]);

    if (state.selectedAdminEvent?.id === eventId) {
      await openEventForAdmin(eventId);
    }

    showMessage(`Státusz frissítve: ${status}`, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function loadUserEvents() {
  const teamId = els.userTeamIdInput.value.trim() || state.currentTeamId;

  if (!teamId || !state.token) {
    els.userEventsList.innerHTML = '<div class="muted">Adj meg vagy tölts be egy csapatot.</div>';
    return;
  }

  try {
    saveTeamId(teamId);
    const result = await api(`/teams/${teamId}/events`, { method: 'GET' });

    state.userTeamEvents = result.events || [];
    await hydrateUserEventDetailsCache(state.userTeamEvents);

    const nextUserEvent = pickRelevantUserEvent(state.userTeamEvents, { allowPastFallback: true });

    if (nextUserEvent?.id) {
      await openEventForUser(nextUserEvent.id);
    } else {
      state.selectedUserEvent = null;
      state.selectedUserEventDetail = null;
      state.savedEventDraw = null;
      state.savedEventDrawEventId = null;
      if (els.userEventDetail) {
        els.userEventDetail.innerHTML = emptyState(
          'Nincs fókuszálható esemény.',
          'Ehhez a csapathoz jelenleg nincs olyan közelgő esemény, amelyre automatikusan rá kellene állni.'
        );
      }
    }

    renderUserEvents(state.userTeamEvents);
  } catch (error) {
    els.userEventsList.innerHTML = `<div class="muted">${escapeHtml(error.message)}</div>`;
  }
}

function renderUserEvents(events) {
  if (getRenderableSavedUserDraw()) {
    renderSavedUserEventDraw();
  } else {
    renderUserTeamDrawPreview();
  }

  if (!events.length) {
    els.userEventsList.innerHTML = emptyState('Nincs esemény.', 'Ehhez a csapathoz jelenleg nincs publikus vagy látható esemény.');
    return;
  }

  const renderUserEventActionButtons = event => {
    const actions = [
      `<button class="btn btn-secondary" type="button" data-user-open="${event.id}">Részletek</button>`
    ];

    if (canAttemptEventRegistration(event)) {
      actions.push(`<button class="btn" type="button" data-user-register="${event.id}">Jelentkezés</button>`);
    } else if (event.my_registration_status === 'cancelled' && hasReachedEventCancellationLimit(event)) {
      actions.push(renderBlockedRegistrationAction(event));
    }

    if (['going', 'waiting_list', 'waiting_list_rank'].includes(event.my_registration_status)) {
      actions.push(`<button class="btn btn-danger" type="button" data-user-cancel="${event.id}">Lemondás</button>`);
    }

    return actions.join('');
  };

  const now = Date.now();
  const sortedEvents = [...events].sort((a, b) => {
    const aTs = new Date(a.start_at).getTime();
    const bTs = new Date(b.start_at).getTime();
    const aIsUpcoming = !Number.isNaN(aTs) && aTs >= now;
    const bIsUpcoming = !Number.isNaN(bTs) && bTs >= now;

    if (aIsUpcoming !== bIsUpcoming) {
      return aIsUpcoming ? -1 : 1;
    }

    if (aIsUpcoming && bIsUpcoming) {
      return aTs - bTs;
    }

    return bTs - aTs;
  });

  els.userEventsList.innerHTML = sortedEvents.map(event => `
    <div class="event-card">
      <div class="row between align-center">
        <h4>${escapeHtml(event.title)}</h4>
        <div class="row gap wrap align-center">
          ${statusBadge(event.status)}
          ${eventReadinessBadge(event.event_readiness || event.eventReadiness)}
        </div>
      </div>
      ${renderHolidayWarning(getHolidayWarningFromEvent(event), { compact: true })}
      ${renderEventReadinessPanel(event, { compact: true })}
      <div class="event-meta">
        <div><strong>Kezdés:</strong> ${escapeHtml(new Date(event.start_at).toLocaleString('hu-HU'))}</div>
        <div><strong>Helyszín:</strong> ${escapeHtml(event.location_name || '-')}</div>
        <div><strong>Jelentkezett:</strong> ${escapeHtml(event.going_count)}</div>
        <div><strong>Szabad hely:</strong> ${escapeHtml(event.spots_left)}</div>
        <div><strong>Hátralévő idő:</strong> ${renderCountdown(event.start_at)}</div>
      </div>
      ${renderUserPaymentSummary(event, { financeOverview: state.currentTeamFinance })}
${renderRankRegistrationNotice(event.registration_window, { compact: true, currentStatus: event.my_registration_status })}
      ${
        event.registration_window && !event.registration_window.isRestrictedByRank
          ? `<div class="small muted top-space">${escapeHtml(event.registration_window.message)}</div>`
          : ''
      }
      ${renderEventParticipantPreview(event, { role: 'user', compact: true })}
      <div class="event-actions">
        ${renderUserEventActionButtons(event)}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-user-open]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openEventForUser(btn.dataset.userOpen);
    });
  });

  document.querySelectorAll('[data-user-register]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await registerForEvent(btn.dataset.userRegister);
    });
  });

  document.querySelectorAll('[data-register-limit-event-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const blockedEvent = events.find(event => event.id === btn.dataset.registerLimitEventId)
        || state.myEvents.find(event => event.id === btn.dataset.registerLimitEventId)
        || state.selectedUserEventDetail?.event
        || state.selectedUserEvent;
      showMessage(buildEventRegistrationLimitMessage(blockedEvent), 'error');
    });
  });

  document.querySelectorAll('[data-user-cancel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await cancelRegistration(btn.dataset.userCancel);
    });
  });
}

async function loadSavedEventDraw(eventId) {
  if (!eventId) {
    state.savedEventDraw = null;
    state.savedEventDrawEventId = null;
    return;
  }

  try {
    const result = await api(`/events/${eventId}/team-draw`, { method: 'GET' });
    state.savedEventDraw = result.draw || null;
    state.savedEventDrawEventId = result.draw ? eventId : null;
  } catch (error) {
    console.error('Mentett esemény csapatleosztás betöltési hiba:', error);
    state.savedEventDraw = null;
    state.savedEventDrawEventId = null;
  }
}

async function loadAdminSavedEventDraw(eventId) {
  if (!eventId) {
    state.adminSavedEventDraw = null;
    state.adminSavedEventDrawEventId = null;
    return;
  }

  try {
    const result = await api(`/events/${eventId}/team-draw`, { method: 'GET' });
    state.adminSavedEventDraw = result.draw || null;
    state.adminSavedEventDrawEventId = result.draw ? eventId : null;
  } catch (error) {
    console.error('Admin mentett esemény csapatleosztás betöltési hiba:', error);
    state.adminSavedEventDraw = null;
    state.adminSavedEventDrawEventId = null;
  }
}

async function openEventForUser(eventId) {
  clearMessage();
  try {
    const result = await api(`/events/${eventId}`, { method: 'GET' });
    markUserEventAsSeen(eventId);
    state.selectedUserEvent = result.event;
    state.selectedUserEventDetail = result;
    state.userEventDetailsById[String(eventId)] = result;
    await loadSavedEventDraw(eventId);
    renderUserEventDetail(result);
    renderUserOverview();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderUserEventDetail(result) {
  const event = result.event;
  const enrichedEvent = {
    ...event,
    payment_summary: result.summary?.paymentSummary || event.payment_summary || event.paymentSummary || null
  };
  const detailWeatherWidgetId = 'detailEventWeatherWidget';
  const myAttendance = findMyAttendanceRegistration(result);
  const attendanceSummary = result.summary?.attendanceSummary || null;
  els.userEventDetail.innerHTML = `
    <div class="stack">
      <div class="row between align-center">
        <h3>${escapeHtml(event.title)}</h3>
        <div class="row gap wrap align-center">
          ${statusBadge(event.status)}
          ${registrationStatusBadge(event.my_registration_status)}
        </div>
      </div>
      ${renderHolidayWarning(result.holidayWarning || getHolidayWarningFromEvent(event))}
      ${renderEventReadinessPanel({
        ...event,
        event_readiness: result.summary.eventReadiness || event.event_readiness || event.eventReadiness
      })}
      <div class="small muted">${escapeHtml(event.description || 'Nincs leírás')}</div>
      ${renderRankRegistrationNotice(result.registrationWindow, { currentStatus: event.my_registration_status })}
      ${
        result.registrationWindow && !result.registrationWindow.isRestrictedByRank
          ? `<div class="small muted">${escapeHtml(result.registrationWindow.message)}</div>`
          : ''
      }
      <div><strong>Kezdés:</strong> ${escapeHtml(new Date(event.start_at).toLocaleString('hu-HU'))}</div>
      <div><strong>Helyszín:</strong> ${escapeHtml(event.location_name || '-')}</div>
      <div><strong>Szabályok:</strong> ${escapeHtml(event.rules_text || '-')}</div>
      ${renderEventWeatherModule(event, { widgetId: detailWeatherWidgetId })}
      ${renderUserPaymentSummary(enrichedEvent, { forceVisible: true, financeOverview: state.currentTeamFinance })}
      ${renderCaptainPaymentCard(enrichedEvent)}
      ${
        event.status === 'finished'
          ? `
            ${renderAttendanceSummary(attendanceSummary, { title: 'Lezárt jelenléti összesítő', compact: true })}
            <div class="detail-box">
              <div class="detail-label">Saját jelenléti státusz</div>
              <div class="detail-value">${attendanceStatusBadge(myAttendance?.attendance_status)}</div>
              <div class="small muted">
                ${
                  myAttendance?.attendance_status
                    ? escapeHtml(
                        myAttendance.attendance_status === 'no_show'
                          ? 'A lezárt eseménynél no-show jelölést kaptál.'
                          : 'A lezárt eseménynél megjelentként lettél jelölve.'
                      )
                    : 'Ehhez a lezárt eseményhez még nincs rögzítve a jelenléti jelölésed.'
                }
              </div>
            </div>
          `
          : ''
      }
      <div class="grid two-col inner-grid">
        <div><strong>Jelentkezett:</strong> ${escapeHtml(result.summary.goingCount)}</div>
        <div><strong>Várólista:</strong> ${escapeHtml(result.summary.waitingCount)}</div>
        <div><strong>Rangvárólista:</strong> ${escapeHtml(result.summary.rankWaitingCount)}</div>
        <div><strong>Lemondta:</strong> ${escapeHtml(result.summary.cancelledCount)}</div>
        <div><strong>Szabad hely:</strong> ${escapeHtml(result.summary.spotsLeft)}</div>
      </div>
      <div class="row gap wrap">
        ${renderGoogleCalendarLink(event)}
        ${renderIcsExportLink(event)}
        ${renderMapsLink(event)}
      </div>
      <div>
        <strong>Lemondtak</strong>
        ${renderParticipantList(result.registrations.cancelled || [], {
          emptyText: 'Nincs lemondás.',
          numbered: false
        })}
      </div>
    </div>
  `;
  hydrateEventWeatherWidget(detailWeatherWidgetId, event);
  renderSavedUserEventDraw();
}

async function registerForEvent(eventId) {
  clearMessage();
  try {
    const result = await api(`/events/${eventId}/register`, { method: 'POST' });
    showMessage(result.message, 'success');
    await loadUserEvents();
    await loadAdminEvents();
    await loadMyEvents();
    await openEventForUser(eventId);
  } catch (error) {
    if (error.body?.cancellationLimitReached) {
      const blockedEvent = state.userTeamEvents.find(item => item.id === eventId)
        || state.myEvents.find(item => item.id === eventId)
        || state.selectedUserEventDetail?.event
        || state.selectedUserEvent;
      showMessage(buildEventRegistrationLimitMessage({
        ...blockedEvent,
        my_cancelled_count: error.body.cancellationCount || blockedEvent?.my_cancelled_count || 2
      }), 'error');
      return;
    }

    showMessage(error.message, 'error');
  }
}

async function cancelRegistration(eventId) {
  clearMessage();
  try {
    const result = await api(`/events/${eventId}/cancel`, { method: 'POST' });
    showMessage(result.message, 'success');
    await loadUserEvents();
    await loadAdminEvents();
    await loadMyEvents();
    await openEventForUser(eventId);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function bindEvents() {
  document.addEventListener('pointerdown', handleSurfaceLayoutPointerDown);
  document.addEventListener('pointermove', handleSurfaceLayoutPointerMove);
  document.addEventListener('pointerup', handleSurfaceLayoutPointerUp);
  document.addEventListener('pointercancel', handleSurfaceLayoutPointerUp);
  document.addEventListener('submit', async event => {
    if (event.target?.id === 'tournamentSetupForm') {
      await handleTournamentSetupSubmit(event);
    }
  });
  document.addEventListener('click', async event => {
    if (event.target?.id === 'paymentQrPreviewOverlay' || event.target.closest('[data-payment-qr-close]')) {
      closePaymentQrPreview();
      return;
    }

    const paymentQrOpenAction = event.target.closest('[data-payment-qr-user-id]');
    if (paymentQrOpenAction) {
      openPaymentQrPreviewForUserId(
        paymentQrOpenAction.dataset.paymentQrUserId,
        paymentQrOpenAction.dataset.paymentQrRole || ''
      );
      return;
    }

    const userOverviewAction = event.target.closest('[data-user-overview-action]');
    if (userOverviewAction) {
      if (userOverviewAction.dataset.userOverviewAction === 'pending-invites') {
        jumpToPendingInvites();
      }
      if (userOverviewAction.dataset.userOverviewAction === 'new-events') {
        await jumpToNewestUnregisteredEvent();
      }
      return;
    }

    const adminHomeDismiss = event.target.closest('[data-admin-home-dismiss]');
    if (adminHomeDismiss) {
      setAdminHomePanelDismissed(adminHomeDismiss.dataset.adminHomeDismiss, true);
      renderAdminHome();
      return;
    }

    const resetAdminEventForm = event.target.closest('[data-admin-reset-event-form]');
    if (resetAdminEventForm) {
      setAdminEventFormMode('create');
      setAdminEventsSection('upcoming');
      clearMessage();
      if (typeof els.createEventForm?.scrollIntoView === 'function') {
        els.createEventForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const eventFormNextButton = event.target.closest('#adminEventNextStepBtn');
    if (eventFormNextButton) {
      const nextSection = eventFormNextButton.dataset.adminEventNextSection || '';
      if (nextSection) {
        setAdminEventFormSection(nextSection);
      }
      return;
    }

    const workspaceJump = event.target.closest('[data-admin-workspace-jump]');
    if (workspaceJump) {
      await applyAdminJump(
        workspaceJump.dataset.adminWorkspaceJump,
        workspaceJump.dataset.adminSectionJump || '',
        workspaceJump.dataset.adminFocusTarget || ''
      );
      return;
    }

    const workspaceSwitch = event.target.closest('[data-admin-workspace]');
    if (workspaceSwitch) {
      setAdminWorkspace(workspaceSwitch.dataset.adminWorkspace);
      if (workspaceSwitch.dataset.adminWorkspace === 'finance') {
        await ensureAdminFinanceFocusEvent();
      }
      return;
    }

    const tournamentWorkspaceSwitch = event.target.closest('[data-tournament-workspace]');
    if (tournamentWorkspaceSwitch) {
      setTournamentWorkspace(tournamentWorkspaceSwitch.dataset.tournamentWorkspace);
      return;
    }

    const tournamentWorkspaceJump = event.target.closest('[data-tournament-workspace-jump]');
    if (tournamentWorkspaceJump) {
      setTournamentWorkspace(tournamentWorkspaceJump.dataset.tournamentWorkspaceJump);
      return;
    }

    const eventFormSectionSwitch = event.target.closest('[data-admin-event-form-section]');
    if (eventFormSectionSwitch) {
      setAdminEventFormSection(eventFormSectionSwitch.dataset.adminEventFormSection);
      return;
    }

    const teamSectionSwitch = event.target.closest('[data-admin-team-section]');
    if (teamSectionSwitch) {
      setAdminTeamSection(teamSectionSwitch.dataset.adminTeamSection);
      return;
    }

    const eventsSectionSwitch = event.target.closest('[data-admin-events-section]');
    if (eventsSectionSwitch) {
      setAdminEventsSection(eventsSectionSwitch.dataset.adminEventsSection);
      return;
    }

    const adminOpenAction = event.target.closest('[data-admin-open]');
    if (adminOpenAction) {
      await handleAdminOpenAction(adminOpenAction.dataset.adminOpen, {
        preferFinanceForClosed: String(adminOpenAction.textContent || '').trim().includes('Utómunka')
      });
      return;
    }

    const inlineStatusAction = event.target.closest('[data-admin-inline-status]');
    if (inlineStatusAction) {
      await changeEventStatus(
        inlineStatusAction.dataset.eventId,
        inlineStatusAction.dataset.adminInlineStatus
      );
      return;
    }

    const financeSectionSwitch = event.target.closest('[data-admin-finance-section]');
    if (financeSectionSwitch) {
      setAdminFinanceSection(financeSectionSwitch.dataset.adminFinanceSection);
      return;
    }

    const authSwitch = event.target.closest('[data-auth-mode-switch]');
    if (authSwitch) {
      setAuthMode(authSwitch.dataset.authModeSwitch);
      return;
    }

    if (event.target.closest('#authModeLoginBtn')) {
      setAuthMode('login');
      return;
    }

    if (event.target.closest('#authModeRegisterBtn')) {
      setAuthMode('register');
      return;
    }

  });

  els.navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  if (els.createInviteForm) {
    els.createInviteForm.addEventListener('submit', handleCreateInvite);
  }

  if (els.createJoinLinkForm) {
    els.createJoinLinkForm.addEventListener('submit', handleCreateJoinLink);
  }

  if (els.addMemberForm) {
    els.addMemberForm.addEventListener('submit', handleAddMember);
  }

  if (els.myTeamsList) {
    els.myTeamsList.addEventListener('click', handleDashboardClicks);
  }

  if (els.myEventsList) {
    els.myEventsList.addEventListener('click', handleDashboardClicks);
  }

  if (els.nextEventHero) {
    els.nextEventHero.addEventListener('click', handleDashboardClicks);
  }

  if (els.teamMembersAdminList) {
    els.teamMembersAdminList.addEventListener('click', handleTeamMemberAdminAction);
    els.teamMembersAdminList.addEventListener('change', syncMemberRankControls);
  }

  if (els.teamSummary) {
    els.teamSummary.addEventListener('click', handleTeamSummaryAction);
    els.teamSummary.addEventListener('change', handleSkillModuleToggleChange);
  }

  if (els.teamAdvancedContent) {
    els.teamAdvancedContent.addEventListener('click', handleTeamSummaryAction);
    els.teamAdvancedContent.addEventListener('change', handleSkillModuleToggleChange);
  }

  if (els.teamDrawContent) {
    els.teamDrawContent.addEventListener('click', handleTeamSummaryAction);
  }

  if (els.adminAttendanceContent) {
    els.adminAttendanceContent.addEventListener('click', handleTeamSummaryAction);
    els.adminAttendanceContent.addEventListener('input', event => {
      const paymentInput = event.target.closest('[data-attendance-payment]');
      if (!paymentInput) return;
      syncAttendancePaymentPreview(paymentInput.dataset.attendanceUserId);
    });
  }

  if (els.adminFinanceContent) {
    els.adminFinanceContent.addEventListener('click', handleTeamSummaryAction);
    els.adminFinanceContent.addEventListener('input', handleAdminFinanceFilterInput);
    els.adminFinanceContent.addEventListener('change', handleAdminFinanceFilterInput);
  }

  if (els.teamInvitesAdminList) {
    els.teamInvitesAdminList.addEventListener('click', handleTeamInviteAdminAction);
  }

  if (els.myInvitesList) {
    els.myInvitesList.addEventListener('click', handleMyInviteAction);
  }

  if (els.profilePanel) {
    els.profilePanel.addEventListener('submit', event => {
      if (event.target?.id === 'profileForm') {
        handleProfileSubmit(event);
      }
    });
    els.profilePanel.addEventListener('click', handleProfilePanelClick);
    els.profilePanel.addEventListener('change', event => {
      if (event.target?.id === 'profileAvatarUpload') {
        handleProfileAvatarChange(event);
        return;
      }
      if (event.target?.id === 'profilePaymentQrUpload') {
        handleProfilePaymentQrChange(event);
        return;
      }
      if (event.target?.id === 'adminHideHiddenEventsToggle') {
        syncAdminHideHiddenEventsPreference();
      }
    });
  }

  if (els.saveApiBaseBtn && els.apiBase) {
    els.saveApiBaseBtn.addEventListener('click', () => {
      state.apiBase = els.apiBase.value.trim() || `${window.location.origin}/api`;
      localStorage.setItem('foci_api_base', state.apiBase);
      showMessage('API base URL elmentve.', 'success');
    });
  }

  els.loginForm.addEventListener('submit', handleLogin);
  els.registerForm.addEventListener('submit', handleRegister);

  els.logoutBtn.addEventListener('click', () => {
    clearAuth();
    clearMessage();
    showMessage('Kijelentkeztél.', 'info');
    switchView('authView');
  });

  els.createTeamForm.addEventListener('submit', handleCreateTeam);

  els.teamLoadForm.addEventListener('submit', async event => {
    event.preventDefault();
    await loadTeam(els.teamIdInput.value.trim());
  });

  els.useSavedTeamBtn.addEventListener('click', async () => {
    if (!state.currentTeamId) {
      showMessage('Nincs mentett csapat ID.', 'error');
      return;
    }
    await loadTeam(state.currentTeamId);
  });

  els.createEventForm.addEventListener('submit', handleCreateEvent);
  document.getElementById('eventSubstitutesEnabled')?.addEventListener('change', syncCreateSubstitutesUi);
  document.getElementById('adminEventCancelEditBtn')?.addEventListener('click', () => {
    state.selectedAdminEvent = null;
    state.selectedAdminEventDetail = null;
    state.adminSavedEventDraw = null;
    state.adminSavedEventDrawEventId = null;
    state.teamDrawPreview = null;
    setAdminEventFormMode('create');
    if (state.currentTeam) {
      renderTeamSummary(state.currentTeam);
    }
  });

  if (els.recurringToggle) {
    els.recurringToggle.addEventListener('change', syncRecurringCreateUi);
  }

  if (els.seriesEndType) {
    els.seriesEndType.addEventListener('change', syncRecurringCreateUi);
  }

  document.getElementById('eventPricingMode')?.addEventListener('change', () => syncPricingModeUi('event'));
  document.getElementById('editPricingMode')?.addEventListener('change', () => syncPricingModeUi('edit'));
  els.createEventForm?.addEventListener('input', () => {
    syncAdminEventFormProgress();
  });
  els.createEventForm?.addEventListener('change', () => {
    syncAdminEventFormProgress();
  });

  syncRecurringCreateUi();

  els.refreshAdminEventsBtn.addEventListener('click', loadAdminEvents);

  els.statusButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.selectedAdminEvent) {
        showMessage('Előbb válassz eseményt.', 'error');
        return;
      }
      await changeEventStatus(state.selectedAdminEvent.id, btn.dataset.statusBtn);
    });
  });

  els.userTeamForm.addEventListener('submit', async event => {
    event.preventDefault();
    await loadUserEvents();
  });

  els.useSavedUserTeamBtn.addEventListener('click', async () => {
    if (!state.currentTeamId) {
      showMessage('Nincs mentett csapat ID.', 'error');
      return;
    }
    els.userTeamIdInput.value = state.currentTeamId;
    await loadUserEvents();
  });

  els.refreshUserEventsBtn.addEventListener('click', loadUserEvents);

  if (els.refreshMyInvitesBtn) {
    els.refreshMyInvitesBtn.addEventListener('click', loadMyInvites);
  }
}

ensureAuthShell();
ensureEventPricingUi();
bindEvents();
resetNotificationPreferencesForm();
document.querySelectorAll('[data-notification-pref]').forEach(input => {
  input.addEventListener('change', syncNotificationPreferenceCards);
});
bootSession();
updateSessionUi();
ensureCountdownTicker();
refreshLiveCountdowns(document);

