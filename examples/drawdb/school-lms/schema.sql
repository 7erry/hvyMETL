CREATE TABLE IF NOT EXISTS `students` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`student_number` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Printed identifier used on transcripts and ID cards. Never reused.',
	`given_name` VARCHAR(100) NOT NULL COMMENT 'First name.',
	`family_name` VARCHAR(100) NOT NULL COMMENT 'Surname, indexed for roster lookups.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Institutional address, used for login and notices.',
	`date_of_birth` DATE COMMENT 'Needed for age-restricted courses and safeguarding rules.',
	`enrolled_on` DATE NOT NULL COMMENT 'Date the student joined the institution.',
	`graduated_on` DATE COMMENT 'Graduation date. Null while still studying.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active | leave | withdrawn | graduated.',
	PRIMARY KEY(`id`)
) COMMENT='A learner. Records outlive study: transcripts must be reissuable years after graduation, so rows are never deleted.';


CREATE INDEX `idx_students_name`
ON `students` (`family_name`, `given_name`);
CREATE TABLE IF NOT EXISTS `instructors` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`staff_number` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Internal staff identifier.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Name as printed on timetables and transcripts.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Institutional address.',
	`department` VARCHAR(120) COMMENT 'Owning department.',
	`title` VARCHAR(60) COMMENT 'Academic title, e.g. Professor or Lecturer.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when staff leave; sections they taught keep pointing here.',
	PRIMARY KEY(`id`)
) COMMENT='Anyone who can teach a section. Kept separate from students because the two have almost no columns in common and very different access rules.';


CREATE TABLE IF NOT EXISTS `terms` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Short code, e.g. 2026-FALL.',
	`name` VARCHAR(80) NOT NULL COMMENT 'Display name.',
	`starts_on` DATE NOT NULL COMMENT 'First teaching day.',
	`ends_on` DATE NOT NULL COMMENT 'Last teaching day.',
	`enrollment_opens_on` DATE COMMENT 'When students may start enrolling.',
	`enrollment_closes_on` DATE COMMENT 'Enrolment deadline, after which changes need an override.',
	PRIMARY KEY(`id`)
) COMMENT='An academic period. Almost everything in a school system is term-scoped, and making the term a row rather than a pair of dates on each course is what keeps that consistent.';


CREATE TABLE IF NOT EXISTS `courses` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Catalogue code, e.g. CS101. Stable across years.',
	`title` VARCHAR(200) NOT NULL COMMENT 'Course title.',
	`description` TEXT COMMENT 'Catalogue description.',
	`department` VARCHAR(120) NOT NULL COMMENT 'Owning department.',
	`credits` DECIMAL(4,1) NOT NULL COMMENT 'Credit value. Decimal because half credits are common.',
	`level` VARCHAR(20) COMMENT 'undergraduate | graduate.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when retired from the catalogue. Historic enrolments still resolve.',
	PRIMARY KEY(`id`)
) COMMENT='The catalogue entry — what is taught, not when. A course is offered many times; each offering is a section.';


CREATE TABLE IF NOT EXISTS `course_prerequisites` (
	`course_id` BIGINT COMMENT 'Course that has the requirement. Half of the composite primary key.',
	`prerequisite_course_id` BIGINT COMMENT 'Course that must be completed first. The other half of the key.',
	`minimum_grade` VARCHAR(4) COMMENT 'Minimum grade in the prerequisite, e.g. C. Null means a pass is enough.',
	PRIMARY KEY(`course_id`, `prerequisite_course_id`)
) COMMENT='Self-referencing many-to-many over courses. The reverse index answers "what does this course unlock", which is what degree planning tools need.';


CREATE INDEX `idx_prereq_prerequisite`
ON `course_prerequisites` (`prerequisite_course_id`);
CREATE TABLE IF NOT EXISTS `sections` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`course_id` BIGINT NOT NULL COMMENT 'Course being offered.',
	`term_id` BIGINT NOT NULL COMMENT 'Term the offering runs in.',
	`instructor_id` BIGINT COMMENT 'Teaching staff member. Null until timetabling assigns one.',
	`section_code` VARCHAR(10) NOT NULL COMMENT 'Distinguishes parallel offerings, e.g. 001 or 002.',
	`capacity` INTEGER NOT NULL DEFAULT 30 COMMENT 'Maximum enrolments. Compared against confirmed enrolments to decide the waitlist.',
	`room` VARCHAR(60) COMMENT 'Room or building code.',
	`meeting_pattern` VARCHAR(60) COMMENT 'Human-readable schedule, e.g. MWF 10:00-10:50.',
	`delivery_mode` VARCHAR(20) NOT NULL DEFAULT 'in_person' COMMENT 'in_person | online | hybrid.',
	PRIMARY KEY(`id`)
) COMMENT='One offering of a course in one term. This is the thing students actually enrol in, and the thing assignments, attendance and grades hang off.';


CREATE UNIQUE INDEX `uq_sections_course_term_code`
ON `sections` (`course_id`, `term_id`, `section_code`);
CREATE INDEX `idx_sections_term_instructor`
ON `sections` (`term_id`, `instructor_id`);
CREATE TABLE IF NOT EXISTS `enrollments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`section_id` BIGINT NOT NULL COMMENT 'Section enrolled in.',
	`student_id` BIGINT NOT NULL COMMENT 'Enrolled student.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'enrolled' COMMENT 'enrolled | waitlisted | dropped | completed.',
	`enrolled_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Enrolment time; also the waitlist ordering.',
	`dropped_on` DATE COMMENT 'Drop date. Whether it counts as a withdrawal depends on the term deadlines.',
	`final_grade` VARCHAR(4) COMMENT 'Letter grade awarded at the end, e.g. A-. Null until grading closes.',
	`grade_points` DECIMAL(4,2) COMMENT 'Numeric equivalent of the letter grade, snapshotted so a later scale change cannot restate an old transcript.',
	PRIMARY KEY(`id`)
) COMMENT='The registration record, and the row a transcript is built from. The final grade lives here because it belongs to the enrolment, not to the student or the course alone.';


CREATE UNIQUE INDEX `uq_enrollments_section_student`
ON `enrollments` (`section_id`, `student_id`);
CREATE INDEX `idx_enrollments_student_status`
ON `enrollments` (`student_id`, `status`);
CREATE TABLE IF NOT EXISTS `assignments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`section_id` BIGINT NOT NULL COMMENT 'Section the assignment belongs to.',
	`title` VARCHAR(200) NOT NULL COMMENT 'Assignment title.',
	`description` TEXT COMMENT 'Instructions given to students.',
	`assignment_type` VARCHAR(20) NOT NULL DEFAULT 'homework' COMMENT 'homework | quiz | exam | project.',
	`points_possible` DECIMAL(6,2) NOT NULL COMMENT 'Maximum score, used to normalise across assignments.',
	`weight_percent` DECIMAL(5,2) COMMENT 'Contribution to the final grade, as a percentage. The section total should reach 100.',
	`due_at` DATETIME COMMENT 'Deadline. Late submissions are detected by comparing the submission time to this.',
	`published_at` DATETIME COMMENT 'When students can see it. Null means it is still a draft.',
	PRIMARY KEY(`id`)
) COMMENT='A graded item within a section. Assignments belong to the offering rather than the course, so each term can weight and schedule its own work.';


CREATE INDEX `idx_assignments_section_due`
ON `assignments` (`section_id`, `due_at`);
CREATE TABLE IF NOT EXISTS `submissions` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`assignment_id` BIGINT NOT NULL COMMENT 'Assignment being answered.',
	`student_id` BIGINT NOT NULL COMMENT 'Submitting student.',
	`attempt_number` INTEGER NOT NULL DEFAULT 1 COMMENT 'Resubmissions are new rows, so feedback history is preserved.',
	`submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Submission time; compared against the deadline to flag lateness.',
	`content_url` VARCHAR(500) COMMENT 'Object storage key or link to the submitted work.',
	`score` DECIMAL(6,2) COMMENT 'Awarded score. Null until marked.',
	`feedback` TEXT COMMENT 'Marker feedback returned to the student.',
	`graded_at` DATETIME COMMENT 'When it was marked.',
	`graded_by_id` BIGINT COMMENT 'Marker. Null until graded.',
	PRIMARY KEY(`id`)
) COMMENT='One row per attempt, not per student. Keeping attempts rather than overwriting is what lets a regrade or an appeal be examined afterwards.';


CREATE UNIQUE INDEX `uq_submissions_assignment_student_attempt`
ON `submissions` (`assignment_id`, `student_id`, `attempt_number`);
CREATE INDEX `idx_submissions_student_time`
ON `submissions` (`student_id`, `submitted_at`);
CREATE TABLE IF NOT EXISTS `attendance` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`section_id` BIGINT NOT NULL COMMENT 'Section meeting.',
	`student_id` BIGINT NOT NULL COMMENT 'Student being marked.',
	`meeting_date` DATE NOT NULL COMMENT 'The class date. A date, not a timestamp — attendance is a per-session fact.',
	`status` VARCHAR(16) NOT NULL COMMENT 'present | absent | late | excused.',
	`note` VARCHAR(255) COMMENT 'Reason or comment, e.g. medical note received.',
	`recorded_by_id` BIGINT COMMENT 'Staff member who took the register.',
	PRIMARY KEY(`id`)
) COMMENT='One row per student per session. The unique key makes taking the register idempotent, so a resubmitted form corrects rather than duplicates.';


CREATE UNIQUE INDEX `uq_attendance_section_date_student`
ON `attendance` (`section_id`, `meeting_date`, `student_id`);
CREATE INDEX `idx_attendance_student_date`
ON `attendance` (`student_id`, `meeting_date`);
ALTER TABLE `course_prerequisites`
ADD FOREIGN KEY(`course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `course_prerequisites`
ADD FOREIGN KEY(`prerequisite_course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `sections`
ADD FOREIGN KEY(`course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sections`
ADD FOREIGN KEY(`term_id`) REFERENCES `terms`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sections`
ADD FOREIGN KEY(`instructor_id`) REFERENCES `instructors`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `enrollments`
ADD FOREIGN KEY(`section_id`) REFERENCES `sections`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `enrollments`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `assignments`
ADD FOREIGN KEY(`section_id`) REFERENCES `sections`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `submissions`
ADD FOREIGN KEY(`assignment_id`) REFERENCES `assignments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `submissions`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `submissions`
ADD FOREIGN KEY(`graded_by_id`) REFERENCES `instructors`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `attendance`
ADD FOREIGN KEY(`section_id`) REFERENCES `sections`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `attendance`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `attendance`
ADD FOREIGN KEY(`recorded_by_id`) REFERENCES `instructors`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
