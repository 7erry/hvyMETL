CREATE TABLE IF NOT EXISTS `clients` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`client_number` VARCHAR(24) NOT NULL UNIQUE COMMENT 'Short human reference used in conversation and on remittance advice. Never reused after a client is archived.',
	`company_name` VARCHAR(200) NOT NULL COMMENT 'Legal entity being billed. This is what must appear on the invoice, not the contact name.',
	`contact_name` VARCHAR(160) COMMENT 'Person who receives the invoice. Null when billing goes to a shared accounts inbox.',
	`email` VARCHAR(320) NOT NULL COMMENT 'Where invoices and reminders are sent.',
	`phone` VARCHAR(32) COMMENT 'Contact number, used when an invoice goes badly overdue.',
	`billing_address` TEXT NOT NULL COMMENT 'Full address as it must be printed. Stored as text rather than structured fields because invoice layout only ever needs it as a block.',
	`country_code` CHAR(2) NOT NULL COMMENT 'ISO 3166-1 alpha-2. Decides whether tax is charged at all, which is the difference between a domestic sale and a reverse-charge export.',
	`tax_number` VARCHAR(40) COMMENT 'VAT or GST registration number. Its presence is what allows a cross-border invoice to be zero-rated, so it is a billing input and not a note.',
	`default_currency` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency this client is normally billed in. A default, copied onto each invoice rather than read at render time.',
	`payment_terms_days` SMALLINT NOT NULL DEFAULT 30 COMMENT 'Days from issue to due date. Copied onto the invoice at issue, because renegotiating terms must not move the due date of invoices already sent.',
	`default_tax_rate_id` BIGINT COMMENT 'Tax rate prefilled on new lines for this client. Null means the line picks the rate itself.',
	`notes` TEXT COMMENT 'Private notes about the relationship. Never printed.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | archived. Archived clients disappear from pickers but keep every invoice they ever received.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the client was added.',
	PRIMARY KEY(`id`)
) COMMENT='Who gets billed. Archived rather than deleted, because an invoice with no client is unrenderable and financial records outlive the working relationship.';


CREATE TABLE IF NOT EXISTS `projects` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`client_id` BIGINT NOT NULL COMMENT 'Client the work is for.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Project name shown in the time tracker and on the invoice.',
	`project_code` VARCHAR(24) COMMENT 'Short code the client may want quoted on invoices, often their own purchase order reference.',
	`billing_type` VARCHAR(16) NOT NULL DEFAULT 'hourly' COMMENT 'hourly | fixed | retainer | non_billable. Non-billable projects still take time entries, which is the only way to know what internal work costs.',
	`hourly_rate_minor` BIGINT COMMENT 'Default rate per hour in minor units. Null for fixed-price work. Lives on the project because the same person bills different clients differently.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'ISO 4217 the project bills in. A client can have projects in two currencies, which is why this is not only on the client.',
	`budget_minor` BIGINT COMMENT 'Agreed budget in minor units. Null means open-ended.',
	`budget_hours` DECIMAL(10,2) COMMENT 'Budget expressed in hours, for projects capped by effort rather than money.',
	`starts_on` DATE COMMENT 'Start date, for reporting.',
	`ends_on` DATE COMMENT 'End date. Null while the project is open-ended.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | on_hold | completed | archived. Completed projects can still be invoiced for unbilled time.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='The unit work is tracked and billed against. It sits between client and time entry so a rate change applies to one engagement rather than to everything that client has ever bought.';


CREATE INDEX `idx_projects_client_status`
ON `projects` (`client_id`, `status`);
CREATE TABLE IF NOT EXISTS `time_entries` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`project_id` BIGINT NOT NULL COMMENT 'Project the work belongs to.',
	`invoice_line_id` BIGINT COMMENT 'Line this entry was billed on. Null means unbilled, and this single column is what makes the unbilled query an index scan instead of a left join against every invoice.',
	`performed_by` VARCHAR(120) NOT NULL COMMENT 'Who did the work. A plain name, since a one-person business has no user table and a small team still bills under one account.',
	`entry_date` DATE NOT NULL COMMENT 'Day the work was done. A calendar date, not a timestamp: a late-night session belongs to the day it is billed as, not to a UTC instant.',
	`duration_minutes` INTEGER NOT NULL COMMENT 'Time worked, in whole minutes. Integer rather than decimal hours because 20 minutes is not representable as a decimal hour and rounding it turns into a billing dispute.',
	`description` VARCHAR(500) NOT NULL COMMENT 'What was done. Copied onto the invoice line, so it is written for the client to read.',
	`hourly_rate_minor` BIGINT COMMENT 'Rate snapshotted when the entry was created, in minor units. Raising your rate must not reprice work already delivered.',
	`is_billable` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether it can appear on an invoice. Non-billable entries still count towards effort reporting.',
	`billed_at` DATETIME COMMENT 'When the entry was pulled onto an invoice. Once set, the entry is read-only in the UI.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was logged.',
	`updated_at` DATETIME COMMENT 'Last edit. Editing after billing is blocked, which is why this being later than billed_at is a bug worth alerting on.',
	PRIMARY KEY(`id`)
) COMMENT='Tracked work, in minutes. Pointing at the invoice line rather than the invoice is deliberate: several entries collapse into one line, and the link is what lets an invoice be expanded back into the hours behind it.';


CREATE INDEX `idx_time_project_date`
ON `time_entries` (`project_id`, `entry_date`);
CREATE INDEX `idx_time_invoice_line`
ON `time_entries` (`invoice_line_id`);
CREATE TABLE IF NOT EXISTS `tax_rates` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(80) NOT NULL COMMENT 'Display name such as Standard VAT, printed on the invoice.',
	`code` VARCHAR(24) NOT NULL COMMENT 'Short code for exports to accounting software.',
	`rate_percent` DECIMAL(7,4) NOT NULL COMMENT 'Percentage as a decimal, so 20 percent is 20.0000. A rate is not money, so decimal is right here; four places cover rates like 8.8750.',
	`tax_type` VARCHAR(16) NOT NULL DEFAULT 'vat' COMMENT 'vat | gst | sales_tax | exempt | reverse_charge. Reverse charge computes zero but must still print its explanation on the invoice.',
	`jurisdiction` VARCHAR(80) COMMENT 'Country or region the rate belongs to, used to prefill the right rate for a client address.',
	`is_compound` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether it applies on top of another tax rather than on the net line, which some provincial regimes require.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Old rates are deactivated, never deleted: invoices issued under them must still render.',
	`effective_from` DATE NOT NULL COMMENT 'When the rate took effect.',
	`effective_to` DATE COMMENT 'When it stopped. Null means current.',
	PRIMARY KEY(`id`)
) COMMENT='The tax catalogue. Rates change by legislation on a fixed date, so rows are versioned by effective date and every invoice line snapshots the percentage it actually used.';


CREATE UNIQUE INDEX `uq_tax_rates_code_from`
ON `tax_rates` (`code`, `effective_from`);
CREATE TABLE IF NOT EXISTS `invoices` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`client_id` BIGINT NOT NULL COMMENT 'Who is billed.',
	`project_id` BIGINT COMMENT 'Project, when the invoice covers exactly one. Null for an invoice spanning several projects.',
	`recurring_template_id` BIGINT COMMENT 'Template that generated it, null for a hand-written invoice. Kept so a template change can be traced to the invoices it produced.',
	`invoice_number` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Sequential, gapless number. In most jurisdictions a gap in the sequence is a compliance problem, which is why voiding an invoice keeps the row and its number.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft | issued | partially_paid | paid | overdue | void | uncollectible. Void keeps the number; uncollectible is written off but still owed.',
	`issue_date` DATE NOT NULL COMMENT 'Date the invoice was issued. Everything tax-related, including the exchange rate, is fixed to this date.',
	`due_date` DATE NOT NULL COMMENT 'Issue date plus the terms in force at issue, stored so renegotiating terms later cannot move it.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'ISO 4217 currency billed in, copied from the client or project at issue.',
	`exchange_rate` DECIMAL(18,8) NOT NULL DEFAULT 1 COMMENT 'Rate from the invoice currency to the base currency, snapshotted at issue. Decimal because a rate is not money; eight places because currencies like JPY need them.',
	`base_currency_code` CHAR(3) NOT NULL COMMENT 'The currency the business reports in. Stored per invoice so a business that changes base currency does not rewrite its own history.',
	`subtotal_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Sum of line totals before tax, in minor units.',
	`tax_total_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Sum of line tax amounts, in minor units. Summed from the lines rather than applied to the subtotal, because per-line rates do not share a single rate.',
	`total_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Subtotal plus tax, in minor units. Maintained on write so listing a hundred invoices needs no aggregate.',
	`amount_paid_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Sum of cleared payments, in minor units.',
	`amount_credited_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Sum of applied credit notes, in minor units.',
	`balance_due_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Total less paid less credited. Stored because it is the column the overdue query filters on, and a computed comparison across three columns cannot use an index well.',
	`total_base_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Total converted at the snapshotted rate, in base-currency minor units. Frozen: revenue reported last quarter must not move when the currency does.',
	`purchase_order_number` VARCHAR(60) COMMENT 'Client reference. Many accounts departments will not pay an invoice that lacks it.',
	`notes` TEXT COMMENT 'Message printed on the invoice.',
	`payment_terms` TEXT COMMENT 'Terms text snapshotted at issue, since the wording is part of what the client agreed to.',
	`sent_at` DATETIME COMMENT 'When it was emailed. Null for an invoice issued but not yet sent.',
	`viewed_at` DATETIME COMMENT 'First time the client opened it, which quietly ends the it-never-arrived conversation.',
	`paid_at` DATETIME COMMENT 'When the balance reached zero.',
	`voided_at` DATETIME COMMENT 'When it was voided. The row and its number survive.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time, which for a draft is much earlier than the issue date.',
	PRIMARY KEY(`id`)
) COMMENT='The document, frozen at issue. Currency, rate, terms and totals are all snapshotted here rather than joined at render time, because an invoice is a statement about one day and must render identically five years later.';


CREATE INDEX `idx_invoices_client_issue`
ON `invoices` (`client_id`, `issue_date`);
CREATE INDEX `idx_invoices_status_due`
ON `invoices` (`status`, `due_date`);
CREATE TABLE IF NOT EXISTS `invoice_lines` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`invoice_id` BIGINT NOT NULL COMMENT 'Parent invoice.',
	`project_id` BIGINT COMMENT 'Project this line bills, when the invoice spans several. Null for a line that belongs to no project, such as an expense.',
	`tax_rate_id` BIGINT COMMENT 'Rate applied. Null for an untaxed line. Kept for reporting, but the percentage below is what actually computed the tax.',
	`line_number` SMALLINT NOT NULL COMMENT 'Position on the printed invoice. Explicit because clients query line three, and a database has no inherent order.',
	`item_type` VARCHAR(16) NOT NULL DEFAULT 'service' COMMENT 'service | time | expense | product | discount. A discount line carries a negative total, which keeps the arithmetic uniform.',
	`description` VARCHAR(500) NOT NULL COMMENT 'What is being charged for, as printed.',
	`quantity` DECIMAL(12,3) NOT NULL DEFAULT 1 COMMENT 'Units billed. Three decimal places so 1.75 hours or 0.5 days work exactly; it is a count, not money.',
	`unit_price_minor` BIGINT NOT NULL COMMENT 'Price per unit in minor units, snapshotted from the project rate. The catalogue can change tomorrow; this line cannot.',
	`discount_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Line-level discount in minor units, applied before tax.',
	`tax_rate_percent` DECIMAL(7,4) NOT NULL DEFAULT 0 COMMENT 'Percentage actually used, copied from the tax rate at issue. This is the column that makes a five-year-old invoice still add up after a rate change.',
	`tax_amount_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Tax on this line in minor units, rounded once per line. Per-line rounding is what the tax authorities expect and what makes the total reproducible.',
	`line_total_minor` BIGINT NOT NULL COMMENT 'Quantity times unit price less discount, in minor units, excluding tax.',
	PRIMARY KEY(`id`)
) COMMENT='One charge on one invoice, with its tax percentage snapshotted rather than joined. Tax is computed and rounded per line because a rate applies to a line, not to an invoice, and summing rounded lines is the only way the printed total matches.';


CREATE UNIQUE INDEX `uq_invoice_lines_invoice_number`
ON `invoice_lines` (`invoice_id`, `line_number`);
CREATE TABLE IF NOT EXISTS `payments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`invoice_id` BIGINT NOT NULL COMMENT 'Invoice being paid. A payment always belongs to one invoice; a client settling three invoices at once records three payments.',
	`payment_reference` VARCHAR(40) NOT NULL UNIQUE COMMENT 'Reference from the bank or processor. Unique so importing the same bank statement twice cannot record the money twice.',
	`amount_minor` BIGINT NOT NULL COMMENT 'Amount received in the invoice currency, in minor units. Partial payments are normal, which is the whole reason this is a table.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'ISO 4217 of the payment, normally matching the invoice.',
	`exchange_rate` DECIMAL(18,8) NOT NULL DEFAULT 1 COMMENT 'Rate on the day the money arrived, which differs from the issue rate. The gap between the two is the foreign exchange gain or loss.',
	`amount_base_minor` BIGINT NOT NULL COMMENT 'Payment converted at the receipt rate, in base-currency minor units.',
	`method` VARCHAR(20) NOT NULL COMMENT 'bank_transfer | card | paypal | direct_debit | cash | cheque.',
	`processor_fee_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Fee deducted by the processor, in minor units. Recorded because the invoice is settled in full even though less money arrived.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'cleared' COMMENT 'pending | cleared | failed | refunded. Only cleared payments count towards the invoice balance.',
	`received_on` DATE NOT NULL COMMENT 'Value date at the bank. This, not the row creation time, decides which period the revenue lands in.',
	`external_reference` VARCHAR(120) COMMENT 'Whatever the client wrote on the transfer, which is often the only way to match a mystery deposit.',
	`note` VARCHAR(255) COMMENT 'Free note, such as short paid by agreement.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was recorded.',
	PRIMARY KEY(`id`)
) COMMENT='Money against an invoice, as rows. Partial payments, a failed card followed by a transfer, and a refund months later are all normal, and none of them can be expressed by a paid flag on the invoice.';


CREATE INDEX `idx_payments_invoice_received`
ON `payments` (`invoice_id`, `received_on`);
CREATE TABLE IF NOT EXISTS `credit_notes` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`invoice_id` BIGINT NOT NULL COMMENT 'Invoice being credited. A credit note always refers to one, since a credit with no original is just an invoice with a minus sign.',
	`credit_note_number` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Its own gapless sequence, separate from invoice numbers because tax authorities treat the two documents differently.',
	`reason` VARCHAR(24) NOT NULL COMMENT 'correction | goodwill | cancellation | overpayment | bad_debt. The reason drives whether the tax is also reversed.',
	`amount_minor` BIGINT NOT NULL COMMENT 'Credited amount excluding tax, in minor units.',
	`tax_amount_minor` BIGINT NOT NULL DEFAULT 0 COMMENT 'Tax reversed, in minor units. Zero for a goodwill credit that does not reclaim the tax.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'ISO 4217, always matching the invoice.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft | issued | applied | void. Applied means it has reduced the invoice balance.',
	`issued_on` DATE COMMENT 'Issue date. Null while a draft.',
	`applied_on` DATE COMMENT 'When it was set against the invoice balance.',
	`notes` TEXT COMMENT 'Explanation printed on the credit note.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time.',
	PRIMARY KEY(`id`)
) COMMENT='A correction that never edits the original. An issued invoice is immutable, so reducing what is owed means issuing a second document, which is exactly what auditors expect to find.';


CREATE INDEX `idx_credit_notes_invoice`
ON `credit_notes` (`invoice_id`);
CREATE TABLE IF NOT EXISTS `recurring_templates` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`client_id` BIGINT NOT NULL COMMENT 'Client billed on the cycle.',
	`project_id` BIGINT COMMENT 'Project billed, if the retainer is project-specific.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Internal name, such as Monthly retainer.',
	`frequency` VARCHAR(12) NOT NULL DEFAULT 'monthly' COMMENT 'weekly | monthly | quarterly | annually.',
	`interval_count` SMALLINT NOT NULL DEFAULT 1 COMMENT 'How many periods between runs, so every two months is monthly with an interval of two rather than a new frequency value.',
	`day_of_month` SMALLINT COMMENT 'Day the invoice is raised. Clamped to the last day in short months, which is why it is stored as an intent rather than as a date.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'ISO 4217 the generated invoices bill in.',
	`payment_terms_days` SMALLINT NOT NULL DEFAULT 30 COMMENT 'Terms applied to each generated invoice.',
	`next_run_on` DATE NOT NULL COMMENT 'When the next invoice is due to be generated. The generator selects on this column alone, which keeps the nightly job a single indexed read.',
	`starts_on` DATE NOT NULL COMMENT 'First billing date.',
	`ends_on` DATE COMMENT 'Last billing date. Null runs until cancelled.',
	`occurrence_limit` SMALLINT COMMENT 'Stop after this many invoices. Null means unlimited.',
	`occurrences_created` SMALLINT NOT NULL DEFAULT 0 COMMENT 'How many have been generated. Compared with the limit rather than counting invoices, so a deleted draft cannot restart the series.',
	`auto_send` BOOLEAN NOT NULL DEFAULT false COMMENT 'Whether generated invoices are emailed immediately or left as drafts for review.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | paused | completed | canceled.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='The recipe, not an invoice. Generated invoices are ordinary rows with a link back here, so editing the template changes future invoices and touches none of the ones already sent.';


CREATE INDEX `idx_templates_status_next_run`
ON `recurring_templates` (`status`, `next_run_on`);
CREATE TABLE IF NOT EXISTS `recurring_template_lines` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`template_id` BIGINT NOT NULL COMMENT 'Parent template.',
	`tax_rate_id` BIGINT COMMENT 'Rate to apply. Resolved at generation time so a legislated rate change flows into the next invoice automatically.',
	`line_number` SMALLINT NOT NULL COMMENT 'Position on the generated invoice.',
	`description` VARCHAR(500) NOT NULL COMMENT 'Line text. Supports date placeholders so a monthly retainer can name its own period.',
	`quantity` DECIMAL(12,3) NOT NULL DEFAULT 1 COMMENT 'Units billed each cycle.',
	`unit_price_minor` BIGINT NOT NULL COMMENT 'Price per unit in minor units. Editing it here changes future invoices only.',
	`item_type` VARCHAR(16) NOT NULL DEFAULT 'service' COMMENT 'service | product | expense | discount.',
	PRIMARY KEY(`id`)
) COMMENT='The lines a template stamps out. Kept as rows rather than JSON so the same editor, validation and tax lookup serve both templates and real invoices.';


CREATE UNIQUE INDEX `uq_template_lines_template_number`
ON `recurring_template_lines` (`template_id`, `line_number`);
CREATE TABLE IF NOT EXISTS `reminder_rules` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`client_id` BIGINT COMMENT 'Client the rule applies to. Null means it is a global default, which is how one schedule covers everyone without copying rows per client.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Rule name, such as First polite nudge.',
	`trigger_type` VARCHAR(16) NOT NULL DEFAULT 'after_due' COMMENT 'before_due | on_due | after_due.',
	`offset_days` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Days before or after the due date. Combined with the trigger type this expresses the whole schedule, so three reminders are three rows rather than three columns.',
	`channel` VARCHAR(12) NOT NULL DEFAULT 'email' COMMENT 'email | sms.',
	`subject_template` VARCHAR(255) COMMENT 'Subject line with placeholders for the invoice number and amount.',
	`body_template` TEXT NOT NULL COMMENT 'Message body with placeholders. Escalating tone is expressed by having several rules, not by logic in code.',
	`stop_when_paid` BOOLEAN NOT NULL DEFAULT true COMMENT 'Cancel pending reminders once the balance reaches zero. The one setting that prevents chasing a client who already paid.',
	`max_sends` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Cap on how many times this rule fires for one invoice.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Deactivated rules stop scheduling but keep their history.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time.',
	PRIMARY KEY(`id`)
) COMMENT='The chasing policy, as data. A rule per reminder means the escalation schedule can be changed by a customer without a deploy, and a per-client override is a row rather than a branch.';


CREATE INDEX `idx_reminder_rules_client_active`
ON `reminder_rules` (`client_id`, `is_active`);
CREATE TABLE IF NOT EXISTS `invoice_reminders` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`invoice_id` BIGINT NOT NULL COMMENT 'Invoice being chased.',
	`rule_id` BIGINT NOT NULL COMMENT 'Rule that scheduled it.',
	`scheduled_on` DATE NOT NULL COMMENT 'Date the reminder is due to go out, computed from the due date and the rule offset when the invoice is issued.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'scheduled' COMMENT 'scheduled | sent | skipped | failed | canceled. Skipped records a reminder that was deliberately not sent, which is as useful to see as one that was.',
	`channel` VARCHAR(12) NOT NULL DEFAULT 'email' COMMENT 'Channel actually used, copied from the rule in case the rule changes before it fires.',
	`recipient_email` VARCHAR(320) COMMENT 'Address used, snapshotted so a later contact change does not rewrite where a reminder went.',
	`sent_at` DATETIME COMMENT 'Send time. Null until it goes.',
	`opened_at` DATETIME COMMENT 'When the client opened it, which is the strongest signal for deciding whether to escalate.',
	`failure_reason` VARCHAR(255) COMMENT 'Bounce or delivery error.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the reminder was scheduled.',
	PRIMARY KEY(`id`)
) COMMENT='One row per reminder, materialised when the invoice is issued rather than decided at send time. Scheduling them up front makes the pipeline visible, cancellable and testable, and the unique key guarantees a retried job cannot send twice.';


CREATE UNIQUE INDEX `uq_reminders_invoice_rule_date`
ON `invoice_reminders` (`invoice_id`, `rule_id`, `scheduled_on`);
CREATE INDEX `idx_reminders_status_scheduled`
ON `invoice_reminders` (`status`, `scheduled_on`);
CREATE TABLE IF NOT EXISTS `exchange_rates` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`base_currency` CHAR(3) NOT NULL COMMENT 'ISO 4217 currency being converted from.',
	`quote_currency` CHAR(3) NOT NULL COMMENT 'ISO 4217 currency being converted to.',
	`rate` DECIMAL(18,8) NOT NULL COMMENT 'Units of quote per one unit of base. Decimal, not float: a rate is a conversion factor and must be identical on every machine that applies it.',
	`rate_date` DATE NOT NULL COMMENT 'Day the rate applies to. Rates are daily closes, so the date is part of the identity of the row.',
	`source` VARCHAR(40) NOT NULL COMMENT 'Provider the rate came from. Auditors ask, and two providers will disagree in the fourth decimal.',
	`fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was pulled, which can be days after the rate date for a backfill.',
	PRIMARY KEY(`id`)
) COMMENT='A daily rate history, used to fill the snapshot on an invoice or a payment. Nothing reads this table at render time: it is the source for a value that is copied, because reporting that changes retroactively with the market is not reporting.';


CREATE UNIQUE INDEX `uq_rates_pair_date`
ON `exchange_rates` (`base_currency`, `quote_currency`, `rate_date`);
ALTER TABLE `clients`
ADD FOREIGN KEY(`default_tax_rate_id`) REFERENCES `tax_rates`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `projects`
ADD FOREIGN KEY(`client_id`) REFERENCES `clients`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `time_entries`
ADD FOREIGN KEY(`project_id`) REFERENCES `projects`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `time_entries`
ADD FOREIGN KEY(`invoice_line_id`) REFERENCES `invoice_lines`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `invoices`
ADD FOREIGN KEY(`client_id`) REFERENCES `clients`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `invoices`
ADD FOREIGN KEY(`project_id`) REFERENCES `projects`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `invoices`
ADD FOREIGN KEY(`recurring_template_id`) REFERENCES `recurring_templates`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `invoice_lines`
ADD FOREIGN KEY(`invoice_id`) REFERENCES `invoices`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `invoice_lines`
ADD FOREIGN KEY(`project_id`) REFERENCES `projects`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `invoice_lines`
ADD FOREIGN KEY(`tax_rate_id`) REFERENCES `tax_rates`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `payments`
ADD FOREIGN KEY(`invoice_id`) REFERENCES `invoices`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `credit_notes`
ADD FOREIGN KEY(`invoice_id`) REFERENCES `invoices`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `recurring_templates`
ADD FOREIGN KEY(`client_id`) REFERENCES `clients`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `recurring_templates`
ADD FOREIGN KEY(`project_id`) REFERENCES `projects`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `recurring_template_lines`
ADD FOREIGN KEY(`template_id`) REFERENCES `recurring_templates`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `recurring_template_lines`
ADD FOREIGN KEY(`tax_rate_id`) REFERENCES `tax_rates`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reminder_rules`
ADD FOREIGN KEY(`client_id`) REFERENCES `clients`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `invoice_reminders`
ADD FOREIGN KEY(`invoice_id`) REFERENCES `invoices`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `invoice_reminders`
ADD FOREIGN KEY(`rule_id`) REFERENCES `reminder_rules`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
