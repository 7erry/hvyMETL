CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Login address.',
	`display_name` VARCHAR(120) NOT NULL COMMENT 'Name shown on results and leaderboards.',
	`role` VARCHAR(16) NOT NULL DEFAULT 'taker' COMMENT 'taker | author | admin. Authors own quizzes and banks; takers only ever own attempts.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when suspended. Quizzes they authored keep pointing here, so rows are never deleted.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Signup time.',
	PRIMARY KEY(`id`)
) COMMENT='Anyone with an account. One table for authors and takers because the same person routinely does both and permissions are checked per quiz.';


CREATE TABLE IF NOT EXISTS `question_pools` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`owner_id` BIGINT NOT NULL COMMENT 'Author who maintains the bank.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Bank name, e.g. Cell biology - mitosis.',
	`subject` VARCHAR(80) COMMENT 'Topic label used to find banks when assembling a quiz.',
	`description` TEXT COMMENT 'What the bank covers and who it is for.',
	`is_shared` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when other authors may draw from it. The whole reason banks are separate from quizzes.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='A reusable bank of questions. Questions belong to a bank rather than to a quiz, which is what lets one question serve a practice quiz, a midterm and a retake without being copied three times.';


CREATE INDEX `idx_pools_owner_subject`
ON `question_pools` (`owner_id`, `subject`);
CREATE TABLE IF NOT EXISTS `questions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`pool_id` BIGINT NOT NULL COMMENT 'Bank this question belongs to.',
	`question_type` VARCHAR(20) NOT NULL COMMENT 'single_choice | multiple_choice | true_false | short_answer. Decides which child table holds the correct answer.',
	`prompt` TEXT NOT NULL COMMENT 'The question as shown to the taker.',
	`media_url` VARCHAR(500) COMMENT 'Optional image or audio accompanying the prompt.',
	`points` DECIMAL(6,2) NOT NULL DEFAULT 1 COMMENT 'Maximum credit. Stored on the question so the same question is worth the same wherever it is drawn.',
	`scoring_mode` VARCHAR(20) NOT NULL DEFAULT 'all_or_nothing' COMMENT 'all_or_nothing | partial_credit | negative_marking. Only meaningful for multiple_choice, where it decides what half-right is worth.',
	`shuffle_options` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether the option order may be randomised per attempt. False for questions whose options read as an ordered list.',
	`difficulty` TINYINT NOT NULL DEFAULT 3 COMMENT '1-5, used to balance a random draw so two takers get comparably hard papers.',
	`explanation` TEXT COMMENT 'Shown after grading. Null when the author gives no rationale.',
	`is_retired` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when withdrawn from future draws. Retired rather than deleted so past attempts still resolve what was asked.',
	PRIMARY KEY(`id`)
) COMMENT='One question in a bank. The type lives here and the correct answer lives elsewhere, because storing a correct answer inline would mean one nullable column per format and a grader full of special cases.';


CREATE INDEX `idx_questions_pool_draw`
ON `questions` (`pool_id`, `is_retired`, `difficulty`);
CREATE INDEX `idx_questions_type`
ON `questions` (`question_type`);
CREATE TABLE IF NOT EXISTS `question_options` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`question_id` BIGINT NOT NULL COMMENT 'Question this option belongs to.',
	`ordinal` SMALLINT NOT NULL COMMENT 'Author order. Preserved even when an attempt shuffles, so an author editing the question sees a stable list.',
	`body` TEXT NOT NULL COMMENT 'Option text as shown.',
	`is_correct` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether selecting this option earns credit. Several rows may be true for multiple_choice, exactly one for single_choice and true_false.',
	`credit_weight` DECIMAL(5,3) NOT NULL DEFAULT 1 COMMENT 'Share of the points this option contributes under partial credit, and the size of the deduction when it is wrong under negative marking.',
	`feedback` VARCHAR(500) COMMENT 'Per-option explanation shown after answering, e.g. why a plausible distractor is wrong.',
	PRIMARY KEY(`id`)
) COMMENT='A selectable answer for a choice question. Correctness lives on the option rather than on the question, so single choice, multiple choice and true/false are the same storage with different cardinality.';


CREATE UNIQUE INDEX `uq_options_question_ordinal`
ON `question_options` (`question_id`, `ordinal`);
CREATE INDEX `idx_options_question_correct`
ON `question_options` (`question_id`, `is_correct`);
CREATE TABLE IF NOT EXISTS `answer_keys` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`question_id` BIGINT NOT NULL COMMENT 'Short-answer question this key grades.',
	`match_mode` VARCHAR(24) NOT NULL DEFAULT 'case_insensitive' COMMENT 'exact | case_insensitive | trimmed | regex | numeric_tolerance. The grading rule, not the answer.',
	`expected_value` VARCHAR(500) NOT NULL COMMENT 'Accepted response, or the pattern when match_mode is regex.',
	`numeric_tolerance` DECIMAL(12,6) COMMENT 'Absolute tolerance for numeric answers, e.g. 0.01. Null for every non-numeric mode.',
	`credit_weight` DECIMAL(5,3) NOT NULL DEFAULT 1 COMMENT 'Fraction of the points a match earns. Below 1 marks an acceptable-but-imprecise answer.',
	`ordinal` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Evaluation order. The first matching key wins, so a full-credit key must be tried before a partial one.',
	PRIMARY KEY(`id`)
) COMMENT='The correct answer for questions that have no options. Several rows per question is the normal case — spelling variants, synonyms and near-misses each get their own row and their own weight.';


CREATE UNIQUE INDEX `uq_answer_keys_question_ordinal`
ON `answer_keys` (`question_id`, `ordinal`);
CREATE TABLE IF NOT EXISTS `quizzes` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`owner_id` BIGINT NOT NULL COMMENT 'Author who publishes and grades it.',
	`title` VARCHAR(200) NOT NULL COMMENT 'Quiz title.',
	`slug` VARCHAR(120) NOT NULL UNIQUE COMMENT 'URL segment used for sharing.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft | published | closed. Only a published quiz accepts new attempts.',
	`time_limit_seconds` INTEGER COMMENT 'Wall-clock allowance per attempt. Null means untimed, which is why the limit is nullable rather than zero.',
	`max_attempts` SMALLINT COMMENT 'Attempt cap per taker. Null means unlimited.',
	`pass_mark_percent` DECIMAL(5,2) COMMENT 'Score needed to pass. Null when the quiz only reports a score.',
	`shuffle_questions` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether the drawn questions are presented in random order.',
	`show_answers_after` VARCHAR(16) NOT NULL DEFAULT 'submission' COMMENT 'never | submission | close_date. Controls when explanations and correctness are revealed.',
	`opens_at` DATETIME COMMENT 'Earliest start. Null means open immediately.',
	`closes_at` DATETIME COMMENT 'Latest start. Null means open indefinitely.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='The assessment definition. It holds no questions of its own: what appears on the paper is decided by the draw rules, which is what lets the same quiz produce a different paper for every taker.';


CREATE INDEX `idx_quizzes_owner_state`
ON `quizzes` (`owner_id`, `state`);
CREATE TABLE IF NOT EXISTS `quiz_pool_rules` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`quiz_id` BIGINT NOT NULL COMMENT 'Quiz these questions are drawn for.',
	`pool_id` BIGINT NOT NULL COMMENT 'Bank drawn from.',
	`section_ordinal` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Section position on the paper, so a quiz can read as several topic blocks.',
	`draw_count` SMALLINT NOT NULL COMMENT 'How many questions to take from this bank. Set to the bank size for a fixed, non-random quiz.',
	`question_type_filter` VARCHAR(20) COMMENT 'Restricts the draw to one type, e.g. only true_false. Null draws any type.',
	`min_difficulty` TINYINT COMMENT 'Lower bound on difficulty for this draw. Null means no floor.',
	`max_difficulty` TINYINT COMMENT 'Upper bound on difficulty. Paired with min_difficulty to make random papers comparable.',
	PRIMARY KEY(`id`)
) COMMENT='A recipe line: take N questions from this bank under these filters. Randomisation is configuration rather than code, and a fixed quiz is just the degenerate case where draw_count equals the bank size.';


CREATE INDEX `idx_pool_rules_quiz_section`
ON `quiz_pool_rules` (`quiz_id`, `section_ordinal`);
CREATE UNIQUE INDEX `uq_pool_rules_quiz_pool`
ON `quiz_pool_rules` (`quiz_id`, `pool_id`);
CREATE TABLE IF NOT EXISTS `attempts` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`quiz_id` BIGINT NOT NULL COMMENT 'Quiz being taken.',
	`user_id` BIGINT NOT NULL COMMENT 'Taker.',
	`attempt_number` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Sequence per taker per quiz, checked against max_attempts before a row is created.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'in_progress' COMMENT 'in_progress | submitted | graded | expired | abandoned.',
	`started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Server-side start time. The client clock is never trusted for timing.',
	`expires_at` DATETIME COMMENT 'Start time plus the time limit, frozen at creation. Null for untimed quizzes; changing the limit later must not shorten an attempt already running.',
	`submitted_at` DATETIME COMMENT 'Submission time. Null while in progress.',
	`raw_score` DECIMAL(8,2) COMMENT 'Sum of awarded points. Null until grading completes.',
	`max_score` DECIMAL(8,2) COMMENT 'Total points available on this particular paper. Stored because a random draw means two attempts at the same quiz can be out of different totals.',
	`percent_score` DECIMAL(5,2) COMMENT 'raw_score over max_score. Denormalised so result lists and pass checks do not divide on every read.',
	`passed` BOOLEAN COMMENT 'Whether percent_score cleared the pass mark in force at submission. Null for ungraded or unmarked attempts.',
	PRIMARY KEY(`id`)
) COMMENT='One sitting. The score totals are stored rather than summed on read because the paper is generated per attempt, so the denominator is a property of the attempt and cannot be recovered from the quiz.';


CREATE UNIQUE INDEX `uq_attempts_quiz_user_number`
ON `attempts` (`quiz_id`, `user_id`, `attempt_number`);
CREATE INDEX `idx_attempts_user_time`
ON `attempts` (`user_id`, `started_at`);
CREATE INDEX `idx_attempts_quiz_state`
ON `attempts` (`quiz_id`, `state`);
CREATE TABLE IF NOT EXISTS `attempt_questions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`attempt_id` BIGINT NOT NULL COMMENT 'Attempt this question was served to.',
	`question_id` BIGINT NOT NULL COMMENT 'Question drawn from a bank.',
	`position` SMALLINT NOT NULL COMMENT 'Order shown to the taker, after any shuffling. This is the paper as it existed.',
	`option_order` JSON COMMENT 'Option ids in the order displayed. Null when options were not shuffled; without it a screenshot of a paper cannot be reconciled with the data.',
	`points_possible` DECIMAL(6,2) NOT NULL COMMENT 'Points snapshotted from the question at draw time, so a later edit cannot change what an old attempt was out of.',
	`scoring_mode` VARCHAR(20) NOT NULL COMMENT 'Snapshotted scoring rule, for the same reason. Regrades then reproduce the original marking exactly.',
	PRIMARY KEY(`id`)
) COMMENT='The generated paper: which questions this attempt actually got, in which order, worth what. This table is what makes a randomised quiz appealable and regradable instead of a black box.';


CREATE UNIQUE INDEX `uq_attempt_questions_attempt_position`
ON `attempt_questions` (`attempt_id`, `position`);
CREATE INDEX `idx_attempt_questions_question`
ON `attempt_questions` (`question_id`);
CREATE TABLE IF NOT EXISTS `responses` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`attempt_question_id` BIGINT NOT NULL UNIQUE COMMENT 'Served question being answered. Unique, so a response is upserted as the taker changes their mind rather than accumulating drafts.',
	`text_answer` VARCHAR(1000) COMMENT 'Typed answer for short_answer questions. Null for choice questions, whose answer is in response_selections.',
	`answered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Last time the answer changed. Compared against expires_at to reject late edits.',
	`time_spent_seconds` INTEGER COMMENT 'Focus time on this question, used to spot guessing and to tune future time limits.',
	`is_flagged` BOOLEAN NOT NULL DEFAULT false COMMENT 'Taker marked it for review. Purely a UI aid, but it belongs to the response rather than to session state.',
	`awarded_points` DECIMAL(6,2) COMMENT 'Credit given after marking. Null until graded; may be fractional under partial credit and negative under negative marking.',
	`is_correct` BOOLEAN COMMENT 'Fully correct or not. Kept alongside awarded_points because a half-credit answer is neither right nor wrong and reporting needs both facts.',
	`graded_at` DATETIME COMMENT 'When marking happened. Null for unmarked short answers awaiting a human.',
	`matched_answer_key_id` BIGINT COMMENT 'Answer key that matched a short answer. Null for choice questions and for unmatched responses; it is the audit trail for automatic text marking.',
	PRIMARY KEY(`id`)
) COMMENT='One answer to one served question. It points at the served question rather than at the quiz question, which is what keeps a response attached to the exact paper the taker saw.';


CREATE INDEX `idx_responses_matched_key`
ON `responses` (`matched_answer_key_id`);
CREATE TABLE IF NOT EXISTS `response_selections` (
	`response_id` BIGINT COMMENT 'Response the selection belongs to. Half of the composite primary key.',
	`option_id` BIGINT COMMENT 'Option chosen. The other half; the pair being the key is what makes selecting the same option twice impossible.',
	`selected_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this option was ticked. Useful for reconstructing how an answer evolved before submission.',
	PRIMARY KEY(`response_id`, `option_id`)
) COMMENT='The ticked boxes. A separate table rather than a column because multiple choice means many selections per response, and grading partial credit is then a set comparison against the correct options instead of string parsing.';


CREATE INDEX `idx_response_selections_option`
ON `response_selections` (`option_id`);
ALTER TABLE `question_pools`
ADD FOREIGN KEY(`owner_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `questions`
ADD FOREIGN KEY(`pool_id`) REFERENCES `question_pools`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `question_options`
ADD FOREIGN KEY(`question_id`) REFERENCES `questions`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `answer_keys`
ADD FOREIGN KEY(`question_id`) REFERENCES `questions`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `quizzes`
ADD FOREIGN KEY(`owner_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `quiz_pool_rules`
ADD FOREIGN KEY(`quiz_id`) REFERENCES `quizzes`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `quiz_pool_rules`
ADD FOREIGN KEY(`pool_id`) REFERENCES `question_pools`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `attempts`
ADD FOREIGN KEY(`quiz_id`) REFERENCES `quizzes`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `attempts`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `attempt_questions`
ADD FOREIGN KEY(`attempt_id`) REFERENCES `attempts`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `attempt_questions`
ADD FOREIGN KEY(`question_id`) REFERENCES `questions`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `responses`
ADD FOREIGN KEY(`attempt_question_id`) REFERENCES `attempt_questions`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `responses`
ADD FOREIGN KEY(`matched_answer_key_id`) REFERENCES `answer_keys`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `response_selections`
ADD FOREIGN KEY(`response_id`) REFERENCES `responses`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `response_selections`
ADD FOREIGN KEY(`option_id`) REFERENCES `question_options`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
