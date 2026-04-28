/** @jest-environment node */

const { bootFrontend } = require('./helpers/frontendHarness');

describe('Frontend statistics module UI', () => {
  test('az admin menuben megjelenik a Statisztikak workspace es kirajzolja az alap blokkokat', async () => {
    const { window, document } = await bootFrontend();

    window.eval(`
      state.currentTeam = { id: 'team-1', name: 'Teszt FC' };
      state.teamMembers = [
        {
          user_id: 'user-1',
          name: 'Attila',
          email: 'attila@example.com',
          membership_status: 'active',
          rank_snapshot: {
            rankModuleEnabled: true,
            rankStatus: 'ranked',
            effectiveRankValue: 8,
            stats: {
              participationRatio: 0.75
            }
          },
          attendance_stats: {
            present_count: 3,
            no_show_count: 1,
            marked_count: 4
          },
          registration_stats: {
            joined_count: 4,
            cancelled_count: 1,
            non_response_count: 0
          },
          finance_stats: {
            current_balance_amount: -500,
            entry_count: 2,
            total_expected_amount: 2600,
            total_actual_paid_amount: 2100,
            last_recorded_at: '2026-04-19T10:00:00.000Z'
          }
        },
        {
          user_id: 'user-2',
          name: 'Bence',
          email: 'bence@example.com',
          membership_status: 'active',
          rank_snapshot: {
            rankModuleEnabled: true,
            rankStatus: 'ranked',
            effectiveRankValue: 6,
            stats: {
              participationRatio: 0.5
            }
          },
          attendance_stats: {
            present_count: 1,
            no_show_count: 0,
            marked_count: 1
          },
          registration_stats: {
            joined_count: 2,
            cancelled_count: 0,
            non_response_count: 3
          },
          finance_stats: {
            current_balance_amount: 200,
            entry_count: 1,
            total_expected_amount: 1300,
            total_actual_paid_amount: 1500,
            last_recorded_at: '2026-04-18T10:00:00.000Z'
          }
        }
      ];
      renderAdminStatisticsPanel();
      setAdminWorkspace('statistics');
    `);

    const workspaceButton = document.querySelector('[data-admin-workspace="statistics"]');
    const statisticsPanel = document.querySelector('[data-admin-workspace-panel="statistics"]');
    const statisticsContent = document.getElementById('adminStatisticsContent');

    expect(workspaceButton).toBeTruthy();
    expect(workspaceButton.classList.contains('active')).toBe(true);
    expect(statisticsPanel.hidden).toBe(false);
    expect(statisticsContent.textContent).toContain('Rangeloszlas');
    expect(statisticsContent.textContent).toContain('Jelenlet es reakcio');
    expect(statisticsContent.textContent).toContain('Penzugyi egyenlegek');
    expect(statisticsContent.textContent).toContain('3+ esemenyre nem reagalok');
    expect(statisticsContent.textContent).toContain('Attila');
    expect(statisticsContent.textContent).toContain('Bence');
    expect(statisticsContent.textContent).toContain('tartozik');
  });
});
