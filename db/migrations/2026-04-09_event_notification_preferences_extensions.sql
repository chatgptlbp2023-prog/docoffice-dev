alter table event_settings
  add column if not exists auto_prestart_processed_at timestamptz null,
  add column if not exists auto_prestart_outcome text null;

alter table event_settings
  alter column notification_preferences
  set default '{
    "notifyTeamOnCreate": true,
    "notifyAllOnNewRegistration": false,
    "notifyAllWhenTwoSpotsLeft": true,
    "notifyAllWhenFull": true,
    "notifyWaitlistPromotion": true,
    "notifyTeamDrawPublished": true,
    "enableAutoTeamDrawOneHourBefore": true,
    "notifyParticipantsOnEventUpdate": true,
    "notifyParticipantsOnEventCancel": true,
    "notifyWeatherAlerts": false
  }'::jsonb;

update event_settings
set notification_preferences =
  coalesce(notification_preferences, '{}'::jsonb)
  || jsonb_build_object(
    'notifyTeamOnCreate', coalesce((notification_preferences ->> 'notifyTeamOnCreate')::boolean, true),
    'notifyAllOnNewRegistration', coalesce((notification_preferences ->> 'notifyAllOnNewRegistration')::boolean, false),
    'notifyAllWhenTwoSpotsLeft', coalesce((notification_preferences ->> 'notifyAllWhenTwoSpotsLeft')::boolean, true),
    'notifyAllWhenFull', coalesce((notification_preferences ->> 'notifyAllWhenFull')::boolean, true),
    'notifyWaitlistPromotion', coalesce((notification_preferences ->> 'notifyWaitlistPromotion')::boolean, true),
    'notifyTeamDrawPublished', coalesce((notification_preferences ->> 'notifyTeamDrawPublished')::boolean, true),
    'enableAutoTeamDrawOneHourBefore', coalesce((notification_preferences ->> 'enableAutoTeamDrawOneHourBefore')::boolean, true),
    'notifyParticipantsOnEventUpdate', coalesce((notification_preferences ->> 'notifyParticipantsOnEventUpdate')::boolean, true),
    'notifyParticipantsOnEventCancel', coalesce((notification_preferences ->> 'notifyParticipantsOnEventCancel')::boolean, true),
    'notifyWeatherAlerts', coalesce((notification_preferences ->> 'notifyWeatherAlerts')::boolean, false)
  );
