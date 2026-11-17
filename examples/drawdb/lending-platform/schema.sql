/* The person who borrows. Kept separate from applications because one person applies repeatedly over years, and the relationship history is itself a decision input. */
CREATE TABLE "applicants" (
	-- Surrogate primary key, backed by an identity column.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Externally quotable applicant number. Never reused, because a declined applicant who reapplies must be recognisable as the same person.
	"applicant_reference" VARCHAR2(24) NOT NULL UNIQUE,
	-- Name exactly as it appears on identity documents. A mismatch against the credit bureau is itself a decision input.
	"legal_name" VARCHAR2(200) NOT NULL,
	-- Required: age is a hard eligibility gate and a bureau matching key.
	"date_of_birth" DATE NOT NULL,
	-- SHA-256 of the national identifier. Hashed rather than stored, so duplicate applications can still be detected without the platform holding the number itself.
	"national_id_hash" RAW(32) NOT NULL,
	-- Contact address for the decision letter and statements.
	"email" VARCHAR2(320) NOT NULL,
	-- E.164 number, used for step-up verification and later by collections.
	"phone" VARCHAR2(32),
	-- Residential street address. Required, since lending rules vary by jurisdiction.
	"address_line1" VARCHAR2(200) NOT NULL,
	-- City of residence.
	"address_city" VARCHAR2(120) NOT NULL,
	-- State or province. Drives the usury cap and the permitted fee schedule.
	"address_region" VARCHAR2(120),
	-- Postal code, also a bureau matching key.
	"address_postcode" VARCHAR2(16) NOT NULL,
	-- ISO 3166-1 alpha-2 country of residence.
	"country_code" CHAR(2) NOT NULL,
	-- citizen | permanent_resident | temporary_resident | non_resident. Affects both eligibility and the documents required.
	"residency_status" VARCHAR2(24),
	-- First time this person was seen by the platform.
	"created_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


/* The commercial template a loan is cut from. Keeping rate, fees and day count here means the decision engine prices against data rather than against deployed code. */
CREATE TABLE "loan_products" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Short code used in pricing sheets and in the decision engine rules.
	"product_code" VARCHAR2(24) NOT NULL UNIQUE,
	-- Customer-facing name.
	"product_name" VARCHAR2(120) NOT NULL,
	-- ISO 4217. A product lends in exactly one currency.
	"currency_code" CHAR(3) NOT NULL,
	-- Smallest principal offered, in minor units.
	"min_amount_minor" NUMBER(19) NOT NULL,
	-- Largest principal offered, in minor units. Bounds are on the product rather than in code so a pricing change is a data change.
	"max_amount_minor" NUMBER(19) NOT NULL,
	-- Shortest term offered.
	"min_term_months" NUMBER(4) NOT NULL,
	-- Longest term offered.
	"max_term_months" NUMBER(4) NOT NULL,
	-- Starting annual rate before risk pricing, as a decimal fraction. NUMBER because Oracle stores it in exact base ten; a binary float here would produce a schedule that does not tie out to the cent.
	"base_annual_rate" NUMBER(9,6) NOT NULL,
	-- declining_balance | flat. The method changes what every schedule row means, so it is fixed at the product rather than assumed.
	"interest_method" VARCHAR2(24) NOT NULL DEFAULT 'declining_balance',
	-- 30/360 | ACT/365 | ACT/360. Decides how a part-month period accrues, which is the single most common source of a one-cent dispute.
	"day_count_convention" VARCHAR2(12) NOT NULL DEFAULT '30/360',
	-- Origination fee in basis points of principal. Basis points as an integer, because a published fee that rounds differently from the contract is a compliance problem.
	"origination_fee_bps" NUMBER(6) NOT NULL DEFAULT 0,
	-- Flat late fee in minor units, charged once per missed instalment after the grace period.
	"late_fee_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Days after the due date before a payment counts as late. Delinquency day counting starts after this window.
	"grace_period_days" NUMBER(3) NOT NULL DEFAULT 0,
	-- Y or N. Retired products stay as rows because live loans still point at them.
	"is_active" CHAR(1) NOT NULL DEFAULT 'Y',
	-- When this version of the product became available. Terms already agreed are never rewritten by a later edit.
	"effective_from" DATE NOT NULL,
	PRIMARY KEY("id")
);


/* One attempt to borrow. It survives its own outcome: declined applications are kept for years because regulators ask what was decided, when, and on what basis. */
CREATE TABLE "applications" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Person applying.
	"applicant_id" NUMBER(19) NOT NULL,
	-- Product applied for. Fixes the currency, the term bounds and the fee schedule under consideration.
	"product_id" NUMBER(19) NOT NULL,
	-- Reference quoted to the customer and in every regulatory file.
	"application_number" VARCHAR2(24) NOT NULL UNIQUE,
	-- Amount asked for, in minor units. Kept even when the approved amount differs, because the gap is what a counter-offer is.
	"requested_amount_minor" NUMBER(19) NOT NULL,
	-- Term asked for, in months.
	"requested_term_months" NUMBER(4) NOT NULL,
	-- ISO 4217, inherited from the product.
	"currency_code" CHAR(3) NOT NULL,
	-- debt_consolidation | home_improvement | medical | vehicle | other. Self-declared, and a real predictor of default.
	"purpose" VARCHAR2(32),
	-- web | mobile | broker | branch | api. Channel is a strong risk signal, so it is captured on the application and never inferred later.
	"channel" VARCHAR2(24) NOT NULL DEFAULT 'web',
	-- draft | submitted | in_review | approved | declined | withdrawn | funded | expired. Only a funded application has a loan.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'draft',
	-- When the applicant agreed to a bureau pull. Without a timestamp here the pull itself is unlawful, so it is stored rather than assumed.
	"credit_consent_at" TIMESTAMP,
	-- When the applicant completed the form. Null while still a draft.
	"submitted_at" TIMESTAMP,
	-- When the last decision landed.
	"decided_at" TIMESTAMP,
	-- When an approved but unaccepted offer lapses, since a decision is only as good as the data behind it.
	"expires_on" DATE,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_applications_applicant"
ON "applications" ("applicant_id", "created_at");
CREATE INDEX "idx_applications_status_submitted"
ON "applications" ("status", "submitted_at");
/* Declared and verified income, as rows rather than a column on the application. People hold several jobs, incomes are verified one source at a time, and the verification state of each source is what caps the offer. */
CREATE TABLE "employment_incomes" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Person whose income this is.
	"applicant_id" NUMBER(19) NOT NULL,
	-- Application this was declared for. Null for a record carried over from a previous application and re-verified.
	"application_id" NUMBER(19),
	-- Employer as declared. Null for self-employed and benefit income.
	"employer_name" VARCHAR2(200),
	-- full_time | part_time | self_employed | contract | retired | benefits | unemployed.
	"employment_type" VARCHAR2(24) NOT NULL,
	-- Declared role, used in manual review rather than in scoring.
	"job_title" VARCHAR2(120),
	-- Annualised gross income in minor units. Annualised at capture so incomes with different pay frequencies are comparable without recomputation.
	"gross_annual_income_minor" NUMBER(19) NOT NULL,
	-- weekly | biweekly | semimonthly | monthly | annual. Kept because affordability is tested against the actual pay cycle, not the annual figure.
	"pay_frequency" VARCHAR2(16) NOT NULL DEFAULT 'monthly',
	-- ISO 4217 of the income.
	"currency_code" CHAR(3) NOT NULL,
	-- When the employment began. Time in role is a scoring input.
	"start_date" DATE,
	-- When it ended. Null means current.
	"end_date" DATE,
	-- declared | documents_received | verified | failed. Declared income alone can only support the smallest offers.
	"verification_status" VARCHAR2(24) NOT NULL DEFAULT 'declared',
	-- payslip | bank_feed | employer_letter | tax_return | open_banking.
	"verification_method" VARCHAR2(24),
	-- When verification completed.
	"verified_at" TIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_income_applicant_status"
ON "employment_incomes" ("applicant_id", "verification_status");
/* An immutable record of what was decided and on what evidence. Everything that fed the answer is snapshotted here, because the only defensible reply to a complaint years later is the state as it was on the day. */
CREATE TABLE "credit_decisions" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Application decided. Several decisions can exist: an automated decline, a referral, then a manual approval.
	"application_id" NUMBER(19) NOT NULL,
	-- approved | declined | referred | conditional. Referred means a human has to look, which is a decision in its own right.
	"decision" VARCHAR2(16) NOT NULL,
	-- auto | manual. Regulators care a great deal which one it was.
	"decision_source" VARCHAR2(12) NOT NULL DEFAULT 'auto',
	-- Version of the rule set that produced it. Without this the decision cannot be reproduced once the rules change, which they do monthly.
	"policy_version" VARCHAR2(24) NOT NULL,
	-- Bureau score at decision time. Snapshotted because pulling it again tomorrow gives a different number and a different answer.
	"credit_score" NUMBER(5),
	-- Which scorecard produced the score. Comparing scores across models is meaningless, so the model travels with the number.
	"score_model" VARCHAR2(32),
	-- Internal grade from A1 down. Drives the priced rate.
	"risk_grade" CHAR(2),
	-- Affordability ratio as a decimal fraction, snapshotted with its inputs.
	"debt_to_income" NUMBER(7,4),
	-- Amount approved, in minor units. Lower than requested for a counter-offer, null for a decline.
	"approved_amount_minor" NUMBER(19),
	-- Priced annual rate as a decimal fraction. Null for a decline.
	"approved_rate" NUMBER(9,6),
	-- Approved term in months.
	"approved_term_months" NUMBER(4),
	-- Underwriter identifier for a manual decision, null for an automated one.
	"decided_by" VARCHAR2(120),
	-- When the offer lapses.
	"expires_on" DATE,
	-- Decision time. Rows are append-only: a changed mind is a new decision, never an edit.
	"decided_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_decisions_application"
ON "credit_decisions" ("application_id", "decided_at");
/* Why the decision went the way it did, as rows. A single reason column cannot carry four ranked codes, and ranked codes are exactly what an adverse-action notice legally requires. */
CREATE TABLE "decision_reasons" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Decision being explained.
	"decision_id" NUMBER(19) NOT NULL,
	-- Standardised code such as INSUFF_INCOME or HIGH_UTIL. Codes rather than free text, because the same reason must read identically in every letter.
	"reason_code" VARCHAR2(16) NOT NULL,
	-- Wording sent to the applicant, snapshotted so a later edit to the template does not rewrite a letter already posted.
	"reason_text" VARCHAR2(255) NOT NULL,
	-- Order of importance, starting at one. Adverse-action rules limit how many reasons may be given, so rank is what decides which ones make the letter.
	"reason_rank" NUMBER(2) NOT NULL,
	-- Y or N. Only adverse reasons go to the applicant; the rest are internal and kept for model review.
	"is_adverse" CHAR(1) NOT NULL DEFAULT 'N',
	-- The value that tripped the rule, such as the utilisation percentage. Stored so an appeal can be answered with a number rather than a category.
	"attribute_value" VARCHAR2(120),
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_reasons_decision_rank"
ON "decision_reasons" ("decision_id", "reason_rank");
/* The live contract. Nothing in the terms is ever edited in place: a restructure writes a new schedule version, because the question asked in every dispute is what the borrower agreed to and when. */
CREATE TABLE "loans" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Originating application. Unique: one funded application makes exactly one loan, and this constraint is what stops a double disbursement.
	"application_id" NUMBER(19) NOT NULL UNIQUE,
	-- Borrower, denormalised from the application so servicing queries never need the join.
	"borrower_id" NUMBER(19) NOT NULL,
	-- Product the loan was cut from.
	"product_id" NUMBER(19) NOT NULL,
	-- Servicing reference quoted on every statement and in every collections call.
	"loan_number" VARCHAR2(24) NOT NULL UNIQUE,
	-- Amount actually disbursed, in minor units. May differ from the approved amount if fees were deducted at disbursement.
	"principal_minor" NUMBER(19) NOT NULL,
	-- ISO 4217.
	"currency_code" CHAR(3) NOT NULL,
	-- Contractual annual rate as a decimal fraction, frozen at signing. Later repricing creates a new schedule version rather than changing this.
	"annual_rate" NUMBER(9,6) NOT NULL,
	-- Contractual term in months.
	"term_months" NUMBER(4) NOT NULL,
	-- Scheduled level payment, in minor units. Computed once at origination and stored, because recomputing it later with a different rounding rule would change the contract.
	"installment_minor" NUMBER(19) NOT NULL,
	-- Fee charged at disbursement, in minor units.
	"origination_fee_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Current principal balance. A maintained figure whose truth is the allocations: it must equal principal less every principal allocation ever posted.
	"outstanding_principal_minor" NUMBER(19) NOT NULL,
	-- Interest earned but not yet due, updated by the daily accrual job. Separate from outstanding principal so an early settlement quote is exact.
	"accrued_interest_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Days since the oldest unpaid instalment came due. Denormalised from the latest delinquency snapshot for the servicing screen.
	"days_past_due" NUMBER(5) NOT NULL DEFAULT 0,
	-- Which amortisation version is live. A restructure inserts a whole new version rather than editing rows, so the original contract stays readable.
	"schedule_version" NUMBER(3) NOT NULL DEFAULT 1,
	-- pending_disbursement | active | delinquent | restructured | paid_off | charged_off. Charged off means written off the books, not forgiven.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'pending_disbursement',
	-- Disbursement date. Null until the money leaves.
	"disbursed_on" DATE,
	-- Due date of instalment one, which is not always one month after disbursement.
	"first_payment_on" DATE,
	-- Due date of the final instalment under the live schedule version.
	"maturity_on" DATE,
	-- When the loan reached zero or was charged off.
	"closed_on" DATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_loans_borrower_status"
ON "loans" ("borrower_id", "status");
CREATE INDEX "idx_loans_status_dpd"
ON "loans" ("status", "days_past_due");
/* One row per instalment. Materialising the whole amortisation at origination is what makes an early settlement quote, a missed-payment query and a restructure comparison ordinary SQL instead of a recomputation nobody can audit. */
CREATE TABLE "loan_schedule_entries" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Loan being amortised.
	"loan_id" NUMBER(19) NOT NULL,
	-- Version this row belongs to. Older versions are kept in full so the original amortisation can still be shown after a restructure.
	"schedule_version" NUMBER(3) NOT NULL DEFAULT 1,
	-- Position in the schedule, from one. Ordering is by this number, not by due date, since a restructure can move dates around.
	"installment_number" NUMBER(4) NOT NULL,
	-- Date the instalment falls due. A local calendar date, never a timestamp: an instalment belongs to a day, and converting it to an instant is what produces the classic off-by-one.
	"due_on" DATE NOT NULL,
	-- Principal outstanding at the start of the period, in minor units.
	"opening_balance_minor" NUMBER(19) NOT NULL,
	-- Principal due this period. Grows over the life of a declining-balance loan.
	"scheduled_principal_minor" NUMBER(19) NOT NULL,
	-- Interest due this period, computed from the opening balance, the rate and the day count, then rounded once to minor units.
	"scheduled_interest_minor" NUMBER(19) NOT NULL,
	-- Any fee due with this instalment, such as a servicing charge.
	"scheduled_fee_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Sum of the three. Stored rather than computed so the figure on the statement and the figure in the database can never differ by a rounding rule.
	"total_due_minor" NUMBER(19) NOT NULL,
	-- Principal outstanding after the payment. The last row must close at zero, and the rounding remainder is absorbed into the final instalment.
	"closing_balance_minor" NUMBER(19) NOT NULL,
	-- Principal actually allocated to this instalment so far.
	"paid_principal_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Interest actually allocated so far.
	"paid_interest_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Fees actually allocated so far.
	"paid_fee_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- scheduled | paid | partially_paid | past_due | waived. Partially paid is common and is why the paid columns are split by component.
	"status" VARCHAR2(20) NOT NULL DEFAULT 'scheduled',
	-- Date the instalment was fully covered.
	"settled_on" DATE,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_schedule_loan_version_number"
ON "loan_schedule_entries" ("loan_id", "schedule_version", "installment_number");
CREATE INDEX "idx_schedule_due_status"
ON "loan_schedule_entries" ("due_on", "status");
/* Money arriving, recorded before anyone decides what it pays for. Keeping receipt separate from allocation is what lets a returned payment be reversed cleanly and a lump sum be spread over several instalments. */
CREATE TABLE "repayments" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Loan being repaid.
	"loan_id" NUMBER(19) NOT NULL,
	-- Reference from the collecting bank or processor. Unique so a replayed settlement file cannot post the same money twice.
	"payment_reference" VARCHAR2(40) NOT NULL UNIQUE,
	-- Amount received, in minor units. Borrowers overpay, underpay and pay round numbers, so this rarely equals an instalment.
	"amount_minor" NUMBER(19) NOT NULL,
	-- ISO 4217, matching the loan.
	"currency_code" CHAR(3) NOT NULL,
	-- direct_debit | card | bank_transfer | cash | payroll_deduction.
	"payment_method" VARCHAR2(20) NOT NULL,
	-- Y or N. An unscheduled extra payment is treated differently by the allocation waterfall, usually going straight to principal.
	"is_scheduled" CHAR(1) NOT NULL DEFAULT 'Y',
	-- pending | cleared | returned | reversed. A direct debit can be returned a week later, which is why allocations wait for cleared.
	"status" VARCHAR2(20) NOT NULL DEFAULT 'pending',
	-- insufficient_funds | account_closed | disputed. Set when the bank sends the money back.
	"return_reason" VARCHAR2(64),
	-- Date the payment was taken, which is what stops the clock on late interest.
	"received_on" DATE NOT NULL,
	-- Date it is treated as effective for interest, which can differ from the received date by the clearing cycle.
	"value_on" DATE,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_repayments_loan_received"
ON "repayments" ("loan_id", "received_on");
CREATE INDEX "idx_repayments_status_received"
ON "repayments" ("status", "received_on");
/* The split of one payment across fees, penalties, interest and principal. This table is the only honest answer to how much of a payment reduced the balance, and it is what makes a payoff figure defensible. */
CREATE TABLE "repayment_allocations" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Payment being applied. One payment produces several allocation rows.
	"repayment_id" NUMBER(19) NOT NULL,
	-- Instalment the money was applied to. Null for a principal prepayment that belongs to no particular instalment.
	"schedule_entry_id" NUMBER(19),
	-- fee | penalty | interest | principal | escrow. The waterfall applies them in that order, which is both contractual and the reason this is a typed row rather than three columns.
	"allocation_type" VARCHAR2(16) NOT NULL,
	-- Portion of the payment applied here, in minor units. The allocations of one payment sum exactly to its amount.
	"amount_minor" NUMBER(19) NOT NULL,
	-- Y or N. A returned payment writes mirrored negative allocations instead of deleting the originals, so the history stays intact.
	"is_reversal" CHAR(1) NOT NULL DEFAULT 'N',
	-- When the allocation was posted. Append-only.
	"applied_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_allocations_repayment"
ON "repayment_allocations" ("repayment_id");
CREATE INDEX "idx_allocations_schedule_entry"
ON "repayment_allocations" ("schedule_entry_id");
/* A daily photograph of how late a loan is. Buckets are stored, not computed on read, because a portfolio report run next year must show what the policy of that day considered thirty days late. */
CREATE TABLE "delinquency_snapshots" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Loan assessed.
	"loan_id" NUMBER(19) NOT NULL,
	-- Business date of the assessment. One row per loan per day for delinquent loans, which is what makes roll-rate analysis a simple self-join.
	"as_of_date" DATE NOT NULL,
	-- Days since the oldest unpaid instalment fell due, after the grace period.
	"days_past_due" NUMBER(5) NOT NULL DEFAULT 0,
	-- current | dpd_1_29 | dpd_30_59 | dpd_60_89 | dpd_90_plus. Stored rather than derived because bucket boundaries change with policy and history must keep the boundaries of its own day.
	"bucket" VARCHAR2(16) NOT NULL DEFAULT 'current',
	-- Overdue principal, in minor units.
	"past_due_principal_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Overdue interest, in minor units.
	"past_due_interest_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Overdue fees, in minor units. Split from the other two because provisioning rules treat fees differently.
	"past_due_fees_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Sum of the three, the figure a collections agent quotes on the call.
	"total_past_due_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Y or N. Flips at the regulatory threshold and drives the provision, so it is recorded per day rather than recomputed.
	"is_non_performing" CHAR(1) NOT NULL DEFAULT 'N',
	-- When the assessment ran.
	"created_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_delinquency_loan_date"
ON "delinquency_snapshots" ("loan_id", "as_of_date");
CREATE INDEX "idx_delinquency_date_bucket"
ON "delinquency_snapshots" ("as_of_date", "bucket");
/* Every attempt to recover money, including the ones that failed. Contact-frequency rules are legally enforced, so the failed attempts have to be recorded as carefully as the successful ones. */
CREATE TABLE "collection_activities" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Loan being collected on.
	"loan_id" NUMBER(19) NOT NULL,
	-- Delinquency snapshot that triggered the activity, linking the action to the state that justified it.
	"snapshot_id" NUMBER(19),
	-- call | sms | email | letter | field_visit | payment_plan | legal_referral | charge_off.
	"activity_type" VARCHAR2(24) NOT NULL,
	-- phone | mobile | email | post | app. Contact rules cap attempts per channel per day, so the channel must be on the row.
	"channel" VARCHAR2(16),
	-- Agent or automated workflow that acted. Null for system-generated letters.
	"agent_reference" VARCHAR2(64),
	-- promise_to_pay | no_answer | wrong_number | refused | dispute | hardship | paid. Null while the activity is still open.
	"outcome" VARCHAR2(24),
	-- Amount the borrower committed to, in minor units. Null unless the outcome was a promise.
	"promised_amount_minor" NUMBER(19),
	-- Date the borrower promised to pay. Kept so a broken promise is measurable, which is the strongest single predictor of charge-off.
	"promised_on" DATE,
	-- Free-text call notes. A CLOB because agents write paragraphs and the text is read by humans, never queried.
	"notes" CLOB,
	-- When the contact happened.
	"occurred_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	-- When the account should be worked again. This is the column the daily work queue is built on.
	"next_action_on" DATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_collections_loan_occurred"
ON "collection_activities" ("loan_id", "occurred_at");
CREATE INDEX "idx_collections_next_action"
ON "collection_activities" ("next_action_on", "outcome");
ALTER TABLE "applications"
ADD CONSTRAINT "fk_applications_applicant_id_applicants" FOREIGN KEY ("applicant_id") REFERENCES "applicants" ("id");
ALTER TABLE "applications"
ADD CONSTRAINT "fk_applications_product_id_loan_products" FOREIGN KEY ("product_id") REFERENCES "loan_products" ("id");
ALTER TABLE "employment_incomes"
ADD CONSTRAINT "fk_employment_incomes_applicant_id_applicants" FOREIGN KEY ("applicant_id") REFERENCES "applicants" ("id")
ON DELETE CASCADE;
ALTER TABLE "employment_incomes"
ADD CONSTRAINT "fk_employment_incomes_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE SET NULL;
ALTER TABLE "credit_decisions"
ADD CONSTRAINT "fk_credit_decisions_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id");
ALTER TABLE "decision_reasons"
ADD CONSTRAINT "fk_decision_reasons_decision_id_credit_decisions" FOREIGN KEY ("decision_id") REFERENCES "credit_decisions" ("id")
ON DELETE CASCADE;
ALTER TABLE "loans"
ADD CONSTRAINT "fk_loans_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id");
ALTER TABLE "loans"
ADD CONSTRAINT "fk_loans_borrower_id_applicants" FOREIGN KEY ("borrower_id") REFERENCES "applicants" ("id");
ALTER TABLE "loans"
ADD CONSTRAINT "fk_loans_product_id_loan_products" FOREIGN KEY ("product_id") REFERENCES "loan_products" ("id");
ALTER TABLE "loan_schedule_entries"
ADD CONSTRAINT "fk_loan_schedule_entries_loan_id_loans" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
ON DELETE CASCADE;
ALTER TABLE "repayments"
ADD CONSTRAINT "fk_repayments_loan_id_loans" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id");
ALTER TABLE "repayment_allocations"
ADD CONSTRAINT "fk_repayment_allocations_repayment_id_repayments" FOREIGN KEY ("repayment_id") REFERENCES "repayments" ("id")
ON DELETE CASCADE;
ALTER TABLE "repayment_allocations"
ADD CONSTRAINT "fk_repayment_allocations_schedule_entry_id_loan_schedule_entries" FOREIGN KEY ("schedule_entry_id") REFERENCES "loan_schedule_entries" ("id")
ON DELETE SET NULL;
ALTER TABLE "delinquency_snapshots"
ADD CONSTRAINT "fk_delinquency_snapshots_loan_id_loans" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
ON DELETE CASCADE;
ALTER TABLE "collection_activities"
ADD CONSTRAINT "fk_collection_activities_loan_id_loans" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
ON DELETE CASCADE;
ALTER TABLE "collection_activities"
ADD CONSTRAINT "fk_collection_activities_snapshot_id_delinquency_snapshots" FOREIGN KEY ("snapshot_id") REFERENCES "delinquency_snapshots" ("id")
ON DELETE SET NULL;
