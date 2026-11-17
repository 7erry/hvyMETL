CREATE TABLE IF NOT EXISTS `clinics` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Site name as patients see it on the confirmation.',
	`code` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Short internal code used in reports and on printed schedules.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone of the site. Every slot instant is rendered through this, because a clinic day is a local-time concept.',
	`address_line` VARCHAR(255) COMMENT 'Street address, included in reminders so patients arrive at the right site.',
	`phone` VARCHAR(32) COMMENT 'Number patients call to cancel, which is the number that must appear in every reminder.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when a site closes. Never deleted, because years of appointment history point at it.',
	PRIMARY KEY(`id`)
) COMMENT='A physical site. The timezone lives here rather than on the organisation because a multi-site group frequently spans zones, and a slot generated in the wrong one is an appointment nobody attends.';


CREATE TABLE IF NOT EXISTS `rooms` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site the room is in.',
	`name` VARCHAR(60) NOT NULL COMMENT 'Room label as staff say it aloud, e.g. Exam 3.',
	`room_type` VARCHAR(24) NOT NULL DEFAULT 'exam' COMMENT 'exam | procedure | lab | telehealth. An appointment type that needs a procedure room cannot be placed in an exam room.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False while out of service for maintenance, which removes it from generation without deleting its history.',
	PRIMARY KEY(`id`)
) COMMENT='Bookable physical space. Rooms are a second scarce resource alongside providers: a clinic with six clinicians and four rooms can only run four appointments at once, and the slot is where those two constraints meet.';


CREATE UNIQUE INDEX `uq_room_clinic_name`
ON `rooms` (`clinic_id`, `name`);
CREATE TABLE IF NOT EXISTS `providers` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Name shown to patients when booking.',
	`credential` VARCHAR(24) NOT NULL COMMENT 'MD | DO | NP | PA | RN. Decides which appointment types they may take.',
	`specialty` VARCHAR(80) COMMENT 'Clinical specialty, used to route referrals.',
	`default_clinic_id` BIGINT COMMENT 'Home site. Null for locums who float between sites.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False after departure. Past appointments stay attributed to them.',
	PRIMARY KEY(`id`)
) COMMENT='Whoever a patient can book with. Deactivation rather than deletion, because cancelling a departed provider future clinic is a deliberate operational task, not a cascade.';


CREATE INDEX `idx_providers_clinic_active`
ON `providers` (`default_clinic_id`, `is_active`);
CREATE TABLE IF NOT EXISTS `patients` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`medical_record_number` VARCHAR(24) NOT NULL UNIQUE COMMENT 'MRN quoted by staff and printed on paperwork.',
	`given_name` VARCHAR(100) NOT NULL COMMENT 'First name.',
	`family_name` VARCHAR(100) NOT NULL COMMENT 'Surname.',
	`date_of_birth` DATE NOT NULL COMMENT 'Identity verification at check-in.',
	`phone` VARCHAR(32) COMMENT 'Primary reminder destination.',
	`email` VARCHAR(320) COMMENT 'Secondary reminder destination and the portal login.',
	`preferred_channel` VARCHAR(12) NOT NULL DEFAULT 'sms' COMMENT 'sms | email | voice | none. none is a real choice and has to be respected rather than treated as a missing value.',
	`no_show_count` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Running count over the policy window, maintained on write. Booking rules read it on every attempt, so counting appointment history there would be a scan in the hot path.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Registration time.',
	PRIMARY KEY(`id`)
) COMMENT='The person being seen. The no-show counter is denormalised deliberately: it is the one clinical-administrative fact that gates booking, and it has to be readable in a single row fetch.';


CREATE INDEX `idx_patients_name_dob`
ON `patients` (`family_name`, `date_of_birth`);
CREATE TABLE IF NOT EXISTS `appointment_types` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site that offers it. The same service can run at different lengths at different sites.',
	`name` VARCHAR(120) NOT NULL COMMENT 'What it is called when booking, e.g. New patient consult.',
	`duration_minutes` SMALLINT NOT NULL DEFAULT 15 COMMENT 'Appointment length. Drives how many slots a template produces, which is why changing it only affects future generation.',
	`buffer_minutes` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Turnaround time after the appointment for cleaning or notes. Kept separate from duration so the patient-visible length stays honest.',
	`requires_room` BOOLEAN NOT NULL DEFAULT true COMMENT 'False for telehealth, which consumes a provider but no physical space.',
	`room_type` VARCHAR(24) COMMENT 'Room type required. Null means any room will do.',
	`default_price_cents` INTEGER COMMENT 'Self-pay price in minor units. Null when the service is only ever billed to a payer.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of default_price_cents.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False retires the type without invalidating appointments already booked under it.',
	PRIMARY KEY(`id`)
) COMMENT='The catalogue of what can be booked. Duration lives here rather than on the appointment because the whole point of a slot grid is that the length is decided before anyone picks a time.';


CREATE UNIQUE INDEX `uq_apptype_clinic_name`
ON `appointment_types` (`clinic_id`, `name`);
CREATE TABLE IF NOT EXISTS `availability_templates` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`provider_id` BIGINT NOT NULL COMMENT 'Provider whose recurring pattern this is.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site the session runs at. A provider who works Mondays at one site and Tuesdays at another has two rows.',
	`weekday` TINYINT NOT NULL COMMENT 'Day of week, 0 for Monday through 6 for Sunday. A template is a weekly rule, so this is the whole recurrence.',
	`start_time` TIME NOT NULL COMMENT 'Local session start, as a wall-clock time. Deliberately not an instant: a clinic that starts at nine keeps starting at nine across a daylight-saving change.',
	`end_time` TIME NOT NULL COMMENT 'Local session end.',
	`slot_interval_minutes` SMALLINT NOT NULL DEFAULT 15 COMMENT 'Spacing of generated slots within the session, which is usually but not always the appointment duration.',
	`appointment_type_id` BIGINT COMMENT 'Restricts the session to one type, e.g. a vaccination clinic. Null means any type fits.',
	`room_id` BIGINT COMMENT 'Room the session is held in. Null when rooms are assigned on the day.',
	`valid_from` DATE NOT NULL COMMENT 'First date the pattern applies.',
	`valid_to` DATE COMMENT 'Last date. Null while the rota is open-ended; setting it is how a rota change is made without editing history.',
	PRIMARY KEY(`id`)
) COMMENT='The recurring rota, expressed as weekly rules rather than as individual dates. Templates are the input to slot generation and are never booked against directly, which is what lets a rota change next month without disturbing appointments already made.';


CREATE INDEX `idx_templates_provider_day`
ON `availability_templates` (`provider_id`, `weekday`, `valid_from`);
CREATE TABLE IF NOT EXISTS `slots` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`provider_id` BIGINT NOT NULL COMMENT 'Provider the time belongs to.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site, denormalised from the template because every search filters on it.',
	`room_id` BIGINT COMMENT 'Room reserved. Null for telehealth or when assignment is deferred to the day.',
	`template_id` BIGINT COMMENT 'Template that generated it. Null for slots added by hand, e.g. an urgent add-on.',
	`appointment_type_id` BIGINT COMMENT 'Type restriction inherited from the template. Null means any type may be booked.',
	`starts_at` DATETIME NOT NULL COMMENT 'Slot start as a UTC instant, materialised from the template local time and the clinic timezone at generation.',
	`ends_at` DATETIME NOT NULL COMMENT 'Slot end including no buffer — the buffer is a gap between slots, not part of one.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open | held | booked | blocked | expired. blocked covers holidays and ad-hoc closures, which is why no separate exceptions table is needed.',
	`hold_expires_at` DATETIME COMMENT 'When a held slot reverts to open. Null unless held; a sweeper releases anything past it.',
	`generated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When generation created the row, so a bad generation run can be identified and reversed.',
	PRIMARY KEY(`id`)
) COMMENT='Materialised bookable time, generated ahead from the templates. Generating slots rather than computing availability from rules at query time is what makes a search a plain indexed read, and what gives holds, blocks and room assignment somewhere concrete to live.';


CREATE UNIQUE INDEX `uq_slot_provider_start`
ON `slots` (`provider_id`, `starts_at`);
CREATE INDEX `idx_slot_search`
ON `slots` (`clinic_id`, `status`, `starts_at`);
CREATE INDEX `idx_slot_room_start`
ON `slots` (`room_id`, `starts_at`);
CREATE TABLE IF NOT EXISTS `appointments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`slot_id` BIGINT NOT NULL UNIQUE COMMENT 'Time consumed. Unique, which is the double-booking guarantee: two concurrent bookings cannot both claim a slot however the application behaves.',
	`patient_id` BIGINT NOT NULL COMMENT 'Patient booked.',
	`provider_id` BIGINT NOT NULL COMMENT 'Provider seen, copied from the slot so provider schedules read one table.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site, copied for the same reason.',
	`appointment_type_id` BIGINT NOT NULL COMMENT 'What was booked, fixed at booking even if the type is later retired.',
	`referral_id` BIGINT COMMENT 'Referral this appointment satisfies. Null for self-booked visits.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'booked' COMMENT 'booked | confirmed | arrived | completed | cancelled | no_show. confirmed is distinct from booked because a confirmed appointment is not eligible for a reminder chase.',
	`booking_channel` VARCHAR(16) NOT NULL DEFAULT 'staff' COMMENT 'staff | portal | phone | waitlist. Waitlist-filled appointments are tracked separately because their show rate differs.',
	`booked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was made. Lead time is booked_at to slot start, and it predicts no-shows better than anything else on this row.',
	`cancelled_at` DATETIME COMMENT 'Cancellation time. Compared with the slot start against the policy notice period to decide whether it was late.',
	`cancelled_by` VARCHAR(16) COMMENT 'patient | clinic | system. A clinic-initiated cancellation must never count against the patient.',
	`cancellation_reason` VARCHAR(255) COMMENT 'Free text, used to separate avoidable churn from genuine clinical rescheduling.',
	`fee_charged_cents` INTEGER COMMENT 'Late-cancellation or no-show fee applied in minor units. Null when none was charged, which is not the same as zero.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of fee_charged_cents.',
	PRIMARY KEY(`id`)
) COMMENT='A booking against exactly one slot. Cancellations set a status rather than deleting the row: no-show rates, late-cancellation fees and waitlist backfill all depend on the cancelled booking still existing.';


CREATE INDEX `idx_appointments_patient_booked`
ON `appointments` (`patient_id`, `booked_at`);
CREATE INDEX `idx_appointments_provider_status`
ON `appointments` (`provider_id`, `status`);
CREATE INDEX `idx_appointments_cancellations`
ON `appointments` (`status`, `cancelled_at`);
CREATE TABLE IF NOT EXISTS `waitlist_entries` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`patient_id` BIGINT NOT NULL COMMENT 'Patient waiting.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site they will travel to.',
	`provider_id` BIGINT COMMENT 'Specific provider requested. Null means any provider of the right type, which fills far faster.',
	`appointment_type_id` BIGINT NOT NULL COMMENT 'What they are waiting for, so a released slot can be matched by type.',
	`earliest_date` DATE NOT NULL COMMENT 'First date they can attend.',
	`latest_date` DATE NOT NULL COMMENT 'Last useful date. Past this the entry expires rather than being offered something worthless.',
	`preferred_weekdays` VARCHAR(20) COMMENT 'Comma-separated weekday numbers they can attend, e.g. 0,2,4. Null means any day.',
	`priority` TINYINT NOT NULL DEFAULT 0 COMMENT 'Clinical urgency, higher first. Ties break on created_at, so the queue is fair within a priority band.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'waiting' COMMENT 'waiting | offered | booked | expired | withdrawn. offered is a temporary state with its own deadline.',
	`offered_slot_id` BIGINT COMMENT 'Slot currently being held for this entry. Null unless status is offered.',
	`offer_expires_at` DATETIME COMMENT 'When the offer lapses and the slot is passed to the next entry. Without this, one unresponsive patient stalls the whole backfill.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When they joined the queue, the tie-breaker within a priority band.',
	PRIMARY KEY(`id`)
) COMMENT='The queue that turns a cancellation back into a filled appointment. Matching criteria live in columns rather than free text so a released slot can be matched by an indexed query the moment the cancellation commits.';


CREATE INDEX `idx_waitlist_match`
ON `waitlist_entries` (`clinic_id`, `appointment_type_id`, `status`, `priority`);
CREATE INDEX `idx_waitlist_patient_status`
ON `waitlist_entries` (`patient_id`, `status`);
CREATE TABLE IF NOT EXISTS `cancellation_policies` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site the policy applies at.',
	`appointment_type_id` BIGINT COMMENT 'Type it applies to. Null is the site-wide default, so a specific row overrides it.',
	`notice_hours` SMALLINT NOT NULL DEFAULT 24 COMMENT 'Hours of notice required for a cancellation to count as timely. The single number the whole policy turns on.',
	`late_cancel_fee_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Charge for cancelling inside the notice period, in minor units.',
	`no_show_fee_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Charge for not attending at all, usually higher than a late cancellation.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of both fees.',
	`no_shows_before_block` TINYINT NOT NULL DEFAULT 3 COMMENT 'How many no-shows within the window before online booking is withdrawn. Zero disables the block.',
	`window_days` SMALLINT NOT NULL DEFAULT 365 COMMENT 'Rolling period the counter is measured over, so an old lapse eventually stops counting.',
	`effective_from` DATE NOT NULL COMMENT 'First day the policy applies. Rows are superseded rather than edited, because a fee has to be justified against the policy in force on the day.',
	`effective_to` DATE COMMENT 'Last day. Null while current.',
	PRIMARY KEY(`id`)
) COMMENT='The rules behind fees and booking blocks, versioned by date. Keeping the policy as data rather than as constants in code is what makes a disputed fee explainable months later.';


CREATE INDEX `idx_policy_lookup`
ON `cancellation_policies` (`clinic_id`, `appointment_type_id`, `effective_from`);
CREATE TABLE IF NOT EXISTS `referrals` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`patient_id` BIGINT NOT NULL COMMENT 'Patient referred.',
	`referring_provider_name` VARCHAR(160) NOT NULL COMMENT 'Who sent them, as free text because the referrer is usually outside this organisation and has no row here.',
	`referred_to_provider_id` BIGINT COMMENT 'Named provider requested. Null for a referral to a service rather than a person.',
	`clinic_id` BIGINT NOT NULL COMMENT 'Site expected to see them.',
	`appointment_type_id` BIGINT COMMENT 'Service requested, which is what lets a referral be turned straight into a booking.',
	`reason` VARCHAR(500) NOT NULL COMMENT 'Clinical reason, read by whoever triages the referral.',
	`urgency` VARCHAR(16) NOT NULL DEFAULT 'routine' COMMENT 'routine | urgent | two_week. Urgency drives the target date, and missing it is a reportable breach in many systems.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'received' COMMENT 'received | triaged | booked | completed | rejected | expired.',
	`received_on` DATE NOT NULL COMMENT 'Date it arrived. Waiting time is measured from here, not from when someone opened it.',
	`expires_on` DATE COMMENT 'Last day the referral can be used. Null when open-ended.',
	PRIMARY KEY(`id`)
) COMMENT='An external request for care, which is a queue before it is an appointment. Kept separate from appointments because waiting-time reporting starts at receipt and most referrals spend far longer here than in the calendar.';


CREATE INDEX `idx_referrals_queue`
ON `referrals` (`status`, `urgency`, `received_on`);
CREATE INDEX `idx_referrals_patient`
ON `referrals` (`patient_id`, `received_on`);
CREATE TABLE IF NOT EXISTS `reminders` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`appointment_id` BIGINT NOT NULL COMMENT 'Appointment being reminded about.',
	`channel` VARCHAR(12) NOT NULL COMMENT 'sms | email | voice. One row per attempt per channel, so a failed SMS followed by a call is two rows and the history is legible.',
	`scheduled_for` DATETIME NOT NULL COMMENT 'When it should go out, usually a fixed offset before the slot. Stored rather than computed so a rescheduled appointment can requeue its reminders explicitly.',
	`sent_at` DATETIME COMMENT 'Actual send time. Null while queued, which is how the sender finds its work.',
	`delivery_status` VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'queued | sent | delivered | failed | skipped. skipped covers patients whose preferred channel is none.',
	`response` VARCHAR(16) COMMENT 'confirmed | cancel | reschedule | none. A confirm reply flips the appointment to confirmed, which is the whole reason reminders are two-way.',
	`responded_at` DATETIME COMMENT 'When the patient replied.',
	`template_key` VARCHAR(60) NOT NULL COMMENT 'Which message template was used, so a change in wording can be correlated with a change in confirmation rate.',
	PRIMARY KEY(`id`)
) COMMENT='One row per reminder attempt, not per appointment. Reminders are the cheapest intervention against no-shows, and measuring which channel and which wording actually reduce them requires the attempts to be individually recorded.';


CREATE INDEX `idx_reminders_appointment_channel`
ON `reminders` (`appointment_id`, `channel`);
CREATE INDEX `idx_reminders_queue`
ON `reminders` (`delivery_status`, `scheduled_for`);
ALTER TABLE `rooms`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `providers`
ADD FOREIGN KEY(`default_clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `appointment_types`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `availability_templates`
ADD FOREIGN KEY(`provider_id`) REFERENCES `providers`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `availability_templates`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `availability_templates`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `availability_templates`
ADD FOREIGN KEY(`room_id`) REFERENCES `rooms`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `slots`
ADD FOREIGN KEY(`provider_id`) REFERENCES `providers`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `slots`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `slots`
ADD FOREIGN KEY(`room_id`) REFERENCES `rooms`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `slots`
ADD FOREIGN KEY(`template_id`) REFERENCES `availability_templates`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `slots`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`slot_id`) REFERENCES `slots`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`patient_id`) REFERENCES `patients`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`provider_id`) REFERENCES `providers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `appointments`
ADD FOREIGN KEY(`referral_id`) REFERENCES `referrals`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `waitlist_entries`
ADD FOREIGN KEY(`patient_id`) REFERENCES `patients`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `waitlist_entries`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `waitlist_entries`
ADD FOREIGN KEY(`provider_id`) REFERENCES `providers`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `waitlist_entries`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `waitlist_entries`
ADD FOREIGN KEY(`offered_slot_id`) REFERENCES `slots`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `cancellation_policies`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cancellation_policies`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `referrals`
ADD FOREIGN KEY(`patient_id`) REFERENCES `patients`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `referrals`
ADD FOREIGN KEY(`referred_to_provider_id`) REFERENCES `providers`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `referrals`
ADD FOREIGN KEY(`clinic_id`) REFERENCES `clinics`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `referrals`
ADD FOREIGN KEY(`appointment_type_id`) REFERENCES `appointment_types`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `reminders`
ADD FOREIGN KEY(`appointment_id`) REFERENCES `appointments`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
