CREATE TABLE IF NOT EXISTS `stores` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(12) NOT NULL UNIQUE COMMENT 'Short branch code printed on receipts and used in every operational report.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Branch name as staff refer to it.',
	`address_line` VARCHAR(250) NOT NULL COMMENT 'Street address printed on the receipt, which is a legal requirement in most jurisdictions.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency all amounts at this store are recorded in.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone. A trading day is a local concept, and reconciling tills in UTC splits a late shift across two days.',
	`tax_rate_bps` INTEGER NOT NULL DEFAULT 0 COMMENT 'Default tax rate in basis points. Basis points rather than a decimal keeps tax arithmetic exact.',
	`opened_at` DATE NOT NULL COMMENT 'Trading start date, used to exclude a branch from like-for-like comparisons in its first year.',
	PRIMARY KEY(`id`)
) COMMENT='A physical branch. Everything else in the schema is scoped to one, because reconciliation, cash and staffing are all per-store concerns.';


CREATE TABLE IF NOT EXISTS `registers` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`store_id` BIGINT NOT NULL COMMENT 'Branch the terminal stands in.',
	`code` VARCHAR(12) NOT NULL COMMENT 'Lane number or terminal label, unique within the store and printed on the receipt so a dispute can be traced to a lane.',
	`device_serial` VARCHAR(80) COMMENT 'Hardware serial of the terminal. Null for a tablet that is swapped out often.',
	`has_cash_drawer` TINYINT NOT NULL DEFAULT 1 COMMENT 'False for a card-only lane, which changes whether a shift needs a float and a count at all.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | maintenance | retired. Retired registers are kept so old sales still resolve to a lane.',
	`last_seen_at` DATETIME COMMENT 'Last heartbeat. Null for a terminal that has never connected, which is how a botched install is found.',
	PRIMARY KEY(`id`)
) COMMENT='A till. It is a separate table from stores because cash, shifts and offline queues are all owned by one terminal, not by the branch.';


CREATE UNIQUE INDEX `uq_registers_store_code`
ON `registers` (`store_id`, `code`);
CREATE TABLE IF NOT EXISTS `employees` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`store_id` BIGINT COMMENT 'Home branch. Null for an area manager who floats between stores and can approve anywhere.',
	`staff_number` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Payroll number, used to sign on at the terminal.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Name printed on the receipt as the serving cashier.',
	`pin_hash` VARCHAR(255) NOT NULL COMMENT 'Hash of the sign-on PIN. Hashed even though it is four digits, because the table is replicated to every terminal in the estate.',
	`role` VARCHAR(20) NOT NULL DEFAULT 'cashier' COMMENT 'cashier | supervisor | manager. Only supervisor and above may approve an override or a no-receipt return.',
	`active` TINYINT NOT NULL DEFAULT 1 COMMENT 'Cleared when someone leaves. The row stays so their historic sales keep a name against them.',
	PRIMARY KEY(`id`)
) COMMENT='Store staff. Rows are never deleted: every sale, override and drawer count has to remain attributable years after the person left.';


CREATE INDEX `idx_employees_store_active`
ON `employees` (`store_id`, `active`);
CREATE TABLE IF NOT EXISTS `shifts` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`register_id` BIGINT NOT NULL COMMENT 'Terminal being worked.',
	`employee_id` BIGINT NOT NULL COMMENT 'Cashier who signed on and who is accountable for the variance.',
	`business_date` DATE NOT NULL COMMENT 'Local trading day. Stored explicitly because a shift that ends at 01:00 belongs to the previous trading day, and deriving it from a timestamp gets that wrong every time.',
	`opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Sign-on time.',
	`opening_float_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Cash placed in the drawer at sign-on, in minor units. Integers only - never float money.',
	`closed_at` DATETIME COMMENT 'Sign-off time. Null while the shift is open, which is also how an abandoned till is found.',
	`counted_cash_minor` INTEGER COMMENT 'Cash physically counted at close. Null until the count is done.',
	`expected_cash_minor` INTEGER COMMENT 'Float plus cash tenders minus cash movements. Computed at close and stored, so a later refund cannot rewrite what the till was expected to hold.',
	`variance_minor` INTEGER COMMENT 'counted minus expected. Signed, and the number a manager actually investigates.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open | closed | suspended | reconciled. Reconciled means a manager has signed off the variance.',
	PRIMARY KEY(`id`)
) COMMENT='One cashier on one till for one session. It is the unit of cash accountability: every sale, tender and drawer movement hangs off a shift so a discrepancy has exactly one owner.';


CREATE INDEX `idx_shifts_register_status`
ON `shifts` (`register_id`, `status`);
CREATE INDEX `idx_shifts_date_register`
ON `shifts` (`business_date`, `register_id`);
CREATE TABLE IF NOT EXISTS `products` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`sku` VARCHAR(64) NOT NULL UNIQUE COMMENT 'Stock keeping unit, the identifier stock and finance agree on.',
	`barcode` VARCHAR(32) UNIQUE COMMENT 'Scanned EAN or UPC. Null for loose goods weighed at the till, which are keyed by SKU instead.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Description printed on the receipt line.',
	`unit_price_minor` INTEGER NOT NULL COMMENT 'Current shelf price in minor units.',
	`tax_rate_bps` INTEGER NOT NULL DEFAULT 0 COMMENT 'Line tax rate in basis points, overriding the store default for zero-rated and reduced-rate goods.',
	`is_age_restricted` TINYINT NOT NULL DEFAULT 0 COMMENT 'Forces a till prompt for proof of age. A compliance control, which is why it lives on the product rather than in a category rule.',
	`sold_by_weight` TINYINT NOT NULL DEFAULT 0 COMMENT 'Quantity is a weight rather than a count, which is the only reason sale_lines.quantity is not an integer.',
	`active` TINYINT NOT NULL DEFAULT 1 COMMENT 'Delisted products stay so historic receipts and returns still resolve.',
	PRIMARY KEY(`id`)
) COMMENT='The sellable item and the current shelf price. Sales snapshot the price they charged, so editing this never touches yesterday takings.';


CREATE TABLE IF NOT EXISTS `sales` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`store_id` BIGINT NOT NULL COMMENT 'Branch, denormalised from the shift so store-level reporting needs no join.',
	`register_id` BIGINT NOT NULL COMMENT 'Terminal the sale was rung on.',
	`shift_id` BIGINT NOT NULL COMMENT 'Shift accountable for it. This is what ties takings to a cashier at close.',
	`receipt_number` VARCHAR(32) NOT NULL COMMENT 'Number printed on the receipt. Unique per store, not globally, because each branch runs its own sequence.',
	`business_date` DATE NOT NULL COMMENT 'Local trading day, copied from the shift so daily takings never straddle midnight UTC.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'completed' COMMENT 'completed | voided | parked | refunded. Voided means cancelled before tendering and is kept, because a pattern of voids is a fraud signal.',
	`subtotal_minor` INTEGER NOT NULL COMMENT 'Sum of line totals before sale-level discount and tax.',
	`discount_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Sale-level discount, separate from line discounts so a whole-basket promotion can be reported apart from markdowns.',
	`tax_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Total tax charged.',
	`total_minor` INTEGER NOT NULL COMMENT 'Amount owed by the customer. The sum of the tenders must equal this, and that reconciliation is the first check a till audit runs.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'Currency of the amounts.',
	`customer_reference` VARCHAR(64) COMMENT 'Loyalty card or membership number when presented. Deliberately just a reference: the till holds no customer record.',
	`completed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When tendering finished.',
	PRIMARY KEY(`id`)
) COMMENT='One transaction at a till. It is the financial record, so every amount that a receipt shows is stored here rather than recomputed from the current catalogue.';


CREATE UNIQUE INDEX `uq_sales_store_receipt`
ON `sales` (`store_id`, `receipt_number`);
CREATE INDEX `idx_sales_shift_completed`
ON `sales` (`shift_id`, `completed_at`);
CREATE INDEX `idx_sales_date_store`
ON `sales` (`business_date`, `store_id`);
CREATE TABLE IF NOT EXISTS `sale_lines` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`sale_id` BIGINT NOT NULL COMMENT 'Parent sale.',
	`line_number` INTEGER NOT NULL COMMENT 'Position on the receipt. Returns and disputes are discussed by line number, so it is stored rather than derived from insertion order.',
	`product_id` BIGINT COMMENT 'Product sold. Nullable so a delisted product can eventually be removed without destroying sales history.',
	`sku` VARCHAR(64) NOT NULL COMMENT 'SKU snapshot, the join key that still works after the product row is gone.',
	`name` VARCHAR(200) NOT NULL COMMENT 'Description snapshot, exactly as printed on the receipt.',
	`quantity` DECIMAL(10,3) NOT NULL DEFAULT 1 COMMENT 'Units or weight. Three decimal places because loose goods are weighed in grams, and this is the only non-integer quantity in the schema.',
	`unit_price_minor` INTEGER NOT NULL COMMENT 'Price charged per unit, after any override. Never re-read from the product.',
	`discount_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Line discount, whether from a promotion or a markdown. Held separately from the price so the discount given is reportable rather than hidden in a lower price.',
	`discount_reason` VARCHAR(40) COMMENT 'staff | promotion | damaged | price_match | manager. Null when there is no discount. What turns a margin drop into an explanation.',
	`tax_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Tax on this line, computed at the line rate.',
	`total_minor` INTEGER NOT NULL COMMENT 'quantity * unit_price_minor - discount_minor, stored so line arithmetic is auditable.',
	PRIMARY KEY(`id`)
) COMMENT='Immutable receipt lines. Everything needed to reprint a receipt or process a return years later is snapshotted here.';


CREATE UNIQUE INDEX `uq_sale_lines_sale_line`
ON `sale_lines` (`sale_id`, `line_number`);
CREATE INDEX `idx_sale_lines_product`
ON `sale_lines` (`product_id`);
CREATE TABLE IF NOT EXISTS `tenders` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`sale_id` BIGINT NOT NULL COMMENT 'Sale being paid.',
	`sequence_number` INTEGER NOT NULL COMMENT 'Order the tenders were taken in. It matters: the last one is the one that gives change.',
	`tender_type` VARCHAR(24) NOT NULL COMMENT 'cash | card | gift_card | voucher | account | mobile_wallet.',
	`amount_minor` INTEGER NOT NULL COMMENT 'Amount applied to the sale. Negative on a refund tender, so one table serves both directions.',
	`tendered_minor` INTEGER COMMENT 'Cash actually handed over, which is usually more than amount_minor. Null for every non-cash type.',
	`change_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Change given back. Non-zero only on cash, and it is what makes the drawer balance at close.',
	`card_scheme` VARCHAR(20) COMMENT 'visa | mastercard | amex and so on. Null for cash.',
	`card_last4` CHAR(4) COMMENT 'Last four digits, the only card data kept. Storing more is a compliance problem, not a feature.',
	`auth_code` VARCHAR(32) COMMENT 'Acquirer authorisation code. Null for cash and for an offline-approved transaction.',
	`terminal_reference` VARCHAR(64) COMMENT 'Payment terminal transaction id, used to match against the acquirer settlement file.',
	`captured_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this tender was taken.',
	PRIMARY KEY(`id`)
) COMMENT='One row per payment instrument, not one per sale. Splitting a bill across a gift card and a card is routine, and payment columns on sales cannot express it at all.';


CREATE UNIQUE INDEX `uq_tenders_sale_sequence`
ON `tenders` (`sale_id`, `sequence_number`);
CREATE INDEX `idx_tenders_type_captured`
ON `tenders` (`tender_type`, `captured_at`);
CREATE TABLE IF NOT EXISTS `returns` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`original_sale_id` BIGINT COMMENT 'Sale being returned against. Null for a no-receipt return, which is precisely why it is nullable and why such returns need supervisor approval.',
	`store_id` BIGINT NOT NULL COMMENT 'Branch handling the return, which is often not the branch that sold it.',
	`register_id` BIGINT NOT NULL COMMENT 'Terminal the return was processed on.',
	`shift_id` BIGINT NOT NULL COMMENT 'Shift accountable for the refunded cash.',
	`receipt_number` VARCHAR(32) NOT NULL COMMENT 'Receipt number of the return itself. A return prints its own receipt.',
	`business_date` DATE NOT NULL COMMENT 'Local trading day of the return.',
	`reason` VARCHAR(40) NOT NULL COMMENT 'faulty | wrong_size | changed_mind | duplicate | price_match | recall. Drives whether the stock goes back on the shelf or into the quarantine bin.',
	`refund_total_minor` INTEGER NOT NULL COMMENT 'Amount refunded, as a positive number. The matching tenders row is negative.',
	`approved_by` BIGINT COMMENT 'Supervisor who authorised it. Null when the return was inside policy and needed no approval.',
	`processed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the refund was given.',
	PRIMARY KEY(`id`)
) COMMENT='A return is its own transaction, not a mutation of the sale. The original sale stays exactly as it was printed, which is the only way a partial return over three visits stays comprehensible.';


CREATE INDEX `idx_returns_original_sale`
ON `returns` (`original_sale_id`);
CREATE INDEX `idx_returns_store_date`
ON `returns` (`store_id`, `business_date`);
CREATE TABLE IF NOT EXISTS `return_lines` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`return_id` BIGINT NOT NULL COMMENT 'Parent return.',
	`sale_line_id` BIGINT COMMENT 'Original line being returned against. Null on a no-receipt return, where there is nothing to point at.',
	`sku` VARCHAR(64) NOT NULL COMMENT 'SKU snapshot of the item coming back.',
	`quantity` DECIMAL(10,3) NOT NULL COMMENT 'Units or weight returned. Can be less than the line quantity, which is what makes partial returns work.',
	`refund_minor` INTEGER NOT NULL COMMENT 'Refunded for this line, capped at what was originally paid after discount rather than at the current shelf price.',
	`restock` TINYINT NOT NULL DEFAULT 1 COMMENT 'Whether the item goes back into sellable stock. False for faulty and recalled goods, which is a stock-accuracy control.',
	PRIMARY KEY(`id`)
) COMMENT='Return lines point at the original sale line, which is what caps a refund at what was actually paid and stops the same line being refunded twice.';


CREATE INDEX `idx_return_lines_return`
ON `return_lines` (`return_id`);
CREATE INDEX `idx_return_lines_sale_line`
ON `return_lines` (`sale_line_id`);
CREATE TABLE IF NOT EXISTS `cash_movements` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shift_id` BIGINT NOT NULL COMMENT 'Shift the drawer belongs to.',
	`movement_type` VARCHAR(24) NOT NULL COMMENT 'opening_float | paid_in | paid_out | safe_drop | pickup | petty_cash | closing_count. One vocabulary for every reason cash moves.',
	`amount_minor` INTEGER NOT NULL COMMENT 'Signed amount. Negative for anything leaving the drawer, so the expected balance is one SUM over the shift.',
	`reason` VARCHAR(200) COMMENT 'Free-text explanation, required by policy for a paid_out. Its absence on a paid_out is itself an audit finding.',
	`performed_by` BIGINT NOT NULL COMMENT 'Employee who moved the cash, which is not always the cashier on the shift.',
	`witnessed_by` BIGINT COMMENT 'Second employee for a safe drop. Null where dual control is not required.',
	`occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the movement happened.',
	PRIMARY KEY(`id`)
) COMMENT='Every non-sale reason the drawer changes. Without it a till variance is unexplainable, because the difference between theft and a forgotten safe drop is exactly one missing row.';


CREATE INDEX `idx_cash_movements_shift_time`
ON `cash_movements` (`shift_id`, `occurred_at`);
CREATE INDEX `idx_cash_movements_type`
ON `cash_movements` (`movement_type`);
CREATE TABLE IF NOT EXISTS `price_overrides` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`sale_line_id` BIGINT NOT NULL UNIQUE COMMENT 'Line whose price was changed. Unique, so a line carries at most one override and the final price has a single explanation.',
	`original_price_minor` INTEGER NOT NULL COMMENT 'Shelf price before the change, snapshotted so the size of the giveaway is measurable.',
	`new_price_minor` INTEGER NOT NULL COMMENT 'Price actually charged, which is also what lands on sale_lines.unit_price_minor.',
	`reason_code` VARCHAR(40) NOT NULL COMMENT 'damaged | competitor_match | manager_discretion | mispriced_label | display_model. A required code, because an override without a reason is indistinguishable from theft.',
	`note` VARCHAR(300) COMMENT 'Free-text detail, typically the competitor name and price.',
	`requested_by` BIGINT NOT NULL COMMENT 'Cashier who asked for it.',
	`approved_by` BIGINT NOT NULL COMMENT 'Supervisor who authorised it. Deliberately not nullable: an override nobody approved should not be possible to record.',
	`approved_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When approval was given.',
	PRIMARY KEY(`id`)
) COMMENT='An audited exception. Overrides are the single largest source of unexplained margin loss in retail, so the approver and the reason are mandatory and the before price is kept.';


CREATE INDEX `idx_overrides_approver_time`
ON `price_overrides` (`approved_by`, `approved_at`);
CREATE INDEX `idx_overrides_reason`
ON `price_overrides` (`reason_code`);
ALTER TABLE `registers`
ADD FOREIGN KEY(`store_id`) REFERENCES `stores`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `employees`
ADD FOREIGN KEY(`store_id`) REFERENCES `stores`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `shifts`
ADD FOREIGN KEY(`register_id`) REFERENCES `registers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `shifts`
ADD FOREIGN KEY(`employee_id`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sales`
ADD FOREIGN KEY(`store_id`) REFERENCES `stores`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sales`
ADD FOREIGN KEY(`register_id`) REFERENCES `registers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sales`
ADD FOREIGN KEY(`shift_id`) REFERENCES `shifts`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `sale_lines`
ADD FOREIGN KEY(`sale_id`) REFERENCES `sales`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `sale_lines`
ADD FOREIGN KEY(`product_id`) REFERENCES `products`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `tenders`
ADD FOREIGN KEY(`sale_id`) REFERENCES `sales`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `returns`
ADD FOREIGN KEY(`original_sale_id`) REFERENCES `sales`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `returns`
ADD FOREIGN KEY(`store_id`) REFERENCES `stores`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `returns`
ADD FOREIGN KEY(`register_id`) REFERENCES `registers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `returns`
ADD FOREIGN KEY(`shift_id`) REFERENCES `shifts`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `returns`
ADD FOREIGN KEY(`approved_by`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `return_lines`
ADD FOREIGN KEY(`return_id`) REFERENCES `returns`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `return_lines`
ADD FOREIGN KEY(`sale_line_id`) REFERENCES `sale_lines`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `cash_movements`
ADD FOREIGN KEY(`shift_id`) REFERENCES `shifts`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cash_movements`
ADD FOREIGN KEY(`performed_by`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `cash_movements`
ADD FOREIGN KEY(`witnessed_by`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `price_overrides`
ADD FOREIGN KEY(`sale_line_id`) REFERENCES `sale_lines`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `price_overrides`
ADD FOREIGN KEY(`requested_by`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `price_overrides`
ADD FOREIGN KEY(`approved_by`) REFERENCES `employees`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
