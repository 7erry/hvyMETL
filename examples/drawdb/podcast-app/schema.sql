/* A subscribed podcast. Everything here is a local mirror of a remote feed: the device owns the row, the publisher owns the truth, and sync reconciles the two. */
CREATE TABLE IF NOT EXISTS "shows" (
	-- Local rowid. Meaningless off the device - feed_url is the identity that survives a reinstall.
	"id" INTEGER,
	-- RSS feed URL, and the real identity of a show. Unique, because subscribing twice from a search result and an OPML import must collapse to one row.
	"feed_url" TEXT NOT NULL UNIQUE,
	-- Show title from the feed.
	"title" TEXT NOT NULL,
	-- Publisher or host name as given in the feed. Often missing, hence nullable.
	"author" TEXT,
	-- Show description, usually HTML from the feed.
	"description" TEXT,
	-- Path of the cached artwork file relative to the app container, never absolute. iOS and Android move the container between launches, so an absolute path is a broken image after the next update.
	"artwork_path" TEXT,
	-- Small thumbnail bytes stored inline for instant list rendering. Full-size art stays on the filesystem; only the tiny version is worth putting in the database.
	"artwork_blob" BLOB,
	-- False keeps a show around for its play history after the user unsubscribes, so resubscribing restores their positions.
	"is_subscribed" BOOLEAN NOT NULL DEFAULT true,
	-- ISO 8601 UTC instant of subscription. Text, because SQLite has no date type and ISO 8601 sorts correctly as a string.
	"subscribed_at" TEXT NOT NULL,
	-- Publish instant of the newest known episode, denormalised so the subscription list sorts by recency without touching episodes.
	"last_episode_at" TEXT,
	PRIMARY KEY("id")
);

CREATE INDEX IF NOT EXISTS "idx_shows_subscribed_recent"
ON "shows" ("is_subscribed", "last_episode_at");
/* A feed item mirrored locally. Rows are upserted on (show_id, guid) every sync, so an edited title updates in place instead of creating a duplicate episode. */
CREATE TABLE IF NOT EXISTS "episodes" (
	-- Local rowid.
	"id" INTEGER,
	-- Parent show.
	"show_id" INTEGER NOT NULL,
	-- The feed item GUID. This, not the URL, is what matches a re-fetched item to an existing row - publishers change media URLs when they swap hosts.
	"guid" TEXT NOT NULL,
	-- Episode title.
	"title" TEXT NOT NULL,
	-- Show notes, as HTML from the feed.
	"description" TEXT,
	-- Enclosure URL. Changes when the publisher migrates hosts, which is exactly why it is not the identity column.
	"media_url" TEXT NOT NULL,
	-- Runtime in seconds as declared in the feed. Null when the feed omits it and the file has not been probed yet.
	"duration_seconds" INTEGER,
	-- ISO 8601 publish instant. The sort key for every episode list.
	"published_at" TEXT NOT NULL,
	-- Season, when the feed uses the iTunes tags. Null for the majority that do not.
	"season_number" INTEGER,
	-- Episode number within the season, when declared.
	"episode_number" INTEGER,
	-- Explicit flag from the feed.
	"is_explicit" BOOLEAN NOT NULL DEFAULT false,
	-- When this device first saw the item. Distinct from published_at, and the honest basis for a "new since you last looked" badge on a back catalogue import.
	"first_seen_at" TEXT NOT NULL,
	PRIMARY KEY("id"),
	FOREIGN KEY ("show_id") REFERENCES "shows"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_episodes_show_guid"
ON "episodes" ("show_id", "guid");

CREATE INDEX IF NOT EXISTS "idx_episodes_show_published"
ON "episodes" ("show_id", "published_at");
/* Chapter markers parsed from the feed or the file tags. Stored rather than re-parsed on every play, because parsing ID3 chapters means reading the media file, which may not be downloaded. */
CREATE TABLE IF NOT EXISTS "episode_chapters" (
	-- Local rowid.
	"id" INTEGER,
	-- Parent episode.
	"episode_id" INTEGER NOT NULL,
	-- Offset where the chapter begins. Chapters are a flat list of start points; the next row implies the end.
	"start_seconds" INTEGER NOT NULL,
	-- Chapter title shown on the now-playing screen.
	"title" TEXT NOT NULL,
	-- Cached chapter artwork path, relative to the app container.
	"image_path" TEXT,
	-- Link the chapter points at, typically a sponsor or show notes URL.
	"url" TEXT,
	PRIMARY KEY("id"),
	FOREIGN KEY ("episode_id") REFERENCES "episodes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_chapters_episode_start"
ON "episode_chapters" ("episode_id", "start_seconds");
/* Current playback position per episode, updated in place. Written far more often than anything else in the database, which is why it is a narrow table of its own rather than columns on episodes. */
CREATE TABLE IF NOT EXISTS "playback_states" (
	-- Episode this position belongs to. The episode id is the primary key, which makes the one-row-per-episode rule structural rather than a convention.
	"episode_id" INTEGER,
	-- Resume point. Written every few seconds while playing, which on a phone means it should be the only column that gets hot.
	"position_seconds" INTEGER NOT NULL DEFAULT 0,
	-- Marked complete. Separate from the position, because an episode stopped during the outro is finished and one stopped at 3 seconds is not.
	"is_finished" BOOLEAN NOT NULL DEFAULT false,
	-- When it was completed. Null while unfinished; used for the "recently played" list.
	"finished_at" TEXT,
	-- ISO 8601 instant of the last playback activity. Continue Listening sorts on this.
	"last_played_at" TEXT NOT NULL,
	-- Speed override for this episode only. Null falls back to the per-show setting, then to the global default - the one place a float belongs here.
	"playback_rate" REAL,
	-- Local modification instant. Compared against the server copy during sync to decide which side wins.
	"updated_at" TEXT NOT NULL,
	PRIMARY KEY("episode_id"),
	FOREIGN KEY ("episode_id") REFERENCES "episodes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_playback_last_played"
ON "playback_states" ("last_played_at");
/* Download bookkeeping. The database tracks state and the filesystem holds bytes, so a startup reconciliation that finds a missing file flips the row back to queued rather than pretending the episode is playable offline. */
CREATE TABLE IF NOT EXISTS "downloads" (
	-- Episode being downloaded. One download per episode on one device, so the episode id is the key.
	"episode_id" INTEGER,
	-- queued | downloading | complete | failed | deleted. The state machine the download manager resumes from after the app is killed mid-transfer.
	"state" TEXT NOT NULL DEFAULT 'queued',
	-- Path of the audio file relative to the app container. Null until the transfer completes.
	"file_path" TEXT,
	-- Expected size from the Content-Length header. Null until the first response arrives.
	"bytes_total" INTEGER,
	-- Bytes on disk so far. Persisted so a resumed transfer sends a correct Range header instead of restarting.
	"bytes_downloaded" INTEGER NOT NULL DEFAULT 0,
	-- Last failure message, kept so a permanent 404 can be shown rather than retried forever.
	"error" TEXT,
	-- When the download was requested, including by an auto-download rule.
	"requested_at" TEXT NOT NULL,
	-- When the file finished. Null until then, and the input to the auto-delete-after-N-days rule.
	"completed_at" TEXT,
	PRIMARY KEY("episode_id"),
	FOREIGN KEY ("episode_id") REFERENCES "episodes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_downloads_state_requested"
ON "downloads" ("state", "requested_at");
/* The play queue, one row per episode, ordered by an integer column. Reordering rewrites the affected range in a transaction; on a single-writer local database that is trivially safe. */
CREATE TABLE IF NOT EXISTS "queue_items" (
	-- Local rowid. The same episode can only be queued once, but a surrogate key keeps reordering simple.
	"id" INTEGER,
	-- Queued episode. Unique, because a queue with the same episode twice is always a bug rather than a feature here.
	"episode_id" INTEGER NOT NULL UNIQUE,
	-- Explicit zero-based order. The queue is what actually plays next, so its order is data, not a sort expression.
	"position" INTEGER NOT NULL,
	-- When it entered the queue.
	"added_at" TEXT NOT NULL,
	-- user | auto_new_episode | auto_continue. Knowing why something is in the queue is what lets the app clean up after a rule the user later turns off.
	"added_by" TEXT NOT NULL DEFAULT 'user',
	PRIMARY KEY("id"),
	FOREIGN KEY ("episode_id") REFERENCES "episodes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_position"
ON "queue_items" ("position");
/* Per-show overrides, with nulls meaning inherit. Storing an explicit copy of the global default instead would silently freeze a show at whatever the default was on the day it was subscribed. */
CREATE TABLE IF NOT EXISTS "show_settings" (
	-- Show these settings apply to. One row per show, created lazily on the first change.
	"show_id" INTEGER,
	-- Default speed for this show. Null inherits the global setting, so an untouched show follows a later change to the default.
	"playback_rate" REAL,
	-- Seconds to skip at the start, for shows with a fixed opening.
	"skip_intro_seconds" INTEGER NOT NULL DEFAULT 0,
	-- Seconds to cut from the end, which also decides when is_finished is set.
	"skip_outro_seconds" INTEGER NOT NULL DEFAULT 0,
	-- Whether new episodes download automatically on wi-fi.
	"auto_download" BOOLEAN NOT NULL DEFAULT false,
	-- off | top | bottom. Where a new episode is inserted in the queue.
	"auto_queue" TEXT NOT NULL DEFAULT 'off',
	-- How many downloaded episodes to retain before deleting the oldest. Null means keep everything until storage runs low.
	"keep_latest" INTEGER,
	-- Whether a new episode raises a notification.
	"notify_new" BOOLEAN NOT NULL DEFAULT true,
	PRIMARY KEY("show_id"),
	FOREIGN KEY ("show_id") REFERENCES "shows"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* A log of feed fetches carrying the conditional-request cursors. Keeping the last few rows per show is what makes "this podcast has not updated since March" answerable without a server. */
CREATE TABLE IF NOT EXISTS "feed_syncs" (
	-- Local rowid.
	"id" INTEGER,
	-- Feed that was fetched.
	"show_id" INTEGER NOT NULL,
	-- ISO 8601 instant the fetch began.
	"started_at" TEXT NOT NULL,
	-- ok | not_modified | http_error | parse_error. not_modified is the common case and the reason the conditional headers below exist.
	"status" TEXT NOT NULL,
	-- Response status code. Null when the request never completed, for example offline.
	"http_status" INTEGER,
	-- ETag from the response, replayed as If-None-Match on the next fetch. This is the cursor that makes polling hundreds of feeds affordable on a metered connection.
	"etag" TEXT,
	-- Last-Modified header, replayed as If-Modified-Since when the server sends no ETag.
	"last_modified" TEXT,
	-- Items inserted by this fetch. Drives the badge and makes a runaway feed obvious.
	"new_episode_count" INTEGER NOT NULL DEFAULT 0,
	-- Failure detail, kept so a feed that has been dead for weeks can be surfaced instead of retried silently.
	"error" TEXT,
	PRIMARY KEY("id"),
	FOREIGN KEY ("show_id") REFERENCES "shows"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_feed_syncs_show_time"
ON "feed_syncs" ("show_id", "started_at");
/* Append-only listening log, kept separate from playback_states. The state table answers where to resume; this one answers how much was listened to, and pruning it never costs anyone their place. */
CREATE TABLE IF NOT EXISTS "play_history" (
	-- Local rowid, monotonic so the log pages cleanly.
	"id" INTEGER,
	-- Episode listened to.
	"episode_id" INTEGER NOT NULL,
	-- ISO 8601 instant playback began.
	"started_at" TEXT NOT NULL,
	-- Seconds actually heard in this stretch, which is what listening-time statistics are summed from.
	"seconds_played" INTEGER NOT NULL,
	-- Whether this stretch reached the end of the episode.
	"completed" BOOLEAN NOT NULL DEFAULT false,
	-- Device the listening happened on, filled in when history is merged from another device.
	"device_name" TEXT,
	PRIMARY KEY("id"),
	FOREIGN KEY ("episode_id") REFERENCES "episodes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_history_episode_time"
ON "play_history" ("episode_id", "started_at");

CREATE INDEX IF NOT EXISTS "idx_history_time"
ON "play_history" ("started_at");
/* Pending changes to push when the device next has a network. This table is what makes the app work offline: every mutation writes the local row and an outbox row in the same transaction. */
CREATE TABLE IF NOT EXISTS "sync_outbox" (
	-- Local rowid, and the send order. Changes must replay in the order they were made.
	"id" INTEGER,
	-- subscription | playback | queue | download_flag. Which local change is pending.
	"entity" TEXT NOT NULL,
	-- Stable remote identity of the thing that changed - a feed URL or an episode GUID, never a local rowid, which means nothing to the server.
	"entity_key" TEXT NOT NULL,
	-- upsert | delete.
	"operation" TEXT NOT NULL,
	-- JSON body of the change, serialised at the time it happened so a later edit does not rewrite an already-queued one.
	"payload" TEXT NOT NULL,
	-- When the change was made locally.
	"created_at" TEXT NOT NULL,
	-- Send attempts so far, used for exponential backoff.
	"attempts" INTEGER NOT NULL DEFAULT 0,
	-- Last failure, so a permanently rejected change can be dropped rather than retried forever.
	"last_error" TEXT,
	PRIMARY KEY("id")
);

CREATE INDEX IF NOT EXISTS "idx_outbox_entity"
ON "sync_outbox" ("entity", "entity_key");
/* Global preferences: default playback rate, download-on-wifi-only, sleep timer default, theme. Exactly one row per key, and the only table here with no foreign key. */
CREATE TABLE IF NOT EXISTS "app_settings" (
	-- Setting name. A key-value table, because app preferences change with every release and migrating a wide settings table for each one is not worth it.
	"key" TEXT,
	-- Value serialised as text. SQLite stores it dynamically anyway, and the app knows the type it expects.
	"value" TEXT NOT NULL,
	-- When it was last changed, used when merging settings from another device.
	"updated_at" TEXT NOT NULL,
	PRIMARY KEY("key")
);
