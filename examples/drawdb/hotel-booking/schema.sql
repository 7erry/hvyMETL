CREATE TABLE IF NOT EXISTS `hotels` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Property name.',
	`slug` VARCHAR(180) NOT NULL UNIQUE COMMENT 'URL segment for the property page.',
	`address_line1` VARCHAR(200) NOT NULL COMMENT 'Street address.',
	`city` VARCHAR(120) NOT NULL COMMENT 'City, the main search facet.',
	`country_code` CHAR(2) NOT NULL COMMENT 'ISO 3166-1 alpha-2 country code.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone. Check-in cut-offs and night boundaries are local, not UTC.',
	`check_in_time` VARCHAR(5) NOT NULL DEFAULT '15:00' COMMENT 'Earliest check-in, local time.',
	`check_out_time` VARCHAR(5) NOT NULL DEFAULT '11:00' COMMENT 'Latest check-out, local time.',
	`star_rating` INTEGER COMMENT 'Official star rating where one exists.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False when the property stops selling but keeps its history.',
	PRIMARY KEY(`id`)
) COMMENT='A property. Timezone lives here because a "night" is a local-date concept and every availability calculation depends on getting that right.';


CREATE INDEX `idx_hotels_city_country`
ON `hotels` (`city`, `country_code`);
CREATE TABLE IF NOT EXISTS `room_types` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`hotel_id` BIGINT NOT NULL COMMENT 'Property the type belongs to.',
	`code` VARCHAR(24) NOT NULL COMMENT 'Short code, e.g. DLX-K. Unique within the hotel.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Guest-facing name, e.g. Deluxe King.',
	`description` TEXT COMMENT 'Marketing description shown on the booking page.',
	`max_occupancy` INTEGER NOT NULL DEFAULT 2 COMMENT 'Maximum guests, used to filter search results.',
	`bed_configuration` VARCHAR(60) COMMENT 'e.g. 1 king or 2 twin.',
	`size_sqm` INTEGER COMMENT 'Room size in square metres.',
	PRIMARY KEY(`id`)
) COMMENT='What is actually sold. Guests book a type and are assigned a specific room at check-in, which is why rates and availability hang off the type rather than the room.';


CREATE UNIQUE INDEX `uq_room_types_hotel_code`
ON `room_types` (`hotel_id`, `code`);
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`hotel_id` BIGINT NOT NULL COMMENT 'Property the room is in.',
	`room_type_id` BIGINT NOT NULL COMMENT 'Type this room belongs to.',
	`room_number` VARCHAR(16) NOT NULL COMMENT 'Door number as signed.',
	`floor` INTEGER COMMENT 'Floor, used for accessibility and allocation preferences.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'available' COMMENT 'available | occupied | cleaning | out_of_service. Out-of-service rooms are removed from inventory.',
	PRIMARY KEY(`id`)
) COMMENT='A physical room. It matters for housekeeping and allocation, not for selling — nothing books a specific room in advance.';


CREATE UNIQUE INDEX `uq_rooms_hotel_number`
ON `rooms` (`hotel_id`, `room_number`);
CREATE INDEX `idx_rooms_type_status`
ON `rooms` (`room_type_id`, `status`);
CREATE TABLE IF NOT EXISTS `rate_plans` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`hotel_id` BIGINT NOT NULL COMMENT 'Property the plan applies to.',
	`code` VARCHAR(24) NOT NULL COMMENT 'Short code, e.g. BAR or NONREF.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Guest-facing name, e.g. Flexible rate.',
	`is_refundable` BOOLEAN NOT NULL DEFAULT true COMMENT 'Drives the cancellation rules shown at booking.',
	`includes_breakfast` BOOLEAN NOT NULL DEFAULT false COMMENT 'Displayed as an inclusion and affects the rate.',
	`min_nights` INTEGER NOT NULL DEFAULT 1 COMMENT 'Minimum stay length the plan can be booked for.',
	`cancellation_hours` INTEGER COMMENT 'Free-cancellation window before check-in, in hours.',
	PRIMARY KEY(`id`)
) COMMENT='The commercial packaging of a room type — flexible, non-refundable, breakfast included. Separating plan from type is what lets one room sell at three prices without duplicating the room.';


CREATE UNIQUE INDEX `uq_rate_plans_hotel_code`
ON `rate_plans` (`hotel_id`, `code`);
CREATE TABLE IF NOT EXISTS `room_rates` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`room_type_id` BIGINT NOT NULL COMMENT 'Type being priced.',
	`rate_plan_id` BIGINT NOT NULL COMMENT 'Plan being priced.',
	`stay_date` DATE NOT NULL COMMENT 'The night being priced. One row per night is what makes seasonal and weekend pricing expressible.',
	`price_minor` INTEGER NOT NULL COMMENT 'Price for that night in minor units.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency.',
	`rooms_available` INTEGER NOT NULL DEFAULT 0 COMMENT 'Inventory released for sale that night. Decremented as bookings confirm.',
	`closed` BOOLEAN NOT NULL DEFAULT false COMMENT 'Stop-sell flag for the night, independent of remaining inventory.',
	PRIMARY KEY(`id`)
) COMMENT='The rate and availability calendar: one row per type, plan and night. Everything about hotel pricing — seasons, weekends, events, last-minute drops — falls out of having a row per night instead of a price on the room type.';


CREATE UNIQUE INDEX `uq_rates_type_plan_date`
ON `room_rates` (`room_type_id`, `rate_plan_id`, `stay_date`);
CREATE INDEX `idx_rates_stay_date`
ON `room_rates` (`stay_date`);
CREATE TABLE IF NOT EXISTS `guests` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Contact address and login identity.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Name as given at booking.',
	`phone` VARCHAR(32) COMMENT 'Contact number for the property.',
	`country_code` CHAR(2) COMMENT 'Residence country, used for tax and reporting.',
	`loyalty_number` VARCHAR(32) UNIQUE COMMENT 'Loyalty programme identifier where the guest is enrolled.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First booking or registration time.',
	PRIMARY KEY(`id`)
) COMMENT='The person booking. Kept separate from the reservation so a returning guest accumulates history rather than a row per stay.';


CREATE TABLE IF NOT EXISTS `reservations` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`hotel_id` BIGINT NOT NULL COMMENT 'Property booked.',
	`guest_id` BIGINT NOT NULL COMMENT 'Primary guest, who holds the booking.',
	`confirmation_code` VARCHAR(16) NOT NULL UNIQUE COMMENT 'Code quoted by the guest at the desk and in support calls.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'confirmed' COMMENT 'confirmed | checked_in | checked_out | cancelled | no_show.',
	`check_in_date` DATE NOT NULL COMMENT 'First night of the stay, as a local date.',
	`check_out_date` DATE NOT NULL COMMENT 'Departure date. The stay covers the nights from check-in up to but not including this date.',
	`adults` INTEGER NOT NULL DEFAULT 1 COMMENT 'Adult guests, checked against room type occupancy.',
	`children` INTEGER NOT NULL DEFAULT 0 COMMENT 'Children, which may affect rate and bedding.',
	`total_minor` INTEGER NOT NULL COMMENT 'Sum of the nightly prices plus taxes, in minor units.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'Currency of total_minor.',
	`source` VARCHAR(24) NOT NULL DEFAULT 'direct' COMMENT 'direct | ota | phone | walk_in. Channel drives commission reporting.',
	`special_requests` TEXT COMMENT 'Free-text requests, passed to the front desk.',
	`booked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the booking was made.',
	`cancelled_at` DATETIME COMMENT 'Cancellation time. Kept rather than deleting, because cancellation rates are a managed metric.',
	PRIMARY KEY(`id`)
) COMMENT='The booking as the guest understands it: one property, one stay, one confirmation code. The nightly detail lives in reservation_nights.';


CREATE INDEX `idx_reservations_hotel_checkin`
ON `reservations` (`hotel_id`, `check_in_date`);
CREATE INDEX `idx_reservations_guest_booked`
ON `reservations` (`guest_id`, `booked_at`);
CREATE INDEX `idx_reservations_status`
ON `reservations` (`status`);
CREATE TABLE IF NOT EXISTS `reservation_nights` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`reservation_id` BIGINT NOT NULL COMMENT 'Parent reservation.',
	`room_type_id` BIGINT NOT NULL COMMENT 'Type sold for that night.',
	`rate_plan_id` BIGINT NOT NULL COMMENT 'Plan the night was sold on.',
	`assigned_room_id` BIGINT COMMENT 'Specific room, assigned at or shortly before check-in.',
	`stay_date` DATE NOT NULL COMMENT 'The night. One row per night of the stay.',
	`price_minor` INTEGER NOT NULL COMMENT 'Price charged for that night, snapshotted at booking so a later rate change cannot alter the bill.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'Currency of price_minor.',
	PRIMARY KEY(`id`)
) COMMENT='One row per night of the stay. This is what makes a mid-stay room change, a partial cancellation and a per-night price breakdown all expressible, and it is what occupancy reporting counts.';


CREATE UNIQUE INDEX `uq_reservation_nights_reservation_date`
ON `reservation_nights` (`reservation_id`, `stay_date`);
CREATE INDEX `idx_reservation_nights_date_type`
ON `reservation_nights` (`stay_date`, `room_type_id`);
CREATE TABLE IF NOT EXISTS `payments` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`reservation_id` BIGINT NOT NULL COMMENT 'Reservation the money relates to.',
	`kind` VARCHAR(24) NOT NULL COMMENT 'deposit | balance | incidental | refund | penalty.',
	`provider` VARCHAR(40) COMMENT 'Gateway that processed the charge.',
	`provider_reference` VARCHAR(120) UNIQUE COMMENT 'Gateway charge id, unique so a replayed webhook cannot double-record.',
	`amount_minor` INTEGER NOT NULL COMMENT 'Amount moved in minor units. Negative for a refund.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'Currency of amount_minor.',
	`status` VARCHAR(24) NOT NULL COMMENT 'authorized | captured | failed | refunded.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the event was recorded.',
	PRIMARY KEY(`id`)
) COMMENT='Append-only money movements. A deposit at booking, a balance at check-out, an incidental at the bar and a refund after a complaint are four rows, not four columns.';


CREATE INDEX `idx_payments_reservation_kind`
ON `payments` (`reservation_id`, `kind`);
CREATE TABLE IF NOT EXISTS `reviews` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`hotel_id` BIGINT NOT NULL COMMENT 'Property reviewed.',
	`reservation_id` BIGINT UNIQUE COMMENT 'Stay being reviewed. Unique, so only a real stay can produce a review and only one per stay.',
	`guest_id` BIGINT NOT NULL COMMENT 'Reviewer.',
	`rating` INTEGER NOT NULL COMMENT 'Overall score, 1 to 10.',
	`title` VARCHAR(160) COMMENT 'Review headline.',
	`body` TEXT COMMENT 'Review text.',
	`response` TEXT COMMENT 'Property response, shown under the review.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Submission time.',
	PRIMARY KEY(`id`)
) COMMENT='Verified reviews only: the unique reservation reference means a review cannot exist without a completed stay, which is the whole defence against review spam.';


CREATE INDEX `idx_reviews_hotel_rating`
ON `reviews` (`hotel_id`, `rating`);
ALTER TABLE `room_types`
ADD FOREIGN KEY(`hotel_id`) REFERENCES `hotels`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `rooms`
ADD FOREIGN KEY(`hotel_id`) REFERENCES `hotels`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `rooms`
ADD FOREIGN KEY(`room_type_id`) REFERENCES `room_types`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `rate_plans`
ADD FOREIGN KEY(`hotel_id`) REFERENCES `hotels`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `room_rates`
ADD FOREIGN KEY(`room_type_id`) REFERENCES `room_types`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `room_rates`
ADD FOREIGN KEY(`rate_plan_id`) REFERENCES `rate_plans`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`hotel_id`) REFERENCES `hotels`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`guest_id`) REFERENCES `guests`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservation_nights`
ADD FOREIGN KEY(`reservation_id`) REFERENCES `reservations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reservation_nights`
ADD FOREIGN KEY(`room_type_id`) REFERENCES `room_types`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservation_nights`
ADD FOREIGN KEY(`rate_plan_id`) REFERENCES `rate_plans`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservation_nights`
ADD FOREIGN KEY(`assigned_room_id`) REFERENCES `rooms`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `payments`
ADD FOREIGN KEY(`reservation_id`) REFERENCES `reservations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`hotel_id`) REFERENCES `hotels`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`reservation_id`) REFERENCES `reservations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`guest_id`) REFERENCES `guests`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
