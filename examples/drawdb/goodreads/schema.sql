CREATE TABLE IF NOT EXISTS `works` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key. The stable id a review, a rating and a series position all point at.',
	`title` VARCHAR(300) NOT NULL COMMENT 'Canonical title of the work, usually the original-language one. Editions carry their own translated or retitled variants.',
	`original_language` CHAR(3) COMMENT 'ISO 639-2 language the work was written in. Null when the catalog does not know.',
	`first_published_year` SMALLINT COMMENT 'Year of first publication of any edition. A year, not a date - for older works nobody agrees on the day, and often not on the year either.',
	`description` TEXT COMMENT 'Plot summary shared by every edition, because a summary describes the work rather than a particular printing.',
	`average_rating` DECIMAL(3,2) NOT NULL DEFAULT 0 COMMENT 'Cached mean rating across all editions, recomputed in batch. Rolling ratings up to the work is the entire reason for the work/edition split.',
	`ratings_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Cached number of ratings, so a search results page needs no aggregate query.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time.',
	PRIMARY KEY(`id`)
) COMMENT='The abstract book - the thing an author wrote, independent of any printing. Nobody has ever held a work; they held an edition of it.';


CREATE INDEX `idx_works_title`
ON `works` (`title`);
CREATE INDEX `idx_works_rating`
ON `works` (`average_rating`, `ratings_count`);
CREATE TABLE IF NOT EXISTS `editions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`work_id` BIGINT NOT NULL COMMENT 'Work this is a printing of. Every edition has one; a work with no editions is a catalog error.',
	`isbn13` CHAR(13) UNIQUE COMMENT 'ISBN-13. Unique where present, but null for anything published before 1970, most self-published books and many ebooks - which is why it cannot be the primary key.',
	`title` VARCHAR(300) NOT NULL COMMENT 'Title as printed on this edition. Translations and retitled paperbacks differ from the work title, and the cover has to match what the reader is holding.',
	`format` VARCHAR(24) NOT NULL DEFAULT 'paperback' COMMENT 'hardcover | paperback | ebook | audiobook | mass_market. Audiobooks have a duration instead of a page count, which is why both columns are nullable.',
	`publisher` VARCHAR(200) COMMENT 'Publisher imprint for this printing.',
	`published_on` DATE COMMENT 'Publication date of this edition. Known to the day far more often than the work first-published year is.',
	`language` CHAR(3) NOT NULL DEFAULT 'eng' COMMENT 'ISO 639-2 language of this printing. A translation is an edition, not a separate work.',
	`page_count` SMALLINT COMMENT 'Pages in this printing. Null for audiobooks, and the reason progress percentages differ between editions of the same book.',
	`audio_seconds` INTEGER COMMENT 'Runtime for an audiobook edition. Null for print.',
	`cover_image_key` VARCHAR(300) COMMENT 'Object storage key of the cover scan for this printing.',
	PRIMARY KEY(`id`)
) COMMENT='One physical or digital printing. Readers shelve, rate and track progress against an edition, because page numbers and narrators are properties of the printing, not of the work.';


CREATE INDEX `idx_editions_work_format`
ON `editions` (`work_id`, `format`);
CREATE INDEX `idx_editions_isbn`
ON `editions` (`isbn13`);
CREATE TABLE IF NOT EXISTS `authors` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Name as credited. Not unique - two different people share a name often enough that a unique constraint would merge them.',
	`sort_name` VARCHAR(200) NOT NULL COMMENT 'Reordered for browsing, e.g. "Le Guin, Ursula K.".',
	`birth_year` SMALLINT COMMENT 'Birth year, used mostly to disambiguate people with the same name.',
	`death_year` SMALLINT COMMENT 'Death year, when applicable.',
	`bio` TEXT COMMENT 'Biography shown on the author page.',
	`is_claimed` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when a real person has claimed the profile and can post to it.',
	PRIMARY KEY(`id`)
) COMMENT='A contributor to one or more works. Kept apart from users: an author who also reviews books has a separate account row.';


CREATE INDEX `idx_authors_sort_name`
ON `authors` (`sort_name`);
CREATE TABLE IF NOT EXISTS `work_contributors` (
	`work_id` BIGINT COMMENT 'Work being credited.',
	`author_id` BIGINT COMMENT 'Contributor.',
	`role` VARCHAR(24) COMMENT 'author | co_author | translator | illustrator | editor | narrator. In the key, because one person can both write and narrate the same book.',
	`position` TINYINT NOT NULL DEFAULT 1 COMMENT 'Billing order within the role, so a three-author book lists its authors in the order the cover does.',
	PRIMARY KEY(`work_id`, `author_id`, `role`)
) COMMENT='Credits as a join table with the role in the key. Translators and narrators sit here too, even though they belong to a specific edition in strict cataloguing terms - a deliberate simplification that avoids an edition_contributors table most rows would never use.';


CREATE INDEX `idx_contributors_author_role`
ON `work_contributors` (`author_id`, `role`);
CREATE TABLE IF NOT EXISTS `series` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Series name as marketed.',
	`description` TEXT COMMENT 'Series blurb.',
	`is_complete` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether the series is finished. Readers filter on it before committing to book one.',
	`book_count` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Cached number of entries, including novellas.',
	PRIMARY KEY(`id`)
) COMMENT='A named sequence of works. It is its own entity rather than a column on works, because a work can belong to more than one series and the reading order is a property of the pair.';


CREATE INDEX `idx_series_name`
ON `series` (`name`);
CREATE TABLE IF NOT EXISTS `series_works` (
	`series_id` BIGINT COMMENT 'Parent series.',
	`work_id` BIGINT COMMENT 'Work in the series.',
	`position` DECIMAL(5,2) NOT NULL COMMENT 'Reading position. Decimal, not integer, because interstitial novellas are genuinely published as book 1.5 and readers expect to see them there.',
	`is_optional` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for side stories that can be skipped without losing the plot - a question every series page gets asked.',
	PRIMARY KEY(`series_id`, `work_id`)
) COMMENT='Series membership with an explicit reading order. The decimal position is the small detail that stops every fractional entry from being crammed into an integer slot or dropped.';


CREATE INDEX `idx_series_works_order`
ON `series_works` (`series_id`, `position`);
CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Login identity.',
	`username` VARCHAR(40) NOT NULL UNIQUE COMMENT 'Public handle used in profile URLs.',
	`display_name` VARCHAR(120) NOT NULL COMMENT 'Name shown on reviews and the profile page.',
	`bio` VARCHAR(500) COMMENT 'Short profile blurb.',
	`annual_goal` SMALLINT COMMENT 'Books targeted for the current reading challenge. Null when the user has not set one.',
	`is_private` BOOLEAN NOT NULL DEFAULT false COMMENT 'Hides shelves and activity from non-friends, which the feed query has to respect on every read.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Signup time.',
	PRIMARY KEY(`id`)
) COMMENT='A reader account. Everything personal - shelves, progress, reviews, friendships - keys here.';


CREATE TABLE IF NOT EXISTS `shelves` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`user_id` BIGINT NOT NULL COMMENT 'Owner of the shelf.',
	`name` VARCHAR(60) NOT NULL COMMENT 'Shelf name as shown, e.g. "Read" or "sci-fi-to-reread".',
	`shelf_type` VARCHAR(20) NOT NULL DEFAULT 'custom' COMMENT 'want_to_read | currently_reading | read | custom. The three built-ins are exclusive of each other; custom shelves behave like tags.',
	`is_exclusive` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for the built-in three. A book can sit on only one exclusive shelf at a time, which is what makes the reading state unambiguous.',
	`book_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Cached item count shown next to the shelf name.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='Default and custom shelves in one table. Making the built-ins ordinary rows with is_exclusive set means the client has one shelf renderer instead of a special case for the three that matter most.';


CREATE UNIQUE INDEX `uq_shelves_user_name`
ON `shelves` (`user_id`, `name`);
CREATE INDEX `idx_shelves_user_type`
ON `shelves` (`user_id`, `shelf_type`);
CREATE TABLE IF NOT EXISTS `shelvings` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shelf_id` BIGINT NOT NULL COMMENT 'Shelf the book was added to.',
	`edition_id` BIGINT NOT NULL COMMENT 'Edition shelved. An edition, not a work - the reader is recording the copy they actually have, including which translation and which narrator.',
	`work_id` BIGINT NOT NULL COMMENT 'Work of that edition, denormalised so a "have I read this book in any edition" check is one indexed lookup rather than a join.',
	`added_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was shelved; the default sort order for a shelf.',
	`started_on` DATE COMMENT 'Date reading began, set when the book moves to currently reading. A date, because nobody remembers the hour.',
	`finished_on` DATE COMMENT 'Date reading finished. Populated on the move to read, and the basis for the annual challenge count.',
	`notes` VARCHAR(500) COMMENT 'Private note, separate from a public review.',
	PRIMARY KEY(`id`)
) COMMENT='A book on a shelf. It carries work_id alongside edition_id so per-work questions stay cheap while the reader keeps the specific printing they own.';


CREATE INDEX `idx_shelvings_shelf_added`
ON `shelvings` (`shelf_id`, `added_at`);
CREATE INDEX `idx_shelvings_work`
ON `shelvings` (`work_id`, `edition_id`);
CREATE TABLE IF NOT EXISTS `reading_progress` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`user_id` BIGINT NOT NULL COMMENT 'Reader.',
	`edition_id` BIGINT NOT NULL COMMENT 'Edition being read. Progress is per edition because page 200 of a paperback is not page 200 of the large-print printing.',
	`page_number` SMALLINT COMMENT 'Current page for a print edition. Null for audio.',
	`audio_seconds` INTEGER COMMENT 'Current position for an audiobook. Null for print.',
	`percent_complete` TINYINT NOT NULL DEFAULT 0 COMMENT 'Normalised progress, computed from whichever of the two columns above applies, so the UI has one number to render.',
	`comment` VARCHAR(500) COMMENT 'Optional status update posted with the progress; this is what shows up in a friend feed.',
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the update was posted. Rows accumulate rather than being overwritten, so a reader can see their own pace through a book.',
	PRIMARY KEY(`id`)
) COMMENT='Append-only progress updates. Keeping every update rather than one current position is what makes the reading timeline, the pace estimate and the friend feed possible from the same rows.';


CREATE INDEX `idx_progress_user_edition`
ON `reading_progress` (`user_id`, `edition_id`, `updated_at`);
CREATE TABLE IF NOT EXISTS `reviews` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`user_id` BIGINT NOT NULL COMMENT 'Reviewer.',
	`work_id` BIGINT NOT NULL COMMENT 'Work reviewed. The review attaches to the work so all of its editions share one rating pool.',
	`edition_id` BIGINT COMMENT 'Edition actually read. Null when the reader never specified one; kept so translation-specific complaints are attributable.',
	`rating` TINYINT COMMENT 'One to five stars. Null for a text-only review, which is why rating and body are independent columns rather than one required pair.',
	`body` TEXT COMMENT 'Review text. Null for a bare rating, which is the large majority of rows.',
	`has_spoilers` BOOLEAN NOT NULL DEFAULT false COMMENT 'Hides the body behind a click. Self-declared, and the one piece of review metadata readers actually rely on.',
	`likes_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Cached likes, used to order the reviews shown on a book page.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Post time.',
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Last edit; reviews are editable, unlike progress updates.',
	PRIMARY KEY(`id`)
) COMMENT='One review per user per work, enforced by the unique key. Rating the paperback four stars and the audiobook two would split the work average, so the rating belongs to the work and the edition is recorded beside it.';


CREATE UNIQUE INDEX `uq_reviews_user_work`
ON `reviews` (`user_id`, `work_id`);
CREATE INDEX `idx_reviews_work_popular`
ON `reviews` (`work_id`, `likes_count`);
CREATE TABLE IF NOT EXISTS `friendships` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`requester_id` BIGINT NOT NULL COMMENT 'User who sent the request.',
	`addressee_id` BIGINT NOT NULL COMMENT 'User who received it. Direction is preserved even after acceptance, so a pending request is never ambiguous.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending | accepted | blocked. A blocked row stays so the block survives and re-requesting is impossible.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the request was sent.',
	`responded_at` DATETIME COMMENT 'When it was accepted or rejected. Null while pending.',
	PRIMARY KEY(`id`)
) COMMENT='A mutual relationship stored as one directed row. Writing two rows per friendship doubles the write and invites them to disagree; the feed query reads both columns instead.';


CREATE UNIQUE INDEX `uq_friendships_pair`
ON `friendships` (`requester_id`, `addressee_id`);
CREATE INDEX `idx_friendships_addressee_status`
ON `friendships` (`addressee_id`, `status`);
CREATE TABLE IF NOT EXISTS `activity_events` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key, monotonic so the feed pages by id.',
	`user_id` BIGINT NOT NULL COMMENT 'User who did the thing.',
	`kind` VARCHAR(24) NOT NULL COMMENT 'shelved | rated | reviewed | progress | finished | followed. What happened, denormalised so rendering a feed row needs no polymorphic joins.',
	`work_id` BIGINT COMMENT 'Work involved, when there is one.',
	`review_id` BIGINT COMMENT 'Review involved, for a rated or reviewed event.',
	`summary` VARCHAR(300) COMMENT 'Pre-rendered text for the feed row, written at event time so a later edit to a review does not silently rewrite history in the feed.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Event time; the only sort key the feed uses.',
	PRIMARY KEY(`id`)
) COMMENT='Append-only feed of what friends are doing. It duplicates facts held elsewhere on purpose: a feed read is one indexed scan per friend instead of a union across shelvings, reviews and progress.';


CREATE INDEX `idx_activity_user_time`
ON `activity_events` (`user_id`, `created_at`);
ALTER TABLE `editions`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `work_contributors`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `work_contributors`
ADD FOREIGN KEY(`author_id`) REFERENCES `authors`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `series_works`
ADD FOREIGN KEY(`series_id`) REFERENCES `series`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `series_works`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shelves`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shelvings`
ADD FOREIGN KEY(`shelf_id`) REFERENCES `shelves`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shelvings`
ADD FOREIGN KEY(`edition_id`) REFERENCES `editions`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shelvings`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reading_progress`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reading_progress`
ADD FOREIGN KEY(`edition_id`) REFERENCES `editions`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`edition_id`) REFERENCES `editions`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `friendships`
ADD FOREIGN KEY(`requester_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `friendships`
ADD FOREIGN KEY(`addressee_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `activity_events`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `activity_events`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `activity_events`
ADD FOREIGN KEY(`review_id`) REFERENCES `reviews`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
