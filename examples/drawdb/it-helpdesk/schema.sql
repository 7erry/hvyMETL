CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`employee_number` VARCHAR(24) NOT NULL UNIQUE COMMENT 'Staff number from the directory. The sync key, stable across name and email changes.',
	`display_name` VARCHAR(200) NOT NULL COMMENT 'Name shown on tickets and in queues.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Work address. Also the inbound channel: a mail to the service desk is matched to a requester by this.',
	`department` VARCHAR(120) COMMENT 'Reporting department. Drives which approval chain a request enters and which catalogue items are visible.',
	`manager_user_id` BIGINT COMMENT 'Line manager, resolved at ticket creation into a manager approval step. Null for the chief executive.',
	`location` VARCHAR(120) COMMENT 'Primary office. Decides the business calendar an SLA clock counts against.',
	`is_agent` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether this person works tickets as well as raising them. One table rather than two, because agents raise tickets constantly and duplicating them creates two identities for one human.',
	`agent_team` VARCHAR(80) COMMENT 'Queue the agent belongs to, such as desktop, network or identity. Null for non-agents.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone. Business-hours SLA counting is meaningless without it.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Deactivated leavers stay as rows because their ticket history, approvals and article authorship all point here.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First appearance in the service desk.',
	PRIMARY KEY(`id`)
) COMMENT='Everyone the service desk deals with, requesters and agents alike. The distinction is a flag rather than a table because the same person is both, several times a week.';


CREATE INDEX `idx_users_agent_team`
ON `users` (`is_agent`, `agent_team`);
CREATE TABLE IF NOT EXISTS `service_catalog_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`item_code` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Short stable code referenced by automation and reporting, so renaming the item does not break either.',
	`name` VARCHAR(200) NOT NULL COMMENT 'What the requester sees in the portal, such as New laptop or VPN access.',
	`category` VARCHAR(64) NOT NULL COMMENT 'hardware | software | access | facilities | account. The top-level grouping in the portal and the first cut in every volume report.',
	`description` TEXT COMMENT 'Explanation shown before the form, which is the cheapest deflection mechanism the service desk has.',
	`request_form` JSON COMMENT 'Field definitions for the request form. Semi-structured because every catalogue item asks for different things and none of them are ever joined on.',
	`default_team` VARCHAR(80) COMMENT 'Queue new requests land in. Null means the triage queue, which is a decision rather than an oversight.',
	`default_priority` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'low | normal | high | urgent. A starting point; an agent can raise it, and the change is what a priority-drift report looks at.',
	`sla_policy_id` BIGINT COMMENT 'Policy applied to requests for this item. Null falls back to the priority-based default policy.',
	`requires_approval` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether an approval chain is generated on submission. Items that cost money or grant access almost always need one.',
	`is_published` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether the item is orderable. Unpublished items stay as rows because closed tickets still reference them.',
	PRIMARY KEY(`id`)
) COMMENT='The menu of things people can ask for. Making it data rather than a set of forms in code is what lets the service desk add an offering on a Tuesday without a deploy.';


CREATE INDEX `idx_catalog_category_published`
ON `service_catalog_items` (`category`, `is_published`);
CREATE TABLE IF NOT EXISTS `assets` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`asset_tag` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Barcode label on the device, the identifier a user can read out over the phone.',
	`asset_kind` VARCHAR(32) NOT NULL COMMENT 'laptop | desktop | phone | printer | server | network | application. Applications are assets here because a change request affects them exactly as a server does.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Hostname or service name as it appears in monitoring.',
	`serial_number` VARCHAR(96) COMMENT 'Manufacturer serial. Null for logical assets such as an application.',
	`owner_user_id` BIGINT COMMENT 'Person currently responsible. Null for shared infrastructure, which is owned by a team rather than a person.',
	`location` VARCHAR(120) COMMENT 'Site or rack. The first thing an on-site engineer needs and the thing most often stale.',
	`environment` VARCHAR(24) COMMENT 'production | staging | development. Null for end-user hardware. Change risk is judged largely on this.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'in_service' COMMENT 'in_service | in_repair | retired. Retired assets stay linked to their historical tickets.',
	PRIMARY KEY(`id`)
) COMMENT='The things tickets are about, kept to the minimum the service desk needs. A full configuration database lives elsewhere; this exists so a ticket can point at something real rather than at a typed hostname.';


CREATE INDEX `idx_assets_kind_status`
ON `assets` (`asset_kind`, `status`);
CREATE TABLE IF NOT EXISTS `tickets` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_number` VARCHAR(24) NOT NULL UNIQUE COMMENT 'Human-quotable reference printed in every notification. Never reused, even after a merge.',
	`ticket_type` VARCHAR(16) NOT NULL DEFAULT 'incident' COMMENT 'incident | request | problem | change. One table for all four because they share a queue, an SLA, a comment thread and a rating; the type only changes which extra rows exist.',
	`catalog_item_id` BIGINT COMMENT 'Catalogue item ordered, for requests. Null for an incident, which by definition is something broken rather than something asked for.',
	`requester_user_id` BIGINT NOT NULL COMMENT 'Who raised it. Distinct from the person affected in a delegated request, though this schema keeps the simple case.',
	`assigned_agent_id` BIGINT COMMENT 'Agent currently working it. Null while queued, which is the state the backlog report counts.',
	`assigned_team` VARCHAR(80) COMMENT 'Queue it currently sits in. Held on the ticket rather than derived from the agent, because a ticket sits in a queue before anyone picks it up.',
	`subject` VARCHAR(300) NOT NULL COMMENT 'One-line summary, written by the requester and rarely improved afterwards.',
	`description` TEXT COMMENT 'Full problem statement or request detail as submitted.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'new' COMMENT 'new | triaged | in_progress | pending_requester | pending_approval | pending_vendor | resolved | closed | cancelled. The three pending states matter because each one stops a different clock.',
	`priority` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'low | normal | high | urgent. Derived from impact and urgency at triage, then stored, because the derivation rules change and old tickets must keep the priority they were worked at.',
	`impact` VARCHAR(16) COMMENT 'individual | department | organisation. Half of the priority calculation, kept so the calculation can be explained.',
	`urgency` VARCHAR(16) COMMENT 'low | medium | high. The other half.',
	`sla_policy_id` BIGINT COMMENT 'Policy in force for this ticket, resolved once at creation. Null for tickets outside any policy, such as internal admin work.',
	`parent_ticket_id` BIGINT COMMENT 'Set when this ticket was merged into or spawned from another. Gives a linked history instead of a deletion.',
	`kb_article_id` BIGINT COMMENT 'Article used to resolve it. The single most useful field for knowing which articles actually deflect work.',
	`resolution_notes` TEXT COMMENT 'What was actually done. Written at resolution and frozen at closure, since it becomes the evidence for the rating.',
	`opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Submission time in UTC.',
	`first_responded_at` DATETIME COMMENT 'First human reply to the requester. Null until it happens, and it is what the first-response target is measured against.',
	`resolved_at` DATETIME COMMENT 'When the agent declared it fixed. A resolved ticket can be reopened, which is why closure is separate.',
	`closed_at` DATETIME COMMENT 'When the ticket became final. Ratings can only be left between resolution and closure plus a grace window.',
	`reopen_count` SMALLINT NOT NULL DEFAULT 0 COMMENT 'How many times it came back. A rising average here is a quality signal that resolution time alone hides.',
	PRIMARY KEY(`id`)
) COMMENT='The unit of work. Incidents, requests and changes share this row so that queues, SLAs and reporting are one implementation, and the differences live in the tables that extend it.';


CREATE INDEX `idx_tickets_status_priority_opened`
ON `tickets` (`status`, `priority`, `opened_at`);
CREATE INDEX `idx_tickets_team_status`
ON `tickets` (`assigned_team`, `status`);
CREATE INDEX `idx_tickets_requester_opened`
ON `tickets` (`requester_user_id`, `opened_at`);
CREATE TABLE IF NOT EXISTS `ticket_assets` (
	`ticket_id` BIGINT COMMENT 'Ticket concerned. Half of the composite primary key, which is why there is no surrogate id here.',
	`asset_id` BIGINT COMMENT 'Asset concerned. Together with ticket_id this prevents the same asset being linked twice by two agents.',
	`relation` VARCHAR(24) NOT NULL DEFAULT 'affected' COMMENT 'affected | caused_by | changed_by. A change request affects a dozen assets and is caused by none; an incident is usually the reverse.',
	`linked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the link was made. Links added late in a ticket are usually the result of a real diagnosis rather than an initial guess.',
	`linked_by_agent_id` BIGINT COMMENT 'Agent who made the link. Null when automation inferred it from a monitoring alert.',
	PRIMARY KEY(`ticket_id`, `asset_id`)
) COMMENT='Many-to-many between tickets and the things they are about. A single asset_id column on the ticket fails immediately for a change that touches a whole rack, or for an incident that turns out to span two services.';


CREATE TABLE IF NOT EXISTS `ticket_approvals` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_id` BIGINT NOT NULL COMMENT 'Ticket awaiting sign-off.',
	`step_number` SMALLINT NOT NULL COMMENT 'Position in the chain, starting at one. Explicit ordering, because approvals are sequential and a chain is not a set.',
	`approver_user_id` BIGINT NOT NULL COMMENT 'Who must decide at this step. Resolved at generation time, so a later change of manager does not silently move a pending approval.',
	`approver_role` VARCHAR(40) NOT NULL DEFAULT 'manager' COMMENT 'manager | budget_holder | security | data_owner | vendor_manager. Records why this person is in the chain, which is what makes the chain auditable a year later.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected | skipped | expired. Only the lowest-numbered pending step is actionable; the rest wait.',
	`decided_at` DATETIME COMMENT 'When the decision was recorded. Null while pending.',
	`decision_comment` VARCHAR(500) COMMENT 'Reason given. Effectively mandatory on a rejection, since the requester sees it.',
	`due_at` DATETIME COMMENT 'When this step expires and escalates. Approval delay is the largest component of request lead time and is invisible without this.',
	`delegated_from_user_id` BIGINT COMMENT 'Original approver, when the decision was taken by a delegate. Kept so the audit trail shows both people rather than quietly substituting one.',
	PRIMARY KEY(`id`)
) COMMENT='An ordered chain, one row per step. Generating every step up front rather than creating the next one on each approval means the requester can see the whole path ahead of them, and a rejection at step two leaves steps three and four visibly skipped rather than absent.';


CREATE UNIQUE INDEX `uq_approvals_ticket_step`
ON `ticket_approvals` (`ticket_id`, `step_number`);
CREATE INDEX `idx_approvals_approver_status`
ON `ticket_approvals` (`approver_user_id`, `status`);
CREATE TABLE IF NOT EXISTS `change_requests` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_id` BIGINT NOT NULL UNIQUE COMMENT 'The ticket this extends. Unique, so a change is one-to-one with its ticket and inherits its queue, approvals and SLA rather than duplicating them.',
	`change_type` VARCHAR(24) NOT NULL DEFAULT 'normal' COMMENT 'standard | normal | emergency. Standard changes are pre-approved, emergency ones are approved after the fact, and normal ones go through the chain. The type decides which, so it is not a label.',
	`risk_level` VARCHAR(16) NOT NULL DEFAULT 'medium' COMMENT 'low | medium | high. Drives how many approval steps are generated and whether a change advisory board review is required.',
	`impact_summary` TEXT COMMENT 'Who or what is affected if this goes wrong. Written for the approvers, not for the engineer.',
	`implementation_plan` TEXT COMMENT 'Steps to be performed. Required before approval for anything above low risk.',
	`rollback_plan` TEXT COMMENT 'How to get back. A change with no rollback plan is a decision to accept an outage, and storing the field separately is what makes that decision visible rather than buried in a paragraph.',
	`test_plan` TEXT COMMENT 'How success is confirmed. Distinct from the rollback plan because the question of whether it worked is not the question of how to undo it.',
	`scheduled_start` DATETIME COMMENT 'Planned start of the change window.',
	`scheduled_end` DATETIME COMMENT 'Planned end of the window. Overlapping windows against the same asset are what a collision report looks for.',
	`actual_start` DATETIME COMMENT 'When work really began. Null until it does.',
	`actual_end` DATETIME COMMENT 'When work really finished. The gap against scheduled_end is the number the change board quotes back at people.',
	`outcome` VARCHAR(24) COMMENT 'successful | successful_with_issues | rolled_back | failed. Null until the change closes. Rolled back is not a failure and is deliberately its own value.',
	`post_review_notes` TEXT COMMENT 'Post-implementation review. Only filled for failures and rollbacks in practice, which is fine because that is where the learning is.',
	PRIMARY KEY(`id`)
) COMMENT='The extra facts a change needs beyond a ticket. Kept as an extension table rather than nullable columns on tickets, because ninety percent of tickets are not changes and would carry eleven empty columns forever.';


CREATE INDEX `idx_changes_scheduled_risk`
ON `change_requests` (`scheduled_start`, `risk_level`);
CREATE TABLE IF NOT EXISTS `sla_policies` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`policy_code` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Stable code referenced by catalogue items and reports.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Policy name as published to the business.',
	`applies_to_priority` VARCHAR(16) COMMENT 'low | normal | high | urgent. Null means the policy is selected by catalogue item instead of by priority.',
	`first_response_minutes` INTEGER NOT NULL COMMENT 'Target minutes to a first human reply. Separate from resolution because a fast acknowledgement is most of perceived service quality.',
	`resolution_minutes` INTEGER NOT NULL COMMENT 'Target minutes to resolution.',
	`business_hours_only` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether the clock runs only during the business calendar. An urgent production policy sets this false; a laptop request does not.',
	`business_day_start` TIME NOT NULL DEFAULT '09:00:00' COMMENT 'Start of the business day in the location timezone.',
	`business_day_end` TIME NOT NULL DEFAULT '17:00:00' COMMENT 'End of the business day. Together with the start this is the window the clock ticks in.',
	`pauses_on_pending_requester` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether waiting on the requester stops the clock. This single flag is the difference between a metric agents trust and one they game.',
	`pauses_on_pending_vendor` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether waiting on a third party stops the clock. Usually false, because the business does not care whose fault the delay is.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Superseded policies stay as rows because tickets already measured against them must keep their target.',
	PRIMARY KEY(`id`)
) COMMENT='The targets and the rules for counting against them. Both halves belong together: a four-hour target means nothing until you say which four hours count.';


CREATE TABLE IF NOT EXISTS `ticket_sla_clocks` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_id` BIGINT NOT NULL COMMENT 'Ticket being measured.',
	`metric` VARCHAR(24) NOT NULL COMMENT 'first_response | resolution. One row per metric, because they start together but stop at different moments and breach independently.',
	`sla_policy_id` BIGINT NOT NULL COMMENT 'Policy the target came from, recorded per clock so that a later policy edit cannot retroactively breach or rescue a closed ticket.',
	`target_minutes` INTEGER NOT NULL COMMENT 'Target copied from the policy at start. Copied, not joined, for exactly the same reason.',
	`started_at` DATETIME NOT NULL COMMENT 'When the clock started, normally ticket creation.',
	`due_at` DATETIME NOT NULL COMMENT 'Current deadline, recomputed forward each time the clock resumes after a pause. This is the column every breach query and every escalation job reads.',
	`stopped_at` DATETIME COMMENT 'When the metric was satisfied — first reply sent, or ticket resolved. Null while running or paused.',
	`elapsed_minutes` INTEGER NOT NULL DEFAULT 0 COMMENT 'Counted minutes so far, excluding paused time and out-of-hours time. Maintained on each state transition rather than derived, so a breach report is a scan rather than a replay of every pause.',
	`paused_minutes` INTEGER NOT NULL DEFAULT 0 COMMENT 'Total minutes excluded. Kept separately because the honest answer to how long a ticket took needs both numbers.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'running' COMMENT 'running | paused | met | breached | cancelled. Met and breached are terminal and are set once, at stop time.',
	`breached_at` DATETIME COMMENT 'Moment the deadline passed, if it did. Recorded even when the ticket is later resolved, because a met-after-breach is not a met.',
	PRIMARY KEY(`id`)
) COMMENT='One clock per ticket per metric. Storing elapsed and due time on the row, and pushing due_at forward on every resume, is what makes the breach query an index scan instead of a recalculation over every pause the ticket ever had.';


CREATE UNIQUE INDEX `uq_sla_clock_ticket_metric`
ON `ticket_sla_clocks` (`ticket_id`, `metric`);
CREATE INDEX `idx_sla_clock_state_due`
ON `ticket_sla_clocks` (`state`, `due_at`);
CREATE TABLE IF NOT EXISTS `sla_pause_periods` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`clock_id` BIGINT NOT NULL COMMENT 'Clock that was paused.',
	`reason` VARCHAR(32) NOT NULL COMMENT 'pending_requester | pending_vendor | pending_approval | out_of_hours | on_hold. The reason decides whether the pause was legitimate under the policy, which is the first thing questioned when a target is missed.',
	`paused_at` DATETIME NOT NULL COMMENT 'Start of the excluded interval, written the moment the ticket enters a waiting status.',
	`resumed_at` DATETIME COMMENT 'End of the excluded interval. Null while still paused, and a stale null here is the classic way a ticket quietly stops being measured.',
	`paused_minutes` INTEGER COMMENT 'Duration of this interval, filled on resume. Null while open, so the sum of these plus the current open pause is always reconcilable against the clock.',
	`triggered_by_user_id` BIGINT COMMENT 'Who caused the pause. Usually the agent who set the status; null when a scheduled job paused it for out-of-hours.',
	PRIMARY KEY(`id`)
) COMMENT='The evidence behind every excluded minute. Without these rows a paused clock is an assertion; with them, a disputed breach is settled by showing exactly which four days the ticket spent waiting on the person who raised it.';


CREATE INDEX `idx_pause_clock_start`
ON `sla_pause_periods` (`clock_id`, `paused_at`);
CREATE TABLE IF NOT EXISTS `kb_articles` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`article_key` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Stable public identifier used in URLs and quoted in tickets. Survives every retitling.',
	`title` VARCHAR(300) NOT NULL COMMENT 'Current title, denormalised from the published version so that search and listings do not join.',
	`category` VARCHAR(64) NOT NULL COMMENT 'Grouping in the portal, usually mirroring the catalogue categories so a failed request suggests the right article.',
	`published_version_id` BIGINT COMMENT 'Version currently visible to requesters. Null for an article that has only ever been a draft.',
	`owner_user_id` BIGINT COMMENT 'Agent responsible for accuracy. Null means nobody owns it, which is the strongest predictor of a stale article.',
	`visibility` VARCHAR(16) NOT NULL DEFAULT 'internal' COMMENT 'internal | public. Internal articles contain remediation steps that should not be self-served.',
	`view_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Reads, as a counter rather than a row per view. The deflection question only needs the magnitude.',
	`helpful_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Positive feedback votes. Together with view_count it identifies articles people find but cannot use.',
	`review_due_on` DATE COMMENT 'When accuracy should next be checked. An article about a system that changed six months ago is worse than no article.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First draft time.',
	PRIMARY KEY(`id`)
) COMMENT='The stable identity of a piece of knowledge. It holds no body text at all: the content lives in versions, so the article can be linked to from a ticket closed three years ago and still resolve.';


CREATE INDEX `idx_kb_category_visibility`
ON `kb_articles` (`category`, `visibility`);
CREATE TABLE IF NOT EXISTS `kb_article_versions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`article_id` BIGINT NOT NULL COMMENT 'Article this is a version of.',
	`version_number` INTEGER NOT NULL COMMENT 'Monotonic version, starting at one. Explicit rather than inferred from timestamps, because two edits can be saved in the same second.',
	`title` VARCHAR(300) NOT NULL COMMENT 'Title as of this version. Stored per version so that a ticket referencing an old version still shows the wording the agent actually read.',
	`body` MEDIUMTEXT NOT NULL COMMENT 'Article content. Mediumtext because runbooks with embedded output outgrow text more often than anyone expects.',
	`change_summary` VARCHAR(500) COMMENT 'What changed and why. The reviewers read this, not the diff.',
	`author_user_id` BIGINT COMMENT 'Who wrote this version. Null for versions imported during a migration.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft | in_review | published | archived. Only one version per article is published at a time, which the article row points at.',
	`published_at` DATETIME COMMENT 'When this version went live. Null for drafts and for versions that were superseded before publication.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the draft was saved.',
	PRIMARY KEY(`id`)
) COMMENT='Immutable snapshots of article content. Editing in place would quietly rewrite the instructions someone followed last month, which is exactly the thing you want to look at when the fix turns out to have been wrong.';


CREATE UNIQUE INDEX `uq_kb_article_version`
ON `kb_article_versions` (`article_id`, `version_number`);
CREATE TABLE IF NOT EXISTS `satisfaction_ratings` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_id` BIGINT NOT NULL UNIQUE COMMENT 'Ticket rated. Unique, so every rating is tied to real work and there is exactly one per ticket — no survey without a stay, and no repeat voting.',
	`rated_by_user_id` BIGINT NOT NULL COMMENT 'Who rated it. Normally the requester, and the constraint that it must be the requester is enforced in the application rather than by the schema.',
	`score` SMALLINT NOT NULL COMMENT 'One to five. A small integer rather than a label, because the mean of a label is not a number.',
	`comment` VARCHAR(1000) COMMENT 'Free-text feedback. The part managers actually read, and the reason a low score is sometimes about a policy rather than an agent.',
	`agent_id` BIGINT COMMENT 'Agent credited, snapshotted at rating time so a later reassignment does not move the score to someone who never touched the ticket.',
	`sla_met` BOOLEAN COMMENT 'Whether both clocks were met at resolution, copied here so satisfaction can be sliced against timeliness without recomputing clocks.',
	`submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the rating arrived. Ratings are accepted between resolution and a grace window after closure, then the ticket goes quiet.',
	PRIMARY KEY(`id`)
) COMMENT='One rating per ticket, verifiable by construction. Anchoring it to a ticket rather than collecting standalone survey responses is what stops the score from measuring who happens to answer surveys.';


CREATE INDEX `idx_ratings_agent_submitted`
ON `satisfaction_ratings` (`agent_id`, `submitted_at`);
CREATE INDEX `idx_ratings_score`
ON `satisfaction_ratings` (`score`);
ALTER TABLE `users`
ADD FOREIGN KEY(`manager_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `service_catalog_items`
ADD FOREIGN KEY(`sla_policy_id`) REFERENCES `sla_policies`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `assets`
ADD FOREIGN KEY(`owner_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`catalog_item_id`) REFERENCES `service_catalog_items`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`requester_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`assigned_agent_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`sla_policy_id`) REFERENCES `sla_policies`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`parent_ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tickets`
ADD FOREIGN KEY(`kb_article_id`) REFERENCES `kb_articles`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `ticket_assets`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `ticket_assets`
ADD FOREIGN KEY(`asset_id`) REFERENCES `assets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `ticket_assets`
ADD FOREIGN KEY(`linked_by_agent_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `ticket_approvals`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `ticket_approvals`
ADD FOREIGN KEY(`approver_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `ticket_approvals`
ADD FOREIGN KEY(`delegated_from_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `change_requests`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `ticket_sla_clocks`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `ticket_sla_clocks`
ADD FOREIGN KEY(`sla_policy_id`) REFERENCES `sla_policies`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sla_pause_periods`
ADD FOREIGN KEY(`clock_id`) REFERENCES `ticket_sla_clocks`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `sla_pause_periods`
ADD FOREIGN KEY(`triggered_by_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `kb_articles`
ADD FOREIGN KEY(`published_version_id`) REFERENCES `kb_article_versions`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `kb_articles`
ADD FOREIGN KEY(`owner_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `kb_article_versions`
ADD FOREIGN KEY(`article_id`) REFERENCES `kb_articles`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `kb_article_versions`
ADD FOREIGN KEY(`author_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `satisfaction_ratings`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `satisfaction_ratings`
ADD FOREIGN KEY(`rated_by_user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `satisfaction_ratings`
ADD FOREIGN KEY(`agent_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
