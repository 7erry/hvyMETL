/* The commercial template a loan is cut from. Eligibility limits live here as data so the pricing and underwriting engines evaluate against rows rather than against deployed code. */
CREATE TABLE "loan_products" (
	-- Surrogate primary key, backed by an identity column.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Short code quoted in rate sheets and in the pricing engine rules.
	"product_code" VARCHAR2(24) NOT NULL UNIQUE,
	-- Customer-facing name such as 30 Year Fixed.
	"product_name" VARCHAR2(160) NOT NULL,
	-- fixed | arm | interest_only | balloon. Changes what every schedule row means, so it is fixed at the product rather than inferred later.
	"amortization_type" VARCHAR2(16) NOT NULL DEFAULT 'fixed',
	-- Full term in months. A number rather than a label, because 360 and 180 are arithmetic inputs.
	"term_months" NUMBER(4) NOT NULL,
	-- Months at the initial rate for an adjustable product. Null for fixed, which is precisely the distinction.
	"arm_initial_fixed_months" NUMBER(4),
	-- Maximum single adjustment in basis points. Null for fixed products.
	"arm_adjustment_cap_bps" NUMBER(6),
	-- Lowest score the product will accept. Null where the decision is fully manual.
	"min_credit_score" NUMBER(4),
	-- Maximum loan-to-value in basis points. Basis points as an integer, because a published limit that rounds differently from the one enforced is a compliance finding.
	"max_ltv_bps" NUMBER(6) NOT NULL,
	-- Maximum debt-to-income ratio in basis points. Null for products underwritten on assets rather than income.
	"max_dti_bps" NUMBER(6),
	-- Y or N. Insurance above a loan-to-value threshold changes the monthly payment and therefore the ratio test.
	"requires_mortgage_insurance" CHAR(1) NOT NULL DEFAULT 'N',
	-- Y or N. Retired products stay as rows because applications in flight and funded loans still point at them.
	"is_active" CHAR(1) NOT NULL DEFAULT 'Y',
	-- When this version of the product became available. Terms already locked are never rewritten by a later edit.
	"effective_from" DATE NOT NULL,
	PRIMARY KEY("id")
);


/* The file everything else hangs from. It is never deleted, whatever the outcome: declined and withdrawn applications carry retention obligations and fair-lending reporting duties that outlast any interest in the deal. */
CREATE TABLE "applications" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Externally quotable file number, printed on every disclosure and used by the borrower on the phone. Never reused.
	"application_number" VARCHAR2(24) NOT NULL UNIQUE,
	-- Product applied for. A change of product mid-process is a real event and rewrites the pricing, which is why it is recorded rather than assumed constant.
	"product_id" NUMBER(19) NOT NULL,
	-- purchase | rate_term_refinance | cash_out_refinance | construction. Drives which documents are required and how the property value is established.
	"loan_purpose" VARCHAR2(24) NOT NULL,
	-- primary | second_home | investment. Pricing, down payment and reserve requirements all differ sharply between them.
	"occupancy_type" VARCHAR2(24) NOT NULL DEFAULT 'primary',
	-- Loan amount requested, in minor units. The approved amount can differ and lives on the decision.
	"requested_amount_minor" NUMBER(19) NOT NULL,
	-- ISO 4217 currency of the loan.
	"currency_code" CHAR(3) NOT NULL,
	-- Borrower contribution in minor units. Null on a refinance, where there is none.
	"down_payment_minor" NUMBER(19),
	-- started | submitted | processing | underwriting | conditional_approval | clear_to_close | closing | funded | declined | withdrawn. Conditional approval and clear to close are separate because the gap between them is where the file actually lives.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'started',
	-- retail | broker | correspondent | online. Compensation rules and disclosure timing differ by channel, so it is not a marketing attribute.
	"channel" VARCHAR2(24) NOT NULL DEFAULT 'retail',
	-- Originator responsible for the file. Text rather than a foreign key, because this schema stops short of being a staff directory.
	"loan_officer_name" VARCHAR2(200),
	-- When the complete application was received. Regulated disclosure clocks run from this moment, not from when the file was started.
	"submitted_at" TIMESTAMP,
	-- When underwriting first issued a decision. Null while in process.
	"decisioned_at" TIMESTAMP,
	-- When money left the lender. The transition that converts an application into a loan.
	"funded_at" TIMESTAMP,
	-- Adverse action reason as communicated to the borrower. Stored verbatim because the wording itself is regulated.
	"declined_reason" VARCHAR2(400),
	-- File creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_applications_status_submitted"
ON "applications" ("status", "submitted_at");
CREATE INDEX "idx_applications_product"
ON "applications" ("product_id");
/* A person on one application, with their details as of that application. Snapshotting rather than joining to a master party record is deliberate: an underwriting decision must remain reproducible against the facts it was actually made on. */
CREATE TABLE "borrowers" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File this borrower appears on. A person applying twice produces two rows, because everything on this row is a snapshot as of one application.
	"application_id" NUMBER(19) NOT NULL,
	-- Stable identifier for the human across applications. Not a foreign key on purpose: it links files for fraud and relationship analysis without letting a later application mutate an earlier snapshot.
	"person_reference" VARCHAR2(32) NOT NULL,
	-- primary | co_borrower | non_occupant_co_borrower | guarantor. A non-occupant co-borrower supports the ratios without living there, which is a different test entirely.
	"borrower_role" VARCHAR2(24) NOT NULL DEFAULT 'primary',
	-- First name as it appears on identity documents. A mismatch against the credit bureau is itself an underwriting condition.
	"legal_first_name" VARCHAR2(100) NOT NULL,
	-- Family name as it appears on identity documents.
	"legal_last_name" VARCHAR2(100) NOT NULL,
	-- Age is an eligibility input and a bureau matching key.
	"date_of_birth" DATE NOT NULL,
	-- SHA-256 of the national identifier. Hashed so duplicate and fraud checks still work without the file holding the number itself.
	"national_id_hash" RAW(32) NOT NULL,
	-- Contact address for disclosures and status updates.
	"email" VARCHAR2(320) NOT NULL,
	-- E.164 number used for verification calls.
	"phone" VARCHAR2(32),
	-- single | married | separated | other. Collected because property rights and signature requirements depend on it in community-property jurisdictions.
	"marital_status" VARCHAR2(24),
	-- citizen | permanent_resident | non_permanent_resident. Determines both eligibility and the documentation set.
	"citizenship_status" VARCHAR2(24),
	-- Y or N. Gates access to assistance programmes and to some pricing.
	"first_time_buyer" CHAR(1) NOT NULL DEFAULT 'N',
	-- Score pulled at application. Null until the bureau responds, and deliberately a snapshot: re-pulling later must not silently restate the decision that was made on the old number.
	"credit_score" NUMBER(4),
	-- Date of the pull. Scores expire, and a stale one is a condition to clear rather than a value to reuse.
	"credit_pulled_on" DATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_borrowers_application_role"
ON "borrowers" ("application_id", "borrower_role");
CREATE INDEX "idx_borrowers_person_reference"
ON "borrowers" ("person_reference");
/* Income as declared and as accepted, side by side. Keeping both is the whole point: the gap between them explains every decline that a borrower thought should have been an approval. */
CREATE TABLE "borrower_incomes" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Borrower the income belongs to.
	"borrower_id" NUMBER(19) NOT NULL,
	-- base_salary | overtime | bonus | commission | self_employment | rental | pension | investment. Each has its own averaging rule, which is why the type drives the calculation rather than a flag.
	"income_type" VARCHAR2(24) NOT NULL,
	-- Employer or source. Null for investment and pension income.
	"employer_name" VARCHAR2(200),
	-- Stated monthly amount in minor units, as declared by the borrower.
	"monthly_amount_minor" NUMBER(19) NOT NULL,
	-- Amount underwriting will actually use, in minor units. Frequently lower than the stated figure — variable income is averaged over two years — and the ratios are computed from this, never from the stated one.
	"qualifying_amount_minor" NUMBER(19),
	-- ISO 4217 currency of the income.
	"currency_code" CHAR(3) NOT NULL,
	-- When this income began. Continuity of two years is a standard requirement, so the date is an input rather than a detail.
	"start_date" DATE,
	-- When it ended, for prior employment listed to establish history. Null if current.
	"end_date" DATE,
	-- stated | documented | verified | rejected. Only verified income counts at final approval, and the progression is what the processing team works through.
	"verification_status" VARCHAR2(24) NOT NULL DEFAULT 'stated',
	-- paystub | w2 | tax_return | voe | bank_statement | asset_report. Records how it was proven, which an audit of the file will ask for by name.
	"verification_method" VARCHAR2(32),
	-- When verification completed. Null while outstanding.
	"verified_on" DATE,
	PRIMARY KEY("id")
);


CREATE INDEX "idx_incomes_borrower_type"
ON "borrower_incomes" ("borrower_id", "income_type");
/* Everything that consumes monthly income. Modelled per obligation rather than as a single total, because each one can be individually excluded, paid off or disputed, and the ratio has to be explainable line by line. */
CREATE TABLE "borrower_liabilities" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Borrower carrying the obligation.
	"borrower_id" NUMBER(19) NOT NULL,
	-- mortgage | auto | student | credit_card | personal | alimony | child_support | other. Support obligations count against the ratio without appearing on a credit report, which is why they are listed explicitly.
	"liability_type" VARCHAR2(24) NOT NULL,
	-- Who is owed. Null for obligations arising from a court order rather than a lender.
	"creditor_name" VARCHAR2(200),
	-- Last four characters of the account number, enough to match a bureau line to a declared debt.
	"account_last_four" CHAR(4),
	-- Outstanding balance in minor units. Null for an obligation with no balance, such as monthly support.
	"balance_minor" NUMBER(19),
	-- Monthly obligation in minor units. This, not the balance, is what enters the debt-to-income calculation.
	"monthly_payment_minor" NUMBER(19) NOT NULL,
	-- ISO 4217 currency of the obligation.
	"currency_code" CHAR(3) NOT NULL,
	-- Payments left. Debts with fewer than a threshold of months remaining are commonly excluded from the ratio, which makes this a decision input.
	"months_remaining" NUMBER(4),
	-- Y or N. A debt cleared at or before closing is excluded from the ratio, but only against evidence, which is exactly what becomes an underwriting condition.
	"will_be_paid_off" CHAR(1) NOT NULL DEFAULT 'N',
	-- declared | credit_report | discovered. Discovered means underwriting found it after the fact, and the difference between declared and discovered is a fraud signal.
	"source" VARCHAR2(24) NOT NULL DEFAULT 'declared',
	-- Y or N. Whether underwriting excluded it from the ratio. Stored with the reason in the decision, so the ratio can always be reconstructed.
	"is_excluded" CHAR(1) NOT NULL DEFAULT 'N',
	PRIMARY KEY("id")
);


CREATE INDEX "idx_liabilities_borrower_type"
ON "borrower_liabilities" ("borrower_id", "liability_type");
/* The security. It is a separate table rather than columns on the application because the property has its own valuation history, its own document set and its own conditions, and because a refinance and a purchase populate it from entirely different sources. */
CREATE TABLE "subject_properties" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File this property secures. Unique, because one application finances exactly one property, and a second property means a second application.
	"application_id" NUMBER(19) NOT NULL UNIQUE,
	-- Street address of the property being financed.
	"address_line1" VARCHAR2(200) NOT NULL,
	-- Unit designation, which is what distinguishes twelve securities sharing a street address.
	"address_line2" VARCHAR2(200),
	-- City, part of the legal description of the security.
	"city" VARCHAR2(120) NOT NULL,
	-- State or province. Decides the recording process, the title practice and the closing customs.
	"region" VARCHAR2(120),
	-- Postal code, also the key for flood and market data lookups.
	"postcode" VARCHAR2(16) NOT NULL,
	-- ISO 3166-1 alpha-2.
	"country_code" CHAR(2) NOT NULL,
	-- single_family | condo | townhouse | multi_family | manufactured. Condominiums and manufactured homes carry extra reviews, so the type gates a whole document set.
	"property_type" VARCHAR2(24) NOT NULL,
	-- Dwelling units in the building. Above one, rental income becomes part of qualification and the reserve requirement rises.
	"units_count" NUMBER(2) NOT NULL DEFAULT 1,
	-- Construction year. Null when unknown, which is common for older stock and itself triggers an inspection condition.
	"year_built" NUMBER(4),
	-- Habitable area in square metres, used by the appraiser to select comparables.
	"living_area_sqm" NUMBER(10,2),
	-- Contract price in minor units. Null on a refinance, where there is no sale.
	"purchase_price_minor" NUMBER(19),
	-- Borrower estimate at application. Kept alongside the appraised value because the difference is a common source of a restructured deal.
	"estimated_value_minor" NUMBER(19),
	-- ISO 4217 currency of the amounts.
	"currency_code" CHAR(3) NOT NULL,
	-- Y or N. Flood insurance is mandatory in a designated zone, and its cost changes the payment and therefore the ratio.
	"is_flood_zone" CHAR(1) NOT NULL DEFAULT 'N',
	-- Association dues per month in minor units. Null where there are none. Counts in the housing expense ratio exactly as taxes and insurance do.
	"hoa_monthly_minor" NUMBER(19),
	PRIMARY KEY("id")
);


/* Valuations as a series, because there is frequently more than one. A disputed value produces a second appraisal and sometimes a review of both, and the decision has to record which one it relied on. */
CREATE TABLE "appraisals" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Property valued.
	"property_id" NUMBER(19) NOT NULL,
	-- full | drive_by | desktop | avm | review. A review is an appraisal of an appraisal, ordered when the first one is challenged, and it is a row like any other.
	"appraisal_type" VARCHAR2(24) NOT NULL DEFAULT 'full',
	-- When the appraisal was ordered. Turn time from here is the most common cause of a missed closing date.
	"ordered_on" DATE NOT NULL,
	-- When the report was delivered. Null while outstanding.
	"completed_on" DATE,
	-- Date the opinion of value applies to. Appraisals expire, and this date, not the delivery date, is what expiry is measured from.
	"effective_date" DATE,
	-- Opinion of value in minor units. Null until the report lands. A value below the contract price restructures the deal rather than merely annoying anyone.
	"appraised_value_minor" NUMBER(19),
	-- ISO 4217 currency of the valuation.
	"currency_code" CHAR(3) NOT NULL,
	-- Individual who signed the report.
	"appraiser_name" VARCHAR2(200),
	-- Licence number, recorded because the file must evidence that the valuation came from a qualified and independent party.
	"appraiser_licence" VARCHAR2(64),
	-- excellent | good | average | fair | poor. A poor rating usually spawns a repair condition before closing.
	"condition_rating" VARCHAR2(16),
	-- ordered | in_progress | completed | expired | disputed | cancelled. Expired is reached by the passage of time rather than by any action, which is why it is a status and not an event.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'ordered',
	-- Object storage key for the report. The report itself is the evidence; every number above is an extract from it.
	"report_document_key" VARCHAR2(500),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_appraisals_property_ordered"
ON "appraisals" ("property_id", "ordered_on");
CREATE INDEX "idx_appraisals_status_completed"
ON "appraisals" ("status", "completed_on");
/* A commitment to a price for a period. Locks are append-only and chained: an expired lock that is replaced must stay visible, because the difference between the old rate and the new one is a cost somebody has to absorb. */
CREATE TABLE "rate_locks" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File the lock applies to.
	"application_id" NUMBER(19) NOT NULL,
	-- Confirmation number from the pricing desk, quoted on the lock agreement given to the borrower.
	"lock_reference" VARCHAR2(32) NOT NULL UNIQUE,
	-- Locked interest rate in basis points. An integer, because a rate that rounds differently between the confirmation and the note is a disclosure violation.
	"note_rate_bps" NUMBER(6) NOT NULL,
	-- Points paid to obtain the rate, in basis points of the loan amount. Part of the price, not a fee.
	"discount_points_bps" NUMBER(6) NOT NULL DEFAULT 0,
	-- Credit toward closing costs in minor units, which is the negative-points case expressed as money.
	"lender_credit_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- ISO 4217 currency.
	"currency_code" CHAR(3) NOT NULL,
	-- Lock period in days as sold. Longer locks cost more, so this is a priced attribute.
	"lock_days" NUMBER(4) NOT NULL,
	-- Moment the rate was committed. Pricing is a point-in-time fact, so the timestamp is part of the evidence.
	"locked_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	-- Last day the lock is honoured. Every closing schedule is driven by this date, and the report of locks expiring this week is the one the desk reads each morning.
	"expires_on" DATE NOT NULL,
	-- active | expired | extended | relocked | cancelled | used. Expiry is passive and arrives on its own, which is precisely why it is tracked rather than assumed.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'active',
	-- Days added by extensions. Cumulative, since a file can be extended more than once.
	"extension_days" NUMBER(4) NOT NULL DEFAULT 0,
	-- Cost charged for extensions in minor units. Usually absorbed when the delay was the lender fault, and knowing the total is how that gets measured.
	"extension_cost_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- Previous lock this supersedes, for a relock after expiry or a float down. Chained rather than overwritten, so the pricing history of the file is intact.
	"replaces_lock_id" NUMBER(19),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_locks_status_expires"
ON "rate_locks" ("status", "expires_on");
CREATE INDEX "idx_locks_application"
ON "rate_locks" ("application_id");
/* One row per decision, never an update. A file that is suspended, re-decisioned on new income and finally approved has three rows, and the ratios on each are the ones that actually applied at that moment. */
CREATE TABLE "underwriting_decisions" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File decided.
	"application_id" NUMBER(19) NOT NULL,
	-- Order of decisions on this file, starting at one. A file is commonly decisioned three times, and the sequence is what makes the progression readable.
	"decision_sequence" NUMBER(4) NOT NULL,
	-- approved | conditional_approval | suspended | declined | counter_offer. Conditional approval is the normal outcome, not an edge case, and suspended means the file is waiting on information rather than rejected.
	"decision" VARCHAR2(24) NOT NULL,
	-- automated | manual | override. An override of an automated recommendation must be identifiable years later, because it is the first thing an audit looks for.
	"decision_method" VARCHAR2(24) NOT NULL DEFAULT 'manual',
	-- Amount approved in minor units, which can be less than requested. Null on a decline.
	"approved_amount_minor" NUMBER(19),
	-- ISO 4217 currency of the approved amount.
	"currency_code" CHAR(3),
	-- Loan-to-value at decision time, in basis points. Snapshotted because it depends on an appraised value that may later be superseded.
	"ltv_bps" NUMBER(6),
	-- Debt-to-income at decision time, in basis points. Snapshotted for the same reason, and because income verification keeps moving.
	"dti_bps" NUMBER(6),
	-- Housing expense as a share of income, in basis points. The second ratio, which catches files the total ratio passes.
	"housing_ratio_bps" NUMBER(6),
	-- Months of payments the borrower holds in reserve after closing. A compensating factor that explains approvals the ratios alone would not.
	"reserves_months" NUMBER(5,2),
	-- Who decided. Null for a purely automated decision, which is itself informative.
	"underwriter_name" VARCHAR2(200),
	-- Reasoning. A CLOB because a conditional approval on a complex self-employed file genuinely runs to pages, and summarising it defeats the purpose.
	"decision_notes" CLOB,
	-- Decision time.
	"decided_at" TIMESTAMP NOT NULL DEFAULT SYSTIMESTAMP,
	PRIMARY KEY("id")
);


CREATE UNIQUE INDEX "uq_decisions_application_sequence"
ON "underwriting_decisions" ("application_id", "decision_sequence");
/* The list the file is actually blocked on. Conditions carry their own deadline type, so the system can distinguish what stops document preparation from what stops the wire hours before it goes out. */
CREATE TABLE "underwriting_conditions" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Decision that imposed the condition. Attached to the decision rather than the application, so a re-decision can retire conditions the previous one raised.
	"decision_id" NUMBER(19) NOT NULL,
	-- Stable code such as VERIFY_LARGE_DEPOSIT. Codes rather than free text, because the same condition recurs on thousands of files and has to be countable.
	"condition_code" VARCHAR2(32) NOT NULL,
	-- What the borrower or processor must actually do, in plain language, because this text is sent to them verbatim.
	"description" VARCHAR2(1000) NOT NULL,
	-- prior_to_docs | prior_to_closing | prior_to_funding | post_closing. The type is a deadline: a prior-to-funding condition can stop the wire on the morning of closing.
	"condition_type" VARCHAR2(24) NOT NULL DEFAULT 'prior_to_closing',
	-- income | assets | credit | property | title | insurance | compliance. The grouping used to route conditions to whoever can actually clear them.
	"category" VARCHAR2(24),
	-- open | submitted | cleared | waived | rejected. Submitted is distinct from cleared because the borrower sending a document is not the same as underwriting accepting it.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'open',
	-- Y or N. Internal conditions exist and should not appear on the borrower portal task list.
	"is_borrower_facing" CHAR(1) NOT NULL DEFAULT 'Y',
	-- When evidence was provided. Null while open, and the gap to cleared_at is the underwriting queue time everyone argues about.
	"submitted_at" TIMESTAMP,
	-- When underwriting accepted it. Null until then. A file reaches clear to close only when no prior-to-closing condition is left open.
	"cleared_at" TIMESTAMP,
	-- Who cleared it, since the authority to clear certain conditions is restricted.
	"cleared_by" VARCHAR2(200),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_conditions_decision_status"
ON "underwriting_conditions" ("decision_id", "status");
CREATE INDEX "idx_conditions_type_status"
ON "underwriting_conditions" ("condition_type", "status");
/* A checklist row per document, with received and verified as separate states. Most of the elapsed time in a mortgage is spent here, and an expiry date on each item is what stops a file closing on a paystub from four months ago. */
CREATE TABLE "document_checklist_items" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File the document belongs to.
	"application_id" NUMBER(19) NOT NULL,
	-- Borrower it relates to. Null for property and title documents, which belong to the file rather than to a person.
	"borrower_id" NUMBER(19),
	-- Condition this document satisfies, when it was requested by underwriting. Null for documents required by the base checklist.
	"condition_id" NUMBER(19),
	-- Stable document type code such as PAYSTUB_30D or HOI_BINDER. Codes make a checklist template reusable across every file.
	"document_code" VARCHAR2(32) NOT NULL,
	-- Human-readable name shown in the borrower portal.
	"document_name" VARCHAR2(200) NOT NULL,
	-- Y or N. Optional items exist on the checklist so that a processor can see what was considered and not asked for.
	"is_required" CHAR(1) NOT NULL DEFAULT 'Y',
	-- requested | received | verified | rejected | expired | waived. Received and verified are deliberately separate: a document in the folder is not a document someone has read.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'requested',
	-- When it was asked for. Null for items created by the template at file open.
	"requested_on" DATE,
	-- When the borrower uploaded it. Null while outstanding, and the age of this value drives the chase list.
	"received_at" TIMESTAMP,
	-- When a human confirmed it was legible, current and the right document. Null until then.
	"verified_at" TIMESTAMP,
	-- When the document goes stale. Paystubs, bank statements and credit reports all age out, and a file that sits for two months needs the same documents again.
	"expires_on" DATE,
	-- Why it was rejected, sent to the borrower verbatim so they do not upload the same thing twice.
	"rejection_reason" VARCHAR2(400),
	-- Object storage key for the uploaded file. Null while requested.
	"storage_key" VARCHAR2(500),
	PRIMARY KEY("id")
);


CREATE INDEX "idx_documents_application_status"
ON "document_checklist_items" ("application_id", "status");
CREATE INDEX "idx_documents_status_expires"
ON "document_checklist_items" ("status", "expires_on");
/* The signing event and its final numbers. Separate from funding because a signed loan is not a funded loan: rescission periods, missing title policies and unmet prior-to-funding conditions all sit in between. */
CREATE TABLE "closings" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- File being closed. Unique, because a loan closes once; a failed closing is rescheduled on the same row.
	"application_id" NUMBER(19) NOT NULL UNIQUE,
	-- Appointment for signing. Driven by the rate lock expiry more than by anyone convenience.
	"scheduled_at" TIMESTAMP,
	-- When signing actually completed. Null until it does.
	"closed_at" TIMESTAMP,
	-- Settlement agent or notary conducting it.
	"closing_agent_name" VARCHAR2(200),
	-- Title or settlement company. The counterparty the funds are wired to, which makes it a fraud-sensitive field.
	"settlement_company" VARCHAR2(200),
	-- Title insurance policy number. Its absence at funding is a hard stop.
	"title_policy_number" VARCHAR2(64),
	-- Amount on the signed note in minor units, which can differ from the approved amount after last-minute changes.
	"final_loan_amount_minor" NUMBER(19) NOT NULL,
	-- All costs charged in minor units. Compared against the last disclosure to test whether a re-disclosure and a waiting period are required.
	"total_closing_costs_minor" NUMBER(19) NOT NULL DEFAULT 0,
	-- What the borrower must bring, in minor units. Negative on a cash-out refinance, where money flows the other way.
	"cash_to_close_minor" NUMBER(19),
	-- ISO 4217 currency.
	"currency_code" CHAR(3) NOT NULL,
	-- First instalment date on the note. Derived at closing and then fixed, because the servicing handoff depends on it.
	"first_payment_due_on" DATE,
	-- End of any right-of-rescission period. Funds must not disburse before it, which is why it is a date on the closing rather than a rule in code.
	"rescission_ends_on" DATE,
	-- scheduled | signed | funded | rescinded | cancelled | rescheduled. Signed and funded are separate states, and the gap between them is where rescission lives.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'scheduled',
	PRIMARY KEY("id")
);


/* Where the money actually goes. Funding is modelled as a set of payments rather than one amount, because a single mortgage typically pays off a prior lien, pays a seller, pays several fee recipients and funds an escrow account, all on the same day. */
CREATE TABLE "disbursements" (
	-- Surrogate primary key.
	"id" NUMBER(19) GENERATED ALWAYS AS IDENTITY,
	-- Closing the money is paid out under.
	"closing_id" NUMBER(19) NOT NULL,
	-- seller | payoff_lender | settlement_agent | borrower | escrow | title_company | fee_recipient. A funding is many payments to many parties, and only one of them is ever the borrower.
	"payee_type" VARCHAR2(24) NOT NULL,
	-- Who is paid. Text, because most payees exist only for this transaction.
	"payee_name" VARCHAR2(200) NOT NULL,
	-- What the payment is for, such as a payoff of an existing lien or a recording fee. Appears on the settlement statement in these words.
	"purpose" VARCHAR2(200) NOT NULL,
	-- Amount disbursed in minor units, always positive. Direction is implied by the payee type.
	"amount_minor" NUMBER(19) NOT NULL,
	-- ISO 4217 currency of the payment.
	"currency_code" CHAR(3) NOT NULL,
	-- wire | ach | check | internal_transfer. Wires are irreversible, which is why the payee details behind them are verified separately.
	"method" VARCHAR2(24) NOT NULL DEFAULT 'wire',
	-- Bank reference for the outgoing payment. Unique, so a retried instruction cannot send the same money twice.
	"wire_reference" VARCHAR2(64) UNIQUE,
	-- Planned disbursement date, which must fall after any rescission period ends.
	"scheduled_on" DATE,
	-- When the payment actually left. Null until it does, and the application is funded only when every required row here has one.
	"disbursed_at" TIMESTAMP,
	-- pending | sent | confirmed | returned | cancelled. Returned is a real and urgent state, usually caused by wrong payee details.
	"status" VARCHAR2(24) NOT NULL DEFAULT 'pending',
	PRIMARY KEY("id")
);


CREATE INDEX "idx_disbursements_closing_payee"
ON "disbursements" ("closing_id", "payee_type");
CREATE INDEX "idx_disbursements_status_scheduled"
ON "disbursements" ("status", "scheduled_on");
ALTER TABLE "applications"
ADD CONSTRAINT "fk_applications_product_id_loan_products" FOREIGN KEY ("product_id") REFERENCES "loan_products" ("id");
ALTER TABLE "borrowers"
ADD CONSTRAINT "fk_borrowers_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE CASCADE;
ALTER TABLE "borrower_incomes"
ADD CONSTRAINT "fk_borrower_incomes_borrower_id_borrowers" FOREIGN KEY ("borrower_id") REFERENCES "borrowers" ("id")
ON DELETE CASCADE;
ALTER TABLE "borrower_liabilities"
ADD CONSTRAINT "fk_borrower_liabilities_borrower_id_borrowers" FOREIGN KEY ("borrower_id") REFERENCES "borrowers" ("id")
ON DELETE CASCADE;
ALTER TABLE "subject_properties"
ADD CONSTRAINT "fk_subject_properties_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE CASCADE;
ALTER TABLE "appraisals"
ADD CONSTRAINT "fk_appraisals_property_id_subject_properties" FOREIGN KEY ("property_id") REFERENCES "subject_properties" ("id")
ON DELETE CASCADE;
ALTER TABLE "rate_locks"
ADD CONSTRAINT "fk_rate_locks_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE CASCADE;
ALTER TABLE "rate_locks"
ADD CONSTRAINT "fk_rate_locks_replaces_lock_id_rate_locks" FOREIGN KEY ("replaces_lock_id") REFERENCES "rate_locks" ("id")
ON DELETE SET NULL;
ALTER TABLE "underwriting_decisions"
ADD CONSTRAINT "fk_underwriting_decisions_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE CASCADE;
ALTER TABLE "underwriting_conditions"
ADD CONSTRAINT "fk_underwriting_conditions_decision_id_underwriting_decisions" FOREIGN KEY ("decision_id") REFERENCES "underwriting_decisions" ("id")
ON DELETE CASCADE;
ALTER TABLE "document_checklist_items"
ADD CONSTRAINT "fk_document_checklist_items_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id")
ON DELETE CASCADE;
ALTER TABLE "document_checklist_items"
ADD CONSTRAINT "fk_document_checklist_items_borrower_id_borrowers" FOREIGN KEY ("borrower_id") REFERENCES "borrowers" ("id")
ON DELETE SET NULL;
ALTER TABLE "document_checklist_items"
ADD CONSTRAINT "fk_document_checklist_items_condition_id_underwriting_conditions" FOREIGN KEY ("condition_id") REFERENCES "underwriting_conditions" ("id")
ON DELETE SET NULL;
ALTER TABLE "closings"
ADD CONSTRAINT "fk_closings_application_id_applications" FOREIGN KEY ("application_id") REFERENCES "applications" ("id");
ALTER TABLE "disbursements"
ADD CONSTRAINT "fk_disbursements_closing_id_closings" FOREIGN KEY ("closing_id") REFERENCES "closings" ("id");
