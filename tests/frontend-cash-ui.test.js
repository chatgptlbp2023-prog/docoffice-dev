/** @jest-environment node */

const { bootFrontend, createJsonResponse, flushMicrotasks } = require('./helpers/frontendHarness');

describe('Frontend cash module UI', () => {
  test('a jelenleti panel penzugyi sora kulon mutatja a tervet, a befolytat es az elterest', async () => {
    const { window } = await bootFrontend();

    const html = window.eval(`
      renderAttendanceFinanceSummary({
        summary: {
          paymentSummary: {
            base_amount_per_person: 1200,
            per_player_fee: 100,
            final_amount_per_person: 1300
          },
          attendanceSummary: {
            totalPaidAmount: 1500
          }
        }
      }, [{}, {}]);
    `);

    expect(html).toContain('Pénzügyi sor');
    expect(html).toContain('Fejpénz / fő terv');
    expect(html).toContain('Alapdíj / fő terv');
    expect(html).toContain('Befolyt összesen');
    expect(html).toContain('Eltérés');
    expect(html).toContain('-1100 Ft');
  });

  test('a csapat kassza attekintesben a szummasor mindig megjelenik, a reszletek lenyithatok', async () => {
    const { window } = await bootFrontend();

    const html = window.eval(`
      renderTeamCashLedgerSummary([
        {
          id: 'event-1',
          title: 'Lezárt 1',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Pálya 1',
          status: 'finished',
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
        }
      ]);
    `);

    expect(html).toContain('Fejpénz összesen');
    expect(html).toContain('Alapdíj összesen');
    expect(html).toContain('Befolyt összesen');
    expect(html).toContain('Esemény részletek');
    expect(html).toContain('Lezárt 1');
    expect(html).toContain('Pálya 1');
  });

  test('az admin attendance panel a beirt befizetest kuldi el, nem a nyers esemenydijat', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/event-1/attendance/player-1')) {
        return createJsonResponse({
          message: 'Megjelent sikeresen rogzitve.',
          attendance: { status: 'present' }
        });
      }

      if (target.includes('/events/event-1') && !target.includes('/attendance/')) {
        return createJsonResponse({
          event: {
            id: 'event-1',
            title: 'Lezart meccs',
            start_at: '2026-04-15T18:00:00.000Z',
            location_name: 'Teszt palya',
            status: 'finished'
          },
          registrations: {
            going: [{
              user_id: 'player-1',
              name: 'Player One',
              finance_balance_before_event: -400,
              finance_settlement_target_amount: 1700,
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
              final_amount_per_person: 1300,
              base_amount_per_person: 1200,
              per_player_fee: 100
            }
          }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: false };
      state.adminEvents = [{
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      }];
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [{
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: -400,
            finance_settlement_target_amount: 1700,
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
            final_amount_per_person: 1300,
            base_amount_per_person: 1200,
            per_player_fee: 100
          }
        }
      };
      renderAdminFinancePanel();
    `);

    expect(document.querySelector('[data-attendance-payment]').value).toBe('1700');
    document.querySelector('[data-attendance-payment]').value = '900';
    document.querySelector('[data-team-summary-action="set-attendance"]').click();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/event-1/attendance/player-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'present',
          paymentAmount: 900
        })
      })
    );
  });

  test('az admin attendance panel az elvart osszeget tolti be, ha meg nincs rogzitett jelenlet csak nullas penzugyi mezo', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.adminWorkspace = 'finance';
      state.adminFinanceSection = 'settlement';
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [({
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: -400,
            finance_settlement_target_amount: 1700,
            attendance_status: null,
            attendance_marked_at: null,
            attendance_payment_recorded_at: null,
            attendance_payment_amount: 0,
            finance_actual_paid_amount: 0
          })]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            final_amount_per_person: 1300,
            base_amount_per_person: 1200,
            per_player_fee: 100
          }
        }
      };
      renderAdminFinancePanel();
    `);

    expect(document.querySelector('[data-attendance-payment][data-attendance-user-id="player-1"]').value).toBe('1700');
  });

  test('a kezzel atirt befizetes megmarad a megjelent rogzites utan is', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/event-1/attendance/player-1')) {
        return createJsonResponse({
          message: 'Jelenlet es fizetes sikeresen rogzitve.',
          attendance: { status: 'present', payment_amount: 900 }
        });
      }

      if (target.includes('/events/event-1/team-draw')) {
        return createJsonResponse({ draw: null });
      }

      if (target.includes('/events/event-1') && !target.includes('/attendance/')) {
        return createJsonResponse({
          event: {
            id: 'event-1',
            title: 'Lezart meccs',
            start_at: '2026-04-15T18:00:00.000Z',
            location_name: 'Teszt palya',
            status: 'finished'
          },
          registrations: {
            going: [({
              user_id: 'player-1',
              name: 'Player One',
              finance_balance_before_event: -400,
              finance_settlement_target_amount: 1700,
              attendance_status: 'present',
              attendance_payment_amount: null
            })]
          },
          summary: {
            attendanceSummary: {
              presentCount: 1,
              noShowCount: 0,
              unmarkedCount: 0,
              totalPaidAmount: 0
            },
            paymentSummary: {
              final_amount_per_person: 1300,
              base_amount_per_person: 1200,
              per_player_fee: 100
            }
          }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: false };
      state.adminEvents = [{
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      }];
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [({
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: -400,
            finance_settlement_target_amount: 1700,
            attendance_status: null,
            attendance_payment_amount: null
          })]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            final_amount_per_person: 1300,
            base_amount_per_person: 1200,
            per_player_fee: 100
          }
        }
      };
      renderAdminFinancePanel();
    `);

    const amountInput = document.querySelector('[data-attendance-payment][data-attendance-user-id="player-1"]');
    amountInput.value = '900';
    amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('[data-team-summary-action="set-attendance"]').click();
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(document.querySelector('[data-attendance-payment][data-attendance-user-id="player-1"]').value).toBe('900');
  });

  test('ha 1400 helyett 1000 erkezik, azt menti es -400 Ft marad a jatekoson', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/event-1/attendance/player-1')) {
        return createJsonResponse({
          message: 'Jelenlet es fizetes sikeresen rogzitve.',
          attendance: { status: 'present', payment_amount: 1000 }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: false };
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [({
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: 0,
            finance_settlement_target_amount: 1400,
            attendance_status: null,
            attendance_payment_amount: null
          })]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            final_amount_per_person: 1400,
            base_amount_per_person: 1300,
            per_player_fee: 100
          }
        }
      };
      renderAdminFinancePanel();
    `);

    const amountInput = document.querySelector('[data-attendance-payment][data-attendance-user-id="player-1"]');
    expect(amountInput.value).toBe('1400');

    amountInput.value = '1000';
    amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(document.querySelector('[data-attendance-payment-delta][data-attendance-user-id="player-1"]').textContent).toContain('-400');
    expect(document.querySelector('[data-attendance-projected-after][data-attendance-user-id="player-1"]').textContent).toContain('-400');

    document.querySelector('[data-team-summary-action="set-attendance"]').click();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/event-1/attendance/player-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'present',
          paymentAmount: 1000
        })
      })
    );
  });

  test('a lathato attendance panel inputjat olvassa akkor is, ha van rejtett duplikalt mező a DOM-ban', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/event-1/attendance/player-1')) {
        return createJsonResponse({
          message: 'Jelenlet es fizetes sikeresen rogzitve.',
          attendance: { status: 'present', payment_amount: 999 }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    document.getElementById('adminAttendanceContentGhost').innerHTML = `
      <input data-attendance-payment data-attendance-user-id="player-1" value="1400" />
      <span data-attendance-actual-paid data-attendance-user-id="player-1">1400 Ft</span>
      <span data-attendance-projected-after data-attendance-user-id="player-1">0 Ft</span>
      <span data-attendance-payment-delta data-attendance-user-id="player-1">0 Ft</span>
    `;

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: false };
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [({
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: 0,
            finance_settlement_target_amount: 1400,
            attendance_status: null,
            attendance_payment_amount: null
          })]
        },
        summary: {
          attendanceSummary: {
            presentCount: 0,
            noShowCount: 0,
            unmarkedCount: 1,
            totalPaidAmount: 0
          },
          paymentSummary: {
            final_amount_per_person: 1400,
            base_amount_per_person: 1300,
            per_player_fee: 100
          }
        }
      };
      renderAdminFinancePanel();
    `);

    const amountInput = document.querySelector('#adminAttendanceContent [data-attendance-payment][data-attendance-user-id="player-1"]');
    amountInput.value = '999';
    amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(document.querySelector('#adminAttendanceContent [data-attendance-actual-paid][data-attendance-user-id="player-1"]').textContent).toContain('999');
    expect(document.querySelector('#adminAttendanceContent [data-attendance-payment-delta][data-attendance-user-id="player-1"]').textContent).toContain('-401');

    document.querySelector('#adminAttendanceContent [data-team-summary-action="set-attendance"]').click();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/event-1/attendance/player-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'present',
          paymentAmount: 999
        })
      })
    );
  });

  test('az admin attendance panel gepeles kozben frissiti a vart egyenleget es az elterest', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.adminWorkspace = 'finance';
      state.adminFinanceSection = 'settlement';
      state.selectedAdminEvent = {
        id: 'event-1',
        title: 'Lezart meccs',
        start_at: '2026-04-15T18:00:00.000Z',
        location_name: 'Teszt palya',
        status: 'finished'
      };
      state.selectedAdminEventDetail = {
        event: {
          id: 'event-1',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        },
        registrations: {
          going: [{
            user_id: 'player-1',
            name: 'Player One',
            finance_balance_before_event: -400,
            finance_settlement_target_amount: 1700,
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
            final_amount_per_person: 1300,
            base_amount_per_person: 1200,
            per_player_fee: 100
          }
        }
      };
      document.getElementById('adminAttendanceContent').innerHTML = renderAdminAttendanceManager();
    `);

    const amountInput = document.querySelector('[data-attendance-payment][data-attendance-user-id="player-1"]');
    amountInput.value = '900';
    amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(document.querySelector('[data-attendance-actual-paid][data-attendance-user-id="player-1"]').textContent).toContain('900');
    expect(document.querySelector('[data-attendance-payment-delta][data-attendance-user-id="player-1"]').textContent).toContain('-800');
    expect(document.querySelector('[data-attendance-projected-after][data-attendance-user-id="player-1"]').textContent).toContain('-800');
  });

  test('a penzugyi munkater a kozelgo esemeny helyett a lezarhato esemenyt nyitja meg no-show adminisztraciohoz', async () => {
    const fetchMock = jest.fn(async (url) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/events/event-finished')) {
        return createJsonResponse({
          event: {
            id: 'event-finished',
            title: 'Lezart meccs',
            start_at: '2026-04-15T18:00:00.000Z',
            location_name: 'Teszt palya',
            status: 'finished'
          },
          registrations: {
            going: [{
              user_id: 'player-1',
              name: 'Player One',
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
              final_amount_per_person: 1300,
              base_amount_per_person: 1200,
              per_player_fee: 100
            }
          }
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: false };
      state.adminEvents = [
        {
          id: 'event-upcoming',
          title: 'Kovetkezo meccs',
          start_at: '2026-06-15T18:00:00.000Z',
          location_name: 'Jovo palya',
          status: 'published'
        },
        {
          id: 'event-finished',
          title: 'Lezart meccs',
          start_at: '2026-04-15T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'finished'
        }
      ];
      state.selectedAdminEvent = {
        id: 'event-upcoming',
        title: 'Kovetkezo meccs',
        start_at: '2026-06-15T18:00:00.000Z',
        location_name: 'Jovo palya',
        status: 'published'
      };
      state.selectedAdminEventDetail = null;
      renderAdminFinancePanel();
      setAdminWorkspace('finance');
    `);

    await window.eval('ensureAdminFinanceFocusEvent()');
    window.eval('renderAdminFinancePanel()');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/event-finished'),
      expect.any(Object)
    );
    expect(document.getElementById('adminAttendanceContent').textContent).toContain('No-show');
    expect(document.getElementById('adminAttendanceContent').textContent).toContain('Lezart meccs');
  });

  test('a user penzugyeim modul mutatja az aktualis egyenleget es az esemenysorokat', async () => {
    const { window } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'captain-1',
        name: 'Kapitany',
        role: 'team_admin',
        membership_status: 'active',
        payment_provider: 'revolut',
        payment_username: '@kapitany',
        payment_qr_data_url: 'data:image/png;base64,AAA='
      }];
      state.currentTeamFinance = {
        current_balance_amount: -100,
        entry_count: 2,
        adjustment_count: 1,
        total_expected_amount: 2600,
        total_actual_paid_amount: 2500,
        total_adjustment_amount: 300,
        entries: [
          {
            entry_type: 'adjustment',
            event_title: 'Kulon penzugyi korrekcio',
            event_start_at: '2026-04-17T18:00:00.000Z',
            note: 'atutalasi korrekcio',
            expected_total_amount: 0,
            actual_paid_amount: 300,
            event_delta_amount: 300,
            balance_after_event: -100
          },
          {
            entry_type: 'event',
            event_title: 'Masodik meccs',
            event_start_at: '2026-04-16T18:00:00.000Z',
            event_location_name: 'Pálya 2',
            expected_total_amount: 1300,
            actual_paid_amount: 1000,
            event_delta_amount: -300,
            balance_after_event: -100
          },
          {
            entry_type: 'event',
            event_title: 'Elso meccs',
            event_start_at: '2026-04-15T18:00:00.000Z',
            event_location_name: 'Pálya 1',
            expected_total_amount: 1300,
            actual_paid_amount: 1500,
            event_delta_amount: 200,
            balance_after_event: 200
          }
        ]
      };
      renderUserFinanceModule();
    `);

    const html = window.document.getElementById('userFinanceModule').innerHTML;
    expect(html).toContain('Fókuszcsapat egyenleg');
    expect(html).toContain('-100 Ft');
    expect(html).toContain('Csapatkapitány fizetési profilja');
    expect(html).toContain('@kapitany');
    expect(html).toContain('Nyitott tartozás');
    expect(html).toContain('Kézi korrekciók');
    expect(html).toContain('Kulon penzugyi korrekcio');
    expect(html).toContain('Befizetett');
    expect(html).toContain('Új egyenleg');
  });

  test.skip('a user esemeny reszleteiben megjelenik az esemenyszintu fizetesi link', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'captain-1',
        name: 'Kapitany',
        role: 'team_admin',
        membership_status: 'active',
        payment_provider: 'revolut',
        payment_username: '@kapitany',
        payment_qr_data_url: 'data:image/png;base64,AAA='
      }];
      renderUserEventDetail({
        event: {
          id: 'event-1',
          team_id: 'team-1',
          title: 'Teszt meccs',
          start_at: '2026-04-20T18:00:00.000Z',
          location_name: 'Teszt pálya',
          rules_text: 'Barátságos',
          status: 'published',
          payment_link_provider: 'revolut',
          payment_link_url: 'https://pay.example.com/event-link'
        },
        registrations: {
          going: [],
          waitingList: [],
          rankWaitingList: [],
          cancelled: []
        },
        summary: {
          eventReadiness: 'open',
          goingCount: 0,
          waitingCount: 0,
          rankWaitingCount: 0,
          cancelledCount: 0,
          spotsLeft: 10,
          paymentSummary: {
            final_amount_per_person: 1300,
            is_visible_to_user: true
          }
        },
        registrationWindow: {
          isRestrictedByRank: false,
          message: 'Nyitva'
        }
      });
    `);

    const html = document.getElementById('userEventDetail').innerHTML;
    expect(html).toContain('EsemĂ©ny fizetĂ©se');
    expect(html).toContain('FizetĂ©s Revolut linkkel');
    expect(html).toContain('https://pay.example.com/event-link');
    expect(html).toContain('1\u00a0300 Ft');
  });

  test('a user event detail card shows the event payment link', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamFinance = {
        current_balance_amount: -400,
        entry_count: 1,
        adjustment_count: 0,
        total_expected_amount: 1300,
        total_actual_paid_amount: 900,
        total_adjustment_amount: 0,
        entries: []
      };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'captain-1',
        name: 'Kapitany',
        role: 'team_admin',
        membership_status: 'active',
        payment_provider: 'revolut',
        payment_username: '@kapitany',
        payment_qr_data_url: 'data:image/png;base64,AAA='
      }];
      renderUserEventDetail({
        event: {
          id: 'event-1',
          team_id: 'team-1',
          title: 'Teszt meccs',
          start_at: '2026-04-20T18:00:00.000Z',
          location_name: 'Teszt palya',
          rules_text: 'Baratsagos',
          status: 'published',
          payment_link_provider: 'revolut',
          payment_link_url: 'https://pay.example.com/event-link'
        },
        registrations: {
          going: [],
          waitingList: [],
          rankWaitingList: [],
          cancelled: []
        },
        summary: {
          eventReadiness: 'open',
          goingCount: 0,
          waitingCount: 0,
          rankWaitingCount: 0,
          cancelledCount: 0,
          spotsLeft: 10,
          paymentSummary: {
            final_amount_per_person: 1300,
            is_visible_to_user: true
          }
        },
        registrationWindow: {
          isRestrictedByRank: false,
          message: 'Nyitva'
        }
      });
    `);

    const html = document.getElementById('userEventDetail').innerHTML;
    expect(html).toContain('https://pay.example.com/event-link');
    expect(html).toContain('Fizetés Revolut linkkel · 1700 Ft');
    expect(html).toContain('Kapitany');
    expect(html).toContain('Most rendezendő');
    expect(html).toContain('Áthozott tartozás');
    expect(html).toContain('1700 Ft');
  });

  test('a user esemeny fizetesi osszeg mutatja az athozott tartozast is', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamFinance = {
        current_balance_amount: -400,
        entry_count: 1,
        adjustment_count: 0,
        total_expected_amount: 1300,
        total_actual_paid_amount: 900,
        total_adjustment_amount: 0,
        entries: []
      };
      renderUserEventDetail({
        event: {
          id: 'event-1',
          team_id: 'team-1',
          title: 'Teszt meccs',
          start_at: '2026-04-20T18:00:00.000Z',
          location_name: 'Teszt palya',
          rules_text: 'Baratsagos',
          status: 'published',
          my_registration_status: 'going'
        },
        registrations: {
          going: [],
          waitingList: [],
          rankWaitingList: [],
          cancelled: []
        },
        summary: {
          eventReadiness: 'open',
          goingCount: 0,
          waitingCount: 0,
          rankWaitingCount: 0,
          cancelledCount: 0,
          spotsLeft: 10,
          paymentSummary: {
            final_amount_per_person: 1300,
            is_visible_to_user: true
          }
        },
        registrationWindow: {
          isRestrictedByRank: false,
          message: 'Nyitva'
        }
      });
    `);

    const html = document.getElementById('userEventDetail').innerHTML;
    expect(html).toContain('Most rendezendő');
    expect(html).toContain('Áthozott tartozás');
    expect(html).toContain('1700 Ft');
  });

  test('a user esemeny fizetesi osszeg levonja az athozott eloleget', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamFinance = {
        current_balance_amount: 500,
        entry_count: 1,
        adjustment_count: 1,
        total_expected_amount: 1300,
        total_actual_paid_amount: 1800,
        total_adjustment_amount: 500,
        entries: []
      };
      renderUserEventDetail({
        event: {
          id: 'event-1',
          team_id: 'team-1',
          title: 'Teszt meccs',
          start_at: '2026-04-20T18:00:00.000Z',
          location_name: 'Teszt palya',
          rules_text: 'Baratsagos',
          status: 'published',
          my_registration_status: 'going'
        },
        registrations: {
          going: [],
          waitingList: [],
          rankWaitingList: [],
          cancelled: []
        },
        summary: {
          eventReadiness: 'open',
          goingCount: 0,
          waitingCount: 0,
          rankWaitingCount: 0,
          cancelledCount: 0,
          spotsLeft: 10,
          paymentSummary: {
            final_amount_per_person: 1300,
            is_visible_to_user: true
          }
        },
        registrationWindow: {
          isRestrictedByRank: false,
          message: 'Nyitva'
        }
      });
    `);

    const html = document.getElementById('userEventDetail').innerHTML;
    expect(html).toContain('Levonható előleg');
    expect(html).toContain('800 Ft');
  });

  test('a kapitany QR nagyitott nezeteben is latszik a most rendezendo osszeg', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamFinance = {
        current_balance_amount: -400,
        entry_count: 1,
        adjustment_count: 0,
        total_expected_amount: 1300,
        total_actual_paid_amount: 900,
        total_adjustment_amount: 0,
        entries: []
      };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'captain-1',
        name: 'Kapitany',
        role: 'team_admin',
        membership_status: 'active',
        payment_provider: 'revolut',
        payment_username: '@kapitany',
        payment_qr_data_url: 'data:image/png;base64,AAA='
      }];
      state.selectedUserEventDetail = {
        event: {
          id: 'event-1',
          team_id: 'team-1',
          title: 'Teszt meccs',
          start_at: '2026-04-20T18:00:00.000Z',
          location_name: 'Teszt palya',
          status: 'published',
          payment_summary: {
            final_amount_per_person: 1300,
            is_visible_to_user: true
          }
        }
      };
      openPaymentQrPreviewForUserId('captain-1', 'captain');
    `);

    const overlayHtml = document.body.innerHTML;
    expect(overlayHtml).toContain('Most rendezendő összeg');
    expect(overlayHtml).toContain('1700 Ft');
    expect(overlayHtml).toContain('Áthozott tartozás');
  });

  test('az admin penzugyi nezet mutatja a tagonkenti egyenlegeket es a szuroket', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: true };
      state.teamMembers = [
        {
          user_id: 'user-1',
          name: 'Ados Adam',
          email: 'adam@example.com',
          membership_status: 'active',
          finance_stats: {
            current_balance_amount: -300,
            entry_count: 2,
            total_expected_amount: 2600,
            total_actual_paid_amount: 2300
          }
        },
        {
          user_id: 'user-2',
          name: 'Pluszos Pali',
          email: 'pali@example.com',
          membership_status: 'active',
          finance_stats: {
            current_balance_amount: 200,
            entry_count: 1,
            total_expected_amount: 1300,
            total_actual_paid_amount: 1500
          }
        }
      ];
      state.teamFinanceEntries = [
        {
          user_id: 'user-1',
          event_title: 'Hetfo esti',
          event_start_at: '2026-04-14T18:00:00.000Z',
          event_location_name: 'Palya 1',
          settlement_target_amount: 1600,
          actual_paid_amount: 1500,
          event_delta_amount: -100,
          balance_after_event: -300
        },
        {
          user_id: 'user-2',
          event_title: 'Keddi esti',
          event_start_at: '2026-04-15T18:00:00.000Z',
          event_location_name: 'Palya 2',
          settlement_target_amount: 1100,
          actual_paid_amount: 1300,
          event_delta_amount: 200,
          balance_after_event: 200
        }
      ];
      state.adminEvents = [];
      renderAdminFinancePanel();
    `);

    let html = document.getElementById('adminFinanceContent').innerHTML;
    expect(html).toContain('Tagonkénti egyenlegek');
    expect(html).toContain('Ados Adam');
    expect(html).toContain('Pluszos Pali');
    expect(html).toContain('tartozik');
    expect(html).toContain('többlete van');

    const filter = document.querySelector('[data-finance-filter="status"]');
    filter.value = 'debt';
    filter.dispatchEvent(new window.Event('change', { bubbles: true }));

    html = document.getElementById('adminFinanceContent').innerHTML;
    expect(html).toContain('Ados Adam');
    expect(html).not.toContain('Pluszos Pali');
  });

  test('az admin kulon befizetest tud rogziteni a tagi egyenleghez', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/teams/team-1/finance-adjustments/user-1')) {
        return createJsonResponse({
          message: 'Penzugyi korrekcio sikeresen rogzitve.'
        });
      }

      if (target.includes('/teams/team-1')) {
        return createJsonResponse({
          team: { id: 'team-1', name: 'Teszt FC', cash_module_enabled: true, capabilities: {} },
          members: [],
          current_user_finance: null,
          team_finance_entries: []
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: true };
      state.teamMembers = [
        {
          user_id: 'user-1',
          name: 'Ados Adam',
          email: 'adam@example.com',
          membership_status: 'active',
          finance_stats: {
            current_balance_amount: -1700,
            debt_amount: 1700,
            entry_count: 2,
            total_expected_amount: 2600,
            total_actual_paid_amount: 900
          }
        }
      ];
      state.teamFinanceEntries = [];
      renderAdminFinancePanel();
    `);

    document.querySelector('details.finance-member-collapse').open = true;
    const amountInput = document.querySelector('[data-finance-adjustment-amount][data-finance-user-id="user-1"]');
    amountInput.value = '1700';
    const noteInput = document.querySelector('[data-finance-adjustment-note][data-finance-user-id="user-1"]');
    noteInput.value = 'utolagos atutalas';

    document.querySelector('[data-team-summary-action="record-finance-adjustment"]').click();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/teams/team-1/finance-adjustments/user-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          adjustmentAmount: 1700,
          note: 'utolagos atutalas'
        })
      })
    );
  });

  test('az admin negativ penzugyi korrekciot is tud rogziteni a tagi egyenleghez', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      const target = String(url);

      if (target.includes('/auth/google/config')) {
        return createJsonResponse({ enabled: false, clientId: null });
      }

      if (target.includes('/teams/team-1/finance-adjustments/user-1')) {
        return createJsonResponse({
          message: 'Penzugyi korrekcio sikeresen rogzitve.'
        });
      }

      if (target.includes('/teams/team-1')) {
        return createJsonResponse({
          team: { id: 'team-1', name: 'Teszt FC', cash_module_enabled: true, capabilities: {} },
          members: [],
          current_user_finance: null,
          team_finance_entries: []
        });
      }

      return createJsonResponse({});
    });

    const { window, document } = await bootFrontend({ fetchMock });

    window.eval(`
      state.token = 'test-token';
      state.currentTeamId = 'team-1';
      state.currentTeam = { id: 'team-1', name: 'Teszt FC', cash_module_enabled: true };
      state.teamMembers = [
        {
          user_id: 'user-1',
          name: 'Pluszos Pali',
          email: 'pali@example.com',
          membership_status: 'active',
          finance_stats: {
            current_balance_amount: 1200,
            credit_amount: 1200,
            debt_amount: 0,
            adjustment_count: 2,
            total_adjustment_amount: 1200,
            entry_count: 2,
            total_expected_amount: 2600,
            total_actual_paid_amount: 3800
          }
        }
      ];
      state.teamFinanceEntries = [];
      renderAdminFinancePanel();
    `);

    document.querySelector('details.finance-member-collapse').open = true;
    const amountInput = document.querySelector('[data-finance-adjustment-amount][data-finance-user-id="user-1"]');
    amountInput.value = '-500';
    const noteInput = document.querySelector('[data-finance-adjustment-note][data-finance-user-id="user-1"]');
    noteInput.value = 'teves jovairas javitasa';

    document.querySelector('[data-team-summary-action="record-finance-adjustment"]').click();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/teams/team-1/finance-adjustments/user-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          adjustmentAmount: -500,
          note: 'teves jovairas javitasa'
        })
      })
    );
  });

  test('a kapitany QR nezeteben is megjelenik a most rendezendo osszeg', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeamFinance = {
        current_balance_amount: -400,
        entry_count: 1,
        adjustment_count: 0,
        total_expected_amount: 1300,
        total_actual_paid_amount: 900,
        total_adjustment_amount: 0,
        entries: []
      };
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [{
        user_id: 'captain-1',
        name: 'Kapitany',
        role: 'team_admin',
        membership_status: 'active',
        payment_provider: 'revolut',
        payment_username: '@kapitany',
        payment_qr_data_url: 'data:image/png;base64,AAA='
      }];
      state.selectedUserEvent = {
        id: 'event-1',
        team_id: 'team-1',
        title: 'Teszt meccs',
        start_at: '2026-04-20T18:00:00.000Z',
        status: 'published',
        payment_summary: {
          final_amount_per_person: 1300,
          is_visible_to_user: true
        }
      };
      openPaymentQrPreviewForUserId('captain-1', 'captain');
    `);

    const html = document.body.innerHTML;
    expect(html).toContain('Most rendezendő összeg');
    expect(html).toContain('1700 Ft');
    expect(html).toContain('Áthozott tartozás');
  });
});
