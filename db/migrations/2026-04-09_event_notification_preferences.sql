alter table event_settings
add column if not exists notification_preferences jsonb not null default '{
  "notifyTeamOnCreate": true,
  "notifyAllOnNewRegistration": false,
  "notifyAllWhenTwoSpotsLeft": true,
  "notifyAllWhenFull": true,
  "notifyWaitlistPromotion": true,
  "notifyParticipantsOnEventUpdate": true,
  "notifyParticipantsOnEventCancel": true
}'::jsonb;
