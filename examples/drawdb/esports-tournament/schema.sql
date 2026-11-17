CREATE TABLE IF NOT EXISTS `tournaments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`slug` VARCHAR(120) NOT NULL UNIQUE COMMENT 'URL segment, e.g. autumn-major-2026. Stable once published because it ends up in links and brackets people share.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Display name.',
	`game_title` VARCHAR(80) NOT NULL COMMENT 'Game being played. A string rather than a table because this schema serves one circuit at a time.',
	`format` VARCHAR(24) NOT NULL COMMENT 'single_elimination | double_elimination | round_robin | swiss. The headline format; individual stages may differ, which is why stages carry their own.',
	`state` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft | registration | locked | live | completed | cancelled. Locked is the state in which rosters are frozen but play has not begun.',
	`registration_opens_at` DATETIME COMMENT 'When teams may start signing up. Null for an invitational.',
	`registration_closes_at` DATETIME COMMENT 'Last moment to enter.',
	`roster_lock_at` DATETIME NOT NULL COMMENT 'Deadline after which a roster may only change through an approved substitution. This single timestamp is what makes ringers a rules problem rather than a data problem.',
	`starts_at` DATETIME NOT NULL COMMENT 'First scheduled match.',
	`ends_at` DATETIME COMMENT 'Grand final. Null while the calendar is provisional.',
	`max_teams` SMALLINT NOT NULL COMMENT 'Field size. Bracket generation reads this, so a 16-team bracket cannot be built for a 12-team field by accident.',
	`prize_pool_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Total pool in the smallest currency unit. Integer only, never float.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency for every money column in this tournament.',
	`organiser_name` VARCHAR(160) NOT NULL COMMENT 'Who is running it. Appears on rulings and on prize payouts.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time.',
	PRIMARY KEY(`id`)
) COMMENT='One competition. It owns the money, the calendar and the roster lock; everything about how matches are arranged belongs to its stages.';


CREATE INDEX `idx_tournaments_state_start`
ON `tournaments` (`state`, `starts_at`);
CREATE TABLE IF NOT EXISTS `stages` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`tournament_id` BIGINT NOT NULL COMMENT 'Parent competition.',
	`stage_index` TINYINT NOT NULL COMMENT 'Order of play, starting at one. Group stage then playoffs is two rows, not a flag.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Display name, e.g. Group Stage or Upper Bracket.',
	`format` VARCHAR(24) NOT NULL COMMENT 'single_elimination | double_elimination | round_robin | swiss. Mixing formats across stages is the normal case, not an exception.',
	`group_count` TINYINT NOT NULL DEFAULT 1 COMMENT 'Number of parallel groups in a round robin. One for a single table.',
	`swiss_rounds` TINYINT COMMENT 'Rounds to play in a Swiss stage. Null for every other format.',
	`default_best_of` TINYINT NOT NULL DEFAULT 3 COMMENT 'Series length used when generating matches. Individual bracket nodes override it, because a grand final is longer than a quarter-final.',
	`advancing_count` TINYINT COMMENT 'Teams promoted to the next stage. Null for the final stage, where nobody advances.',
	`starts_at` DATETIME COMMENT 'First match of the stage.',
	`ends_at` DATETIME COMMENT 'Last match of the stage.',
	PRIMARY KEY(`id`)
) COMMENT='A phase with one format. Splitting stages out is what lets a tournament run a Swiss opener into a double-elimination playoff without either half pretending to be the other.';


CREATE UNIQUE INDEX `uq_stages_tournament_index`
ON `stages` (`tournament_id`, `stage_index`);
CREATE TABLE IF NOT EXISTS `venues` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Arena, studio or server name.',
	`city` VARCHAR(120) COMMENT 'City. Null for an online venue.',
	`country_code` CHAR(2) COMMENT 'ISO 3166-1 alpha-2. Null for online.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone, e.g. Europe/Berlin. Stored because a schedule is published in local time and a match start is an instant; without it every published time is a guess.',
	`seating_capacity` INTEGER COMMENT 'Audience seats. Null for online or studio-only venues.',
	`is_online` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for remote play. Online venues still exist as rows so the schedule and the stream have a consistent place to hang.',
	PRIMARY KEY(`id`)
) COMMENT='Where a match happens. Modelling online as a venue rather than as a null keeps scheduling queries uniform across a mixed online and LAN circuit.';


CREATE TABLE IF NOT EXISTS `teams` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`slug` VARCHAR(120) NOT NULL UNIQUE COMMENT 'URL segment for the organisation page.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Full organisation name.',
	`tag` VARCHAR(8) NOT NULL COMMENT 'Short tag shown in brackets and on scoreboards, e.g. NRG. Not unique, because tags get reused across regions and eras.',
	`region_code` VARCHAR(12) NOT NULL COMMENT 'Competitive region, e.g. emea or na. Drives regional qualification, not latency.',
	`country_code` CHAR(2) COMMENT 'Registered country. Null for multi-national organisations with no single home.',
	`founded_on` DATE COMMENT 'Organisation founding date, for the profile page.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False for disbanded organisations. Rows are never deleted because historical brackets still reference them.',
	PRIMARY KEY(`id`)
) COMMENT='A persistent organisation that exists between tournaments. It never holds a roster directly - rosters belong to a tournament entry, because the five players who represent a team change constantly.';


CREATE INDEX `idx_teams_region_active`
ON `teams` (`region_code`, `is_active`);
CREATE TABLE IF NOT EXISTS `players` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`gamertag` VARCHAR(60) NOT NULL UNIQUE COMMENT 'Competitive handle. Unique because it is the identifier casters, brackets and statistics all key on.',
	`full_name` VARCHAR(160) COMMENT 'Legal name, needed for visas and prize payouts. Null until a player supplies it.',
	`country_code` CHAR(2) COMMENT 'Nationality, which drives roster nationality rules in regional leagues.',
	`date_of_birth` DATE COMMENT 'Used for minimum-age eligibility. Kept as a date, never as an age, because an age is wrong the next morning.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False after retirement. Retired players stay referenced by historical rosters.',
	PRIMARY KEY(`id`)
) COMMENT='A competitor as a person, independent of any organisation. Keeping players separate from teams is what makes a transfer a new roster row rather than a rewritten history.';


CREATE TABLE IF NOT EXISTS `tournament_entries` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`tournament_id` BIGINT NOT NULL COMMENT 'Competition entered.',
	`team_id` BIGINT NOT NULL COMMENT 'Organisation entering.',
	`seed` TINYINT COMMENT 'Seeding position used to place the team in the bracket. Null until seeding is decided.',
	`group_label` VARCHAR(8) COMMENT 'Group in a round-robin stage, e.g. A. Null outside group play.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'registered' COMMENT 'registered | confirmed | checked_in | withdrawn | disqualified. A disqualified entry keeps its matches and forfeits them rather than vanishing from the bracket.',
	`registered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Sign-up time, which breaks ties for the last slot in an open field.',
	`roster_locked_at` DATETIME COMMENT 'When this entry roster was frozen. Usually the tournament deadline, but an early-locking team gets its own timestamp.',
	PRIMARY KEY(`id`)
) COMMENT='A team participation in one tournament, and the thing brackets and rosters actually reference. Pointing matches at the entry rather than the team is what lets the same organisation appear in two concurrent events with different lineups.';


CREATE UNIQUE INDEX `uq_entries_tournament_team`
ON `tournament_entries` (`tournament_id`, `team_id`);
CREATE INDEX `idx_entries_tournament_seed`
ON `tournament_entries` (`tournament_id`, `seed`);
CREATE TABLE IF NOT EXISTS `roster_slots` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`entry_id` BIGINT NOT NULL COMMENT 'Tournament entry this roster belongs to.',
	`player_id` BIGINT NOT NULL COMMENT 'Player on the roster.',
	`role` VARCHAR(32) COMMENT 'In-game role, e.g. support or in_game_leader. Null when the game has no formal roles.',
	`is_starter` BOOLEAN NOT NULL DEFAULT true COMMENT 'False for a registered substitute. Substitutes must still be registered before the lock, which is the whole reason they occupy a roster slot at all.',
	`added_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the player joined the roster. Rows added after roster_lock_at are only legal via an approved substitution.',
	`removed_at` DATETIME COMMENT 'When they left it. Null for a current member; rows are closed rather than deleted so a bracket from round one still names the right five players.',
	PRIMARY KEY(`id`)
) COMMENT='Membership with a validity window. Closing a row instead of deleting it is what makes the roster at any past moment reconstructible, which is exactly what a roster-lock dispute needs.';


CREATE UNIQUE INDEX `uq_roster_entry_player_added`
ON `roster_slots` (`entry_id`, `player_id`, `added_at`);
CREATE INDEX `idx_roster_player`
ON `roster_slots` (`player_id`);
CREATE TABLE IF NOT EXISTS `substitutions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`entry_id` BIGINT NOT NULL COMMENT 'Entry whose roster is changing.',
	`match_id` BIGINT COMMENT 'Match the change takes effect from. Null for a change between stages that applies to everything remaining.',
	`player_out_id` BIGINT NOT NULL COMMENT 'Player being replaced.',
	`player_in_id` BIGINT NOT NULL COMMENT 'Player coming in. Must already hold a roster slot on the entry unless the ruling grants an exception.',
	`reason` VARCHAR(40) NOT NULL COMMENT 'illness | visa | emergency | disciplinary | strategic. Strategic substitutions are usually restricted after the lock, which is why the reason is recorded rather than assumed.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'requested' COMMENT 'requested | approved | rejected | withdrawn. Only approved substitutions change who may play.',
	`requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the team asked.',
	`decided_at` DATETIME COMMENT 'When the organiser ruled.',
	`decided_by` VARCHAR(120) COMMENT 'Official who ruled. Null while the request is open.',
	PRIMARY KEY(`id`)
) COMMENT='A post-lock roster change and the ruling on it. It is an approval record rather than a direct edit, because after the lock the interesting question is not who played but who allowed it.';


CREATE INDEX `idx_subs_entry_state`
ON `substitutions` (`entry_id`, `state`);
CREATE TABLE IF NOT EXISTS `bracket_nodes` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`stage_id` BIGINT NOT NULL COMMENT 'Stage the bracket belongs to.',
	`round_index` TINYINT NOT NULL COMMENT 'Round number within the bracket side. Round one is the first games played, not the final.',
	`position_in_round` SMALLINT NOT NULL COMMENT 'Slot within the round, top to bottom as drawn. With round_index it gives every node a stable coordinate for rendering.',
	`label` VARCHAR(60) NOT NULL COMMENT 'Human name, e.g. Upper Semifinal 2. What casters and schedules actually say.',
	`bracket_side` VARCHAR(12) NOT NULL DEFAULT 'main' COMMENT 'main | upper | lower | final. Double elimination needs both sides plus a grand final node that pulls one team from each.',
	`best_of` TINYINT NOT NULL DEFAULT 3 COMMENT 'Series length for this node, overriding the stage default. A grand final is longer, and that is a property of the position in the bracket, not of the match played there.',
	`slot_a_source` VARCHAR(12) NOT NULL COMMENT 'seed | winner | loser | bye. Says where the first competitor comes from, which is the whole trick of bracket modelling.',
	`slot_a_node_id` BIGINT COMMENT 'Node the first competitor is pulled from when slot_a_source is winner or loser. Null for a seeded entry.',
	`slot_a_entry_id` BIGINT COMMENT 'Directly seeded entry for the first slot. Null whenever the competitor is decided by an earlier node.',
	`slot_b_source` VARCHAR(12) NOT NULL COMMENT 'seed | winner | loser | bye for the second competitor.',
	`slot_b_node_id` BIGINT COMMENT 'Node the second competitor is pulled from. Null for a seeded entry.',
	`slot_b_entry_id` BIGINT COMMENT 'Directly seeded entry for the second slot.',
	PRIMARY KEY(`id`)
) COMMENT='The bracket structure, as a tree of self-referencing nodes. Winner of match 7 plays winner of match 8 is stored on the later node as two pull references, so the whole bracket exists before anyone has played and a result propagates by writing one match winner.';


CREATE UNIQUE INDEX `uq_nodes_stage_round_position`
ON `bracket_nodes` (`stage_id`, `round_index`, `position_in_round`);
CREATE INDEX `idx_nodes_slot_a_source`
ON `bracket_nodes` (`slot_a_node_id`);
CREATE INDEX `idx_nodes_slot_b_source`
ON `bracket_nodes` (`slot_b_node_id`);
CREATE TABLE IF NOT EXISTS `matches` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`tournament_id` BIGINT NOT NULL COMMENT 'Competition, denormalised from the stage so the tournament schedule is one query.',
	`stage_id` BIGINT NOT NULL COMMENT 'Stage the match belongs to.',
	`bracket_node_id` BIGINT UNIQUE COMMENT 'Bracket position being played. Unique, so a node hosts at most one series. Null for round-robin games, which have no bracket position.',
	`venue_id` BIGINT COMMENT 'Where it is played. Null until the schedule is finalised.',
	`entry_a_id` BIGINT COMMENT 'First competitor. Null while the feeding nodes are still undecided, which is why a bracket can be published before anyone has played.',
	`entry_b_id` BIGINT COMMENT 'Second competitor. Null for the same reason.',
	`best_of` TINYINT NOT NULL DEFAULT 3 COMMENT 'Series length snapshot from the bracket node. Snapshotted because changing the format of a future round must not rewrite a series already played.',
	`state` VARCHAR(20) NOT NULL DEFAULT 'scheduled' COMMENT 'scheduled | live | completed | forfeited | cancelled. A forfeit still has a winner and still advances the bracket.',
	`maps_won_a` TINYINT NOT NULL DEFAULT 0 COMMENT 'Maps won by the first competitor. Denormalised from match_maps so a bracket renders without aggregating.',
	`maps_won_b` TINYINT NOT NULL DEFAULT 0 COMMENT 'Maps won by the second competitor.',
	`winner_entry_id` BIGINT COMMENT 'Series winner. Writing this is the single action that advances the bracket, because later nodes pull from it.',
	`scheduled_at` DATETIME COMMENT 'Planned start instant, stored in UTC and rendered in the venue timezone.',
	`started_at` DATETIME COMMENT 'Actual start. Delays against scheduled_at are the metric broadcast cares about.',
	`ended_at` DATETIME COMMENT 'Actual finish.',
	`stream_url` VARCHAR(300) COMMENT 'Broadcast link for this series.',
	PRIMARY KEY(`id`)
) COMMENT='One series between two entries. Competitors are nullable on purpose: a bracket is generated in full before it is played, and a match is filled in as the nodes feeding it resolve.';


CREATE INDEX `idx_matches_tournament_schedule`
ON `matches` (`tournament_id`, `scheduled_at`);
CREATE INDEX `idx_matches_stage_state`
ON `matches` (`stage_id`, `state`);
CREATE TABLE IF NOT EXISTS `match_maps` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`match_id` BIGINT NOT NULL COMMENT 'Series this game belongs to.',
	`map_index` TINYINT NOT NULL COMMENT 'Game number within the series, starting at one. Ordering matters because veto and side selection depend on it.',
	`map_name` VARCHAR(80) NOT NULL COMMENT 'Map or stage played.',
	`picked_by_entry_id` BIGINT COMMENT 'Entry that selected the map in the veto. Null for a decider map, which nobody picks.',
	`score_a` INTEGER NOT NULL DEFAULT 0 COMMENT 'Rounds, goals or kills for the first competitor on this map.',
	`score_b` INTEGER NOT NULL DEFAULT 0 COMMENT 'Same for the second competitor.',
	`winner_entry_id` BIGINT COMMENT 'Map winner. Null while the game is live or if it was voided.',
	`duration_seconds` INTEGER COMMENT 'Length of the game, used for scheduling estimates and for broadcast planning.',
	`stats` JSON COMMENT 'Per-map detail the format cares about: bans, picks, per-player lines. Schemaless because every title records something different.',
	PRIMARY KEY(`id`)
) COMMENT='One game inside a best-of series. Series score lives here and is summarised onto the match, which is what makes a 2-1 both auditable map by map and cheap to render.';


CREATE UNIQUE INDEX `uq_maps_match_index`
ON `match_maps` (`match_id`, `map_index`);
CREATE TABLE IF NOT EXISTS `prize_distributions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`tournament_id` BIGINT NOT NULL COMMENT 'Competition whose pool is being split.',
	`placement_from` TINYINT NOT NULL COMMENT 'First place in the band. Elimination brackets produce shared placements, so a band rather than a single rank is the honest unit.',
	`placement_to` TINYINT NOT NULL COMMENT 'Last place in the band. Equal to placement_from for an outright position such as first.',
	`share_percent` DECIMAL(6,3) NOT NULL COMMENT 'Percentage of the pool each team in the band receives. Percentages across all bands must total one hundred, which is a cheap check before payout.',
	`amount_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Resolved amount per team in the smallest unit, computed once the pool is final. Stored so rounding is decided once rather than differently by every reader.',
	PRIMARY KEY(`id`)
) COMMENT='The published payout table, which exists before anyone qualifies. Bands rather than single ranks are required because a single-elimination bracket genuinely cannot distinguish the two teams knocked out in the semi-finals.';


CREATE UNIQUE INDEX `uq_prizes_tournament_placement`
ON `prize_distributions` (`tournament_id`, `placement_from`);
CREATE TABLE IF NOT EXISTS `placements` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`tournament_id` BIGINT NOT NULL COMMENT 'Competition being settled.',
	`entry_id` BIGINT NOT NULL COMMENT 'Team entry being placed.',
	`final_rank` TINYINT NOT NULL COMMENT 'Where the team finished. Teams sharing a band share the rank, matching the prize table.',
	`prize_amount_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Money owed, resolved from the prize band at the time of settlement.',
	`circuit_points` INTEGER NOT NULL DEFAULT 0 COMMENT 'Season or circuit points earned, which usually matter more than the money for qualification.',
	`paid_at` DATETIME COMMENT 'When the payout cleared. Null while owed, which makes an outstanding-prizes report a single query.',
	PRIMARY KEY(`id`)
) COMMENT='The settled result, written once the bracket completes. It is a separate table from the prize bands because the band is a plan and the placement is what actually happened, including disqualifications that move everyone below up a rung.';


CREATE UNIQUE INDEX `uq_placements_tournament_entry`
ON `placements` (`tournament_id`, `entry_id`);
CREATE INDEX `idx_placements_tournament_rank`
ON `placements` (`tournament_id`, `final_rank`);
ALTER TABLE `stages`
ADD FOREIGN KEY(`tournament_id`) REFERENCES `tournaments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `tournament_entries`
ADD FOREIGN KEY(`tournament_id`) REFERENCES `tournaments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `tournament_entries`
ADD FOREIGN KEY(`team_id`) REFERENCES `teams`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `roster_slots`
ADD FOREIGN KEY(`entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `roster_slots`
ADD FOREIGN KEY(`player_id`) REFERENCES `players`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `substitutions`
ADD FOREIGN KEY(`entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `substitutions`
ADD FOREIGN KEY(`match_id`) REFERENCES `matches`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `substitutions`
ADD FOREIGN KEY(`player_out_id`) REFERENCES `players`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `substitutions`
ADD FOREIGN KEY(`player_in_id`) REFERENCES `players`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `bracket_nodes`
ADD FOREIGN KEY(`stage_id`) REFERENCES `stages`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `bracket_nodes`
ADD FOREIGN KEY(`slot_a_node_id`) REFERENCES `bracket_nodes`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `bracket_nodes`
ADD FOREIGN KEY(`slot_b_node_id`) REFERENCES `bracket_nodes`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `bracket_nodes`
ADD FOREIGN KEY(`slot_a_entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `bracket_nodes`
ADD FOREIGN KEY(`slot_b_entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `matches`
ADD FOREIGN KEY(`tournament_id`) REFERENCES `tournaments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `matches`
ADD FOREIGN KEY(`stage_id`) REFERENCES `stages`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `matches`
ADD FOREIGN KEY(`bracket_node_id`) REFERENCES `bracket_nodes`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `matches`
ADD FOREIGN KEY(`venue_id`) REFERENCES `venues`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `matches`
ADD FOREIGN KEY(`entry_a_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `matches`
ADD FOREIGN KEY(`entry_b_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `matches`
ADD FOREIGN KEY(`winner_entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `match_maps`
ADD FOREIGN KEY(`match_id`) REFERENCES `matches`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `match_maps`
ADD FOREIGN KEY(`picked_by_entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `match_maps`
ADD FOREIGN KEY(`winner_entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `prize_distributions`
ADD FOREIGN KEY(`tournament_id`) REFERENCES `tournaments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `placements`
ADD FOREIGN KEY(`tournament_id`) REFERENCES `tournaments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `placements`
ADD FOREIGN KEY(`entry_id`) REFERENCES `tournament_entries`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
