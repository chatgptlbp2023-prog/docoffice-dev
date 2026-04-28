/** @jest-environment node */

const { bootFrontend } = require('./helpers/frontendHarness');

describe('Frontend rank module UI', () => {
  test('rank korlatozasnal a hero kartyan megjelenik az ok es a visszaszamlalas', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      renderHeroEvent({
        id: 'event-rank-1',
        title: 'Rangkapus meccs',
        team_name: 'Teszt FC',
        start_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        location_name: 'Teszt pálya',
        status: 'published',
        going_count: 5,
        waiting_count: 0,
        spots_left: 3,
        my_registration_status: null,
        is_registration_open: false,
        event_readiness: 'published',
        registration_window: {
          isRestrictedByRank: true,
          isOpen: false,
          opensAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          opensAtLabel: '2026. 04. 18. 20:00',
          waveLabel: '72 óra',
          offsetHours: 72,
          rankModuleEnabled: true,
          rankStatus: 'ranked',
          effectiveRankValue: 6,
          message: 'A csapatkapitány aktiválta a rangmodult. A jelenlegi 6. rang alapján 2026. 04. 18. 20:00 után tudsz jelentkezni.'
        }
      });
    `);

    const nextEventHero = document.getElementById('nextEventHero');
    expect(nextEventHero.textContent).toContain('A rangmodul most még korlátozza a jelentkezésedet.');
    expect(nextEventHero.textContent).toContain('A csapatkapitány aktiválta a rangmodult');
    expect(nextEventHero.textContent).toContain('72 óra');
    expect(nextEventHero.querySelector('.rank-registration-notice')).toBeTruthy();
    expect(nextEventHero.querySelector('.live-countdown')).toBeTruthy();
  });

  test('villamesemenynel nincs rank-blokk, hanem azonnal nyitott a jelentkezes', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      renderHeroEvent({
        id: 'event-fast-1',
        title: 'Villámfoci',
        team_name: 'Teszt FC',
        start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        location_name: 'Gyors pálya',
        status: 'published',
        going_count: 2,
        waiting_count: 0,
        spots_left: 8,
        my_registration_status: null,
        is_registration_open: true,
        event_readiness: 'published',
        registration_window: {
          isRestrictedByRank: false,
          isOpen: true,
          opensAt: new Date().toISOString(),
          opensAtLabel: 'most',
          waveLabel: 'azonnal',
          offsetHours: 0,
          fastStartException: true,
          rankModuleEnabled: true,
          rankStatus: 'ranked',
          effectiveRankValue: 6,
          message: 'A rangmodul aktív, de ez az esemény a létrehozásától számítva 3 órán belül kezdődik, ezért a jelentkezés azonnal nyitott.'
        }
      });
    `);

    const nextEventHero = document.getElementById('nextEventHero');
    expect(nextEventHero.textContent).toContain('Jelentkezem');
    expect(nextEventHero.textContent).not.toContain('korlátozza a jelentkezésedet');
    expect(nextEventHero.querySelector('.rank-registration-notice')).toBeNull();
  });

  test('rangvarolistas usernel kulon statusz es notice jelenik meg', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      renderHeroEvent({
        id: 'event-rank-2',
        title: 'Elojelentkezeses meccs',
        team_name: 'Teszt FC',
        start_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        location_name: 'Teszt palya',
        status: 'published',
        going_count: 5,
        waiting_count: 0,
        rank_waiting_count: 1,
        spots_left: 3,
        my_registration_status: 'waiting_list_rank',
        is_registration_open: false,
        event_readiness: 'published',
        registration_window: {
          isRestrictedByRank: true,
          isOpen: false,
          opensAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          opensAtLabel: '2026. 04. 18. 08:00',
          waveLabel: '72 oras',
          offsetHours: 72,
          rankModuleEnabled: true,
          rankStatus: 'ranked',
          effectiveRankValue: 4,
          message: 'A csapatkapitany aktivalta a rangmodult.'
        }
      });
    `);

    const nextEventHero = document.getElementById('nextEventHero');
    expect(nextEventHero.textContent).toContain('rangvárólistán');
    expect(nextEventHero.textContent).toContain('Előjelentkeztél');
    expect(nextEventHero.textContent).toContain('Rangvárólista');
  });

  test('a user rangmodul az aktualis tagsag alapjan ON marad, akkor is ha a globalis cache ures', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.teamSkillSettings = null;
      state.currentTeam = {
        id: 'team-1',
        name: 'Teszt FC',
        rank_module_enabled: true
      };
      state.user = {
        id: 'user-1',
        name: 'Attila'
      };
      state.teamMembers = [{
        user_id: 'user-1',
        name: 'Attila',
        membership_status: 'active',
        rank_snapshot: {
          rankModuleEnabled: true,
          baseRankValue: 6,
          effectiveRankValue: 6,
          stats: {
            evaluatedEvents: 1,
            attendedEvents: 0,
            participationRatio: 0
          }
        },
        rank_status: 'ranked',
        rank_value: 6
      }];
      renderUserRankModule();
    `);

    const rankModule = document.getElementById('userRankModule');
    expect(rankModule.textContent).toContain('RANG MODUL ON');
    expect(rankModule.textContent).toContain('0%');
  });
});
