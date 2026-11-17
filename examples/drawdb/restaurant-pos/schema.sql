CREATE TABLE IF NOT EXISTS `staff_members` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`display_name` VARCHAR(120) NOT NULL COMMENT 'Name printed on the check and shown on the kitchen display.',
	`role` VARCHAR(24) NOT NULL COMMENT 'server | bartender | busser | runner | line_cook | manager. Drives what the terminal will let them do and how tip-outs are calculated.',
	`pin_hash` VARCHAR(255) NOT NULL COMMENT 'Bcrypt hash of the four-digit terminal PIN. Terminals are shared, so a PIN is the only login; hashing it still matters because the tablet is on the restaurant wifi.',
	`hourly_rate_cents` INTEGER COMMENT 'Base wage in minor units. Null for staff paid a salary or purely on tips.',
	`tip_pool_share_bps` INTEGER NOT NULL DEFAULT 0 COMMENT 'Share of the tip pool in basis points for staff who do not carry checks. Zero for servers, who are tipped directly and then tip out.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Set false when someone leaves. Rows are never deleted because past shifts and checks point at them.',
	`hired_at` DATE NOT NULL COMMENT 'Start date, used for seniority rules in scheduling.',
	PRIMARY KEY(`id`)
) COMMENT='Anyone who can log into a terminal or receive a tip-out. One table rather than one per role, because people cover shifts outside their usual job constantly.';


CREATE INDEX `idx_staff_role_active`
ON `staff_members` (`role`, `is_active`);
CREATE TABLE IF NOT EXISTS `cashier_shifts` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`staff_member_id` BIGINT NOT NULL COMMENT 'Who is working the drawer.',
	`terminal_code` VARCHAR(24) NOT NULL COMMENT 'Which physical till. Two shifts on the same terminal cannot overlap, which is how a cash count is attributable.',
	`business_date` DATE NOT NULL COMMENT 'Trading day the shift belongs to. Not derivable from the clock: a bar that closes at 3am books those sales to the previous day.',
	`opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Clock-in at the terminal.',
	`closed_at` DATETIME COMMENT 'Drawer count completed. Null while the shift is live; exactly one open shift per terminal.',
	`opening_float_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Cash placed in the drawer at the start, in minor units.',
	`counted_cash_cents` INTEGER COMMENT 'Cash physically counted at close. Null until the count happens.',
	`expected_cash_cents` INTEGER COMMENT 'Float plus cash payments minus cash refunds. The difference against counted_cash_cents is the over/short, which is deliberately computed rather than stored.',
	`notes` VARCHAR(400) COMMENT 'Manager comment on a discrepancy.',
	PRIMARY KEY(`id`)
) COMMENT='One person on one till for one trading day. It is the unit everything financial reconciles to: payments, refunds and tip-outs all carry a shift id so a drawer can be balanced without a date range query.';


CREATE INDEX `idx_shifts_date_terminal`
ON `cashier_shifts` (`business_date`, `terminal_code`);
CREATE INDEX `idx_shifts_staff_opened`
ON `cashier_shifts` (`staff_member_id`, `opened_at`);
CREATE TABLE IF NOT EXISTS `dining_tables` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`label` VARCHAR(16) NOT NULL UNIQUE COMMENT 'What staff call it out loud, e.g. 14 or B3. Unique because two tables named 12 is a service disaster.',
	`section` VARCHAR(40) NOT NULL COMMENT 'Floor area, e.g. patio or bar. Sections are how servers are assigned.',
	`seat_count` SMALLINT NOT NULL COMMENT 'Standard cover count. The real party size lives on the check, because tables get pushed together.',
	`pos_x` SMALLINT NOT NULL DEFAULT 0 COMMENT 'X coordinate on the floor plan canvas, in grid units.',
	`pos_y` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Y coordinate on the floor plan canvas.',
	`shape` VARCHAR(16) NOT NULL DEFAULT 'square' COMMENT 'square | round | rect | booth. Purely how the floor plan draws it.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False while a table is out of service, e.g. a broken leg or a rebuilt patio.',
	PRIMARY KEY(`id`)
) COMMENT='A physical table on the floor plan. It holds no state about who is sitting there: occupancy is derived from whether an open check points at it, so a crashed terminal cannot leave a table stuck as occupied.';


CREATE INDEX `idx_dining_tables_section`
ON `dining_tables` (`section`);
CREATE TABLE IF NOT EXISTS `menu_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`station_id` BIGINT NOT NULL COMMENT 'Kitchen station that cooks it. This single column is what routes an order to the right printer.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Name printed on the check and the ticket.',
	`category` VARCHAR(60) NOT NULL COMMENT 'Menu grouping, e.g. appetizers or wine. Drives the terminal button layout and the sales mix report.',
	`price_cents` INTEGER NOT NULL COMMENT 'Current price in minor units. Integers only; never float money.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency for price_cents.',
	`default_course_id` BIGINT COMMENT 'Course this dish normally belongs to. The server can override per check, which is why check_items carries its own course.',
	`prep_seconds` SMALLINT COMMENT 'Typical cook time. The expediter uses it to decide when to fire a course so plates land together.',
	`is_sold_out` BOOLEAN NOT NULL DEFAULT false COMMENT 'The 86 flag. Set from the kitchen display the moment the last portion goes out; the terminal greys the button immediately.',
	`sold_out_at` DATETIME COMMENT 'When it was 86ed. Kept so the closing report can show what ran out and when, which is a purchasing signal.',
	`sold_out_until` DATETIME COMMENT 'Auto-clear time, normally end of service. Without it someone has to remember to un-86 the dish tomorrow, and nobody does.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False for a dish off the menu entirely. Distinct from sold out, which is temporary.',
	PRIMARY KEY(`id`)
) COMMENT='A sellable dish. Sold-out state is three columns rather than one boolean because the interesting questions are when did it run out and when does it come back, and a single flag answers neither.';


CREATE INDEX `idx_menu_items_category_active`
ON `menu_items` (`category`, `is_active`);
CREATE INDEX `idx_menu_items_sold_out`
ON `menu_items` (`is_sold_out`);
CREATE TABLE IF NOT EXISTS `courses` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(40) NOT NULL UNIQUE COMMENT 'Course name, e.g. apps, mains, dessert.',
	`sequence` SMALLINT NOT NULL COMMENT 'Serving order. The expediter fires courses in this order and the kitchen display sorts by it.',
	`auto_fire_delay_seconds` INTEGER COMMENT 'Delay after the previous course is cleared before this one fires automatically. Null means the server fires it by hand, which is the norm for dessert.',
	PRIMARY KEY(`id`)
) COMMENT='The pacing plan for a meal. Keeping courses as rows rather than an integer on the item means a restaurant can rename or reorder its service without a migration.';


CREATE TABLE IF NOT EXISTS `checks` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`parent_check_id` BIGINT COMMENT 'Check this one was split off. Null for an original. A split is a new row, not an edit, so the original tab stays intact and reprintable.',
	`dining_table_id` BIGINT COMMENT 'Table being served. Null for a bar tab or a takeaway order.',
	`opened_by_staff_id` BIGINT NOT NULL COMMENT 'Server who opened the tab. Tips and sales are attributed here even if someone else closes it.',
	`shift_id` BIGINT COMMENT 'Cashier shift that closed it. Null while the check is open, set at payment time so the drawer can be balanced.',
	`check_number` VARCHAR(16) NOT NULL UNIQUE COMMENT 'Human reference printed on the receipt and shouted across the pass.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open | closed | voided | transferred.',
	`guest_count` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Actual covers. Not taken from the table seat count, because parties merge tables and the per-cover average is a headline metric.',
	`subtotal_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Sum of item line totals, recomputed on every change while open.',
	`tax_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Tax due, in minor units.',
	`tip_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Tip declared across all payments on this check. Denormalised from check_payments so the tip-out calculation is a single read.',
	`total_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Amount owed, tax included, tip excluded.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency for all amounts here.',
	`opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the tab was started. Table turn time is measured from here.',
	`closed_at` DATETIME COMMENT 'When it was fully paid. Null while open.',
	`voided_at` DATETIME COMMENT 'Set when a manager voids the check. The row is kept because a void is an event auditors ask about.',
	PRIMARY KEY(`id`)
) COMMENT='A tab. Splitting produces child rows pointing back here rather than mutating the original, which is what makes a split reversible and keeps the kitchen tickets attached to the check that ordered the food.';


CREATE INDEX `idx_checks_status_opened`
ON `checks` (`status`, `opened_at`);
CREATE INDEX `idx_checks_table_status`
ON `checks` (`dining_table_id`, `status`);
CREATE INDEX `idx_checks_shift`
ON `checks` (`shift_id`);
CREATE TABLE IF NOT EXISTS `check_seats` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`check_id` BIGINT NOT NULL COMMENT 'Check this seat belongs to.',
	`seat_number` SMALLINT NOT NULL COMMENT 'Position at the table, numbered clockwise from the server point of entry. This is what makes seat-position delivery possible without asking who had the salmon.',
	`guest_label` VARCHAR(60) COMMENT 'Optional name, e.g. Birthday or Dr Reyes. Used on large-party checks and for regulars.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the seat was added, which is also when a late arrival joined.',
	PRIMARY KEY(`id`)
) COMMENT='A guest position on a check. Seats exist as rows rather than as an integer on the item because a seat is what a split-by-guest check is built from, and because a party can grow mid-meal.';


CREATE UNIQUE INDEX `uq_check_seats_check_seat`
ON `check_seats` (`check_id`, `seat_number`);
CREATE TABLE IF NOT EXISTS `check_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`check_id` BIGINT NOT NULL COMMENT 'Check the line belongs to.',
	`seat_id` BIGINT COMMENT 'Guest who ordered it. Null for something shared by the table, which is exactly the case a split-by-seat has to handle specially.',
	`menu_item_id` BIGINT COMMENT 'Dish ordered. Nullable so a retired item can be deleted without destroying sales history.',
	`course_id` BIGINT COMMENT 'Course this line fires with. Defaults from the menu item but is overridden constantly, e.g. a starter ordered as a main.',
	`name_snapshot` VARCHAR(160) NOT NULL COMMENT 'Dish name as printed. Kept because menus are reprinted mid-year and receipts must still read correctly.',
	`quantity` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Units of an identically configured line.',
	`unit_price_cents` INTEGER NOT NULL COMMENT 'Price at the moment of ordering. Never re-read from menu_items, or a happy-hour tab reprices at 8pm.',
	`line_total_cents` INTEGER NOT NULL COMMENT 'quantity * unit_price_cents less any discount, stored so the check arithmetic is auditable.',
	`modifiers_text` VARCHAR(400) COMMENT 'Free-form kitchen instructions, e.g. no onions, med rare. Deliberately unstructured here; a full modifier model belongs to a delivery menu, not a dining room terminal.',
	`status` VARCHAR(20) NOT NULL DEFAULT 'ordered' COMMENT 'ordered | fired | served | voided | comped.',
	`fired_at` DATETIME COMMENT 'When the line was actually sent to the kitchen. Distinct from ordered time: a main ordered at 7:02 may be fired at 7:31 when the apps clear.',
	`served_at` DATETIME COMMENT 'When the runner dropped the plate. The gap from fired_at is the ticket time the kitchen is measured on.',
	`voided_by_staff_id` BIGINT COMMENT 'Manager who removed the line. Null normally; voids after firing need an override because the food was already cooked.',
	PRIMARY KEY(`id`)
) COMMENT='One ordered line. Ordering and firing are separate timestamps, and that separation is the whole point of the table: coursing means the guest orders everything at once and the kitchen receives it in waves.';


CREATE INDEX `idx_check_items_check_course`
ON `check_items` (`check_id`, `course_id`);
CREATE INDEX `idx_check_items_status_fired`
ON `check_items` (`status`, `fired_at`);
CREATE TABLE IF NOT EXISTS `kitchen_stations` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(60) NOT NULL UNIQUE COMMENT 'Station name, e.g. grill, saute, cold, pastry, bar.',
	`printer_address` VARCHAR(120) COMMENT 'Network address of the ticket printer. Null for a station that only runs a screen.',
	`display_enabled` BOOLEAN NOT NULL DEFAULT true COMMENT 'Whether the station has a kitchen display. Stations often run both a screen and a printer during the changeover.',
	`sequence` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Order stations appear on the expediter screen, usually mirroring the physical line.',
	PRIMARY KEY(`id`)
) COMMENT='A place in the kitchen where food is made. Routing is the only reason this table exists, and it is why menu_items.station_id is not nullable.';


CREATE TABLE IF NOT EXISTS `kitchen_tickets` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`check_id` BIGINT NOT NULL COMMENT 'Check the food is for. The ticket header prints the check number and table so a plate can find its way back.',
	`station_id` BIGINT NOT NULL COMMENT 'Station the ticket was routed to.',
	`course_id` BIGINT COMMENT 'Course being fired. Null for something sent immediately, such as a bar order.',
	`ticket_number` VARCHAR(16) NOT NULL COMMENT 'Short number called at the pass. Unique per station per business date rather than globally, so the number stays short enough to shout.',
	`fired_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the station received it. The clock on the kitchen display starts here.',
	`bumped_at` DATETIME COMMENT 'When the cook cleared the ticket, meaning the food is up. Null while it is still on the rail.',
	`priority` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal | rush | allergy. Allergy tickets print separately and are cooked on clean equipment.',
	`notes` VARCHAR(300) COMMENT 'Expediter message to the station, e.g. hold until table 9 clears.',
	PRIMARY KEY(`id`)
) COMMENT='One fire of one course to one station. Firing a three-course order across grill and cold produces several rows, which is exactly what you want: each station gets its own clock and its own ticket time.';


CREATE INDEX `idx_kitchen_tickets_station_fired`
ON `kitchen_tickets` (`station_id`, `fired_at`);
CREATE INDEX `idx_kitchen_tickets_check_course`
ON `kitchen_tickets` (`check_id`, `course_id`);
CREATE TABLE IF NOT EXISTS `kitchen_ticket_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`ticket_id` BIGINT NOT NULL COMMENT 'Ticket this line was printed on.',
	`check_item_id` BIGINT NOT NULL COMMENT 'Ordered line being cooked. The link back is what lets a bumped ticket mark the check line served.',
	`quantity` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Units on this ticket, which can be fewer than the check line if a partial refire was sent.',
	`line_text` VARCHAR(300) NOT NULL COMMENT 'Exactly what the station sees, dish name and modifiers already flattened. Rendered once at fire time so a later menu edit cannot change what the cook was told.',
	`is_refire` BOOLEAN NOT NULL DEFAULT false COMMENT 'True when the line is being remade after a mistake or a send-back. Refire rates per station are the single most useful kitchen quality metric.',
	PRIMARY KEY(`id`)
) COMMENT='A line on a printed ticket. It is not the same thing as a check line: one ordered dish can appear on two tickets if it was refired, and the second ticket is how you find that out.';


CREATE INDEX `idx_kitchen_ticket_items_ticket`
ON `kitchen_ticket_items` (`ticket_id`);
CREATE INDEX `idx_kitchen_ticket_items_check_item`
ON `kitchen_ticket_items` (`check_item_id`);
CREATE TABLE IF NOT EXISTS `check_payments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`check_id` BIGINT NOT NULL COMMENT 'Check being paid. Several rows per check is normal, and not only for splits.',
	`shift_id` BIGINT NOT NULL COMMENT 'Drawer the money landed in. Required, because an unattributed payment cannot be reconciled at close.',
	`method` VARCHAR(20) NOT NULL COMMENT 'cash | card | gift_card | comp | house_account.',
	`amount_cents` INTEGER NOT NULL COMMENT 'Amount applied to the balance, in minor units. Negative for a refund, which appends rather than deletes.',
	`tip_cents` INTEGER NOT NULL DEFAULT 0 COMMENT 'Tip on this payment. Card tips arrive when the slip is signed, minutes after the authorisation, which is why tip is not part of amount.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of amount_cents.',
	`card_brand` VARCHAR(20) COMMENT 'Visa, Mastercard and so on. Null for cash.',
	`card_last4` CHAR(4) COMMENT 'Last four digits only. Nothing else about the card is ever stored here.',
	`processor_reference` VARCHAR(120) UNIQUE COMMENT 'Gateway transaction id. Unique so a retried terminal request cannot double-charge a guest.',
	`paid_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the payment cleared.',
	PRIMARY KEY(`id`)
) COMMENT='One movement of money against a check. Multiple rows cover the everyday case of four cards on one table, and refunds append instead of editing so the drawer still balances.';


CREATE INDEX `idx_check_payments_check_method`
ON `check_payments` (`check_id`, `method`);
CREATE INDEX `idx_check_payments_shift_paid`
ON `check_payments` (`shift_id`, `paid_at`);
CREATE TABLE IF NOT EXISTS `tip_outs` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shift_id` BIGINT NOT NULL COMMENT 'Shift the tips were earned on. Tip-outs are computed at close, from that shift declared tips.',
	`to_staff_member_id` BIGINT NOT NULL COMMENT 'Who receives the money, typically a busser, runner or bartender.',
	`basis` VARCHAR(24) NOT NULL COMMENT 'tips_percent | sales_percent | hours_pooled. Which rule produced the number, because jurisdictions differ and staff will ask.',
	`rate_bps` INTEGER NOT NULL COMMENT 'Rate applied in basis points, snapshotted from the policy in force that night. Policies change; a settled shift must not move.',
	`amount_cents` INTEGER NOT NULL COMMENT 'Amount transferred, in minor units.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of amount_cents.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the tip-out was calculated at shift close.',
	PRIMARY KEY(`id`)
) COMMENT='A transfer of tip money from a server shift to support staff. Storing the rate and the basis alongside the amount is what makes a payroll dispute six weeks later answerable from the row itself.';


CREATE INDEX `idx_tip_outs_shift_staff`
ON `tip_outs` (`shift_id`, `to_staff_member_id`);
ALTER TABLE `cashier_shifts`
ADD FOREIGN KEY(`staff_member_id`) REFERENCES `staff_members`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `menu_items`
ADD FOREIGN KEY(`station_id`) REFERENCES `kitchen_stations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `menu_items`
ADD FOREIGN KEY(`default_course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `checks`
ADD FOREIGN KEY(`parent_check_id`) REFERENCES `checks`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `checks`
ADD FOREIGN KEY(`dining_table_id`) REFERENCES `dining_tables`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `checks`
ADD FOREIGN KEY(`opened_by_staff_id`) REFERENCES `staff_members`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `checks`
ADD FOREIGN KEY(`shift_id`) REFERENCES `cashier_shifts`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `check_seats`
ADD FOREIGN KEY(`check_id`) REFERENCES `checks`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `check_items`
ADD FOREIGN KEY(`check_id`) REFERENCES `checks`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `check_items`
ADD FOREIGN KEY(`seat_id`) REFERENCES `check_seats`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `check_items`
ADD FOREIGN KEY(`menu_item_id`) REFERENCES `menu_items`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `check_items`
ADD FOREIGN KEY(`course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `check_items`
ADD FOREIGN KEY(`voided_by_staff_id`) REFERENCES `staff_members`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `kitchen_tickets`
ADD FOREIGN KEY(`check_id`) REFERENCES `checks`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `kitchen_tickets`
ADD FOREIGN KEY(`station_id`) REFERENCES `kitchen_stations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `kitchen_tickets`
ADD FOREIGN KEY(`course_id`) REFERENCES `courses`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `kitchen_ticket_items`
ADD FOREIGN KEY(`ticket_id`) REFERENCES `kitchen_tickets`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `kitchen_ticket_items`
ADD FOREIGN KEY(`check_item_id`) REFERENCES `check_items`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `check_payments`
ADD FOREIGN KEY(`check_id`) REFERENCES `checks`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `check_payments`
ADD FOREIGN KEY(`shift_id`) REFERENCES `cashier_shifts`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `tip_outs`
ADD FOREIGN KEY(`shift_id`) REFERENCES `cashier_shifts`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `tip_outs`
ADD FOREIGN KEY(`to_staff_member_id`) REFERENCES `staff_members`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
