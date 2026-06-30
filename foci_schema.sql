--
-- PostgreSQL database dump
--

\restrict k3eq2m5ioEuKtygj9W6wVUxfSvDFpmmgbj68cRwrHaSRzmTSJ9pYBUcAbRkhEIm

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: event_attendance_marks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_attendance_marks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL,
    note text,
    marked_by_user_id uuid NOT NULL,
    marked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_amount integer,
    payment_recorded_at timestamp with time zone,
    CONSTRAINT event_attendance_marks_payment_amount_check CHECK (((payment_amount IS NULL) OR (payment_amount >= 0)))
);


ALTER TABLE public.event_attendance_marks OWNER TO postgres;

--
-- Name: event_financial_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_financial_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    attendance_status text NOT NULL,
    expected_base_amount integer DEFAULT 0 NOT NULL,
    expected_fee_amount integer DEFAULT 0 NOT NULL,
    expected_total_amount integer DEFAULT 0 NOT NULL,
    balance_before_event integer DEFAULT 0 NOT NULL,
    settlement_target_amount integer DEFAULT 0 NOT NULL,
    actual_paid_amount integer DEFAULT 0 NOT NULL,
    event_delta_amount integer DEFAULT 0 NOT NULL,
    balance_after_event integer DEFAULT 0 NOT NULL,
    recorded_by_user_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_financial_entries_actual_paid_amount_check CHECK ((actual_paid_amount >= 0)),
    CONSTRAINT event_financial_entries_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['present'::text, 'no_show'::text]))),
    CONSTRAINT event_financial_entries_expected_base_amount_check CHECK ((expected_base_amount >= 0)),
    CONSTRAINT event_financial_entries_expected_fee_amount_check CHECK ((expected_fee_amount >= 0)),
    CONSTRAINT event_financial_entries_expected_total_amount_check CHECK ((expected_total_amount >= 0)),
    CONSTRAINT event_financial_entries_settlement_target_amount_check CHECK ((settlement_target_amount >= 0))
);


ALTER TABLE public.event_financial_entries OWNER TO postgres;

--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_registrations (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    team_id uuid NOT NULL,
    registration_status character varying(20) NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    promoted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_cancelled_at_logic CHECK (((((registration_status)::text = 'cancelled'::text) AND (cancelled_at IS NOT NULL)) OR ((registration_status)::text <> 'cancelled'::text))),
    CONSTRAINT event_registrations_status_check CHECK (((registration_status)::text = ANY ((ARRAY['going'::character varying, 'waiting_list'::character varying, 'waiting_list_rank'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.event_registrations OWNER TO postgres;

--
-- Name: event_series; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location_name text NOT NULL,
    location_address text,
    start_at_template timestamp with time zone NOT NULL,
    min_players integer NOT NULL,
    max_players integer NOT NULL,
    initial_event_status text NOT NULL,
    recurrence_type text NOT NULL,
    series_end_type text NOT NULL,
    series_occurrence_count integer,
    series_until_date timestamp with time zone,
    generation_horizon_count integer DEFAULT 6 NOT NULL,
    field_size text,
    field_quality text,
    surface_type text,
    game_duration_minutes integer,
    rules_text text,
    price_per_player numeric(10,2),
    payment_notes text,
    players_on_field_total integer NOT NULL,
    substitutes_enabled boolean DEFAULT false NOT NULL,
    substitutes_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pricing_mode text,
    fixed_price_per_person numeric(10,2),
    total_event_cost numeric(10,2),
    per_player_fee integer DEFAULT 0 NOT NULL,
    CONSTRAINT event_series_end_type_check CHECK ((series_end_type = ANY (ARRAY['occurrence_count'::text, 'until_date'::text]))),
    CONSTRAINT event_series_initial_event_status_check CHECK ((initial_event_status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT event_series_per_player_fee_check CHECK ((per_player_fee = ANY (ARRAY[0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]))),
    CONSTRAINT event_series_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['free'::text, 'fixed_per_person'::text, 'split_total_cost'::text]))),
    CONSTRAINT event_series_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])))
);


ALTER TABLE public.event_series OWNER TO postgres;

--
-- Name: event_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_settings (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    field_size character varying(100),
    field_quality character varying(100),
    surface_type character varying(50),
    game_duration_minutes smallint,
    rules_text text,
    price_per_player integer,
    payment_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    players_on_field_total smallint,
    substitutes_enabled boolean DEFAULT false NOT NULL,
    substitutes_count smallint DEFAULT 0 NOT NULL,
    notification_preferences jsonb DEFAULT '{"notifyAllWhenFull": true, "notifyTeamOnCreate": true, "notifyWeatherAlerts": false, "notifyTeamDrawPublished": true, "notifyWaitlistPromotion": true, "notifyAllWhenTwoSpotsLeft": true, "notifyAllOnNewRegistration": false, "enableAutoTeamDrawOneHourBefore": true, "notifyParticipantsOnEventCancel": true, "notifyParticipantsOnEventUpdate": true}'::jsonb NOT NULL,
    auto_prestart_processed_at timestamp with time zone,
    auto_prestart_outcome text,
    pricing_mode text,
    fixed_price_per_person numeric(10,2),
    total_event_cost numeric(10,2),
    per_player_fee integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_game_duration_minutes CHECK (((game_duration_minutes > 0) OR (game_duration_minutes IS NULL))),
    CONSTRAINT chk_players_on_field_total CHECK (((players_on_field_total IS NULL) OR (players_on_field_total > 0))),
    CONSTRAINT chk_price_per_player CHECK (((price_per_player >= 0) OR (price_per_player IS NULL))),
    CONSTRAINT chk_substitutes_count CHECK (((substitutes_count >= 0) AND (substitutes_count <= 10))),
    CONSTRAINT chk_substitutes_enabled_logic CHECK ((((substitutes_enabled = false) AND (substitutes_count = 0)) OR ((substitutes_enabled = true) AND ((substitutes_count >= 1) AND (substitutes_count <= 10))))),
    CONSTRAINT event_settings_per_player_fee_check CHECK ((per_player_fee = ANY (ARRAY[0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]))),
    CONSTRAINT event_settings_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['free'::text, 'fixed_per_person'::text, 'split_total_cost'::text])))
);


ALTER TABLE public.event_settings OWNER TO postgres;

--
-- Name: event_team_draws; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_team_draws (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    team_a_json jsonb NOT NULL,
    team_b_json jsonb NOT NULL,
    totals_json jsonb NOT NULL,
    settings_json jsonb NOT NULL,
    within_tolerance boolean DEFAULT false NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'saved'::text NOT NULL,
    published_at timestamp with time zone,
    stale_at timestamp with time zone,
    CONSTRAINT event_team_draws_status_check CHECK ((status = ANY (ARRAY['saved'::text, 'published'::text, 'stale'::text])))
);


ALTER TABLE public.event_team_draws OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid NOT NULL,
    team_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    title character varying(150) NOT NULL,
    description text,
    start_at timestamp with time zone NOT NULL,
    location_name character varying(150) NOT NULL,
    location_address character varying(255),
    min_players smallint NOT NULL,
    max_players smallint NOT NULL,
    status character varying(20) DEFAULT 'published'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    series_id uuid,
    occurrence_index integer,
    occurs_on date,
    is_exception boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    hidden_from_admin_list boolean DEFAULT false NOT NULL,
    location_latitude numeric,
    location_longitude numeric,
    location_place_id text,
    location_formatted_address text,
    location_geocoded_at timestamp with time zone,
    CONSTRAINT chk_event_max_players CHECK ((max_players >= 1)),
    CONSTRAINT chk_event_min_le_max CHECK ((min_players <= max_players)),
    CONSTRAINT chk_event_min_players CHECK ((min_players >= 1)),
    CONSTRAINT chk_events_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'cancelled'::character varying, 'finished'::character varying])::text[]))),
    CONSTRAINT events_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'cancelled'::character varying, 'finished'::character varying])::text[])))
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: team_financial_adjustments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_financial_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    adjustment_amount integer NOT NULL,
    note text,
    balance_before_adjustment integer DEFAULT 0 NOT NULL,
    balance_after_adjustment integer DEFAULT 0 NOT NULL,
    recorded_by_user_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_financial_adjustments_nonzero_amount_check CHECK ((adjustment_amount <> 0))
);


ALTER TABLE public.team_financial_adjustments OWNER TO postgres;

--
-- Name: team_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    invited_email text,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by_user_id uuid NOT NULL,
    message text,
    expires_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token text,
    invite_code text,
    invited_phone text,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT team_invites_role_check CHECK ((role = ANY (ARRAY['member'::text, 'team_manager'::text]))),
    CONSTRAINT team_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'revoked'::text, 'expired'::text])))
);


ALTER TABLE public.team_invites OWNER TO postgres;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(30) DEFAULT 'member'::character varying NOT NULL,
    membership_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    primary_position character varying(30),
    defense_score smallint DEFAULT 50 NOT NULL,
    attack_score smallint DEFAULT 50 NOT NULL,
    goalkeeper_score smallint DEFAULT 0 NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skills_enabled boolean DEFAULT true NOT NULL,
    is_goalkeeper boolean DEFAULT false NOT NULL,
    rank_value integer DEFAULT 10 NOT NULL,
    rank_status text DEFAULT 'guest'::text NOT NULL,
    CONSTRAINT chk_attack_score CHECK ((((attack_score >= 0) AND (attack_score <= 100)) OR (attack_score IS NULL))),
    CONSTRAINT chk_defense_score CHECK ((((defense_score >= 0) AND (defense_score <= 100)) OR (defense_score IS NULL))),
    CONSTRAINT chk_goalkeeper_score CHECK ((((goalkeeper_score >= 0) AND (goalkeeper_score <= 100)) OR (goalkeeper_score IS NULL))),
    CONSTRAINT chk_primary_position CHECK ((((primary_position)::text = ANY ((ARRAY['goalkeeper'::character varying, 'defender'::character varying, 'attacker'::character varying])::text[])) OR (primary_position IS NULL))),
    CONSTRAINT chk_team_membership_status CHECK (((membership_status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'removed'::character varying])::text[]))),
    CONSTRAINT team_members_attack_score_check CHECK (((attack_score >= 0) AND (attack_score <= 100))),
    CONSTRAINT team_members_defense_score_check CHECK (((defense_score >= 0) AND (defense_score <= 100))),
    CONSTRAINT team_members_goalkeeper_score_check CHECK (((goalkeeper_score >= 0) AND (goalkeeper_score <= 100))),
    CONSTRAINT team_members_rank_status_check CHECK ((rank_status = ANY (ARRAY['guest'::text, 'ranked'::text]))),
    CONSTRAINT team_members_rank_value_check CHECK (((rank_value >= 1) AND (rank_value <= 10))),
    CONSTRAINT team_members_role_check CHECK (((role)::text = ANY ((ARRAY['team_admin'::character varying, 'team_manager'::character varying, 'member'::character varying])::text[])))
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id uuid NOT NULL,
    name character varying(120) NOT NULL,
    created_by_user_id uuid NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_balancing_enabled boolean DEFAULT true NOT NULL,
    skill_balance_tolerance_percent integer DEFAULT 15 NOT NULL,
    draw_strategy text DEFAULT 'auto_balanced'::text NOT NULL,
    goalkeeper_module_enabled boolean DEFAULT true NOT NULL,
    rank_module_enabled boolean DEFAULT false NOT NULL,
    cash_module_enabled boolean DEFAULT false NOT NULL,
    discipline_module_enabled boolean DEFAULT false NOT NULL,
    admin_guide_module_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_teams_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT teams_draw_strategy_check CHECK ((draw_strategy = ANY (ARRAY['auto_balanced'::text, 'random'::text, 'sum_balance'::text]))),
    CONSTRAINT teams_skill_balance_tolerance_percent_check CHECK (((skill_balance_tolerance_percent >= 0) AND (skill_balance_tolerance_percent <= 100)))
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    name character varying(120) NOT NULL,
    email character varying(255) NOT NULL,
    auth_provider character varying(50),
    auth_provider_user_id character varying(255),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255),
    is_superadmin boolean DEFAULT false NOT NULL,
    platform_role text DEFAULT 'user'::text NOT NULL,
    google_sub text,
    phone text,
    nickname text,
    birth_year integer,
    avatar_data_url text,
    can_create_team boolean DEFAULT false NOT NULL,
    payment_provider text,
    payment_username text,
    payment_qr_data_url text,
    CONSTRAINT chk_users_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying])::text[]))),
    CONSTRAINT users_auth_provider_check CHECK (((auth_provider)::text = ANY ((ARRAY['local'::character varying, 'google'::character varying])::text[]))),
    CONSTRAINT users_birth_year_check CHECK (((birth_year IS NULL) OR ((birth_year >= 1900) AND (birth_year <= 2100)))),
    CONSTRAINT users_payment_provider_check CHECK (((payment_provider IS NULL) OR (payment_provider = ANY (ARRAY['revolut'::text, 'wise'::text])))),
    CONSTRAINT users_platform_role_check CHECK ((platform_role = ANY (ARRAY['platform_owner'::text, 'user'::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: event_attendance_marks event_attendance_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attendance_marks
    ADD CONSTRAINT event_attendance_marks_pkey PRIMARY KEY (id);


--
-- Name: event_financial_entries event_financial_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_financial_entries
    ADD CONSTRAINT event_financial_entries_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: event_series event_series_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_series
    ADD CONSTRAINT event_series_pkey PRIMARY KEY (id);


--
-- Name: event_settings event_settings_event_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_settings
    ADD CONSTRAINT event_settings_event_id_key UNIQUE (event_id);


--
-- Name: event_settings event_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_settings
    ADD CONSTRAINT event_settings_pkey PRIMARY KEY (id);


--
-- Name: event_team_draws event_team_draws_event_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_team_draws
    ADD CONSTRAINT event_team_draws_event_id_key UNIQUE (event_id);


--
-- Name: event_team_draws event_team_draws_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_team_draws
    ADD CONSTRAINT event_team_draws_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: team_financial_adjustments team_financial_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_financial_adjustments
    ADD CONSTRAINT team_financial_adjustments_pkey PRIMARY KEY (id);


--
-- Name: team_invites team_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: team_members uq_team_members_team_user; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT uq_team_members_team_user UNIQUE (team_id, user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: event_attendance_marks_event_user_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX event_attendance_marks_event_user_unique_idx ON public.event_attendance_marks USING btree (event_id, user_id);


--
-- Name: event_financial_entries_event_user_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX event_financial_entries_event_user_unique_idx ON public.event_financial_entries USING btree (event_id, user_id);


--
-- Name: event_financial_entries_team_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_financial_entries_team_event_idx ON public.event_financial_entries USING btree (team_id, event_id);


--
-- Name: event_financial_entries_team_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_financial_entries_team_user_idx ON public.event_financial_entries USING btree (team_id, user_id, recorded_at DESC);


--
-- Name: event_series_team_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_series_team_active_idx ON public.event_series USING btree (team_id, is_active);


--
-- Name: event_series_team_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_series_team_id_idx ON public.event_series USING btree (team_id);


--
-- Name: events_series_id_start_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_series_id_start_at_idx ON public.events USING btree (series_id, start_at);


--
-- Name: events_series_occurrence_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX events_series_occurrence_unique_idx ON public.events USING btree (series_id, occurrence_index) WHERE ((series_id IS NOT NULL) AND (occurrence_index IS NOT NULL));


--
-- Name: idx_event_registrations_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_registrations_event_id ON public.event_registrations USING btree (event_id);


--
-- Name: idx_event_registrations_registered_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_registrations_registered_at ON public.event_registrations USING btree (registered_at);


--
-- Name: idx_event_registrations_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_registrations_status ON public.event_registrations USING btree (registration_status);


--
-- Name: idx_event_registrations_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_registrations_team_id ON public.event_registrations USING btree (team_id);


--
-- Name: idx_event_registrations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_registrations_user_id ON public.event_registrations USING btree (user_id);


--
-- Name: idx_event_settings_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_settings_event_id ON public.event_settings USING btree (event_id);


--
-- Name: idx_events_created_by_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_created_by_user_id ON public.events USING btree (created_by_user_id);


--
-- Name: idx_events_start_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_start_at ON public.events USING btree (start_at);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_team_id ON public.events USING btree (team_id);


--
-- Name: idx_team_members_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_role ON public.team_members USING btree (role);


--
-- Name: idx_team_members_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);


--
-- Name: idx_team_members_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);


--
-- Name: idx_teams_created_by_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_created_by_user_id ON public.teams USING btree (created_by_user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: team_financial_adjustments_team_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX team_financial_adjustments_team_user_idx ON public.team_financial_adjustments USING btree (team_id, user_id, recorded_at DESC);


--
-- Name: team_invites_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX team_invites_email_idx ON public.team_invites USING btree (lower(invited_email));


--
-- Name: team_invites_invite_code_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX team_invites_invite_code_unique_idx ON public.team_invites USING btree (invite_code);


--
-- Name: team_invites_invited_by_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX team_invites_invited_by_idx ON public.team_invites USING btree (invited_by_user_id);


--
-- Name: team_invites_one_pending_per_team_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX team_invites_one_pending_per_team_email_idx ON public.team_invites USING btree (team_id, lower(invited_email)) WHERE ((status = 'pending'::text) AND (invited_email IS NOT NULL));


--
-- Name: team_invites_team_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX team_invites_team_status_idx ON public.team_invites USING btree (team_id, status);


--
-- Name: team_invites_token_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX team_invites_token_unique_idx ON public.team_invites USING btree (token);


--
-- Name: users_google_sub_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_google_sub_unique_idx ON public.users USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- Name: ux_event_registrations_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_event_registrations_active ON public.event_registrations USING btree (event_id, user_id) WHERE ((registration_status)::text = ANY ((ARRAY['going'::character varying, 'waiting_list'::character varying])::text[]));


--
-- Name: event_attendance_marks event_attendance_marks_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attendance_marks
    ADD CONSTRAINT event_attendance_marks_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_attendance_marks event_attendance_marks_marked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attendance_marks
    ADD CONSTRAINT event_attendance_marks_marked_by_user_id_fkey FOREIGN KEY (marked_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_attendance_marks event_attendance_marks_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attendance_marks
    ADD CONSTRAINT event_attendance_marks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: event_attendance_marks event_attendance_marks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attendance_marks
    ADD CONSTRAINT event_attendance_marks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_financial_entries event_financial_entries_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_financial_entries
    ADD CONSTRAINT event_financial_entries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_financial_entries event_financial_entries_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_financial_entries
    ADD CONSTRAINT event_financial_entries_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_financial_entries event_financial_entries_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_financial_entries
    ADD CONSTRAINT event_financial_entries_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: event_financial_entries event_financial_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_financial_entries
    ADD CONSTRAINT event_financial_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_series event_series_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_series
    ADD CONSTRAINT event_series_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: event_series event_series_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_series
    ADD CONSTRAINT event_series_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: event_settings event_settings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_settings
    ADD CONSTRAINT event_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_team_draws event_team_draws_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_team_draws
    ADD CONSTRAINT event_team_draws_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: event_team_draws event_team_draws_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_team_draws
    ADD CONSTRAINT event_team_draws_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: events events_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.event_series(id) ON DELETE SET NULL;


--
-- Name: events events_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_financial_adjustments team_financial_adjustments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_financial_adjustments
    ADD CONSTRAINT team_financial_adjustments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: team_financial_adjustments team_financial_adjustments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_financial_adjustments
    ADD CONSTRAINT team_financial_adjustments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_financial_adjustments team_financial_adjustments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_financial_adjustments
    ADD CONSTRAINT team_financial_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: team_invites team_invites_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id);


--
-- Name: team_invites team_invites_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict k3eq2m5ioEuKtygj9W6wVUxfSvDFpmmgbj68cRwrHaSRzmTSJ9pYBUcAbRkhEIm
