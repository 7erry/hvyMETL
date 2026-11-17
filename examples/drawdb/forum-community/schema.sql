CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`username` VARCHAR(30) NOT NULL UNIQUE COMMENT 'Public handle. Unique, immutable by convention, and what every post is attributed to.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Login and notification address.',
	`password_hash` VARCHAR(255) NOT NULL COMMENT 'Argon2 or bcrypt digest. Never the password.',
	`title` VARCHAR(60) COMMENT 'Custom rank shown under the avatar, e.g. Senior Member. Null falls back to a title derived from post count.',
	`signature` VARCHAR(1000) COMMENT 'Block appended to every post. A forum institution, and the reason posts are rendered with author state rather than frozen.',
	`avatar_url` VARCHAR(500) COMMENT 'Profile image.',
	`post_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Denormalised total. It is shown beside every post the user has ever made, so counting on read is not an option.',
	`reputation` INTEGER NOT NULL DEFAULT 0 COMMENT 'Running total of reputation_events. Cached here because it is displayed next to the post count on every page.',
	`joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Registration time, also printed under the avatar.',
	`last_seen_at` DATETIME COMMENT 'Last activity, used for the online list and for pruning dormant accounts.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | unconfirmed | suspended | banned. Suspended users can still read, which is why this is not a boolean.',
	`suspended_until` DATETIME COMMENT 'End of a temporary suspension. Null for permanent bans and for active accounts.',
	PRIMARY KEY(`id`)
) COMMENT='A member. Post count and reputation are cached on the row because a forum renders the author identity beside every single post, and a page of forty replies must not become forty aggregate queries.';


CREATE INDEX `idx_users_state_seen`
ON `users` (`state`, `last_seen_at`);
CREATE TABLE IF NOT EXISTS `categories` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Heading shown on the index page, e.g. General Discussion.',
	`slug` VARCHAR(120) NOT NULL UNIQUE COMMENT 'URL segment.',
	`description` VARCHAR(500) COMMENT 'One-line explanation under the heading.',
	`display_order` INTEGER NOT NULL DEFAULT 0 COMMENT 'Manual position on the index. Categories are curated by staff, not ranked by activity — that is the first thing that separates this from a vote-driven site.',
	`is_collapsed_by_default` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for archive sections that should not dominate the index.',
	PRIMARY KEY(`id`)
) COMMENT='A top-level grouping of boards. It holds no threads of its own: it exists to give the index page a stable, human-arranged shape that nobody can change by posting.';


CREATE TABLE IF NOT EXISTS `boards` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`category_id` BIGINT NOT NULL COMMENT 'Category this board sits under.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Board name.',
	`slug` VARCHAR(120) NOT NULL UNIQUE COMMENT 'URL segment.',
	`description` VARCHAR(500) COMMENT 'What belongs here. On a curated forum this is the rule that moderators enforce.',
	`display_order` INTEGER NOT NULL DEFAULT 0 COMMENT 'Manual position within the category.',
	`thread_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Denormalised count shown on the index.',
	`post_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Denormalised count shown on the index. Maintained by trigger or by the same transaction that posts.',
	`last_post_at` DATETIME COMMENT 'Timestamp of the newest post anywhere in the board, so the index shows activity without touching threads.',
	`min_read_level` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Minimum permission level to see the board. Staff-only areas are a level, not a separate table.',
	`min_post_level` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Minimum level to reply. Read-only announcement boards set this above every member level.',
	`is_locked` BOOLEAN NOT NULL DEFAULT false COMMENT 'True archives the whole board: existing threads stay readable, nothing new can be posted.',
	PRIMARY KEY(`id`)
) COMMENT='A forum section, and the unit of permission and moderation. Boards are created by staff, which is the structural difference from a site where any user can start a community.';


CREATE INDEX `idx_boards_category_order`
ON `boards` (`category_id`, `display_order`);
CREATE TABLE IF NOT EXISTS `board_moderators` (
	`board_id` BIGINT COMMENT 'Board being moderated. Half of the composite primary key.',
	`user_id` BIGINT COMMENT 'Moderator. The other half; the pair is the key because one appointment per person per board is all that makes sense.',
	`can_edit_posts` BOOLEAN NOT NULL DEFAULT true COMMENT 'May edit member posts in place, the defining moderator power on a forum.',
	`can_move_threads` BOOLEAN NOT NULL DEFAULT true COMMENT 'May move a thread to another board, which is the usual answer to an off-topic post.',
	`can_ban_users` BOOLEAN NOT NULL DEFAULT false COMMENT 'Reserved for senior moderators. Kept as a grant rather than a role so a board can have a junior moderator.',
	`appointed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the appointment was made.',
	`appointed_by_id` BIGINT COMMENT 'Administrator who made the appointment. Null for the founding staff.',
	PRIMARY KEY(`board_id`, `user_id`)
) COMMENT='Moderation authority scoped to a board. Per-board rather than global because forum moderation is traditionally delegated to people who actually care about that section.';


CREATE INDEX `idx_board_moderators_user`
ON `board_moderators` (`user_id`);
CREATE TABLE IF NOT EXISTS `threads` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`board_id` BIGINT NOT NULL COMMENT 'Board the thread lives in. Changed when a moderator moves it, which is why it is not derived from the first post.',
	`author_id` BIGINT NOT NULL COMMENT 'Member who opened it.',
	`title` VARCHAR(250) NOT NULL COMMENT 'Thread title, shown in the listing and editable by moderators.',
	`slug` VARCHAR(250) NOT NULL COMMENT 'URL segment derived from the title at creation and frozen, so retitling does not break inbound links.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open | locked | hidden | deleted. Locked threads stay readable, which is the point of locking rather than deleting.',
	`is_sticky` BOOLEAN NOT NULL DEFAULT false COMMENT 'Pins the thread above the rest of the listing. A staff decision, not an earned position.',
	`sticky_until` DATETIME COMMENT 'When the pin expires. Null for permanent stickies; without it, announcement threads accumulate forever.',
	`view_count` BIGINT NOT NULL DEFAULT 0 COMMENT 'Page views, incremented on read and deliberately approximate. It is an engagement signal, never a ranking input.',
	`reply_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Posts after the first. Denormalised so the listing does not count rows per thread.',
	`first_post_id` BIGINT COMMENT 'Opening post, for rendering the listing preview. Null only in the instant between inserting the thread and its first post.',
	`last_post_id` BIGINT COMMENT 'Newest post, so the listing can show who replied last without a subquery.',
	`last_posted_at` DATETIME COMMENT 'Timestamp of the newest post. This column, not a score, is what orders the board — a reply bumps the thread back to the top.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the thread was opened.',
	PRIMARY KEY(`id`)
) COMMENT='A conversation. Ordering is by last_posted_at with stickies first, so a thread rises by being replied to rather than by being upvoted — the single decision that gives a forum its character.';


CREATE INDEX `idx_threads_board_listing`
ON `threads` (`board_id`, `is_sticky`, `last_posted_at`);
CREATE INDEX `idx_threads_author`
ON `threads` (`author_id`, `created_at`);
CREATE INDEX `idx_threads_board_state`
ON `threads` (`board_id`, `state`);
CREATE TABLE IF NOT EXISTS `posts` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`thread_id` BIGINT NOT NULL COMMENT 'Thread this post belongs to.',
	`author_id` BIGINT NOT NULL COMMENT 'Member who wrote it.',
	`post_number` INTEGER NOT NULL COMMENT 'Position within the thread, starting at 1. Stable, citable, and what a permalink and a #12 reference point at.',
	`body` MEDIUMTEXT NOT NULL COMMENT 'Post source in the forum markup, stored unrendered so signatures, quotes and emoticons can be re-rendered after a parser change.',
	`quoted_post_id` BIGINT COMMENT 'Post being replied to. Null for a plain reply; a flat thread with optional quoting rather than a comment tree.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'visible' COMMENT 'visible | edited | hidden | deleted. Deleted posts keep their number so the thread does not renumber underneath every existing link.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Post time; also the thread ordering, because posts always read oldest first.',
	`edited_at` DATETIME COMMENT 'Last edit. Null for unedited posts, and non-null is what triggers the visible edit notice.',
	`edited_by_id` BIGINT COMMENT 'Who edited. Different from the author when a moderator intervened, which is exactly the case members want disclosed.',
	`edit_reason` VARCHAR(255) COMMENT 'Shown in the edit notice. Expected when a moderator edits someone else.',
	`author_ip` VARBINARY(16) COMMENT 'Packed IPv4 or IPv6 address of the poster, kept for ban evasion checks and purged on a retention schedule.',
	PRIMARY KEY(`id`)
) COMMENT='One message, flat within its thread. post_number is the identity members actually use, and it is never reassigned — a removed post leaves a gap, because renumbering would silently invalidate every quote and link that mentions it.';


CREATE UNIQUE INDEX `uq_posts_thread_number`
ON `posts` (`thread_id`, `post_number`);
CREATE INDEX `idx_posts_author_time`
ON `posts` (`author_id`, `created_at`);
CREATE INDEX `idx_posts_quoted`
ON `posts` (`quoted_post_id`);
CREATE TABLE IF NOT EXISTS `thread_subscriptions` (
	`thread_id` BIGINT COMMENT 'Thread being watched. Half of the composite primary key.',
	`user_id` BIGINT COMMENT 'Subscriber. The other half; the pair being the key makes subscribing idempotent.',
	`subscribed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the subscription started.',
	`notify_mode` VARCHAR(16) NOT NULL DEFAULT 'instant' COMMENT 'instant | daily | none. The none mode is a bookmark: watch the thread without receiving mail.',
	`last_read_post_number` INTEGER NOT NULL DEFAULT 0 COMMENT 'How far the member has read. This is what powers the jump-to-first-unread link that defines forum navigation.',
	`last_notified_at` DATETIME COMMENT 'Last notification sent, so a burst of replies produces one mail rather than twenty.',
	`is_muted` BOOLEAN NOT NULL DEFAULT false COMMENT 'True suppresses notifications while keeping the read position, for a thread someone wants to stop hearing about.',
	PRIMARY KEY(`thread_id`, `user_id`)
) COMMENT='A watched thread plus a read position. Storing the read pointer here rather than as a global timestamp is what lets a member have unread posts in one thread and not another.';


CREATE INDEX `idx_subscriptions_user`
ON `thread_subscriptions` (`user_id`, `subscribed_at`);
CREATE TABLE IF NOT EXISTS `reputation_events` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`user_id` BIGINT NOT NULL COMMENT 'Member whose reputation changed.',
	`granted_by_id` BIGINT COMMENT 'Member who granted it. Null for automatic awards such as a post-count milestone.',
	`post_id` BIGINT COMMENT 'Post that prompted the award. Null for awards unrelated to a specific post.',
	`delta` INTEGER NOT NULL COMMENT 'Points added or removed. Negative values exist, but a single grant is capped by policy so no one can be destroyed in one action.',
	`reason` VARCHAR(255) COMMENT 'Why it was given. Required on negative awards, since unexplained reputation loss is the fastest way to lose a community.',
	`event_type` VARCHAR(24) NOT NULL COMMENT 'member_grant | staff_award | badge_award | milestone | penalty.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it happened.',
	PRIMARY KEY(`id`)
) COMMENT='An append-only reputation ledger. Every point is attributable to a person and a reason, which is what makes reciprocal back-scratching findable — the opposite of an anonymous vote, and the whole reason this is not a votes table.';


CREATE INDEX `idx_reputation_user_time`
ON `reputation_events` (`user_id`, `created_at`);
CREATE INDEX `idx_reputation_granter_time`
ON `reputation_events` (`granted_by_id`, `created_at`);
CREATE TABLE IF NOT EXISTS `badges` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(40) NOT NULL UNIQUE COMMENT 'Stable identifier used by the awarding rules, e.g. first_thousand_posts.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Display name.',
	`description` VARCHAR(500) NOT NULL COMMENT 'What earns it. Shown on the badge list so the criteria are public.',
	`tier` VARCHAR(16) NOT NULL DEFAULT 'bronze' COMMENT 'bronze | silver | gold | staff. Purely cosmetic ranking of badges.',
	`icon_url` VARCHAR(500) COMMENT 'Image shown under the avatar.',
	`is_automatic` BOOLEAN NOT NULL DEFAULT true COMMENT 'True when a rule awards it. False for badges only staff can hand out, which are the ones members actually chase.',
	`reputation_bonus` INTEGER NOT NULL DEFAULT 0 COMMENT 'Points granted alongside the badge, written as a reputation_events row so the ledger stays complete.',
	PRIMARY KEY(`id`)
) COMMENT='A definition, not an award. Keeping the criteria as a row means the badge list is generated from the same data the awarding job reads, so what members are told matches what actually happens.';


CREATE TABLE IF NOT EXISTS `user_badges` (
	`user_id` BIGINT COMMENT 'Member holding the badge. Half of the composite primary key.',
	`badge_id` BIGINT COMMENT 'Badge held. The other half; a badge is earned once, and the key enforces it.',
	`awarded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was earned.',
	`awarded_by_id` BIGINT COMMENT 'Staff member who granted a manual badge. Null for automatic awards.',
	`is_featured` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for the badges the member chose to display beside their posts, since showing all of them would crowd out the post.',
	PRIMARY KEY(`user_id`, `badge_id`)
) COMMENT='An earned badge. The composite key is the whole enforcement: no surrogate id means the awarding job can insert-ignore and never double-award on a retry.';


CREATE INDEX `idx_user_badges_badge`
ON `user_badges` (`badge_id`);
CREATE TABLE IF NOT EXISTS `reports` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`reporter_id` BIGINT NOT NULL COMMENT 'Member who raised it.',
	`post_id` BIGINT COMMENT 'Reported post. Null when the report is about a whole thread or a user.',
	`thread_id` BIGINT COMMENT 'Reported thread. Null for post-level reports.',
	`reported_user_id` BIGINT COMMENT 'Reported member, for complaints about behaviour rather than one message.',
	`reason_code` VARCHAR(24) NOT NULL COMMENT 'spam | abuse | off_topic | duplicate | illegal | doxxing | other.',
	`details` VARCHAR(1000) COMMENT 'What the reporter says is wrong. Optional, but queues where it is usually filled in get resolved faster.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open | claimed | actioned | dismissed. Claimed exists so two moderators do not work the same report.',
	`claimed_by_id` BIGINT COMMENT 'Moderator currently handling it. Null while unclaimed, which is how the open queue is defined.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was raised. The queue is worked oldest first.',
	`resolved_at` DATETIME COMMENT 'When it left the queue. Null while outstanding; the gap to created_at is the response time staff are judged on.',
	PRIMARY KEY(`id`)
) COMMENT='A complaint, and the queue it sits in. Reports are separate from the actions taken on them because several members report the same post and one moderator decision resolves all of them.';


CREATE INDEX `idx_reports_queue`
ON `reports` (`state`, `created_at`);
CREATE INDEX `idx_reports_post`
ON `reports` (`post_id`);
CREATE INDEX `idx_reports_reporter`
ON `reports` (`reporter_id`, `created_at`);
CREATE TABLE IF NOT EXISTS `moderation_actions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`moderator_id` BIGINT NOT NULL COMMENT 'Staff member who acted.',
	`report_id` BIGINT COMMENT 'Report that prompted it. Null for proactive moderation, and the null is how unreported enforcement is measured.',
	`action_type` VARCHAR(24) NOT NULL COMMENT 'edit_post | hide_post | delete_post | lock_thread | move_thread | sticky_thread | warn_user | suspend_user | ban_user.',
	`target_post_id` BIGINT COMMENT 'Post acted on. Null for thread and user actions.',
	`target_thread_id` BIGINT COMMENT 'Thread acted on. Null for post and user actions.',
	`target_user_id` BIGINT COMMENT 'Member acted on. Null for content-only actions.',
	`reason` VARCHAR(500) NOT NULL COMMENT 'Justification, always required. A moderation log without reasons cannot survive an appeal.',
	`duration_hours` INTEGER COMMENT 'Length of a suspension. Null for permanent bans and for actions with no duration.',
	`is_reversed` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when the action was overturned. Reversals are marked rather than deleted so the log stays an honest history.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the action was taken.',
	PRIMARY KEY(`id`)
) COMMENT='An append-only moderation log. Every entry names a moderator, a target and a reason, which is what lets a community audit its staff instead of taking their word for it.';


CREATE INDEX `idx_mod_actions_moderator`
ON `moderation_actions` (`moderator_id`, `created_at`);
CREATE INDEX `idx_mod_actions_target_user`
ON `moderation_actions` (`target_user_id`, `created_at`);
CREATE INDEX `idx_mod_actions_report`
ON `moderation_actions` (`report_id`);
CREATE TABLE IF NOT EXISTS `private_messages` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`sender_id` BIGINT NOT NULL COMMENT 'Member who sent it.',
	`recipient_id` BIGINT NOT NULL COMMENT 'Member who receives it. One recipient per row, so a message to three people is three rows and each copy is deleted independently.',
	`parent_message_id` BIGINT COMMENT 'Message being replied to. Null starts a conversation; following the chain reconstructs the exchange.',
	`subject` VARCHAR(250) NOT NULL COMMENT 'Subject line. Forum messaging is modelled on mail, not on chat, so a subject is required.',
	`body` MEDIUMTEXT NOT NULL COMMENT 'Message source in the same markup as posts.',
	`sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Send time.',
	`read_at` DATETIME COMMENT 'When the recipient opened it. Null means unread, which is the inbox badge.',
	`sender_deleted` BOOLEAN NOT NULL DEFAULT false COMMENT 'Hides it from the outbox. Each side deletes its own copy, which is why this is not one shared row.',
	`recipient_deleted` BOOLEAN NOT NULL DEFAULT false COMMENT 'Hides it from the inbox.',
	`is_reported` BOOLEAN NOT NULL DEFAULT false COMMENT 'True once a recipient escalates it to staff, which is the only circumstance in which a moderator may read it.',
	PRIMARY KEY(`id`)
) COMMENT='A direct message, modelled as mail with one row per recipient. That duplication is deliberate: each side keeps its own read state and its own deletion, and neither can remove the other copy.';


CREATE INDEX `idx_pm_inbox`
ON `private_messages` (`recipient_id`, `read_at`, `sent_at`);
CREATE INDEX `idx_pm_outbox`
ON `private_messages` (`sender_id`, `sent_at`);
CREATE INDEX `idx_pm_thread`
ON `private_messages` (`parent_message_id`);
ALTER TABLE `boards`
ADD FOREIGN KEY(`category_id`) REFERENCES `categories`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `board_moderators`
ADD FOREIGN KEY(`board_id`) REFERENCES `boards`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `board_moderators`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `board_moderators`
ADD FOREIGN KEY(`appointed_by_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `threads`
ADD FOREIGN KEY(`board_id`) REFERENCES `boards`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `threads`
ADD FOREIGN KEY(`author_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `threads`
ADD FOREIGN KEY(`first_post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `threads`
ADD FOREIGN KEY(`last_post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `posts`
ADD FOREIGN KEY(`thread_id`) REFERENCES `threads`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `posts`
ADD FOREIGN KEY(`author_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `posts`
ADD FOREIGN KEY(`quoted_post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `posts`
ADD FOREIGN KEY(`edited_by_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thread_subscriptions`
ADD FOREIGN KEY(`thread_id`) REFERENCES `threads`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `thread_subscriptions`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reputation_events`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reputation_events`
ADD FOREIGN KEY(`granted_by_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `reputation_events`
ADD FOREIGN KEY(`post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `user_badges`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `user_badges`
ADD FOREIGN KEY(`badge_id`) REFERENCES `badges`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `user_badges`
ADD FOREIGN KEY(`awarded_by_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `reports`
ADD FOREIGN KEY(`reporter_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reports`
ADD FOREIGN KEY(`post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reports`
ADD FOREIGN KEY(`thread_id`) REFERENCES `threads`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reports`
ADD FOREIGN KEY(`reported_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reports`
ADD FOREIGN KEY(`claimed_by_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `moderation_actions`
ADD FOREIGN KEY(`moderator_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `moderation_actions`
ADD FOREIGN KEY(`report_id`) REFERENCES `reports`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `moderation_actions`
ADD FOREIGN KEY(`target_post_id`) REFERENCES `posts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `moderation_actions`
ADD FOREIGN KEY(`target_thread_id`) REFERENCES `threads`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `moderation_actions`
ADD FOREIGN KEY(`target_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `private_messages`
ADD FOREIGN KEY(`sender_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `private_messages`
ADD FOREIGN KEY(`recipient_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `private_messages`
ADD FOREIGN KEY(`parent_message_id`) REFERENCES `private_messages`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
