/* A local profile. The three calendar columns are here rather than in app settings because every streak query needs them, and a streak computed with the wrong day boundary is silently wrong rather than visibly broken. */
CREATE TABLE IF NOT EXISTS "users" (
	-- Surrogate primary key. Profiles on one device, not accounts on a server.
	"id" INTEGER,
	-- Profile name, shown when a household shares a tablet.
	"name" TEXT NOT NULL,
	-- IANA zone, e.g. Europe/Berlin. Stored because a check-in belongs to a local calendar day, and travelling across a zone must not retroactively move yesterday.
	"timezone" TEXT NOT NULL DEFAULT 'UTC',
	-- How far past midnight a new day begins. Set to 240 and a 2 a.m. check-in still counts for the previous day, which is the difference between a tracker people keep using and one they abandon.
	"day_start_offset_minutes" INTEGER NOT NULL DEFAULT 0,
	-- 1 = Monday, 7 = Sunday. Decides which days a weekly target is counted over, so it changes results and not just the calendar header.
	"week_starts_on" INTEGER NOT NULL DEFAULT 1,
	-- Profile creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id")
);

/* A flat grouping. Deliberately not a tree: habit lists are short, and a nested category system is the first feature that makes a simple tracker feel like work. */
CREATE TABLE IF NOT EXISTS "categories" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Owning profile.
	"user_id" INTEGER NOT NULL,
	-- Display name, e.g. Health or Study.
	"name" TEXT NOT NULL,
	-- Hex swatch used for the habit chips and the heatmap.
	"color" TEXT,
	-- Manual sort order in the list.
	"position" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("user_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_user_name"
ON "categories" ("user_id", "name");
/* The thing being tracked. It carries no streak, no completion count and no "last done" column - every one of those is a question about check-ins, and storing an answer means maintaining it forever. */
CREATE TABLE IF NOT EXISTS "habits" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Owning profile.
	"user_id" INTEGER NOT NULL,
	-- Grouping. Null for an ungrouped habit.
	"category_id" INTEGER,
	-- What the user is trying to do, e.g. "Read 20 pages".
	"name" TEXT NOT NULL,
	-- Optional longer intention, shown on the habit detail screen.
	"description" TEXT,
	-- boolean | quantity. A boolean habit is done or not; a quantity habit accumulates towards target_amount.
	"kind" TEXT NOT NULL DEFAULT 'boolean',
	-- Units per occurrence for a quantity habit, e.g. 20 pages or 2.5 km. Null for boolean habits. REAL because distances and hours are genuinely fractional.
	"target_amount" REAL,
	-- Label for target_amount, e.g. pages or km. Null for boolean habits.
	"unit" TEXT,
	-- Retires a habit without deleting it. Deleting would destroy the check-ins that make last year heatmap correct.
	"is_archived" BOOLEAN NOT NULL DEFAULT false,
	-- First day the habit counts. A streak query must not reward the empty months before the habit existed.
	"started_on" DATE NOT NULL,
	-- Manual order on the home screen.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("user_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_habits_user_active"
ON "habits" ("user_id", "is_archived", "position");
/* Schedules are versioned by date rather than edited in place. Going from five days a week to seven must not retroactively turn last month into a pile of misses, so each day is judged against the rule that was in force on that day. */
CREATE TABLE IF NOT EXISTS "habit_schedules" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Habit this rule applies to.
	"habit_id" INTEGER NOT NULL,
	-- daily | specific_days | times_per_week | every_n_days. Four rules cover essentially every habit people actually track.
	"rule_kind" TEXT NOT NULL DEFAULT 'daily',
	-- Bitmask of weekdays for specific_days, bit 0 = Monday. Null for other rules. An integer beats seven booleans because the whole rule compares in one expression.
	"days_mask" INTEGER,
	-- Completions required per period: per day for daily, per week for times_per_week.
	"target_count" INTEGER NOT NULL DEFAULT 1,
	-- N for every_n_days, counted from effective_from. Null for other rules.
	"interval_days" INTEGER,
	-- First day this version of the rule applies.
	"effective_from" DATE NOT NULL,
	-- Last day it applies. Null for the rule in force today.
	"effective_to" DATE,
	-- When the user made this change.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("habit_id") REFERENCES "habits"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_schedules_habit_from"
ON "habit_schedules" ("habit_id", "effective_from");
/* One row per completion. Everything the app displays - streaks, heatmaps, weekly totals, best month - is an aggregate over this table, which is why it is the only table that must never be lossy. */
CREATE TABLE IF NOT EXISTS "check_ins" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Habit completed.
	"habit_id" INTEGER NOT NULL,
	-- The calendar day this completion belongs to, in the profile timezone with day_start_offset applied. A DATE, never a timestamp: a habit day is a local-calendar fact, and converting to UTC is what makes a late-night entry vanish from the correct day.
	"local_date" DATE NOT NULL,
	-- 1 for the first completion of the day, 2 for the second. Lets a three-times-a-day habit record three rows without a compound uniqueness hack.
	"occurrence" INTEGER NOT NULL DEFAULT 1,
	-- Units completed for a quantity habit. Null for boolean habits, where the row existing is the whole fact.
	"amount" REAL,
	-- What the user wrote about this one completion. Per check-in rather than per day, because "ran 5k, knee hurt" belongs to the run and not to the date.
	"note" TEXT,
	-- Optional 1-5 rating captured at check-in, so the stats screen can correlate adherence with how it felt.
	"mood" INTEGER,
	-- The actual instant of logging. Kept alongside local_date for "what time of day do I usually do this?" - the date answers whether, this answers when.
	"completed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("habit_id") REFERENCES "habits"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_check_ins_habit_date_occurrence"
ON "check_ins" ("habit_id", "local_date", "occurrence");

CREATE INDEX IF NOT EXISTS "idx_check_ins_habit_date"
ON "check_ins" ("habit_id", "local_date");
/* Date ranges the streak calculation skips entirely - not misses, not completions. Without this table the only way to survive a holiday is to lie by back-filling check-ins, which corrupts every statistic on the page. */
CREATE TABLE IF NOT EXISTS "pauses" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Habit being paused.
	"habit_id" INTEGER NOT NULL,
	-- First day excluded from streak evaluation.
	"starts_on" DATE NOT NULL,
	-- Last excluded day. Null for an open-ended pause that is still running.
	"ends_on" DATE,
	-- vacation | illness | injury | break. Shown on the heatmap so a grey block has an explanation.
	"reason" TEXT NOT NULL DEFAULT 'break',
	-- When the pause was declared.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("habit_id") REFERENCES "habits"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_pauses_habit_start"
ON "pauses" ("habit_id", "starts_on");
/* Scheduling intent, not scheduled notifications. The OS scheduler is the thing that actually fires; this table is what it is rebuilt from after a reboot, a restore or a timezone change. */
CREATE TABLE IF NOT EXISTS "reminders" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Habit being reminded about.
	"habit_id" INTEGER NOT NULL,
	-- Local wall-clock time, e.g. 07:30. Deliberately not a timestamp: the user means "every morning at half seven", which is a different thing from a fixed instant repeated.
	"remind_at" TIME NOT NULL,
	-- Weekdays the reminder fires, bit 0 = Monday. Default 127 is every day.
	"days_mask" INTEGER NOT NULL DEFAULT 127,
	-- Lets a user silence a reminder without losing its configuration.
	"is_enabled" BOOLEAN NOT NULL DEFAULT true,
	-- Suppresses the notification when a check-in already exists for the day. The single setting that stops a tracker feeling like nagging.
	"skip_if_done" BOOLEAN NOT NULL DEFAULT true,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("habit_id") REFERENCES "habits"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_reminders_habit_enabled"
ON "reminders" ("habit_id", "is_enabled");
/* A small delivery log with a uniqueness constraint doing the real work: it guarantees at most one notification per reminder per day no matter how many times the OS wakes the app. */
CREATE TABLE IF NOT EXISTS "reminder_deliveries" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Reminder that fired.
	"reminder_id" INTEGER NOT NULL,
	-- Day it fired for, so a redelivery after a restart can be recognised as a duplicate.
	"local_date" DATE NOT NULL,
	-- Actual delivery instant.
	"fired_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- delivered | suppressed | tapped | dismissed. Suppressed rows are the evidence that skip_if_done is working.
	"outcome" TEXT NOT NULL DEFAULT 'delivered',
	PRIMARY KEY("id"),
	FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_deliveries_reminder_date"
ON "reminder_deliveries" ("reminder_id", "local_date");
/* Purely derived and entirely disposable - dropping this table loses nothing, because every value in it is a query over check_ins. It exists only so the home screen renders without recomputing a year of history, and it is rebuilt rather than adjusted. */
CREATE TABLE IF NOT EXISTS "streak_cache" (
	-- Habit this cache row describes. One row per habit, so the habit id is the primary key.
	"habit_id" INTEGER,
	-- Consecutive qualifying periods up to today. Computed from check_ins, habit_schedules and pauses - never incremented by the check-in code path.
	"current_streak" INTEGER NOT NULL DEFAULT 0,
	-- Best run ever, for the badge on the habit card.
	"longest_streak" INTEGER NOT NULL DEFAULT 0,
	-- Most recent qualifying day. Null for a habit with no check-ins yet.
	"last_check_in_date" DATE,
	-- Lifetime completion count, shown on the detail screen.
	"total_check_ins" INTEGER NOT NULL DEFAULT 0,
	-- Last day the calculation covered. If this is behind today, the cache is stale and the UI recomputes rather than showing a wrong number.
	"computed_through" DATE,
	-- When the row was last rebuilt.
	"computed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("habit_id"),
	FOREIGN KEY ("habit_id") REFERENCES "habits"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);
