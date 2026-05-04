/** @jest-environment node */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function createJsonResponse(body, init = {}) {
  const status = init.status || 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type'
          ? 'application/json'
          : null;
      }
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

async function bootFrontend() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });

  const { window } = dom;
  const fetchMock = jest.fn(async (url) => {
    const target = String(url);

    if (target.includes('/version')) {
      return createJsonResponse({
        version: {
          name: 'Foci App',
          version: '1.0.0',
          commit: 'abc1234',
          environment: 'test',
          builtAt: '2026-05-01T20:40:00.000Z',
          startedAt: '2026-05-01T20:45:00.000Z'
        }
      });
    }

    if (target.includes('/auth/google/config')) {
      return createJsonResponse({ enabled: false, clientId: null });
    }

    if (target.includes('/auth/me')) {
      return createJsonResponse({ user: null }, { status: 401, ok: false });
    }

    return createJsonResponse({});
  });

  Object.assign(window, {
    fetch: fetchMock,
    confirm: jest.fn(() => true),
    alert: jest.fn(),
    scrollTo: jest.fn(),
    google: {
      accounts: {
        id: {
          initialize: jest.fn(),
          renderButton: jest.fn()
        }
      }
    }
  });

  window.setInterval = jest.fn(() => 1);
  window.clearInterval = jest.fn();
  window.setTimeout = jest.fn(() => 1);
  window.clearTimeout = jest.fn();

  class MockFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,AAA=';
      if (typeof this.onload === 'function') {
        this.onload({ target: { result: this.result } });
      }
    }
  }

  window.FileReader = MockFileReader;

  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(script, dom.getInternalVMContext());
  await flushMicrotasks();

  return { dom, window, document: window.document, fetchMock };
}

describe('Frontend auth UI smoke tests', () => {
  test('guest nézetben csak a login panel látszik és a profilfiók rejtve marad', async () => {
    const { document } = await bootFrontend();

    const authView = document.getElementById('authView');
    const loginPanel = document.getElementById('loginPanel');
    const registerPanel = document.getElementById('registerPanel');
    const profilePanel = document.getElementById('profilePanel');
    const sidebar = document.querySelector('.sidebar');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');

    expect(authView).toBeTruthy();
    expect(authView.style.display).toBe('flex');
    expect(authView.style.justifyContent).toBe('center');
    expect(authView.style.alignItems).toBe('flex-start');
    expect(sidebar.style.display).toBe('none');

    expect(document.getElementById('profileDrawer')).toBeNull();
    expect(profilePanel.hidden).toBe(true);
    expect(profilePanel.style.display).toBe('none');
    expect(profilePanel.parentElement).toBe(sidebar);

    expect(loginPanel.classList.contains('hidden')).toBe(false);
    expect(loginPanel.style.display).toBe('flex');
    expect(registerPanel.classList.contains('hidden')).toBe(true);
    expect(registerPanel.style.display).toBe('none');

    expect(loginEmail.disabled).toBe(false);
    expect(loginPassword.disabled).toBe(false);
    loginEmail.value = 'teszt@example.com';
    loginPassword.value = 'titok123';
    expect(loginEmail.value).toBe('teszt@example.com');
    expect(loginPassword.value).toBe('titok123');
  });

  test('a verzióinformáció megjelenik a login képernyőn és a sidebar alján', async () => {
    const { document } = await bootFrontend();

    const authVersionInfo = document.getElementById('authVersionInfo');
    const sidebarVersionInfo = document.getElementById('sidebarVersionInfo');

    expect(authVersionInfo).toBeTruthy();
    expect(sidebarVersionInfo).toBeTruthy();
    expect(authVersionInfo.textContent).toContain('Verzió: 1.0.0');
    expect(authVersionInfo.textContent).toContain('Commit: abc1234');
    expect(sidebarVersionInfo.textContent).toContain('Környezet: test');
  });

  test('egy kattintással át lehet váltani regisztrációra és vissza', async () => {
    const { window, document } = await bootFrontend();

    const toRegisterBtn = document.querySelector('[data-auth-mode-switch="register"]');
    const toLoginBtn = document.querySelector('[data-auth-mode-switch="login"]');
    const loginPanel = document.getElementById('loginPanel');
    const registerPanel = document.getElementById('registerPanel');

    expect(toRegisterBtn).toBeTruthy();
    expect(toLoginBtn).toBeTruthy();

    toRegisterBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(loginPanel.classList.contains('hidden')).toBe(true);
    expect(loginPanel.style.display).toBe('none');
    expect(registerPanel.classList.contains('hidden')).toBe(false);
    expect(registerPanel.style.display).toBe('flex');
    expect(registerPanel.querySelector('.auth-card-head')).toBeTruthy();
    expect(document.getElementById('authCardTitle')?.textContent).toBe('Regisztráció');
    expect(document.getElementById('authModeLoginBtn')).toBeTruthy();
    expect(document.getElementById('authModeRegisterBtn')).toBeTruthy();

    toLoginBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(loginPanel.classList.contains('hidden')).toBe(false);
    expect(loginPanel.style.display).toBe('flex');
    expect(registerPanel.classList.contains('hidden')).toBe(true);
    expect(registerPanel.style.display).toBe('none');
    expect(loginPanel.querySelector('.auth-card-head')).toBeTruthy();
    expect(document.getElementById('authCardTitle')?.textContent).toBe('Bejelentkezés');
  });

  test('a regisztrációs nézetben megjelenik az új belépési útvonal választó', async () => {
    const { window, document } = await bootFrontend();

    window.setAuthMode('register');

    const chooser = document.getElementById('registrationPathChooser');
    const options = [...document.querySelectorAll('.auth-path-panel')];
    const details = document.getElementById('registerFormDetails');

    expect(chooser).toBeTruthy();
    expect(options.map(option => option.dataset.registrationPath)).toEqual([
      'tournament_organizer',
      'team_sport_organizer',
      'activity_organizer',
      'invited_participant'
    ]);
    expect(details.hidden).toBe(true);

    options[0].querySelector('.auth-path-trigger').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(details.hidden).toBe(false);
    expect(options[0].classList.contains('is-active')).toBe(true);
  });

  test('a regisztráció elküldi a választott registrationPath értéket', async () => {
    const { window, document, fetchMock } = await bootFrontend();

    fetchMock.mockImplementation(async (url) => {
      const target = String(url);

      if (target.includes('/auth/register')) {
        return createJsonResponse({
          ok: true,
          message: 'Sikeres regisztráció.',
          token: 'demo-token',
          user: {
            id: 'user-1',
            name: 'Tournament User',
            email: 'tournament@example.com',
            can_create_team: true,
            registration_path: 'tournament_organizer'
          }
        }, { status: 201 });
      }

      if (target.includes('/version')) {
        return createJsonResponse({
          version: {
            name: 'Foci App',
            version: '1.0.0',
            commit: 'abc1234',
            environment: 'test',
            builtAt: '2026-05-01T20:40:00.000Z',
            startedAt: '2026-05-01T20:45:00.000Z'
          }
        });
      }

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/auth/me')) {
        return createJsonResponse({ user: null }, { status: 401, ok: false });
      }

      if (target.includes('/my/')) {
        return createJsonResponse({ teams: [], events: [], invites: [] });
      }

      if (target.includes('/platform/summary')) {
        return createJsonResponse({ ok: true, summary: null });
      }

      return createJsonResponse({});
    });

    window.setAuthMode('register');

    document.getElementById('registerName').value = 'Tournament User';
    document.getElementById('registerEmail').value = 'tournament@example.com';
    document.getElementById('registerPassword').value = 'titok123';
    const tournamentCard = document.querySelector('.auth-path-panel[data-registration-path="tournament_organizer"] .auth-path-trigger');
    tournamentCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    document.getElementById('registerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const registerCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/register'));
    expect(registerCall).toBeTruthy();
    const payload = JSON.parse(registerCall[1].body);
    expect(payload.registrationPath).toBe('tournament_organizer');
    expect(payload.registerAsOrganizer).toBe(true);
  });

  test('a profil a sidebarban jelenik meg belépés után, és kijelentkezve eltűnik', async () => {
    const { window, document } = await bootFrontend();

    expect(typeof window.setAuth).toBe('function');
    expect(typeof window.switchView).toBe('function');

    window.setAuth('demo-token', {
      id: 'user-1',
      name: 'Peter',
      nickname: 'Peti',
      email: 'peter@example.com'
    });

    window.switchView('userView');
    await flushMicrotasks();

    const profilePanel = document.getElementById('profilePanel');
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const appShell = document.querySelector('.app-shell');
    expect(document.getElementById('profileDrawer')).toBeNull();
    expect(profilePanel.hidden).toBe(false);
    expect(profilePanel.parentElement).toBe(sidebar);
    expect(sidebarToggle).toBeTruthy();
    expect(sidebarToggle.hidden).toBe(false);
    expect(sidebar.style.display).toBe('flex');
    expect(appShell.classList.contains('sidebar-collapsed')).toBe(false);

    sidebarToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(appShell.classList.contains('sidebar-collapsed')).toBe(true);

    sidebarToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(appShell.classList.contains('sidebar-collapsed')).toBe(false);

    window.clearAuth();
    window.switchView('authView');
    expect(profilePanel.hidden).toBe(true);
    expect(profilePanel.style.display).toBe('none');
    expect(sidebarToggle.hidden).toBe(true);
  });

  test('az admin meghívólistában megjelenik az email küldési állapot', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.teamInvites = [{
        id: 'invite-1',
        invited_email: 'jatekos@example.com',
        role: 'member',
        status: 'pending',
        invited_by_name: 'Ricsi',
        expires_at: '2026-05-10T18:00:00.000Z',
        invite_code: 'ABC123',
        invite_link: '/?invite=token-1',
        message: 'Gyere focizni',
        email_delivery_status: 'failed',
        email_delivery_reason: 'send_failed',
        email_delivery_error: 'SMTP timeout',
        email_delivery_updated_at: '2026-05-02T09:15:00.000Z'
      }];
      renderTeamInvitesAdmin(state.teamInvites);
    `);

    const inviteList = document.getElementById('teamInvitesAdminList');
    expect(inviteList.textContent).toContain('Email állapot');
    expect(inviteList.textContent).toContain('email hiba');
    expect(inviteList.textContent).toContain('send_failed');
    expect(inviteList.textContent).toContain('SMTP timeout');
  });

  test('a meghívó űrlap elküldi a kitöltött email címet az API-nak', async () => {
    const { window, document, fetchMock } = await bootFrontend();

    fetchMock.mockImplementation(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/version')) {
        return createJsonResponse({
          version: {
            name: 'Foci App',
            version: '1.0.0',
            commit: 'abc1234',
            environment: 'test',
            builtAt: '2026-05-01T20:40:00.000Z',
            startedAt: '2026-05-01T20:45:00.000Z'
          }
        });
      }

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/auth/me')) {
        return createJsonResponse({ user: null }, { status: 401, ok: false });
      }

      if (target.includes('/teams/team-1/invites')) {
        return createJsonResponse({
          ok: true,
          message: 'Meghívó sikeresen létrehozva.',
          invite: {
            id: 'invite-1',
            invited_email: 'teszt@example.com',
            status: 'pending'
          },
          emailDelivery: {
            status: 'skipped',
            reason: 'not_configured'
          }
        });
      }

      if (target.includes('/my/invites')) {
        return createJsonResponse({ invites: [] });
      }

      return createJsonResponse({});
    });

    window.eval(`
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.user = { id: 'u1', name: 'Ricsi', email: 'ricsi@example.com' };
      state.token = 'token-1';
      applyRoleAwareUi();
    `);

    const inviteEmail = document.getElementById('inviteEmail');
    const inviteRole = document.getElementById('inviteRole');
    const inviteMessage = document.getElementById('inviteMessage');
    const form = document.getElementById('createInviteForm');

    inviteEmail.value = 'teszt@example.com';
    inviteRole.value = 'member';
    inviteMessage.value = 'Gyere';

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const inviteCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/teams/team-1/invites'));
    expect(inviteCall).toBeTruthy();
    const payload = JSON.parse(inviteCall[1].body);
    expect(payload.email).toBe('teszt@example.com');
    expect(payload.role).toBe('member');
    expect(payload.message).toBe('Gyere');
  });

  test('a meghívó űrlap üres emaillel nem indít API hívást', async () => {
    const { window, document, fetchMock } = await bootFrontend();

    window.eval(`
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.user = { id: 'u1', name: 'Ricsi', email: 'ricsi@example.com' };
      state.token = 'token-1';
      applyRoleAwareUi();
    `);

    const form = document.getElementById('createInviteForm');
    const inviteRole = document.getElementById('inviteRole');
    inviteRole.value = 'member';

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const inviteCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/teams/team-1/invites'));
    expect(inviteCall).toBeUndefined();
    expect(document.getElementById('sidebarMessage')?.textContent || '').toContain('email');
  });

  test('a függő meghívás kártyája kiemelve jelenik meg, ha van aktív meghívás', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.myInvites = [{
        id: 'invite-1',
        status: 'pending',
        team_id: 'team-1',
        team_name: 'Teszt FC'
      }];
      state.myTeams = [];
      state.myEvents = [];
      state.userInvitePulseUntil = Date.now() + 5000;
      renderUserOverview();
    `);

    const inviteCard = document.querySelector('[data-user-overview-action="pending-invites"]');
    expect(inviteCard).toBeTruthy();
    expect(inviteCard.textContent).toContain('Függő meghívás');
    expect(inviteCard.textContent).toContain('1');
    expect(inviteCard.textContent).toContain('Kattints az elfogadáshoz');
    expect(inviteCard.classList.contains('user-invite-alert-card')).toBe(true);
    expect(inviteCard.classList.contains('is-pulsing')).toBe(true);
  });

  test('a függő meghívás kártyára kattintva a meghíváslistához ugrik', async () => {
    const { window, document } = await bootFrontend();
    const inviteList = document.getElementById('myInvitesList');
    inviteList.scrollIntoView = jest.fn();

    window.eval(`
      state.myInvites = [{
        id: 'invite-1',
        status: 'pending',
        team_id: 'team-1',
        team_name: 'Teszt FC'
      }];
      state.myTeams = [];
      state.myEvents = [];
      renderMyInvites(state.myInvites);
      renderUserOverview();
    `);

    const inviteCard = document.querySelector('[data-user-overview-action="pending-invites"]');
    const acceptButton = inviteList.querySelector('[data-my-invite-action="accept"]');
    acceptButton.focus = jest.fn();
    inviteCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(inviteList.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(inviteList.closest('.card').classList.contains('invite-jump-highlight')).toBe(true);
    expect(acceptButton.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  test('az új esemény kártya mutatja a még nem reagált eseményeket és kiemelhető', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'user-1' };
      state.myInvites = [];
      state.myTeams = [{ id: 'team-1', membership_status: 'active' }];
      state.myEvents = [{
        id: 'event-1',
        title: 'Új pénteki foci',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        my_registration_status: null,
        my_cancelled_count: 0,
        is_registration_open: true
      }];
      state.userNewEventsPulseUntil = Date.now() + 5000;
      renderUserOverview();
    `);

    const newEventCard = document.querySelector('[data-user-overview-action="new-events"]');
    expect(newEventCard).toBeTruthy();
    expect(newEventCard.textContent).toContain('Új esemény');
    expect(newEventCard.textContent).toContain('1');
    expect(newEventCard.textContent).toContain('Kattints a legközelebbi új eseményhez');
    expect(newEventCard.classList.contains('user-invite-alert-card')).toBe(true);
    expect(newEventCard.classList.contains('is-pulsing')).toBe(true);
  });

  test('kijelentkez?s ut?n a regisztr?ci?s email mez? ki?r?l ?s szerkeszthet? marad', async () => {
    const { window, document } = await bootFrontend();

    const registerEmail = document.getElementById('registerEmail');
    const registerPhone = document.getElementById('registerPhone');
    const registerInviteToken = document.getElementById('registerInviteToken');
    const invitedParticipantCard = document.querySelector('.auth-path-panel[data-registration-path="invited_participant"] .auth-path-trigger');

    registerEmail.value = 'akos@example.com';
    registerEmail.disabled = true;
    registerEmail.readOnly = true;
    registerPhone.value = '+36123456789';
    registerInviteToken.value = 'invite-token';
    invitedParticipantCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    window.clearAuth();
    window.setAuthMode('register');

    expect(registerEmail.value).toBe('');
    expect(registerEmail.disabled).toBe(false);
    expect(registerEmail.readOnly).toBe(false);
    registerEmail.value = 'uj@example.com';
    expect(registerEmail.value).toBe('uj@example.com');
    expect(registerPhone.value).toBe('');
    expect(document.querySelector('.auth-path-panel.is-active')).toBeNull();
    expect(registerInviteToken.value).toBe('invite-token');
  });

  test('a csapat munkat?r alapb?l a megh?v?sok f?lre v?lt, ha m?g alakul a keret', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'admin-1',
        name: 'Captain',
        membership_status: 'active'
      }];
      state.teamInvites = [];
      state.adminEvents = [];
      setAdminWorkspace('team');
    `);

    expect(document.querySelector('[data-admin-team-section="invites"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-admin-team-panel="invites"]').hidden).toBe(false);
  });

  test('a csapat munkat?r a halad? be?ll?t?sok f?lre v?lt, ha m?r vannak tagok, de m?g kapus vagy leoszt?s hi?nyzik', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Player', membership_status: 'active', is_goalkeeper: false }
      ];
      state.teamInvites = [];
      state.adminEvents = [{
        id: 'event-1',
        title: 'Teszt meccs',
        status: 'published',
        event_readiness: 'published'
      }];
      setAdminWorkspace('team');
    `);

    expect(document.querySelector('[data-admin-team-section="advanced"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-admin-team-panel="advanced"]').hidden).toBe(false);
  });

  test('a csapat munkatér a csapatsorsolás fülre vált, ha már van kapus és kijelölt esemény', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Kapus 2', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-3', name: 'Player', membership_status: 'active', is_goalkeeper: false }
      ];
      state.teamInvites = [];
      state.adminEvents = [{
        id: 'event-1',
        title: 'Teszt meccs',
        status: 'published',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        event_readiness: 'published'
      }];
      state.selectedAdminEvent = state.adminEvents[0];
      setAdminWorkspace('team');
    `);

    expect(document.querySelector('[data-admin-team-section="draw"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-admin-team-panel="draw"]').hidden).toBe(false);
  });
  test('csak szervezoi flaggel latszik az admin starter, es ez nem fugg a csapatlistatol', async () => {
    const firstBoot = await bootFrontend();
    firstBoot.window.setAuth('demo-token-a', {
      id: 'user-no-team-member',
      name: 'Member Only',
      email: 'member@example.com',
      can_create_team: false
    });

    expect(firstBoot.document.querySelector('[data-view="adminView"]').style.display).toBe('none');

    const secondBoot = await bootFrontend();
    secondBoot.window.setAuth('demo-token-b', {
      id: 'user-organizer',
      name: 'Organizer',
      email: 'organizer@example.com',
      can_create_team: true
    });

    expect(secondBoot.document.querySelector('[data-view="adminView"]').style.display).not.toBe('none');
    secondBoot.window.eval(`
      state.myTeams = [{ id: 'team-1', role: 'member' }];
      applyRoleAwareUi();
    `);
    expect(secondBoot.document.querySelector('[data-view="adminView"]').style.display).not.toBe('none');
  });

  test('a tornaszervezo kulon munkateret kap, es nem a csapatsport adminba esik vissza', async () => {
    const { window, document } = await bootFrontend();

    window.setAuth('tournament-token', {
      id: 'user-tournament',
      name: 'Tornaszervező',
      email: 'tournament@example.com',
      can_create_team: true,
      registration_path: 'tournament_organizer'
    });

    window.switchView('tournamentView');

    expect(document.querySelector('[data-view="tournamentView"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-view="adminView"]').style.display).toBe('none');
    expect(document.getElementById('tournamentView').hidden).toBe(false);
    expect(document.getElementById('tournamentView').classList.contains('active')).toBe(true);
    expect(document.getElementById('adminView').hidden).toBe(true);
    expect(document.getElementById('tournamentHomeContent').textContent).toContain('tornaszervezői munkatér');
  });

  test('a tornaszervezo el tudja menteni a torna alapjait a sajat munkateren', async () => {
    const { window, document } = await bootFrontend();

    window.setAuth('tournament-token', {
      id: 'user-tournament-save',
      name: 'Tornaszervező',
      email: 'tournament-save@example.com',
      can_create_team: true,
      registration_path: 'tournament_organizer'
    });
    window.switchView('tournamentView');

    document.querySelector('[data-tournament-workspace="tournaments"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    const form = document.getElementById('tournamentSetupForm');
    expect(form).toBeTruthy();

    document.getElementById('tournamentTitle').value = 'Tavaszi Városi Kupa';
    document.getElementById('tournamentLocationName').value = 'Vasas pálya';
    document.getElementById('tournamentTeamCount').value = '16';
    document.getElementById('tournamentFieldCount').value = '2';
    document.getElementById('tournamentMatchDuration').value = '18';
    document.getElementById('tournamentStartDate').value = '2026-05-24T09:00';
    document.getElementById('tournamentFormatHint').value = 'group_knockout';
    document.getElementById('tournamentNotes').value = 'Két pályán párhuzamos lebonyolítás.';

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const savedRaw = window.localStorage.getItem('foci_tournament_setup_user-tournament-save');
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw);
    expect(saved.title).toBe('Tavaszi Városi Kupa');
    expect(saved.locationName).toBe('Vasas pálya');
    expect(saved.teamCount).toBe(16);
    expect(saved.fieldCount).toBe(2);
    expect(saved.matchDurationMinutes).toBe(18);
    expect(document.getElementById('tournamentWorkspaceSummary').textContent).toContain('Tavaszi Városi Kupa');
  });

  test('login utan az auth/me alapjan is admin starterre valt, ha a login valaszban hianyzik a flag', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      runScripts: 'outside-only'
    });

    const { window } = dom;
    const fetchMock = jest.fn(async (url, init = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/auth/login')) {
        return createJsonResponse({
          ok: true,
          token: 'demo-token',
          user: {
            id: 'user-login',
            name: 'Fülöp',
            email: 'fulopmatyi@example.com',
            platform_role: 'user'
          }
        });
      }

      if (target.includes('/auth/me')) {
        return createJsonResponse({
          ok: true,
          user: {
            id: 'user-login',
            name: 'Fülöp',
            email: 'fulopmatyi@example.com',
            platform_role: 'user',
            can_create_team: true
          }
        });
      }

      if (target.includes('/my/teams')) return createJsonResponse({ ok: true, teams: [], count: 0 });
      if (target.includes('/my/events')) return createJsonResponse({ ok: true, events: [], count: 0 });
      if (target.includes('/my/invites')) return createJsonResponse({ ok: true, invites: [], count: 0 });
      if (target.includes('/my/platform-summary')) {
        return createJsonResponse({ ok: true, counts: {}, recent_teams: [], recent_events: [] });
      }

      return createJsonResponse({});
    });

    Object.assign(window, {
      fetch: fetchMock,
      confirm: jest.fn(() => true),
      alert: jest.fn(),
      scrollTo: jest.fn(),
      google: {
        accounts: {
          id: {
            initialize: jest.fn(),
            renderButton: jest.fn()
          }
        }
      }
    });

    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    window.setTimeout = jest.fn(() => 1);
    window.clearTimeout = jest.fn();

    class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,AAA=';
        if (typeof this.onload === 'function') {
          this.onload({ target: { result: this.result } });
        }
      }
    }

    window.FileReader = MockFileReader;

    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    vm.runInContext(script, dom.getInternalVMContext());

    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }

    window.document.getElementById('loginEmail').value = 'fulopmatyi@example.com';
    window.document.getElementById('loginPassword').value = 'teszt123';
    window.document.getElementById('loginForm').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    for (let i = 0; i < 120; i += 1) {
      await Promise.resolve();
    }

    expect(window.document.getElementById('adminView').classList.contains('active')).toBe(true);
    expect(window.document.querySelector('[data-view="adminView"]').style.display).not.toBe('none');
  });

  test('login utan a tournament_organizer nem az admin starterre, hanem a tornaszervezoi shellre erkezik', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      runScripts: 'outside-only'
    });

    const { window } = dom;
    const fetchMock = jest.fn(async (url) => {
      const target = String(url);

      if (target.includes('/version')) {
        return createJsonResponse({
          version: {
            name: 'Foci App',
            version: '1.0.0',
            commit: 'abc1234',
            environment: 'test',
            builtAt: '2026-05-01T20:40:00.000Z',
            startedAt: '2026-05-01T20:45:00.000Z'
          }
        });
      }

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/auth/login')) {
        return createJsonResponse({
          ok: true,
          token: 'demo-token',
          user: {
            id: 'user-login',
            name: 'Tornagazda',
            email: 'tornagazda@example.com',
            platform_role: 'user',
            registration_path: 'tournament_organizer'
          }
        });
      }

      if (target.includes('/auth/me')) {
        return createJsonResponse({
          ok: true,
          user: {
            id: 'user-login',
            name: 'Tornagazda',
            email: 'tornagazda@example.com',
            platform_role: 'user',
            can_create_team: true,
            registration_path: 'tournament_organizer'
          }
        });
      }

      if (target.includes('/my/teams')) return createJsonResponse({ ok: true, teams: [], count: 0 });
      if (target.includes('/my/events')) return createJsonResponse({ ok: true, events: [], count: 0 });
      if (target.includes('/my/invites')) return createJsonResponse({ ok: true, invites: [], count: 0 });
      if (target.includes('/my/platform-summary')) {
        return createJsonResponse({ ok: true, counts: {}, recent_teams: [], recent_events: [] });
      }

      return createJsonResponse({});
    });

    Object.assign(window, {
      fetch: fetchMock,
      confirm: jest.fn(() => true),
      alert: jest.fn(),
      scrollTo: jest.fn(),
      google: {
        accounts: {
          id: {
            initialize: jest.fn(),
            renderButton: jest.fn()
          }
        }
      }
    });

    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    window.setTimeout = jest.fn(() => 1);
    window.clearTimeout = jest.fn();

    class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,AAA=';
        if (typeof this.onload === 'function') {
          this.onload({ target: { result: this.result } });
        }
      }
    }

    window.FileReader = MockFileReader;

    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    vm.runInContext(script, dom.getInternalVMContext());

    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }

    window.document.getElementById('loginEmail').value = 'tornagazda@example.com';
    window.document.getElementById('loginPassword').value = 'teszt123';
    window.document.getElementById('loginForm').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    for (let i = 0; i < 120; i += 1) {
      await Promise.resolve();
    }

    expect(window.document.getElementById('tournamentView').classList.contains('active')).toBe(true);
    expect(window.document.querySelector('[data-view="tournamentView"]').style.display).not.toBe('none');
    expect(window.document.querySelector('[data-view="adminView"]').style.display).toBe('none');
  });

  test.skip('a m?ltbeli published esem?ny a megval?sult csoportba ker?l admin oldalon', async () => {
    const { window, document } = await bootFrontend();

    const now = Date.now();
    const futureIso = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
    const pastIso = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.adminHideHiddenEvents = true;
      renderAdminEvents([
        {
          id: 'evt-future',
          title: 'JA�vL'beli publik?lt',
          status: 'published',
          start_at: '${futureIso}',
          location_name: 'Teszt p?lya',
          going_count: 8,
          waiting_count: 1,
          event_readiness: 'open'
        },
        {
          id: 'evt-past-published',
          title: 'Elmúlt publikált',
          status: 'published',
          start_at: '${pastIso}',
          location_name: 'Régi pálya',
          going_count: 10,
          waiting_count: 0,
          event_readiness: 'open'
        },
        {
          id: 'evt-finished',
          title: 'Ténylegesen lezárt',
          status: 'finished',
          start_at: '${pastIso}',
          location_name: 'Lezárt pálya',
          going_count: 10,
          waiting_count: 0,
          event_readiness: 'finished'
        }
      ]);
    `);

    const adminEventsList = document.getElementById('adminEventsList');
    const adminClosedEventsList = document.getElementById('adminClosedEventsList');
    const sections = [...adminEventsList.querySelectorAll('details.admin-collapse')];
    const closedSections = [...adminClosedEventsList.querySelectorAll('details.admin-collapse')];
    const finishedSectionResolved = () => closedSections[0] || sections.find(section => section.textContent?.includes('Elmúlt publikált'));
    const publishedSection = sections.find(section => section.querySelector('summary')?.textContent?.includes('Publikált események'));
    const finishedSection = sections.find(section => section.querySelector('summary')?.textContent?.includes('Lezárt események'));

    expect(publishedSection).toBeTruthy();
    expect(finishedSectionResolved()).toBeTruthy();
    expect(publishedSection.textContent).toContain('Jövőbeli publikált');
    expect(publishedSection.textContent).not.toContain('Elmúlt publikált');
    expect(finishedSectionResolved().textContent).toContain('Elmúlt publikált');
    expect(finishedSectionResolved().textContent).toContain('Ténylegesen lezárt');
    expect(finishedSectionResolved().innerHTML).toContain('megvalósult');
  });

  test.skip('a múltbeli, meg nem lezárt admin eseménynél megjelenik a no-show előkészítő blokk', async () => {
    const { window } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const html = window.eval(`
      state.selectedAdminEventDetail = {
        event: {
          id: 'evt-past',
          title: 'Elmúlt publikált',
          status: 'published',
          start_at: '${pastIso}'
        },
        registrations: {
          going: []
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 0
          }
        }
      };
      renderAdminAttendanceManager();
    `);

    expect(html).toContain('Jelenlét / no-show összesítő');
    expect(html).toContain('No-show jelölés');
    expect(html).toContain('Mind megjelent');
    expect(html).toContain('automatikusan lezárja');
  });

  test('a pénzügyi munkatér a selectedAdminEventDetail alapján kirajzolja a no-show blokkot', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.currentTeam = {
        id: 'team-1',
        name: 'Teszt FC',
        capabilities: {},
        cash_module_enabled: false
      };
      state.teamMembers = [];
      state.teamSkillSettings = null;
      state.selectedAdminEvent = null;
      state.selectedAdminEventDetail = {
        event: {
          id: 'evt-past',
          title: 'Lezárt meccs',
          status: 'finished',
          start_at: '${pastIso}',
          location_name: 'Teszt pálya'
        },
        registrations: {
          going: [{
            user_id: 'user-1',
            name: 'Játékos Egy',
            email: 'jatekos@example.com',
            attendance_status: null,
            attendance_payment_amount: null
          }]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            base_amount_per_person: 1200,
            per_player_fee: 100,
            final_amount_per_person: 1300
          }
        }
      };
      renderTeamSummary(state.currentTeam);
      renderAdminFinancePanel();
    `);

    const adminAttendanceContent = document.getElementById('adminAttendanceContent');
    expect(adminAttendanceContent.textContent).toContain('Kiválasztott esemény');
    expect(adminAttendanceContent.textContent).toContain('Lezárt meccs');
    expect(adminAttendanceContent.textContent).toContain('Jelenlét / no-show összesítő');
    expect(adminAttendanceContent.textContent).toContain('Mind megjelent');
    expect(adminAttendanceContent.textContent).toContain('Befizetés');
    expect(adminAttendanceContent.querySelector('.attendance-finance-card')).toBeTruthy();
    expect(adminAttendanceContent.innerHTML).toContain('value="1300"');
  });

  test('a pénzügyi panel a jelenléti hiányt emeli ki, ha még nincs minden going játékos jelölve', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.currentTeam = {
        id: 'team-1',
        name: 'Teszt FC',
        capabilities: {},
        cash_module_enabled: false
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'evt-open',
          title: 'Megvalosult meccs',
          status: 'published',
          start_at: '${pastIso}',
          location_name: 'Teszt p?lya'
        },
        registrations: {
          going: [{
            user_id: 'user-1',
            name: 'J?t?kos Egy',
            email: 'jatekos@example.com',
            attendance_status: null,
            attendance_payment_amount: null
          }]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            base_amount_per_person: 1200,
            per_player_fee: 100,
            final_amount_per_person: 1300
          },
          financeSummary: {
            expected_total_amount: 1300,
            actual_paid_total_amount: 0
          }
        }
      };
      renderAdminFinancePanel();
    `);

    const adminAttendanceContent = document.getElementById('adminAttendanceContent');
    expect(adminAttendanceContent.textContent).toContain('Most a jelenl');
    expect(adminAttendanceContent.querySelector('.finance-task-block.is-current')).toBeTruthy();
  });

  test('a pénzügyi panel a könyvelést emeli ki, ha a jelenlét már megvan, de az összeg eltér', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.currentTeam = {
        id: 'team-1',
        name: 'Teszt FC',
        capabilities: {},
        cash_module_enabled: false
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'evt-open',
          title: 'Megvalosult meccs',
          status: 'published',
          start_at: '${pastIso}',
          location_name: 'Teszt p?lya'
        },
        registrations: {
          going: [{
            user_id: 'user-1',
            name: 'J?t?kos Egy',
            email: 'jatekos@example.com',
            attendance_status: 'present',
            attendance_payment_amount: 1000
          }]
        },
        summary: {
          attendanceSummary: {
            presentCount: 1,
            noShowCount: 0,
            unmarkedCount: 0,
            totalPaidAmount: 1000
          },
          paymentSummary: {
            base_amount_per_person: 1200,
            per_player_fee: 100,
            final_amount_per_person: 1300,
            recorded_total_amount: 1000
          },
          financeSummary: {
            expected_total_amount: 1300,
            actual_paid_total_amount: 1000
          }
        }
      };
      renderAdminFinancePanel();
    `);

    const adminAttendanceContent = document.getElementById('adminAttendanceContent');
    expect(adminAttendanceContent.textContent).toContain('Most a befizet');
    expect(adminAttendanceContent.querySelectorAll('.finance-task-block.is-current').length).toBeGreaterThan(0);
  });

  test('a pénzügyi munkatér kassza blokkja a lezárt eseményeket összesített sorokkal jeleníti meg', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.currentTeam = {
        id: 'team-1',
        name: 'Teszt FC',
        capabilities: { canViewCashLedger: true },
        cash_module_enabled: false
      };
      state.teamMembers = [];
      state.teamSkillSettings = null;
      state.adminEvents = [{
        id: 'evt-ledger',
        title: 'Keddi focis fiuk',
        status: 'finished',
        start_at: '${pastIso}',
        location_name: 'Vasas',
        going_count: 2,
        payment_summary: {
          base_amount_per_person: 1200,
          per_player_fee: 100,
          final_amount_per_person: 1300
        },
        attendance_summary: {
          going_count_basis: 2,
          total_paid_amount: 2800
        }
      }];
      state.selectedAdminEvent = null;
      state.selectedAdminEventDetail = null;
      renderTeamSummary(state.currentTeam);
      renderAdminFinancePanel();
    `);

    const adminFinanceContent = document.getElementById('adminFinanceContent');
    expect(adminFinanceContent.textContent).toContain('Könyvelt lezárt események');
    expect(adminFinanceContent.textContent).toContain('Keddi focis fiuk');
    expect(adminFinanceContent.textContent).toContain('Vasas');
    expect(adminFinanceContent.textContent).toContain('Befolyt összesen');
    expect(adminFinanceContent.textContent).toContain('2800 Ft');
  });
  test('a rangmodul miatti jelentkezési korlátozás külön visszaszámlálós üzenetben látszik', async () => {
    const { window, document } = await bootFrontend();
    const openAtIso = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    window.eval(`
      renderUserEvents([{
        id: 'evt-rank-gate',
        title: 'Rangkapus esemény',
        status: 'published',
        start_at: '${openAtIso}',
        location_name: 'Teszt pálya',
        going_count: 8,
        spots_left: 2,
        is_registration_open: false,
        my_registration_status: null,
        registration_window: {
          offsetHours: 72,
          opensAt: '${openAtIso}',
          opensAtLabel: '2026. 04. 19. 18:00:00',
          isOpen: false,
          rankModuleEnabled: true,
          rankStatus: 'ranked',
          effectiveRankValue: 4,
          isRestrictedByRank: true,
          message: 'A csapatkapitány aktiválta a rangmodult.'
        }
      }]);
    `);

    const userEventsList = document.getElementById('userEventsList');
    expect(userEventsList.textContent).toContain('A rangmodul most még korlátozza a jelentkezésedet.');
    expect(userEventsList.textContent).toContain('A csapatkapitány aktiválta a rangmodult');
    expect(userEventsList.textContent).toContain('72 óra');
    expect(userEventsList.textContent).toContain('Hátralévő idő:');
    expect(userEventsList.querySelector('.rank-registration-notice')).toBeTruthy();
    expect(userEventsList.querySelector('.live-countdown')).toBeTruthy();
  });

  test('a következő esemény hero kártyában is megjelenik a rangkorlátozás oka', async () => {
    const { window, document } = await bootFrontend();
    const openAtIso = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    window.eval(`
      renderMyEvents([{
        id: 'evt-hero-rank-gate',
        title: 'Öröm foci',
        team_name: 'Keddi focis fiuk',
        status: 'published',
        start_at: '${openAtIso}',
        location_name: 'szentkorona általános iskola',
        location_address: '',
        my_registration_status: null,
        going_count: 5,
        waiting_count: 0,
        spots_left: 6,
        max_players: 11,
        event_readiness: 'open',
        registration_window: {
          offsetHours: 72,
          opensAt: '${openAtIso}',
          opensAtLabel: '2026. 04. 19. 18:00:00',
          isOpen: false,
          rankModuleEnabled: true,
          rankStatus: 'ranked',
          effectiveRankValue: 6,
          isRestrictedByRank: true,
          message: 'A csapatkapitány aktiválta a rangmodult.'
        }
      }]);
    `);

    const nextEventHero = document.getElementById('nextEventHero');
    expect(nextEventHero.textContent).toContain('A rangmodul most még korlátozza a jelentkezésedet.');
    expect(nextEventHero.textContent).toContain('A csapatkapitány aktiválta a rangmodult');
    expect(nextEventHero.textContent).toContain('72 óra');
    expect(nextEventHero.querySelector('.rank-registration-notice')).toBeTruthy();
    expect(nextEventHero.querySelector('.live-countdown')).toBeTruthy();
  });

  test('az új admin munkaterek közül egyszerre csak az aktív látszik', async () => {
    const { window, document } = await bootFrontend();

    window.setAuth('demo-admin-token', {
      id: 'admin-user',
      name: 'Admin',
      email: 'admin@example.com',
      can_create_team: true
    });
    window.switchView('adminView');

    const homePanel = document.querySelector('[data-admin-workspace-panel="home"]');
    const teamPanel = document.querySelector('[data-admin-workspace-panel="team"]');
    const financePanel = document.querySelector('[data-admin-workspace-panel="finance"]');

    expect(homePanel.hidden).toBe(false);
    expect(teamPanel.hidden).toBe(true);
    expect(financePanel.hidden).toBe(true);

    document.querySelector('[data-admin-workspace="finance"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(homePanel.hidden).toBe(true);
    expect(financePanel.hidden).toBe(false);

    document.querySelector('[data-admin-workspace="team"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(teamPanel.hidden).toBe(false);
    expect(financePanel.hidden).toBe(true);
  });

  test('a kezdolap onboarding szemelyre szabott, es a csapat nezett alnezetekre bonthato', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Asj csapat' };
      state.teamMembers = [{ user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapitány' }];
      state.teamInvites = [];
      state.adminEvents = [];
      renderAdminHome();
      setAdminWorkspace('team');
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Most ezzel foglalkozz');
    expect(adminHomeContent.textContent).toContain('Hívj meg játékosokat a csapatba.');

    const invitesPanel = document.querySelector('[data-admin-team-panel="invites"]');
    const membersPanel = document.querySelector('[data-admin-team-panel="members"]');
    expect(invitesPanel.hidden).toBe(false);
    expect(membersPanel.hidden).toBe(true);

    document.querySelector('[data-admin-team-section="members"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(invitesPanel.hidden).toBe(true);
    expect(membersPanel.hidden).toBe(false);
  });

  test('a csapat guide a helyzethez illő következő lépést mutatja', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true }
      ];
      state.teamInvites = [];
      renderTeamSummary(state.currentTeam);
    `);

    expect(document.getElementById('teamSummary').textContent).toContain('Most ezzel foglalkozz');
    expect(document.getElementById('teamSummary').textContent).toContain('Meghívások');

    window.eval(`
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Player', membership_status: 'active', is_goalkeeper: false }
      ];
      renderTeamSummary(state.currentTeam);
    `);

    expect(document.getElementById('teamSummary').textContent).toContain('Kapusok beállítása');
    expect(document.getElementById('teamSummary').textContent).toContain('Kapusok beállítása');

    window.eval(`
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Kapus 2', membership_status: 'active', is_goalkeeper: true }
      ];
      state.selectedAdminEvent = {
        id: 'evt-1',
        title: 'K?vetkez? foci',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        location_name: 'Teszt p?lya',
        status: 'published'
      };
      renderTeamSummary(state.currentTeam);
    `);

    expect(document.getElementById('teamSummary').textContent).toContain('Csapatsorsolás');
    expect(document.getElementById('teamSummary').textContent).toContain('Csapatsorsolás');
  });

  test('a csapat menü mutatja a készültséget és a következő fókuszt', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Player', membership_status: 'active', is_goalkeeper: false }
      ];
      state.teamInvites = [];
      state.adminEvents = [];
      renderTeamSummary(state.currentTeam);
      setAdminWorkspace('team');
    `);

    const progress = document.getElementById('adminTeamProgressSummary');
    expect(progress.textContent).toContain('Csapatépítési készültség');
    expect(progress.textContent).toContain('haladó beállítások');
    expect(document.querySelector('[data-admin-team-section="members"]').classList.contains('is-done')).toBe(true);
    expect(document.querySelector('[data-admin-team-section="advanced"]').classList.contains('is-current-focus')).toBe(true);
  });

  test('a csapat fókuszkártya gombja már ugrási célponttal nyitja a megfelelő részt', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'admin-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true }
      ];
      state.teamInvites = [];
      renderTeamSummary(state.currentTeam);
    `);

    const primaryButton = document.querySelector('#teamSummary [data-admin-workspace-jump]');
    expect(primaryButton).toBeTruthy();
    expect(primaryButton.dataset.adminWorkspaceJump).toBe('team');
    expect(primaryButton.dataset.adminSectionJump).toBe('invites');
    expect(primaryButton.dataset.adminFocusTarget).toBe('team-invites');
  });

  test('a csapat oldali vezérfonal a helyzetnek megfelelő lépést emeli ki és kattintható', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.teamMembers = [
        { user_id: 'captain-1', name: 'Captain', membership_status: 'active', is_goalkeeper: true },
        { user_id: 'user-2', name: 'Player', membership_status: 'active', is_goalkeeper: false }
      ];
      state.teamInvites = [];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Penteki meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location_name: 'Teszt p?lya'
      }];
      state.selectedAdminEvent = state.adminEvents[0];
      renderTeamSummary(state.currentTeam);
      setAdminWorkspace('team');
    `);

    const teamSummary = document.getElementById('teamSummary');
    expect(teamSummary.textContent).toContain('Most ezzel foglalkozz');
    expect(teamSummary.textContent).toContain('Itt tart a csapat');
    expect(teamSummary.textContent).toContain('Polcra tett csapatfolyamat');

    const flowShelf = [...teamSummary.querySelectorAll('details')].find(section =>
      section.textContent.includes('Polcra tett csapatfolyamat')
    );
    flowShelf.open = true;

    const focusStep = [...teamSummary.querySelectorAll('[data-admin-workspace-jump]')].find(button =>
      button.textContent.includes('3. Fókusz esemény')
    );
    focusStep.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('[data-admin-workspace-panel="events"]').hidden).toBe(false);
    expect(document.querySelector('[data-admin-events-panel="upcoming"]').hidden).toBe(false);
  });

  test('az új esemény mód gomb visszavált szerkesztésből a létrehozási flowba', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Szerkesztett meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }];
      state.selectedAdminEvent = state.adminEvents[0];
      state.selectedAdminEventDetail = { event: state.adminEvents[0], registrations: [] };
      setAdminWorkspace('events');
      setAdminEventsSection('closed');
      setAdminEventFormMode('edit', state.adminEvents[0]);
    `);

    const resetButton = document.querySelector('[data-admin-reset-event-form="true"]');
    expect(resetButton).toBeTruthy();

    resetButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(window.eval('state.adminEventFormMode')).toBe('create');
    expect(document.querySelector('[data-admin-events-panel="upcoming"]').hidden).toBe(false);
    expect(document.querySelector('[data-admin-events-panel="closed"]').hidden).toBe(true);
    expect(document.getElementById('adminEventFormMeta').textContent).toContain('Új esemény mód');
  });

  test('az admin esemény űrlap lépésenként váltható blokkokra van bontva', async () => {
    const { window, document } = await bootFrontend();

    const basicsPanel = document.querySelector('[data-admin-event-form-panel="basics"]');
    const logisticsPanel = document.querySelector('[data-admin-event-form-panel="logistics"]');
    const extrasPanel = document.querySelector('[data-admin-event-form-panel="extras"]');

    expect(document.getElementById('adminEventFormSectionNav').textContent).toContain('1. Alapok');
    expect(document.getElementById('adminEventFormSectionNav').textContent).toContain('2. Létszám és pálya');
    expect(document.getElementById('adminEventFormSectionNav').textContent).toContain('3. Speciális beállítások');
    expect(basicsPanel.hidden).toBe(false);
    expect(logisticsPanel.hidden).toBe(true);
    expect(extrasPanel.hidden).toBe(true);

    document.querySelector('[data-admin-event-form-section="extras"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(basicsPanel.hidden).toBe(true);
    expect(logisticsPanel.hidden).toBe(true);
    expect(extrasPanel.hidden).toBe(false);
    expect(extrasPanel.textContent).toContain('Speciális beállítások');
    expect(extrasPanel.textContent).toContain('Kassza');
  });

  test('az esemény létrehozás gomb csak az utolsó blokkon látszik, előtte tovább gomb vezet', async () => {
    const { window, document } = await bootFrontend();

    const nextButton = document.getElementById('adminEventNextStepBtn');
    const submitButton = document.getElementById('adminEventSubmitBtn');
    const basicsPanel = document.querySelector('[data-admin-event-form-panel="basics"]');
    const logisticsPanel = document.querySelector('[data-admin-event-form-panel="logistics"]');
    const extrasPanel = document.querySelector('[data-admin-event-form-panel="extras"]');

    expect(basicsPanel.hidden).toBe(false);
    expect(nextButton.classList.contains('hidden')).toBe(false);
    expect(nextButton.textContent).toContain('Létszám és pálya');
    expect(submitButton.classList.contains('hidden')).toBe(true);

    nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(logisticsPanel.hidden).toBe(false);
    expect(basicsPanel.hidden).toBe(true);
    expect(extrasPanel.hidden).toBe(true);
    expect(nextButton.textContent).toContain('Speciális beállítások');
    expect(submitButton.classList.contains('hidden')).toBe(true);

    nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(extrasPanel.hidden).toBe(false);
    expect(logisticsPanel.hidden).toBe(true);
    expect(nextButton.classList.contains('hidden')).toBe(true);
    expect(submitButton.classList.contains('hidden')).toBe(false);
  });

  test('az esemény űrlap mutatja a készültséget és a következő lépést', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      setAdminEventFormMode('create');
    `);

    document.getElementById('eventTitle').value = '';
    document.getElementById('eventStartAt').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventTitle').dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('eventStartAt').dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('eventLocation').dispatchEvent(new window.Event('input', { bubbles: true }));

    const summary = document.getElementById('adminEventFormProgressSummary');
    expect(summary.textContent).toContain('alapok blokk');

    document.getElementById('eventTitle').value = 'Penteki foci';
    document.getElementById('eventStartAt').value = '2026-04-24T18:30';
    document.getElementById('eventLocation').value = 'Vasas';
    document.getElementById('eventTitle').dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('eventStartAt').dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('eventLocation').dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(summary.textContent).toContain('létszám és pálya blokk');
    expect(document.querySelector('[data-admin-event-form-section="basics"]').classList.contains('is-done')).toBe(true);
  });

  test('új esemény módban az alapok blokk kapja az automatikus fókuszt', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      setAdminEventFormMode('create');
    `);

    expect(window.eval('state.adminEventFormSection')).toBe('basics');
    expect(document.querySelector('[data-admin-event-form-panel="basics"]').hidden).toBe(false);
    expect(document.querySelector('[data-admin-event-form-panel="logistics"]').hidden).toBe(true);
    expect(document.querySelector('[data-admin-event-form-panel="extras"]').hidden).toBe(true);
  });

  test('szerkesztésnél a speciális pénzügyi esemény az extrák blokkra áll', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.selectedAdminEvent = {
        id: 'evt-paid',
        title: 'Penteki premium foci',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location_name: 'Vasas',
        min_players: 10,
        players_on_field_total: 10,
        substitutes_enabled: true,
        substitutes_count: 2,
        rules_text: 'labda es mez',
        pricing_mode: 'fixed_per_person',
        fixed_price_per_person: 1800,
        per_player_fee: 200
      };
      setAdminEventFormMode('edit', state.selectedAdminEvent);
    `);

    expect(window.eval('state.adminEventFormSection')).toBe('extras');
    expect(document.querySelector('[data-admin-event-form-panel="basics"]').hidden).toBe(true);
    expect(document.querySelector('[data-admin-event-form-panel="extras"]').hidden).toBe(false);
    expect(document.querySelector('[data-admin-event-form-panel="extras"]').textContent).toContain('Kassza');
  });

  test('az események guide kártyái segítenek váltani a közelgő és megvalósult nézetek között', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapitány' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [{
        id: 'evt-future',
        title: 'Közelgő meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }, {
        id: 'evt-past',
        title: 'Lejátszott meccs',
        status: 'published',
        start_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }];
      setAdminWorkspace('events');
      setAdminEventsSection('upcoming');
      renderAdminEvents(state.adminEvents);
    `);

    const toClosedButton = [...document.querySelectorAll('[data-admin-events-section="closed"]')].find(button =>
      button.textContent.includes('Megvalósult események')
    );
    expect(toClosedButton).toBeTruthy();

    toClosedButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('[data-admin-events-panel="upcoming"]').hidden).toBe(true);
    expect(document.querySelector('[data-admin-events-panel="closed"]').hidden).toBe(false);
    expect(document.getElementById('adminEventEditorCard').hidden).toBe(true);
    expect(document.getElementById('adminClosedEventsList').textContent).toContain('Megvalósult esemény folyamata');
    expect(document.getElementById('adminClosedEventsList').textContent).toContain('4. Utómunka');
  });

  test('a pénzügy nézetben egyszerre csak az aktuális alfeladat látszik', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.adminEvents = [{
        id: 'evt-past',
        title: 'Lejátszott meccs',
        status: 'published',
        start_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }];
      state.selectedAdminEvent = state.adminEvents[0];
      state.selectedAdminEventDetail = { event: state.adminEvents[0], registrations: [] };
      setAdminWorkspace('finance');
      renderAdminFinancePanel();
    `);

    expect(document.getElementById('adminFinanceSettlementCard').hidden).toBe(false);
    expect(document.getElementById('adminFinanceBalancesCard').hidden).toBe(true);
    expect(document.getElementById('adminAttendanceContent').textContent).toContain('Elszámolási sorrend');
    expect(document.getElementById('adminAttendanceContent').textContent).toContain('Polcra tett elszámolási folyamat');
    expect(document.getElementById('adminAttendanceContent').textContent).toContain('3. Könyvelés');

    document.querySelector('[data-admin-finance-section="balances"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(document.getElementById('adminFinanceSettlementCard').hidden).toBe(true);
    expect(document.getElementById('adminFinanceBalancesCard').hidden).toBe(false);
    expect(document.getElementById('adminFinanceContent').textContent).toContain('Polcra tett pénzügyi háttér');
  });

  test('a pénzügy menü a következő fókuszt mutatja és a gombokat állapot szerint jelöli', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      const event = {
        id: 'evt-finished',
        title: 'Lezart meccs',
        status: 'finished',
        start_at: '${pastIso}',
        event_readiness: 'finished'
      };
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.adminEvents = [event];
      state.selectedAdminEvent = event;
      state.selectedAdminEventDetail = {
        event,
        registrations: { going: [] },
        summary: { paymentSummary: {}, financeSummary: {}, attendanceSummary: {} }
      };
      renderAdminFinancePanel();
      setAdminFinanceSection('balances');
    `);

    expect(document.getElementById('adminFinanceProgressSummary').textContent).toContain('Egyenlegek áttekintése');
    expect(document.getElementById('adminFinanceContent').textContent).toContain('Polcon még van pár pénzügyes út');
    expect(document.querySelector('[data-admin-finance-section="balances"]').classList.contains('is-current-focus')).toBe(true);
    expect(document.querySelector('[data-admin-finance-section="balances"]').classList.contains('is-done')).toBe(true);
  });

  test('a statisztikák nézetben csak a vezetői összkép marad elöl, a részletek polcra kerülnek', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.teamMembers = [
        {
          user_id: 'member-1',
          name: 'Ákos',
          email: 'akos@example.com',
          membership_status: 'active',
          role: 'member',
          stats_joined_count: 4,
          stats_cancelled_count: 1,
          stats_non_response_count: 0,
          stats_present_count: 3,
          stats_no_show_count: 0,
          stats_current_balance_amount: 0,
          stats_total_actual_paid_amount: 3000,
          stats_total_expected_amount: 3000,
          stats_finance_entry_count: 2
        },
        {
          user_id: 'member-2',
          name: 'Béla',
          email: 'bela@example.com',
          membership_status: 'active',
          role: 'member',
          stats_joined_count: 1,
          stats_cancelled_count: 0,
          stats_non_response_count: 3,
          stats_present_count: 0,
          stats_no_show_count: 1,
          stats_current_balance_amount: -1500,
          stats_total_actual_paid_amount: 0,
          stats_total_expected_amount: 1500,
          stats_finance_entry_count: 1
        }
      ];
      renderAdminStatisticsPanel();
    `);

    const statsText = document.getElementById('adminStatisticsContent').textContent;
    expect(statsText).toContain('Ez vezetői rálátás.');
    expect(statsText).toContain('Figyelmet igenyel');
    expect(statsText).toContain('Polcra tett rangkép');
    expect(statsText).toContain('Polcra tett jelenléti bontás');
    expect(statsText).toContain('Polcra tett pénzügyi bontás');
  });

  test('a csapatgenerálás preview a csapat nézetben azonnal látszik, ha már van eredmény', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.teamSkillSettings = {
        skill_balancing_enabled: true,
        skill_balance_tolerance_percent: 15,
        rank_module_enabled: true
      };
      state.selectedAdminEvent = {
        id: 'evt-1',
        title: 'Következő foci',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        location_name: 'Teszt pálya',
        status: 'published'
      };
      state.teamDrawPreview = {
        withinTolerance: true,
        totals: { teamA: 100, teamB: 100, difference: 0, differencePercent: 0 },
        settings: { generationMode: 'skill', skillBalancingEnabled: true },
        teamA: [{ name: 'A játékos', is_goalkeeper: true }],
        teamB: [{ name: 'B játékos', is_goalkeeper: true }]
      };
      renderTeamSummary(state.currentTeam);
    `);

    const teamDrawContent = document.getElementById('teamDrawContent');
    expect(teamDrawContent.textContent).toContain('Csapatsorsolás');
    expect(teamDrawContent.textContent).toContain('Csapatsorsolás preview');
    expect(teamDrawContent.textContent).toContain('Leosztás mentése');
  });

  test('a tagok panel megnyitásakor a belső lista is automatikusan lenyílik', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.teamRole = 'team_admin';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapitány', email: 'captain@example.com', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', email: 'tag2@example.com', is_goalkeeper: false }
      ];
      renderTeamMembersAdmin(state.teamMembers);
      setAdminTeamSection('members');
    `);

    const membersPanel = document.querySelector('[data-admin-team-panel="members"]');
    const membersDetails = membersPanel.querySelector('details');

    expect(membersPanel.hidden).toBe(false);
    expect(membersDetails.open).toBe(true);
  });

  test('több saját csapatnál a csapatkontextus dropdown név alapján tölti a választható csapatokat', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamId = 'team-2';
      state.myTeams = [
        { id: 'team-1', name: 'Rákospalotai Botláb FC', role: 'team_admin' },
        { id: 'team-2', name: 'Angyalföldi Zsiványok TC', role: 'team_admin' }
      ];
      syncTeamSelectors();
    `);

    const adminSelector = document.getElementById('teamIdInput');
    const userSelector = document.getElementById('userTeamIdInput');
    const adminOptions = [...adminSelector.querySelectorAll('option')].map(option => option.textContent.trim());

    expect(adminSelector.tagName).toBe('SELECT');
    expect(userSelector.tagName).toBe('SELECT');
    expect(adminOptions).toContain('Rákospalotai Botláb FC');
    expect(adminOptions).toContain('Angyalföldi Zsiványok TC');
    expect(adminSelector.value).toBe('team-2');
    expect(userSelector.value).toBe('team-2');
  });

  test.skip('a setup checklist továbblép publikált esemény, két kapus és csapatsorsolás után is', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapitány', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Publikált meccs',
        status: 'published',
        event_readiness: 'draw_published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('7/9');
    expect(adminHomeContent.textContent).toContain('Van publikált vagy már lezárt eseményed');
    expect(adminHomeContent.textContent).toContain('Kijelöltél legalább két kapust a csapatban');
    expect(adminHomeContent.textContent).toContain('Készült és menthető csapatsorsolás');
  });
  test('a múltbeli published esemény csak a megvalósult admin csoportban jelenik meg', async () => {
    const { window, document } = await bootFrontend();
    const now = Date.now();
    const futureIso = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
    const pastIso = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.adminHideHiddenEvents = true;
      renderAdminEvents([
        {
          id: 'evt-future',
          title: 'J?v?beli publik?lt',
          status: 'published',
          start_at: '${futureIso}',
          location_name: 'Teszt p?lya',
          going_count: 8,
          waiting_count: 1,
          event_readiness: 'open'
        },
        {
          id: 'evt-past-published',
          title: 'Elm?lt publik?lt',
          status: 'published',
          start_at: '${pastIso}',
          location_name: 'R?gi p?lya',
          going_count: 10,
          waiting_count: 0,
          event_readiness: 'open'
        },
        {
          id: 'evt-finished',
          title: 'Tenylegesen lezart',
          status: 'finished',
          start_at: '${pastIso}',
          location_name: 'Lez?rt p?lya',
          going_count: 10,
          waiting_count: 0,
          event_readiness: 'finished'
        }
      ]);
    `);

    const adminEventsList = document.getElementById('adminEventsList');
    const adminClosedEventsList = document.getElementById('adminClosedEventsList');
    const publishedSection = [...adminEventsList.querySelectorAll('details.admin-collapse')].find(section =>
      section.querySelector('summary')?.textContent?.includes('Publik')
    );
    const completedSection = [...adminClosedEventsList.querySelectorAll('details.admin-collapse')][0];

    expect(publishedSection).toBeTruthy();
    expect(completedSection).toBeTruthy();
    expect(publishedSection.textContent).toContain('J?v?beli publik?lt');
    expect(publishedSection.textContent).not.toContain('Elm?lt publik?lt');
    expect(completedSection.textContent).toContain('Elm?lt publik?lt');
    expect(completedSection.textContent).not.toContain('Tenylegesen lezart');
  });

  test('a setup checklist a publikált eseményt új szöveggel is elismeri', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Publik?lt meccs',
        status: 'published',
        event_readiness: 'draw_published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Itt tartasz most');
    expect(adminHomeContent.textContent).toContain('2/3 kész');
    expect(adminHomeContent.textContent).toContain('Közelgő esemény kész');
    expect(adminHomeContent.textContent).toContain('1 publikált esemény');
    expect(adminHomeContent.textContent).toContain('még nem jutottál el idáig');
  });

  test('a setup checklist a mentett csapatsorsol?st is elv?gzett l?p?sk?nt kezeli', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Publik?lt meccs',
        status: 'published',
        draw_status: 'saved',
        event_readiness: 'open',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('2/3 kész');
    expect(document.getElementById('adminHomeSummary').textContent).toContain('Polcra tett extra panelek');
  });

  test('az iránytű előbb a publikált állapotig terel, ha már van piszkozat esemény', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: false },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: false }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Piszkozat meccs',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Publik');
    expect(adminHomeContent.textContent).not.toContain('Jelölj ki legalább két kapust');
  });

  test('a kezdolap egyszeruen csak egyetlen haladasi blokkot mutat', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Piszkozat meccs',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      renderAdminHome();
    `);

    const progressCard = [...document.querySelectorAll('#adminHomeContent .admin-home-progress-card')];
    expect(progressCard).toHaveLength(1);
    expect(progressCard[0].querySelectorAll('.admin-home-progress-row')).toHaveLength(3);
  });

  test('az esemény workspace automatikusan a megvalósult panelre vált, ha már csak utómunka maradt', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.adminEvents = [{
        id: 'evt-past',
        title: 'Lejatszott meccs',
        status: 'published',
        start_at: '${pastIso}',
        location_name: 'Teszt p?lya'
      }];
      renderAdminEvents(state.adminEvents);
      setAdminWorkspace('events');
    `);

    expect(document.querySelector('[data-admin-events-panel="closed"]').hidden).toBe(false);
    expect(document.querySelector('[data-admin-events-panel="upcoming"]').hidden).toBe(true);
    expect(document.getElementById('adminClosedEventsList').textContent).toContain('megvalósult');
  });

  test('az esemény szerkesztői útmutató a publikálásra terel, ha csak piszkozat létezik', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.adminEvents = [{
        id: 'evt-draft',
        title: 'Piszkozat meccs',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }];
      state.adminEventFormMode = 'create';
      syncUnifiedAdminEventFormMode();
    `);

    expect(document.getElementById('selectedEventMeta').textContent).toContain('publikálás');
    expect(document.getElementById('selectedEventMeta').textContent).toContain('piszkozat');
  });

  test('piszkozat szerkesztésnél a publikáció a következő kiemelt akció', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      const draftEvent = {
        id: 'evt-draft',
        title: 'Piszkozat meccs',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      state.selectedAdminEvent = draftEvent;
      state.selectedAdminEventDetail = { event: draftEvent, registrations: { going: [] }, summary: {} };
      state.adminEventFormMode = 'edit';
      syncUnifiedAdminEventFormMode();
    `);

    expect(document.getElementById('adminEventSubmitBtn').textContent).toContain('Piszkozat mentése');
    expect(document.getElementById('selectedEventMeta').textContent).toContain('Publikálás most');
  });

  test('az esemény lista a piszkozat csoportot nyitja ki, ha most publikáció következik', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.adminHideHiddenEvents = true;
      renderAdminEvents([{
        id: 'evt-draft',
        title: 'Piszkozat meccs',
        status: 'draft',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location_name: 'Teszt p?lya',
        going_count: 0,
        waiting_count: 0
      }]);
    `);

    const sections = [...document.getElementById('adminEventsList').querySelectorAll('details.admin-collapse')];
    const draftSection = sections.find(section => section.querySelector('summary')?.textContent?.includes('Piszkozat események'));
    const publishedSection = sections.find(section => section.querySelector('summary')?.textContent?.includes('Publikált események'));

    expect(draftSection.open).toBe(true);
    expect(publishedSection.open).toBe(false);
    expect(document.getElementById('adminEventsList').textContent).toContain('Fókusz esemény');
  });

  test('a megvalósult esemény kártyán az utómunka akció jelenik meg', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.adminHideHiddenEvents = true;
      renderAdminEvents([{
        id: 'evt-past',
        title: 'Lejatszott meccs',
        status: 'published',
        start_at: '${pastIso}',
        location_name: 'Teszt p?lya',
        going_count: 10,
        waiting_count: 0
      }]);
    `);

    const closedText = document.getElementById('adminClosedEventsList').textContent;
    expect(closedText).toContain('Utómunka');
    expect(closedText).toContain('Most adminisztrálandó esemény');
  });

  test('az utómunka gomb a megvalósult esemény elszámolási nézetére ugrik', async () => {
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const fetchMock = jest.fn(async url => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/evt-past/team-draw')) {
        return createJsonResponse({ draw: null });
      }

      if (target.includes('/events/evt-past') && !target.includes('/team-draw')) {
        return createJsonResponse({
          event: {
            id: 'evt-past',
            title: 'Lejatszott meccs',
            status: 'published',
            start_at: pastIso,
            location_name: 'Teszt palya'
          },
          registrations: { going: [] },
          summary: {
            paymentSummary: {},
            financeSummary: {},
            attendanceSummary: { presentCount: 0, noShowCount: 0, unmarkedCount: 0, totalPaidAmount: 0 }
          }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.adminWorkspace = 'events';
      state.adminEvents = [{
        id: 'evt-past',
        title: 'Lejatszott meccs',
        status: 'published',
        start_at: '${pastIso}',
        location_name: 'Teszt palya',
        going_count: 10,
        waiting_count: 0
      }];
      renderAdminEvents(state.adminEvents);
    `);

    await window.eval(`handleAdminOpenAction('evt-past', { preferFinanceForClosed: true })`);
    await flushMicrotasks();

    expect(window.eval('state.adminWorkspace')).toBe('finance');
    expect(window.eval('state.adminFinanceSection')).toBe('settlement');
    expect(document.querySelector('[data-admin-workspace-panel="finance"]').hidden).toBe(false);
  });

  test('megvalósult esemény szerkesztésnél az elszámolás kerül előtérbe', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      const pastEvent = {
        id: 'evt-past',
        title: 'Lejatszott meccs',
        status: 'published',
        start_at: '${pastIso}'
      };
      state.selectedAdminEvent = pastEvent;
      state.selectedAdminEventDetail = {
        event: pastEvent,
        registrations: { going: [] },
        summary: { paymentSummary: {}, financeSummary: {} }
      };
      state.adminEventFormMode = 'edit';
      syncUnifiedAdminEventFormMode();
    `);

    expect(document.getElementById('adminEventSubmitBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('selectedEventMeta').textContent).toContain('Elszámolás megnyitása');
    expect(document.getElementById('adminEventFormMeta').textContent).toContain('Megvalósult esemény');
  });

  test('a setup checklist a megkezdett utómunkát is elismeri megvalósult eseménynél', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Megvalosult meccs',
        status: 'published',
        draw_status: 'published',
        event_readiness: 'open',
        start_at: '${pastIso}',
        attendance_summary: {
          present_count: 1,
          no_show_count: 0,
          unmarked_count: 0,
          total_paid_amount: 1300
        }
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('2/3 kész');
    expect(adminHomeContent.textContent).toContain('1 megvalósult esemény vár rád');
  });

  test('a kezdőlapi checklist újrarenderelődik, amikor később töltődnek be az admin események', async () => {
    const { window, document } = await bootFrontend({
      fetchMock: jest.fn(async url => {
        const target = String(url);
        if (target.includes('/auth/google/config')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ enabled: false, clientId: null }),
            text: async () => '{}'
          };
        }
        if (target.includes('/teams/team-1/events')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              events: [{
                id: 'evt-1',
                title: 'Elso meccs',
                status: 'published',
                start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                event_readiness: 'open'
              }]
            }),
            text: async () => '{}'
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({}),
          text: async () => '{}'
        };
      })
    });

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.token = 'demo-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamRole = 'team_admin';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Közelgő esemény kész');
    expect(adminHomeContent.textContent).toContain('még nincs esemény');

    window.eval(`
      state.adminEvents = [{
        id: 'evt-1',
        title: 'Elso meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }];
      renderAdminHome();
    `);

    expect(adminHomeContent.textContent).toContain('1 publikált esemény');
    expect(adminHomeContent.textContent).toContain('2/3 kész');
    expect(adminHomeContent.textContent).toContain('még nem jutottál el idáig');
  });

  test('a kezdőlapi fókusz állandóan látszik, és nincs külön bezárandó iránytű', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'F?kusz meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location_name: 'Teszt p?lya',
        going_count: 8,
        waiting_count: 2,
        event_readiness: 'open'
      }];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Fókusz esemény');
    expect(adminHomeContent.textContent).toContain('F?kusz meccs');
    expect(adminHomeContent.textContent).toContain('Most ezzel foglalkozz');
    expect(adminHomeContent.querySelector('[data-admin-home-dismiss]')).toBeNull();
  });

  test('a kezd?lapi ir?nyt? egy f? l?p?sre ?s legfeljebb k?t mell?k?tra sz?k?ti a figyelmet', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-1',
        title: 'K?vetkez? meccs',
        status: 'published',
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        event_readiness: 'open'
      }];
      renderAdminHome();
    `);

    const guideCard = document.querySelector('#adminHomeContent .admin-home-primary-card');
    expect(guideCard).toBeTruthy();

    const actionButtons = guideCard.querySelectorAll('[data-admin-workspace-jump]');
    expect(actionButtons.length).toBeLessThanOrEqual(3);
    expect(actionButtons.length).toBeGreaterThanOrEqual(1);
  });

  test('a kezdőlapi új esemény lépés rögtön az esemény alapok blokkra visz', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [];
      renderAdminHome();
    `);

    const goButton = [...document.querySelectorAll('#adminHomeContent [data-admin-workspace-jump]')]
      .find(button => button.textContent.includes('Új esemény') || button.textContent.includes('Uj esemeny'));
    goButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('[data-admin-workspace-panel="events"]').hidden).toBe(false);
    expect(window.eval('state.adminEventFormSection')).toBe('basics');
    expect(document.querySelector('[data-admin-event-form-panel="basics"]').hidden).toBe(false);
  });

  test('a kezd?lapi elsz?mol?s l?p?s a p?nz?gy aktu?lis blokkj?hoz visz', async () => {
    const { window, document } = await bootFrontend();
    const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', capabilities: {}, cash_module_enabled: false };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.adminEvents = [{
        id: 'evt-past',
        title: 'Lezajlott meccs',
        status: 'published',
        start_at: '${pastIso}',
        event_readiness: 'open'
      }];
      state.selectedAdminEvent = state.adminEvents[0];
      state.selectedAdminEventDetail = {
        event: state.adminEvents[0],
        registrations: {
          going: [{
            user_id: 'member-2',
            name: 'Tag 2',
            email: 'tag2@example.com',
            attendance_status: null,
            attendance_payment_amount: null
          }]
        },
        summary: {
          attendanceSummary: { presentCount: 0, noShowCount: 0, unmarkedCount: 1, totalPaidAmount: 0 },
          paymentSummary: { base_amount_per_person: 1200, per_player_fee: 100, final_amount_per_person: 1300 },
          financeSummary: { expected_total_amount: 1300, actual_paid_total_amount: 0 }
        }
      };
      renderAdminHome();
      renderAdminFinancePanel();
    `);

    const goButton = [...document.querySelectorAll('#adminHomeContent [data-admin-workspace-jump]')]
      .find(button => button.textContent.includes('Elszámolás') || button.textContent.includes('Elszamolas'));
    goButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('[data-admin-workspace-panel="finance"]').hidden).toBe(false);
    expect(window.eval('state.adminFinanceSection')).toBe('settlement');
    expect(document.querySelector('.finance-task-block.is-current, .finance-finish-row.is-current')).toBeTruthy();
  });

  test('a nem létfontosságú panelek a polcra kerülnek', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [];
      state.adminSavedEventDraw = {
        withinTolerance: true,
        totals: { teamA: 100, teamB: 100, difference: 0, differencePercent: 0 },
        settings: { generationMode: 'skill', skillBalancingEnabled: true },
        teamA: [{ name: 'A játékos', is_goalkeeper: true }],
        teamB: [{ name: 'B játékos', is_goalkeeper: true }]
      };
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    const adminHomeSummary = document.getElementById('adminHomeSummary');
    expect(adminHomeSummary.textContent).toContain('Polcra tett extra panelek');

    const shelf = adminHomeSummary.querySelector('details');
    shelf.open = true;

    expect(adminHomeSummary.textContent).toContain('Csapatleosztás');
    expect(adminHomeSummary.textContent).toContain('Csapatpénztár');
  });

  test('a kezdőlapon csak rövid 3 soros haladási blokk marad', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny' },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2' }
      ];
      state.adminEvents = [];
      renderAdminHome();
    `);

    const progressCard = document.querySelector('#adminHomeContent .admin-home-progress-card');
    expect(progressCard).toBeTruthy();
    expect(progressCard.querySelectorAll('.admin-home-progress-row')).toHaveLength(3);
    expect(document.getElementById('adminHomeContent').textContent).not.toContain('Setup checklist');
  });

  test('a halad?bb admin kezd?lap operat?v m?dra v?lt ?s a checklist h?tt?rbe ker?l', async () => {
    const { window, document } = await bootFrontend();
    const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    window.eval(`
      state.user = { id: 'captain-1', can_create_team: true };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.currentTeamId = 'team-1';
      state.teamRole = 'team_admin';
      state.teamInvites = [];
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapit?ny', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true },
        { user_id: 'member-3', membership_status: 'active', role: 'member', name: 'Tag 3', is_goalkeeper: false },
        { user_id: 'member-4', membership_status: 'active', role: 'member', name: 'Tag 4', is_goalkeeper: false },
        { user_id: 'member-5', membership_status: 'active', role: 'member', name: 'Tag 5', is_goalkeeper: false },
        { user_id: 'member-6', membership_status: 'active', role: 'member', name: 'Tag 6', is_goalkeeper: false },
        { user_id: 'member-7', membership_status: 'active', role: 'member', name: 'Tag 7', is_goalkeeper: false }
      ];
      state.adminEvents = [
        {
          id: 'evt-future',
          title: 'K?vetkez? meccs',
          status: 'published',
          draw_status: 'saved',
          start_at: '${futureIso}',
          location_name: 'Vasas',
          event_readiness: 'draw_published'
        },
        {
          id: 'evt-finished',
          title: 'Lezart meccs',
          status: 'finished',
          start_at: '${pastIso}',
          location_name: 'Vasas',
          event_readiness: 'finished'
        },
        {
          id: 'evt-extra',
          title: 'Masik meccs',
          status: 'draft',
          start_at: '${futureIso}',
          location_name: '?j p?lya',
          event_readiness: 'open'
        }
      ];
      renderAdminHome();
    `);

    const adminHomeContent = document.getElementById('adminHomeContent');
    expect(adminHomeContent.textContent).toContain('Most ezzel foglalkozz');
    expect(adminHomeContent.textContent).toContain('Nézd át a pénzügyi összesítést.');
    expect(adminHomeContent.textContent).not.toContain('Setup checklist');
    expect(adminHomeContent.textContent).toContain('Fókusz esemény');
    expect(document.getElementById('adminHomeSummary').textContent).toContain('Polcra tett extra panelek');
  });
});


