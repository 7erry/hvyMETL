CREATE TABLE IF NOT EXISTS `works` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`uniform_title` VARCHAR(300) NOT NULL COMMENT 'Canonical title used to collocate every edition, e.g. Hamlet regardless of the cover title.',
	`original_language` CHAR(3) COMMENT 'ISO 639-2 code of the language it was written in. Null for anonymous or multilingual works.',
	`first_published_year` SMALLINT COMMENT 'Year of first publication anywhere. Null when unknown, which is common for older works.',
	`work_type` VARCHAR(20) NOT NULL DEFAULT 'book' COMMENT 'book | serial | film | audio | map | score.',
	`subject_headings` TEXT COMMENT 'Controlled subject terms, one per line. Attached to the work because subjects describe the content, not the printing.',
	`summary` TEXT COMMENT 'Catalogue blurb shown once for every edition.',
	PRIMARY KEY(`id`)
) COMMENT='The intellectual work, independent of any printing. It exists so that fourteen editions of the same novel collocate in search results and share one hold queue instead of fourteen.';


CREATE INDEX `idx_works_uniform_title`
ON `works` (`uniform_title`);
CREATE TABLE IF NOT EXISTS `editions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`work_id` BIGINT NOT NULL COMMENT 'Work this edition realises.',
	`isbn13` CHAR(13) UNIQUE COMMENT 'ISBN-13. Unique but nullable: pre-1970 books, pamphlets and donations often have none.',
	`title` VARCHAR(300) NOT NULL COMMENT 'Title as printed on this edition, which can differ from the uniform title.',
	`publisher` VARCHAR(200) COMMENT 'Publisher imprint.',
	`published_year` SMALLINT COMMENT 'Year this edition was issued.',
	`edition_statement` VARCHAR(80) COMMENT 'Printed edition wording, e.g. 3rd revised edition.',
	`language_code` CHAR(3) NOT NULL COMMENT 'Language of this edition. A translation is a different edition of the same work, which is the whole point of the split.',
	`format` VARCHAR(24) NOT NULL DEFAULT 'hardback' COMMENT 'hardback | paperback | large_print | audiobook_cd | dvd | ebook.',
	`page_count` INTEGER COMMENT 'Pages, for print formats. Null for audio and video.',
	`cover_image_url` VARCHAR(500) COMMENT 'Jacket image for the catalogue.',
	PRIMARY KEY(`id`)
) COMMENT='A specific published version of a work: this translation, this publisher, this format. A borrower who wants large print or Spanish cares about the edition; a borrower who just wants the story does not.';


CREATE INDEX `idx_editions_work_language`
ON `editions` (`work_id`, `language_code`);
CREATE INDEX `idx_editions_title`
ON `editions` (`title`);
CREATE TABLE IF NOT EXISTS `contributors` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`authority_name` VARCHAR(200) NOT NULL COMMENT 'Name in authority order, e.g. Le Guin, Ursula K. The form used for browsing and sorting.',
	`display_name` VARCHAR(200) NOT NULL COMMENT 'Name in natural order for display.',
	`birth_year` SMALLINT COMMENT 'Used to disambiguate two people with the same name, which is the main job of an authority record.',
	`death_year` SMALLINT COMMENT 'Null for living contributors.',
	`external_authority_id` VARCHAR(60) UNIQUE COMMENT 'Identifier in a national authority file, e.g. a VIAF id. Unique so imports cannot create duplicates.',
	PRIMARY KEY(`id`)
) COMMENT='A person or body credited on a work. Kept as an authority record rather than a text field on the edition, because otherwise the same author appears under six spellings and no browse list works.';


CREATE INDEX `idx_contributors_authority_name`
ON `contributors` (`authority_name`);
CREATE TABLE IF NOT EXISTS `work_contributors` (
	`work_id` BIGINT COMMENT 'Work being credited. Half of the composite primary key.',
	`contributor_id` BIGINT COMMENT 'Person credited. Second part of the key.',
	`role` VARCHAR(24) COMMENT 'author | editor | translator | illustrator | narrator | composer. Part of the key because one person can be both author and illustrator of the same work.',
	`ordinal` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Billing order within the role, so the first-named author stays first.',
	PRIMARY KEY(`work_id`, `contributor_id`, `role`)
) COMMENT='Credits, attached to the work rather than the edition. Translators are the deliberate exception people ask about: a translation is a separate edition, but the translator is credited on the work through this table with the translator role.';


CREATE INDEX `idx_work_contributors_person_role`
ON `work_contributors` (`contributor_id`, `role`);
CREATE TABLE IF NOT EXISTS `branches` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(12) NOT NULL UNIQUE COMMENT 'Short branch code printed on spine labels and used in transfer slips.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Branch name.',
	`address_line` VARCHAR(240) COMMENT 'Street address for pickup notices.',
	`postcode` VARCHAR(16) COMMENT 'Postal code, used to suggest the nearest branch.',
	`phone` VARCHAR(32) COMMENT 'Public contact number.',
	`opens_at` TIME COMMENT 'Typical opening time, used to phrase pickup deadlines. Null for a closed or seasonal branch.',
	`closes_at` TIME COMMENT 'Typical closing time.',
	`is_open` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when a branch is closed for refurbishment; its copies stay assigned so they can be transferred back later.',
	PRIMARY KEY(`id`)
) COMMENT='A physical library location. Branches matter to the schema because a copy has a home, a member has a preferred pickup point, and the gap between the two is what transfers exist to close.';


CREATE TABLE IF NOT EXISTS `copies` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`edition_id` BIGINT NOT NULL COMMENT 'Edition this physical item is a copy of.',
	`barcode` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Scanned at the desk. The only identifier staff and self-service machines ever use.',
	`home_branch_id` BIGINT NOT NULL COMMENT 'Branch that owns the copy and that it is returned to after a transfer.',
	`current_branch_id` BIGINT NOT NULL COMMENT 'Branch it is physically at now. Differs from home while it is away filling a hold.',
	`shelf_location` VARCHAR(60) COMMENT 'Call number or shelf label within the branch.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'available' COMMENT 'available | on_loan | in_transit | on_hold_shelf | repair | lost | withdrawn.',
	`acquired_on` DATE COMMENT 'Accession date, used for collection age reporting.',
	`cost_minor` INTEGER COMMENT 'Purchase price in minor units. The basis of a replacement charge when the copy is lost.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 code for cost_minor and for any charge derived from it.',
	`condition_note` VARCHAR(255) COMMENT 'Damage recorded at the last return, so the next borrower is not blamed for it.',
	`is_reference_only` BOOLEAN NOT NULL DEFAULT false COMMENT 'True for items that never circulate. Enforced here rather than on the edition because one copy of a title is often kept back for reference.',
	PRIMARY KEY(`id`)
) COMMENT='The barcoded object on the shelf. This is the only level a loan can attach to: members search works, choose editions, but physically borrow copies, and availability is a count of these rows.';


CREATE INDEX `idx_copies_edition_branch_status`
ON `copies` (`edition_id`, `current_branch_id`, `status`);
CREATE INDEX `idx_copies_branch_status`
ON `copies` (`current_branch_id`, `status`);
CREATE TABLE IF NOT EXISTS `members` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`library_card_number` VARCHAR(24) NOT NULL UNIQUE COMMENT 'Number on the card. Reissued cards get a new number, so the old one stops working immediately.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Member name as registered.',
	`email` VARCHAR(320) COMMENT 'Notice address. Null for members who chose postal or phone notices only.',
	`phone` VARCHAR(32) COMMENT 'Contact number for hold-ready calls.',
	`date_of_birth` DATE COMMENT 'Determines the junior category and the borrowing limits that go with it.',
	`home_branch_id` BIGINT NOT NULL COMMENT 'Registration branch and the default pickup point.',
	`membership_type` VARCHAR(20) NOT NULL DEFAULT 'adult' COMMENT 'adult | junior | senior | staff | institutional. Drives loan length and item limits.',
	`joined_on` DATE NOT NULL COMMENT 'Registration date.',
	`expires_on` DATE COMMENT 'Membership expiry. Null for permanent categories such as staff.',
	`borrowing_blocked` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when fines or lost items exceed the threshold. A stored flag so the desk does not recompute the whole fine ledger at checkout.',
	PRIMARY KEY(`id`)
) COMMENT='A borrower. The block flag is denormalised deliberately: checkout happens at a desk with a queue behind it, and the decision has to be one indexed read.';


CREATE INDEX `idx_members_branch_type`
ON `members` (`home_branch_id`, `membership_type`);
CREATE INDEX `idx_members_name`
ON `members` (`full_name`);
CREATE TABLE IF NOT EXISTS `loans` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`copy_id` BIGINT NOT NULL COMMENT 'Physical copy borrowed.',
	`member_id` BIGINT NOT NULL COMMENT 'Borrower.',
	`checkout_branch_id` BIGINT NOT NULL COMMENT 'Branch that issued the loan.',
	`return_branch_id` BIGINT COMMENT 'Branch it came back to. Null until returned; when it differs from the home branch a transfer is raised.',
	`checked_out_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Issue time.',
	`due_on` DATE NOT NULL COMMENT 'A date, not a timestamp: items are due at end of day, and overdue counting is in whole days.',
	`returned_at` DATETIME COMMENT 'Return time. Null while the loan is open, which is also how open loans are found.',
	`renewal_count` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Renewals so far, denormalised from loan_renewals so the limit check is one read.',
	`renewal_limit` SMALLINT NOT NULL DEFAULT 3 COMMENT 'Maximum renewals, snapshotted from policy at checkout so a policy change cannot retroactively deny a renewal.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open | returned | overdue | lost | claimed_returned.',
	PRIMARY KEY(`id`)
) COMMENT='One circulation of one copy. Loans are never deleted: the history is what supports lost-item claims, and a copy with a suspicious return record is found by reading it.';


CREATE INDEX `idx_loans_member_state`
ON `loans` (`member_id`, `state`);
CREATE INDEX `idx_loans_copy_time`
ON `loans` (`copy_id`, `checked_out_at`);
CREATE INDEX `idx_loans_overdue_sweep`
ON `loans` (`state`, `due_on`);
CREATE TABLE IF NOT EXISTS `loan_renewals` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`loan_id` BIGINT NOT NULL COMMENT 'Loan being extended.',
	`renewal_number` SMALLINT NOT NULL COMMENT 'Sequence within the loan, matching renewal_count after the row lands.',
	`renewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the extension was granted.',
	`previous_due_on` DATE NOT NULL COMMENT 'Due date before the renewal. Keeping it is what lets a disputed overdue fine be reconstructed.',
	`new_due_on` DATE NOT NULL COMMENT 'Due date after the renewal.',
	`channel` VARCHAR(16) NOT NULL DEFAULT 'online' COMMENT 'online | desk | phone | auto. Auto renewals are the ones members forget about and then dispute.',
	`granted_by` VARCHAR(120) COMMENT 'Staff login that authorised an override. Null for self-service renewals.',
	PRIMARY KEY(`id`)
) COMMENT='One extension of one loan. A row rather than a counter, because the due date history is the evidence in every fine dispute and overwriting due_on destroys it.';


CREATE UNIQUE INDEX `uq_renewals_loan_number`
ON `loan_renewals` (`loan_id`, `renewal_number`);
CREATE TABLE IF NOT EXISTS `holds` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`member_id` BIGINT NOT NULL COMMENT 'Member waiting.',
	`work_id` BIGINT NOT NULL COMMENT 'Work requested. Holds queue on the work so any available edition can satisfy them.',
	`edition_id` BIGINT COMMENT 'Specific edition, when the member insists on large print or a given translation. Null means any edition will do, which is what keeps the queue moving.',
	`pickup_branch_id` BIGINT NOT NULL COMMENT 'Where the member wants to collect. The destination a transfer targets.',
	`placed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Request time, and the tie-break behind queue position.',
	`queue_position` INTEGER NOT NULL COMMENT 'Place in line. Stored rather than derived because members are told their position and it must not silently change when someone ahead cancels early.',
	`state` VARCHAR(20) NOT NULL DEFAULT 'waiting' COMMENT 'waiting | in_transit | ready | collected | expired | cancelled.',
	`fulfilled_copy_id` BIGINT COMMENT 'Copy allocated to this hold. Null until one is trapped at return or pulled from the shelf.',
	`ready_at` DATETIME COMMENT 'When it reached the hold shelf and the member was notified.',
	`expires_on` DATE COMMENT 'Last day to collect before the hold passes to the next in line. Null until ready.',
	`suspended_until` DATE COMMENT 'Member is away; keep the place but skip allocation until this date. Null for an active hold.',
	PRIMARY KEY(`id`)
) COMMENT='A place in the queue for a work. Queueing on the work rather than on a copy is what stops eight separate lines forming for eight identical books, and the stored position is what makes the wait quotable.';


CREATE INDEX `idx_holds_work_queue`
ON `holds` (`work_id`, `state`, `queue_position`);
CREATE INDEX `idx_holds_member_state`
ON `holds` (`member_id`, `state`);
CREATE INDEX `idx_holds_pickup_state`
ON `holds` (`pickup_branch_id`, `state`);
CREATE TABLE IF NOT EXISTS `transfers` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`copy_id` BIGINT NOT NULL COMMENT 'Copy being moved.',
	`from_branch_id` BIGINT NOT NULL COMMENT 'Branch sending it.',
	`to_branch_id` BIGINT NOT NULL COMMENT 'Branch receiving it.',
	`hold_id` BIGINT COMMENT 'Hold this movement serves. Null for a rebalancing or return-home transfer, which is how the two reasons are told apart.',
	`reason` VARCHAR(20) NOT NULL DEFAULT 'hold' COMMENT 'hold | return_home | rebalance | repair | withdrawal.',
	`sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it left the sending branch. The copy is in_transit from this moment.',
	`received_at` DATETIME COMMENT 'When the receiving branch scanned it in. Null while in the van, which is how items lost in transit are found.',
	`courier_run` VARCHAR(40) COMMENT 'Van run or bag identifier, so a whole missing bag can be traced at once.',
	PRIMARY KEY(`id`)
) COMMENT='One leg of a physical journey between branches. Modelled as its own row rather than as a status on the copy, because an item unaccounted for after three days is a query over this table.';


CREATE INDEX `idx_transfers_copy_time`
ON `transfers` (`copy_id`, `sent_at`);
CREATE INDEX `idx_transfers_inbound`
ON `transfers` (`to_branch_id`, `received_at`);
CREATE TABLE IF NOT EXISTS `fines` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`member_id` BIGINT NOT NULL COMMENT 'Member charged.',
	`loan_id` BIGINT COMMENT 'Loan that caused the charge. Null for non-circulation charges such as a printing fee or a lost card.',
	`charge_type` VARCHAR(24) NOT NULL COMMENT 'overdue | replacement | processing | damage | card_replacement.',
	`amount_minor` INTEGER NOT NULL COMMENT 'Charge in minor units. Integers only — accruing daily fines in floating point drifts within a month.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 code for amount_minor.',
	`assessed_on` DATE NOT NULL COMMENT 'Date the charge was raised.',
	`days_overdue` INTEGER COMMENT 'Days late at assessment, snapshotted so the arithmetic behind an overdue charge stays visible. Null for non-overdue charges.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'outstanding' COMMENT 'outstanding | paid | waived | written_off | disputed.',
	`waived_reason` VARCHAR(240) COMMENT 'Why it was cancelled. Null unless the state is waived, and required by policy when it is.',
	PRIMARY KEY(`id`)
) COMMENT='A single charge, raised once and then settled. Fines are not recomputed from loan dates on read: the amount is fixed at assessment so a later policy change or a backdated return cannot restate what a member was told they owed.';


CREATE INDEX `idx_fines_member_state`
ON `fines` (`member_id`, `state`);
CREATE INDEX `idx_fines_assessed`
ON `fines` (`assessed_on`);
CREATE TABLE IF NOT EXISTS `fine_payments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`fine_id` BIGINT NOT NULL COMMENT 'Charge being paid down. A fine can receive several payments.',
	`amount_minor` INTEGER NOT NULL COMMENT 'Amount paid in minor units. Partial payments are normal, so this is not assumed to equal the fine.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 code for amount_minor.',
	`method` VARCHAR(20) NOT NULL COMMENT 'cash | card | online | transfer.',
	`paid_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Payment time.',
	`received_branch_id` BIGINT COMMENT 'Branch that took the money. Null for online payments, which belong to no desk.',
	`external_reference` VARCHAR(120) UNIQUE COMMENT 'Processor reference for card and online payments. Unique so a replayed gateway callback cannot credit twice.',
	PRIMARY KEY(`id`)
) COMMENT='An append-only record of money received. Kept separate from fines so partial payment is representable and so a refund or a correction is another row rather than an edit to a historical charge.';


CREATE INDEX `idx_fine_payments_fine_time`
ON `fine_payments` (`fine_id`, `paid_at`);
ALTER TABLE `editions`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `work_contributors`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `work_contributors`
ADD FOREIGN KEY(`contributor_id`) REFERENCES `contributors`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `copies`
ADD FOREIGN KEY(`edition_id`) REFERENCES `editions`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `copies`
ADD FOREIGN KEY(`home_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `copies`
ADD FOREIGN KEY(`current_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `members`
ADD FOREIGN KEY(`home_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `loans`
ADD FOREIGN KEY(`copy_id`) REFERENCES `copies`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `loans`
ADD FOREIGN KEY(`member_id`) REFERENCES `members`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `loans`
ADD FOREIGN KEY(`checkout_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `loans`
ADD FOREIGN KEY(`return_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `loan_renewals`
ADD FOREIGN KEY(`loan_id`) REFERENCES `loans`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `holds`
ADD FOREIGN KEY(`member_id`) REFERENCES `members`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `holds`
ADD FOREIGN KEY(`work_id`) REFERENCES `works`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `holds`
ADD FOREIGN KEY(`edition_id`) REFERENCES `editions`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `holds`
ADD FOREIGN KEY(`pickup_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `holds`
ADD FOREIGN KEY(`fulfilled_copy_id`) REFERENCES `copies`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `transfers`
ADD FOREIGN KEY(`copy_id`) REFERENCES `copies`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `transfers`
ADD FOREIGN KEY(`from_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `transfers`
ADD FOREIGN KEY(`to_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `transfers`
ADD FOREIGN KEY(`hold_id`) REFERENCES `holds`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `fines`
ADD FOREIGN KEY(`member_id`) REFERENCES `members`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `fines`
ADD FOREIGN KEY(`loan_id`) REFERENCES `loans`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `fine_payments`
ADD FOREIGN KEY(`fine_id`) REFERENCES `fines`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `fine_payments`
ADD FOREIGN KEY(`received_branch_id`) REFERENCES `branches`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
