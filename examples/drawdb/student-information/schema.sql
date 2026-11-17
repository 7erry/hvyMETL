/* A pupil, held once for their whole career in the district. Rows are never deleted and never merged away: transcripts, attendance returns and safeguarding records all depend on this identity outliving any single school year. */
CREATE TABLE "students" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- State or district identifier printed on transcripts. Never reused, because a transcript must stay resolvable decades later.
	"student_number" VARCHAR2(20) NOT NULL UNIQUE,
	-- Surname as it appears on the birth certificate, used on every legal document.
	"legal_surname" VARCHAR2(100) NOT NULL,
	-- Given names as registered.
	"legal_given_names" VARCHAR2(150) NOT NULL,
	-- Name the student is called in class. Null means use the given names; keeping it separate avoids editing the legal record to fix a register.
	"preferred_name" VARCHAR2(100),
	-- Drives year-group placement, safeguarding rules and age-restricted consents.
	"date_of_birth" DATE NOT NULL,
	-- Reporting code as defined by the education authority. Null where not declared.
	"gender_code" VARCHAR2(10),
	-- ISO 639-2 code of the language spoken at home, used for support funding returns.
	"home_language_code" CHAR(3),
	-- 1 = a care plan exists and staff must be alerted, 0 = none. A flag, not the plan itself, which lives in a restricted system.
	"has_medical_plan" NUMBER(1) NOT NULL DEFAULT 0,
	-- Roll-call photograph. Null until consent is recorded.
	"photo" BLOB,
	-- When the record was first created in the district.
	"created_on" DATE NOT NULL DEFAULT SYSDATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_students_name"
ON "students" ("legal_surname", "legal_given_names");
CREATE INDEX "idx_students_dob"
ON "students" ("date_of_birth");
/* An adult responsible for one or more students. A separate entity because siblings share guardians, and because a guardian address change must not be applied one child at a time. */
CREATE TABLE "guardians" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Guardian surname, which frequently differs from the student surname.
	"surname" VARCHAR2(100) NOT NULL,
	-- Guardian given names.
	"given_names" VARCHAR2(150) NOT NULL,
	-- Usual relationship wording, e.g. MOTHER or FOSTER_CARER. The authoritative per-student value is on the link table.
	"relationship_default" VARCHAR2(30),
	-- First-choice number for absence calls and emergencies.
	"mobile_phone" VARCHAR2(32),
	-- Secondary number.
	"home_phone" VARCHAR2(32),
	-- Address for reports and newsletters. Null for guardians who receive paper only.
	"email" VARCHAR2(320),
	-- Postal address. Held on the guardian rather than the student, because a student in shared care has two.
	"address_line" VARCHAR2(240),
	-- Postal code, used for catchment and transport eligibility.
	"postcode" VARCHAR2(16),
	-- Language for written communication, so interpreted letters are produced automatically.
	"preferred_language_code" CHAR(3),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_guardians_name"
ON "guardians" ("surname", "given_names");
/* The relationship between a student and an adult, with every right stored as its own flag. Collapsing custody, consent, collection and reporting into one status is the classic failure here: a safeguarding case needs to say yes to reports and no to collection. */
CREATE TABLE "student_guardians" (
	-- Student. Half of the composite primary key.
	"student_id" NUMBER(19),
	-- Guardian. The other half; no surrogate id because there is exactly one link per pair.
	"guardian_id" NUMBER(19),
	-- MOTHER | FATHER | STEP_PARENT | GRANDPARENT | FOSTER_CARER | SOCIAL_WORKER | OTHER.
	"relationship" VARCHAR2(30) NOT NULL,
	-- Call order in an emergency: 1 is tried first. The single most operationally important column in the schema.
	"contact_priority" NUMBER(2) NOT NULL DEFAULT 1,
	-- 1 = holds custody, 0 = does not. Custody and contact are different rights and are stored as different columns on purpose.
	"has_legal_custody" NUMBER(1) NOT NULL DEFAULT 1,
	-- 1 = may consent to trips, medical treatment and exclusions. Independent of custody.
	"has_parental_responsibility" NUMBER(1) NOT NULL DEFAULT 1,
	-- 1 = permitted to collect from the gate. This is the flag the office checks, and it is deliberately not derived from the other two.
	"may_collect_student" NUMBER(1) NOT NULL DEFAULT 1,
	-- 1 = receives academic reports. A non-resident parent often keeps this while losing collection rights.
	"receives_reports" NUMBER(1) NOT NULL DEFAULT 1,
	-- Court order or safeguarding instruction in plain words. Null when unrestricted; when present the office is expected to read it before releasing the child.
	"restriction_note" VARCHAR2(500),
	-- 1 = same household, used for the census return and for deciding which address is primary.
	"lives_with_student" NUMBER(1) NOT NULL DEFAULT 1,
	PRIMARY KEY("student_id", "guardian_id")
);


CREATE INDEX "idx_student_guardians_priority"
ON "student_guardians" ("student_id", "contact_priority");
CREATE INDEX "idx_student_guardians_guardian"
ON "student_guardians" ("guardian_id");
/* An academic year. Almost everything here is year-scoped, and making the year a row rather than a pair of dates on each record is what keeps attendance denominators, funding returns and year-group promotion consistent. */
CREATE TABLE "school_years" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Short code, e.g. 2026-27. Used on every printed return.
	"year_code" VARCHAR2(12) NOT NULL UNIQUE,
	-- First teaching day of the year.
	"starts_on" DATE NOT NULL,
	-- Last teaching day.
	"ends_on" DATE NOT NULL,
	-- Statutory headcount date. Funding is calculated from enrolments open on exactly this day.
	"census_date" DATE,
	-- Total sessions in the year, the denominator of every attendance percentage.
	"teaching_days" NUMBER(4) NOT NULL,
	-- 1 for the year the school is operating in. Exactly one row should carry it, which makes every default lookup trivial.
	"is_current" NUMBER(1) NOT NULL DEFAULT 0,
	PRIMARY KEY("id")
);


/* Anyone employed at the school. Leavers are retained rather than deleted because an attendance mark or a discipline report that loses its author stops being evidence. */
CREATE TABLE "staff" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Payroll identifier, stable across role changes.
	"staff_number" VARCHAR2(20) NOT NULL UNIQUE,
	-- Surname as printed on timetables.
	"surname" VARCHAR2(100) NOT NULL,
	-- Given names.
	"given_names" VARCHAR2(150) NOT NULL,
	-- Form of address used on letters, e.g. MS or DR.
	"title" VARCHAR2(20),
	-- Work address, used for login and for parent contact.
	"email" VARCHAR2(320) NOT NULL UNIQUE,
	-- TEACHER | ADMIN | SENIOR_LEADER | PASTORAL | SUPPORT. Governs what parts of a student record are visible.
	"role_code" VARCHAR2(20) NOT NULL DEFAULT 'TEACHER',
	-- Employment start date.
	"started_on" DATE NOT NULL,
	-- Leaving date. Null for current staff; historic timetables and incident reports keep pointing here afterwards.
	"left_on" DATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_staff_name"
ON "staff" ("surname", "given_names");
CREATE INDEX "idx_staff_role_active"
ON "staff" ("role_code", "left_on");
/* A teachable space. Rooms are modelled as their own entity because allocation is a constraint problem — capacity, type and access all have to be checked against a class before a timetable row is valid. */
CREATE TABLE "rooms" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Code printed on the timetable and the door, e.g. SCI-04.
	"room_code" VARCHAR2(20) NOT NULL UNIQUE,
	-- Building or block name, used for movement-time checks between consecutive periods.
	"building" VARCHAR2(60),
	-- Maximum seats. Compared against class size when the timetable is built.
	"capacity" NUMBER(4) NOT NULL,
	-- CLASSROOM | LAB | GYM | MUSIC | IT_SUITE | HALL. A chemistry set cannot be placed in a plain classroom.
	"room_type" VARCHAR2(20) NOT NULL DEFAULT 'CLASSROOM',
	-- 1 = step-free access. Drives room reassignment when a student has a mobility need.
	"is_accessible" NUMBER(1) NOT NULL DEFAULT 1,
	-- 0 while a room is out of service; existing timetable rows survive and are flagged for reallocation.
	"is_bookable" NUMBER(1) NOT NULL DEFAULT 1,
	PRIMARY KEY("id")
);


/* One slot in the daily bell schedule for one school year. Periods are rows so that a timetable, an attendance mark and a clash check all refer to the same definition of when period three is. */
CREATE TABLE "periods" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Year this bell schedule applies to. Schedules change between years and old attendance must still resolve.
	"school_year_id" NUMBER(19) NOT NULL,
	-- Label shown on the timetable, e.g. P3 or REG.
	"period_code" VARCHAR2(12) NOT NULL,
	-- Order through the day, used to detect clashes and to compute movement time.
	"sequence_no" NUMBER(3) NOT NULL,
	-- Start time as HH24:MI. A wall-clock string rather than a DATE, because a period is a recurring time of day with no date of its own.
	"starts_at" VARCHAR2(5) NOT NULL,
	-- End time as HH24:MI.
	"ends_at" VARCHAR2(5) NOT NULL,
	-- AM | PM. Statutory attendance returns count half-day sessions, not periods, so the mapping has to be explicit.
	"session_code" VARCHAR2(10) NOT NULL DEFAULT 'AM',
	-- 1 for form or homeroom registration periods, whose marks carry the statutory weight.
	"is_registration" NUMBER(1) NOT NULL DEFAULT 0,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_periods_year_code"
ON "periods" ("school_year_id", "period_code");
CREATE INDEX "idx_periods_year_sequence"
ON "periods" ("school_year_id", "sequence_no");
/* One student on roll for one year, and the spine of the whole system. A student has as many of these as years attended, which is what makes a career history, a repeated year and a mid-year transfer all representable without editing anything. */
CREATE TABLE "enrollments" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Student being enrolled.
	"student_id" NUMBER(19) NOT NULL,
	-- Academic year of this enrolment.
	"school_year_id" NUMBER(19) NOT NULL,
	-- Grade or year level, e.g. 09. Stored per enrolment so a repeated year is a plain fact rather than a correction.
	"year_group" VARCHAR2(10) NOT NULL,
	-- Form or homeroom code, e.g. 9B.
	"registration_group" VARCHAR2(20),
	-- Form tutor. Null before allocation and after a tutor leaves.
	"homeroom_staff_id" NUMBER(19),
	-- First day on roll in this year. Mid-year joiners are normal and their attendance denominator starts here.
	"entry_date" DATE NOT NULL,
	-- Last day on roll. Null while the student is still enrolled, which is how the live roll is found.
	"leaving_date" DATE,
	-- TRANSFERRED | GRADUATED | MOVED_AREA | EXCLUDED | HOME_EDUCATED. Null while on roll; required by the authority when set.
	"leaving_reason" VARCHAR2(30),
	-- ON_ROLL | LEFT | DUAL_REGISTERED | GUEST.
	"enrollment_status" VARCHAR2(20) NOT NULL DEFAULT 'ON_ROLL',
	-- 1 = counted in the census headcount. Dual-registered students are on roll at two schools but funded at one.
	"is_funded" NUMBER(1) NOT NULL DEFAULT 1,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_enrollments_student_year"
ON "enrollments" ("student_id", "school_year_id");
CREATE INDEX "idx_enrollments_year_group"
ON "enrollments" ("school_year_id", "year_group", "registration_group");
CREATE INDEX "idx_enrollments_year_status"
ON "enrollments" ("school_year_id", "enrollment_status");
/* One recurring weekly lesson: this set, this period, this day, this room, this teacher. The room and staff indexes exist to make double-booking detectable, which is the only thing a timetable has to guarantee. */
CREATE TABLE "timetable_entries" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Year this timetable belongs to.
	"school_year_id" NUMBER(19) NOT NULL,
	-- Subject taught, e.g. MATH. A code rather than a catalogue row because a school timetable is built from a short fixed subject list.
	"subject_code" VARCHAR2(20) NOT NULL,
	-- Set or band label, e.g. 9B-MATH-2. Identifies which group of students meets, and is the join key onto subject_registrations.
	"teaching_set" VARCHAR2(20) NOT NULL,
	-- Slot in the bell schedule.
	"period_id" NUMBER(19) NOT NULL,
	-- 1 = Monday through 5 = Friday. Together with the period this fixes one weekly meeting.
	"day_of_week" NUMBER(1) NOT NULL,
	-- ALL | A | B, for schools running a two-week timetable. Ignoring this is how fortnightly schedules break.
	"week_pattern" VARCHAR2(4) NOT NULL DEFAULT 'ALL',
	-- Teacher allocated. Null while timetabling is still in progress.
	"staff_id" NUMBER(19),
	-- Room allocated. Null for unallocated or off-site lessons, which is why it is not mandatory.
	"room_id" NUMBER(19),
	-- Planned class size, checked against the room capacity before the allocation is accepted.
	"expected_size" NUMBER(4),
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_timetable_set_slot"
ON "timetable_entries" ("school_year_id", "teaching_set", "day_of_week", "period_id");
CREATE INDEX "idx_timetable_room_slot"
ON "timetable_entries" ("room_id", "day_of_week", "period_id");
CREATE INDEX "idx_timetable_staff_slot"
ON "timetable_entries" ("staff_id", "day_of_week", "period_id");
/* A student taking a subject in a year, and the transcript line for it. The roster row and the transcript row are the same fact recorded at two moments, so keeping them as one table removes the reconciliation nobody ever gets right. */
CREATE TABLE "subject_registrations" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Student-year this registration belongs to. Everything academic hangs off the enrolment, never off the student directly.
	"enrollment_id" NUMBER(19) NOT NULL,
	-- Subject studied.
	"subject_code" VARCHAR2(20) NOT NULL,
	-- Set the student was placed in, matching timetable_entries. This is what turns a registration into a class roster.
	"teaching_set" VARCHAR2(20) NOT NULL,
	-- First day in this set. Mid-year set changes create a new row rather than editing this one.
	"started_on" DATE NOT NULL,
	-- Last day in this set. Null while current; a moved student has a closed row and an open one.
	"ended_on" DATE,
	-- Reported grade, e.g. A- or 7. Null until the year is marked.
	"final_grade" VARCHAR2(6),
	-- Numeric equivalent, snapshotted so a later change to the grading scale cannot restate an issued transcript.
	"grade_points" NUMBER(4,2),
	-- Credit value earned, decimal because half credits are common.
	"credits" NUMBER(4,1),
	-- 0 for pass or fail subjects, which appear on the transcript but must be excluded from the average.
	"counts_towards_gpa" NUMBER(1) NOT NULL DEFAULT 1,
	-- 0 hides a withdrawn subject from the printed transcript while keeping it for internal reporting.
	"is_transcript_visible" NUMBER(1) NOT NULL DEFAULT 1,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_subject_reg_enrol_subject_start"
ON "subject_registrations" ("enrollment_id", "subject_code", "started_on");
CREATE INDEX "idx_subject_reg_gpa"
ON "subject_registrations" ("enrollment_id", "counts_towards_gpa");
/* One mark per student per lesson per day. The unique key makes taking a register idempotent, so a resubmitted or corrected form updates the mark instead of inflating the absence count. */
CREATE TABLE "attendance_marks" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Student-year being marked. Using the enrolment means a mid-year transfer never inherits the previous school attendance.
	"enrollment_id" NUMBER(19) NOT NULL,
	-- Lesson the mark belongs to, which supplies the period, room and teacher.
	"timetable_entry_id" NUMBER(19) NOT NULL,
	-- Calendar date of the lesson. A date, not a timestamp, because attendance is a per-session fact.
	"mark_date" DATE NOT NULL,
	-- Statutory code: PRES | LATE | AUTH | UNAU | EXCL | OFFS | ILLN. The authority defines these and they must be stored verbatim.
	"attendance_code" VARCHAR2(4) NOT NULL,
	-- Lateness in minutes. Null unless the code is LATE; a long enough delay is reported as an absence instead.
	"minutes_late" NUMBER(4),
	-- What the guardian said. Null when no explanation was given, which is exactly what distinguishes authorised from unauthorised absence.
	"reason_note" VARCHAR2(255),
	-- Staff member who took the register. Null for marks imported from a door scanner.
	"recorded_by_staff_id" NUMBER(19),
	-- When the mark was entered. Registers taken hours after the lesson are a compliance flag in their own right.
	"recorded_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	-- Why an existing mark was changed. Null for original marks; amendments to attendance are audited because funding depends on them.
	"amended_reason" VARCHAR2(255),
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_attendance_enrol_lesson_date"
ON "attendance_marks" ("enrollment_id", "timetable_entry_id", "mark_date");
CREATE INDEX "idx_attendance_date_code"
ON "attendance_marks" ("mark_date", "attendance_code");
CREATE INDEX "idx_attendance_enrol_date"
ON "attendance_marks" ("enrollment_id", "mark_date");
/* A behaviour record. Investigation and outcome live on the same row with nullable sanction columns, because an incident is logged immediately and resolved later, and the gap between the two dates is what an inspection looks at. */
CREATE TABLE "discipline_incidents" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Student involved. Attached to the student rather than the enrolment because behaviour history follows a child across years and schools.
	"student_id" NUMBER(19) NOT NULL,
	-- Year the incident occurred in, for annual reporting.
	"school_year_id" NUMBER(19) NOT NULL,
	-- Date of the incident.
	"occurred_on" DATE NOT NULL,
	-- DISRUPTION | BULLYING | VIOLENCE | ABSCONDING | PROPERTY | SUBSTANCE | OTHER.
	"category" VARCHAR2(30) NOT NULL,
	-- 1 to 5. Stored rather than inferred from the sanction, because the same behaviour draws different sanctions from different staff.
	"severity" NUMBER(1) NOT NULL DEFAULT 1,
	-- Where it happened, e.g. CORRIDOR-B. Patterns in this column are what identify unsupervised hotspots.
	"location" VARCHAR2(60),
	-- Full account. A CLOB because these are written as narrative and are disclosed to guardians verbatim.
	"description" CLOB NOT NULL,
	-- DETENTION | INTERNAL_EXCLUSION | SUSPENSION | RESTORATIVE | NONE. Null while the incident is still being investigated.
	"sanction" VARCHAR2(30),
	-- Length of an exclusion in school days. Null for sanctions with no duration.
	"sanction_days" NUMBER(3),
	-- Staff member who logged it. Null for incidents reported by a guardian or a student.
	"reported_by_staff_id" NUMBER(19),
	-- When contact was made. Null means not yet, and an unfilled value on a serious incident is itself a compliance failure.
	"guardians_informed_on" DATE,
	-- 1 restricts the record to senior and pastoral staff, e.g. where safeguarding is involved.
	"is_confidential" NUMBER(1) NOT NULL DEFAULT 0,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_discipline_student_date"
ON "discipline_incidents" ("student_id", "occurred_on");
CREATE INDEX "idx_discipline_year_category"
ON "discipline_incidents" ("school_year_id", "category", "severity");
/* An append-only account of everything charged, paid, waived and refunded. One ledger rather than separate charge and payment tables, because the only question anyone asks is the running balance and a single signed sum answers it. */
CREATE TABLE "fee_ledger" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Student whose account is affected.
	"student_id" NUMBER(19) NOT NULL,
	-- Year the entry belongs to, so a balance can be struck per year as well as overall.
	"school_year_id" NUMBER(19) NOT NULL,
	-- CHARGE | PAYMENT | WAIVER | REFUND | ADJUSTMENT. The type, not the sign, is what a bursar reads.
	"entry_type" VARCHAR2(20) NOT NULL,
	-- TUITION | TRIP | MEALS | TRANSPORT | UNIFORM | EXAM_FEE | DAMAGE.
	"category" VARCHAR2(30) NOT NULL,
	-- Line wording as it appears on the statement.
	"description" VARCHAR2(255) NOT NULL,
	-- Signed amount in minor units: charges positive, payments and waivers negative. Integers only, because summing a year of fractional currency in floating point drifts.
	"amount_minor" NUMBER(12) NOT NULL,
	-- ISO 4217 code for amount_minor.
	"currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
	-- Payment deadline. Null for payment and refund entries, which are not owed.
	"due_on" DATE,
	-- When the entry was written. The ledger is append-only and ordered by this.
	"posted_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	-- CASH | CARD | BANK_TRANSFER | ONLINE. Null for charges and waivers, which move no money.
	"payment_method" VARCHAR2(20),
	-- Processor or bank reference. Unique so a replayed gateway callback cannot post the same payment twice.
	"external_reference" VARCHAR2(120) UNIQUE,
	-- Entry this one cancels. Null for ordinary entries; corrections are new rows rather than edits, so a statement once sent stays reproducible.
	"reverses_entry_id" NUMBER(19),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_fee_ledger_student_year"
ON "fee_ledger" ("student_id", "school_year_id", "posted_at");
CREATE INDEX "idx_fee_ledger_due"
ON "fee_ledger" ("entry_type", "due_on");
ALTER TABLE "student_guardians"
ADD CONSTRAINT "fk_student_guardians_student_id_students" FOREIGN KEY ("student_id") REFERENCES "students" ("id")
ON DELETE CASCADE;
ALTER TABLE "student_guardians"
ADD CONSTRAINT "fk_student_guardians_guardian_id_guardians" FOREIGN KEY ("guardian_id") REFERENCES "guardians" ("id");
ALTER TABLE "enrollments"
ADD CONSTRAINT "fk_enrollments_student_id_students" FOREIGN KEY ("student_id") REFERENCES "students" ("id");
ALTER TABLE "enrollments"
ADD CONSTRAINT "fk_enrollments_school_year_id_school_years" FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id");
ALTER TABLE "enrollments"
ADD CONSTRAINT "fk_enrollments_homeroom_staff_id_staff" FOREIGN KEY ("homeroom_staff_id") REFERENCES "staff" ("id")
ON DELETE SET NULL;
ALTER TABLE "periods"
ADD CONSTRAINT "fk_periods_school_year_id_school_years" FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id")
ON DELETE CASCADE;
ALTER TABLE "timetable_entries"
ADD CONSTRAINT "fk_timetable_entries_school_year_id_school_years" FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id")
ON DELETE CASCADE;
ALTER TABLE "timetable_entries"
ADD CONSTRAINT "fk_timetable_entries_period_id_periods" FOREIGN KEY ("period_id") REFERENCES "periods" ("id");
ALTER TABLE "timetable_entries"
ADD CONSTRAINT "fk_timetable_entries_staff_id_staff" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id")
ON DELETE SET NULL;
ALTER TABLE "timetable_entries"
ADD CONSTRAINT "fk_timetable_entries_room_id_rooms" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id")
ON DELETE SET NULL;
ALTER TABLE "subject_registrations"
ADD CONSTRAINT "fk_subject_registrations_enrollment_id_enrollments" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id")
ON DELETE CASCADE;
ALTER TABLE "attendance_marks"
ADD CONSTRAINT "fk_attendance_marks_enrollment_id_enrollments" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id")
ON DELETE CASCADE;
ALTER TABLE "attendance_marks"
ADD CONSTRAINT "fk_attendance_marks_timetable_entry_id_timetable_entries" FOREIGN KEY ("timetable_entry_id") REFERENCES "timetable_entries" ("id");
ALTER TABLE "attendance_marks"
ADD CONSTRAINT "fk_attendance_marks_recorded_by_staff_id_staff" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "staff" ("id")
ON DELETE SET NULL;
ALTER TABLE "discipline_incidents"
ADD CONSTRAINT "fk_discipline_incidents_student_id_students" FOREIGN KEY ("student_id") REFERENCES "students" ("id");
ALTER TABLE "discipline_incidents"
ADD CONSTRAINT "fk_discipline_incidents_school_year_id_school_years" FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id");
ALTER TABLE "discipline_incidents"
ADD CONSTRAINT "fk_discipline_incidents_reported_by_staff_id_staff" FOREIGN KEY ("reported_by_staff_id") REFERENCES "staff" ("id")
ON DELETE SET NULL;
ALTER TABLE "fee_ledger"
ADD CONSTRAINT "fk_fee_ledger_student_id_students" FOREIGN KEY ("student_id") REFERENCES "students" ("id");
ALTER TABLE "fee_ledger"
ADD CONSTRAINT "fk_fee_ledger_school_year_id_school_years" FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id");
ALTER TABLE "fee_ledger"
ADD CONSTRAINT "fk_fee_ledger_reverses_entry_id_fee_ledger" FOREIGN KEY ("reverses_entry_id") REFERENCES "fee_ledger" ("id")
ON DELETE SET NULL;
