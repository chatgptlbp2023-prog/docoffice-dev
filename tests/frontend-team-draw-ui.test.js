/** @jest-environment node */

const { bootFrontend, createJsonResponse, flushMicrotasks } = require('./helpers/frontendHarness');

describe('Frontend team draw UI', () => {
  test('a csapatsorsolas fulon latszik a generalas, a preview es a mentes', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamRole = 'team_admin';
      state.teamMembers = [
        { user_id: 'captain-1', membership_status: 'active', role: 'team_admin', name: 'Kapitany', is_goalkeeper: true },
        { user_id: 'member-2', membership_status: 'active', role: 'member', name: 'Tag 2', is_goalkeeper: true }
      ];
      state.teamSkillSettings = {
        skill_balancing_enabled: true,
        skill_balance_tolerance_percent: 15,
        rank_module_enabled: true
      };
      state.selectedAdminEvent = {
        id: 'evt-1',
        title: 'Kovetkezo foci',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        location_name: 'Teszt palya',
        status: 'published'
      };
      state.teamDrawPreview = {
        withinTolerance: true,
        totals: { teamA: 100, teamB: 100, difference: 0, differencePercent: 0 },
        settings: { generationMode: 'skill', strategy: 'auto_balanced', skillBalancingEnabled: true },
        explanation: {
          summary: 'Automatikusan kiegyensúlyozott leosztás készült.',
          bullets: [
            'A két csapat összereje közel azonos.',
            'A legerősebb támadók nem kerültek egy oldalra.'
          ]
        },
        source_member_count: 2,
        teamA: [{ name: 'A jatekos', email: 'a@example.com', is_goalkeeper: true, overall_skill: 50 }],
        teamB: [{ name: 'B jatekos', email: 'b@example.com', is_goalkeeper: true, overall_skill: 50 }]
      };
      renderTeamSummary(state.currentTeam);
    `);

    const teamDrawContent = document.getElementById('teamDrawContent');
    expect(teamDrawContent.textContent).toContain('Csapatsorsolás');
    expect(teamDrawContent.textContent).toContain('preview');
    expect(teamDrawContent.textContent).toContain('Automatikus kiegyensúlyozott leosztás');
    expect(teamDrawContent.textContent).toContain('Automatikus kiegyensúlyozás aktív');
    expect(teamDrawContent.textContent).toContain('Miért így osztottam?');
    expect(teamDrawContent.textContent).toContain('A legerősebb támadók nem kerültek egy oldalra.');
    expect(teamDrawContent.textContent).toContain('Leosztás mentése');
  });

  test('a csapatsorsolas panel strategy valasztoja request bodyban kuldi a kivalasztott modot', async () => {
    const fetchMock = jest.fn(async url => {
      const target = String(url);

      if (target.includes('/events/evt-1/team-draw/preview')) {
        return createJsonResponse({
          message: 'Preview kesz.',
          draw: {
            event_id: 'evt-1',
            source_member_count: 2,
            settings: {
              generationMode: 'skill',
              strategy: 'counter_pair_balance',
              skillBalancingEnabled: true
            },
            totals: { teamA: 30, teamB: 30, difference: 0, differencePercent: 0 },
            teamA: [{ name: 'A jatekos', overall_skill: 30 }],
            teamB: [{ name: 'B jatekos', overall_skill: 30 }],
            withinTolerance: true
          }
        });
      }

      return createJsonResponse({});
    });
    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'token-1';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamRole = 'team_admin';
      state.teamDrawStrategy = 'optimized';
      state.teamSkillSettings = {
        skill_balancing_enabled: true,
        skill_balance_tolerance_percent: 15,
        rank_module_enabled: true
      };
      state.selectedAdminEvent = {
        id: 'evt-1',
        title: 'Kovetkezo foci',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        status: 'published'
      };
      renderTeamSummary(state.currentTeam);
    `);

    const teamDrawContent = document.getElementById('teamDrawContent');
    expect(teamDrawContent.textContent).toContain('Leosztási mód');
    expect(document.querySelector('[data-team-draw-strategy="optimized"]').classList.contains('is-active')).toBe(true);

    document.querySelector('[data-team-draw-strategy="counter_pair_balance"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(window.eval('state.teamDrawStrategy')).toBe('counter_pair_balance');
    expect(document.querySelector('[data-team-draw-strategy="counter_pair_balance"]').classList.contains('is-active')).toBe(true);

    document.querySelector('[data-team-summary-action="preview-team-draw"]').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );
    await flushMicrotasks();

    const previewCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/events/evt-1/team-draw/preview'));
    expect(previewCall).toBeTruthy();
    expect(JSON.parse(previewCall[1].body)).toEqual({ strategy: 'counter_pair_balance' });
  });

  test('user oldalon a mentett csapatleosztas megjelenik a ket csapattal', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.savedEventDraw = {
        teamA: [{ name: 'Feher 1', is_goalkeeper: true }, { name: 'Feher 2', is_goalkeeper: false }],
        teamB: [{ name: 'Piros 1', is_goalkeeper: true }, { name: 'Piros 2', is_goalkeeper: false }]
      };
      state.savedEventDrawEventId = 'evt-1';
      state.selectedUserEvent = { id: 'evt-1' };
      state.selectedUserEventDetail = {
        event: { id: 'evt-1' },
        summary: {
          paymentSummary: {
            final_amount_per_person: 1300
          }
        }
      };
      renderSavedUserEventDraw();
    `);

    const preview = document.getElementById('userTeamDrawPreview');
    expect(preview.textContent).toContain('Mentett csapatleoszt');
    expect(preview.textContent).toContain('Feher');
    expect(preview.textContent).toContain('Piros');
    expect(preview.textContent).toContain('Feher 1');
    expect(preview.textContent).toContain('Piros 1');
  });

  test('ujramentett draw is a kivalasztott user esemenyhez kotve jelenik meg', async () => {
    const fetchMock = jest.fn(async url => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/evt-1/team-draw')) {
        return createJsonResponse({
          draw: {
            event_id: 'evt-1',
            teamA: [{ name: 'Feher 1' }, { name: 'Uj jatekos' }],
            teamB: [{ name: 'Piros 1' }]
          }
        });
      }

      if (target.includes('/events/evt-1')) {
        return createJsonResponse({
          event: {
            id: 'evt-1',
            title: 'Frissitett draw meccs',
            status: 'published',
            start_at: new Date(Date.now() + 3600000).toISOString(),
            my_registration_status: 'going'
          },
          registrations: { cancelled: [] },
          summary: {
            eventReadiness: 'draw_saved',
            goingCount: 3,
            waitingCount: 0,
            cancelledCount: 0,
            spotsLeft: 1,
            paymentSummary: null
          }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    await window.openEventForUser('evt-1');
    await flushMicrotasks();

    const preview = document.getElementById('userTeamDrawPreview');
    expect(preview.textContent).toContain('Mentett csapatleoszt');
    expect(preview.textContent).toContain('Uj jatekos');
  });

  test('lemondott user ujra jelentkezhet, de ket lemondas utan mar adminhoz kell fordulnia', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.myEvents = [{
        id: 'evt-cancelled',
        title: 'Visszajelentkezos esemeny',
        status: 'published',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        is_registration_open: true,
        my_registration_status: 'cancelled',
        my_cancelled_count: 1
      }, {
        id: 'evt-blocked',
        title: 'Limitalt esemeny',
        status: 'published',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        is_registration_open: true,
        my_registration_status: 'cancelled',
        my_cancelled_count: 2,
        registration_limit_reached: true
      }];
      renderMyEvents(state.myEvents);
    `);

    expect(document.querySelector('[data-register-event-id="evt-cancelled"]')).toBeTruthy();
    expect(document.querySelector('[data-register-limit-event-id="evt-blocked"]')).toBeTruthy();
  });

  test('a kik jonnek lista cache-elt user detailbol is megjelenik, nem csak az aktualisan nyitott esemenynel', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.userEventDetailsById = {
        'evt-preview': {
          event: { id: 'evt-preview' },
          registrations: {
            going: [{ name: 'Akos' }, { name: 'Ricsi' }],
            waitingList: [{ name: 'Bence' }],
            rankWaitingList: [{ name: 'Zoli' }]
          }
        }
      };
      state.myEvents = [{
        id: 'evt-preview',
        title: 'Kik jonnek teszt',
        team_name: 'Teszt FC',
        status: 'published',
        start_at: new Date(Date.now() + 3600000).toISOString(),
        location_name: 'Teszt palya',
        is_registration_open: true,
        my_registration_status: null,
        going_count: 2,
        waiting_count: 1,
        rank_waiting_count: 1,
        rank_module_enabled: true,
        spots_left: 3
      }];
      renderMyEvents(state.myEvents);
    `);

    const hero = document.getElementById('nextEventHero');
    expect(hero.textContent).toContain('Kik');
    expect(hero.textContent).toContain('Akos');
    expect(hero.textContent).toContain('Ricsi');
    expect(hero.textContent).toContain('Rang');
    expect(hero.textContent).toContain('Zoli');
    expect(hero.textContent).toContain('Váró');
    expect(hero.textContent).toContain('Bence');
  });
});
