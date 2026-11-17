CREATE TABLE IF NOT EXISTS `locations` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(12) NOT NULL UNIQUE COMMENT 'Branch code used on agreements and in every internal system, e.g. SFO01.',
	`name` VARCHAR(160) NOT NULL COMMENT 'Branch name shown to customers.',
	`address_line1` VARCHAR(200) NOT NULL COMMENT 'Street address, printed on the agreement.',
	`city` VARCHAR(120) NOT NULL COMMENT 'City, the primary search facet.',
	`country_code` CHAR(2) NOT NULL COMMENT 'ISO 3166-1 alpha-2 code, which determines the mandatory insurance rules that apply.',
	`timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC' COMMENT 'IANA zone. Opening hours and late-return grace periods are local, never UTC.',
	`phone` VARCHAR(32) COMMENT 'Branch telephone number, given to customers for late returns.',
	`is_airport` BOOLEAN NOT NULL DEFAULT false COMMENT 'Airport branches carry concession fees and different opening hours, so this drives pricing rather than just a map pin.',
	`opens_at` TIME NOT NULL DEFAULT '08:00:00' COMMENT 'Local opening time. A car cannot be collected before this unless the branch offers key-box pickup.',
	`closes_at` TIME NOT NULL DEFAULT '18:00:00' COMMENT 'Local closing time, which decides whether a return counts as after-hours.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False closes a branch without orphaning its rental history.',
	PRIMARY KEY(`id`)
) COMMENT='A branch. It is both a place to collect from and a place to return to, and because those two can differ, it is referenced twice by every reservation and rental.';


CREATE INDEX `idx_locations_city_country`
ON `locations` (`city`, `country_code`);
CREATE TABLE IF NOT EXISTS `vehicle_classes` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`acriss_code` CHAR(4) NOT NULL UNIQUE COMMENT 'Industry four-letter code, e.g. CDMR for compact four-door manual with air conditioning. It is what brokers and partners exchange.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Customer-facing name, e.g. Compact.',
	`example_models` VARCHAR(200) COMMENT 'Illustrative models, always phrased as or similar. The customer is buying the class, not the badge.',
	`transmission` VARCHAR(12) NOT NULL DEFAULT 'automatic' COMMENT 'automatic | manual. In much of Europe this is the single most important filter.',
	`doors` TINYINT NOT NULL DEFAULT 4 COMMENT 'Door count, part of the ACRISS definition.',
	`seats` TINYINT NOT NULL DEFAULT 5 COMMENT 'Passenger seats, a hard filter for families.',
	`large_bags` TINYINT NOT NULL DEFAULT 2 COMMENT 'Large suitcases that fit, which is the number customers actually plan around.',
	`has_air_conditioning` BOOLEAN NOT NULL DEFAULT true COMMENT 'Part of the class definition rather than a per-car feature.',
	`base_daily_rate_minor` INTEGER NOT NULL COMMENT 'Fallback daily rate in minor units, used when no availability row prices the day.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of base_daily_rate_minor.',
	`min_driver_age` TINYINT NOT NULL DEFAULT 21 COMMENT 'Minimum age for the class. Performance classes set this higher, and it is checked before a reservation is accepted.',
	PRIMARY KEY(`id`)
) COMMENT='What is actually sold. A customer reserves a Compact, never a specific car, which is why rates, availability and the reservation itself all key on the class and the registration plate appears only at the counter.';


CREATE TABLE IF NOT EXISTS `vehicles` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`class_id` BIGINT NOT NULL COMMENT 'Class this car is rented as. Changing it is an inventory decision, not a data fix.',
	`home_location_id` BIGINT NOT NULL COMMENT 'Branch the car belongs to. A one-way rental leaves it somewhere else, and the gap between home and current is what drives repositioning.',
	`current_location_id` BIGINT COMMENT 'Branch it is physically at now. Null while in transit between branches.',
	`vin` VARCHAR(17) NOT NULL UNIQUE COMMENT 'Vehicle identification number, the only globally unique identifier a car has.',
	`plate` VARCHAR(16) NOT NULL COMMENT 'Registration plate. Changes when a car is re-registered, so it is not the key.',
	`make` VARCHAR(60) NOT NULL COMMENT 'Manufacturer.',
	`model` VARCHAR(60) NOT NULL COMMENT 'Model name.',
	`model_year` YEAR COMMENT 'Model year, which feeds the fleet age reports that drive disposal.',
	`colour` VARCHAR(32) COMMENT 'Colour, used mainly to find the car in the lot.',
	`fuel_type` VARCHAR(16) NOT NULL DEFAULT 'petrol' COMMENT 'petrol | diesel | hybrid | electric. Electric cars are charged rather than refuelled, which changes the return policy.',
	`tank_capacity_litres` DECIMAL(5,2) COMMENT 'Tank or battery size, needed to convert a fuel gauge reading into a refuelling charge.',
	`odometer_km` INTEGER NOT NULL DEFAULT 0 COMMENT 'Latest reading, updated on every return. The rental rows hold the readings that produced it.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'available' COMMENT 'available | on_rent | cleaning | maintenance | in_transit | grounded | sold.',
	`acquired_on` DATE COMMENT 'Date the car entered the fleet.',
	`sold_on` DATE COMMENT 'Date it left. Rows are kept after disposal because the damage and rental history outlives the car.',
	PRIMARY KEY(`id`)
) COMMENT='A physical car. It matters enormously for operations and not at all for selling: nothing reserves a specific vehicle in advance, because the car promised three weeks ago may be sitting in a body shop on the day.';


CREATE INDEX `idx_vehicles_class_location_status`
ON `vehicles` (`class_id`, `current_location_id`, `status`);
CREATE INDEX `idx_vehicles_plate`
ON `vehicles` (`plate`);
CREATE TABLE IF NOT EXISTS `class_availability` (
	`location_id` BIGINT COMMENT 'Branch the inventory belongs to.',
	`class_id` BIGINT COMMENT 'Class being counted.',
	`available_on` DATE COMMENT 'The day. With the branch and class this makes a composite key, so one day can never be counted twice.',
	`cars_available` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Cars expected on the lot that day, net of planned maintenance and known one-way departures.',
	`cars_reserved` SMALLINT NOT NULL DEFAULT 0 COMMENT 'Cars already committed. Sellable is cars_available minus cars_reserved, which is where overbooking is controlled.',
	`daily_rate_minor` INTEGER NOT NULL COMMENT 'Rate for that day, overriding the class base rate. Weekend and event pricing needs a row per day to exist at all.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of daily_rate_minor.',
	`is_closed` BOOLEAN NOT NULL DEFAULT false COMMENT 'Stop-sell for the day, independent of remaining cars. Branches close classes to hold stock for corporate contracts.',
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Last change, used to expire cached search results.',
	PRIMARY KEY(`location_id`, `class_id`, `available_on`)
) COMMENT='The availability and rate calendar, one row per branch, class and day. Unlike a hotel the fleet moves between branches, so this is a forecast that a one-way booking updates in two places at once rather than a fixed room count.';


CREATE INDEX `idx_availability_date_class`
ON `class_availability` (`available_on`, `class_id`);
CREATE TABLE IF NOT EXISTS `customers` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Contact address and login identity.',
	`full_name` VARCHAR(160) NOT NULL COMMENT 'Name as it appears on the driving licence, because the counter compares the two.',
	`phone` VARCHAR(32) COMMENT 'Contact number used for late returns and roadside assistance.',
	`date_of_birth` DATE NOT NULL COMMENT 'Checked against the class minimum age and the young-driver surcharge threshold.',
	`licence_number` VARCHAR(64) NOT NULL COMMENT 'Driving licence number, recorded on the agreement.',
	`licence_country_code` CHAR(2) NOT NULL COMMENT 'Issuing country, which decides whether an international permit is also required.',
	`licence_expires_on` DATE COMMENT 'Expiry date, checked against the return date rather than the pickup date.',
	`loyalty_number` VARCHAR(32) UNIQUE COMMENT 'Loyalty programme identifier, which usually means skipping the counter entirely.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First booking or registration time.',
	PRIMARY KEY(`id`)
) COMMENT='The renter, who must also be a licensed driver. Licence details live here rather than on the rental because they are verified once and reused, and expiry is a reason to refuse a booking at reservation time.';


CREATE TABLE IF NOT EXISTS `reservations` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`confirmation_code` VARCHAR(12) NOT NULL UNIQUE COMMENT 'Code the customer quotes at the counter.',
	`customer_id` BIGINT NOT NULL COMMENT 'Person who booked. The driver at the counter must be the same person or an added driver.',
	`class_id` BIGINT NOT NULL COMMENT 'Class reserved. Deliberately not a vehicle, because no specific car is promised.',
	`pickup_location_id` BIGINT NOT NULL COMMENT 'Branch the car is collected from.',
	`return_location_id` BIGINT NOT NULL COMMENT 'Branch it is returned to. Equal to pickup for the ordinary case, different for a one-way.',
	`pickup_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Scheduled collection, local to the pickup branch.',
	`return_at` DATETIME NOT NULL COMMENT 'Scheduled return, local to the return branch. Rental days are counted in 24-hour periods from pickup, not calendar days.',
	`rental_days` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Billable 24-hour periods, computed at booking and stored so the quote can be reproduced.',
	`quoted_daily_rate_minor` INTEGER NOT NULL COMMENT 'Daily rate quoted, snapshotted so a later calendar change cannot alter the promise.',
	`one_way_fee_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Drop fee quoted for returning to a different branch. Zero for same-branch rentals.',
	`estimated_total_minor` INTEGER NOT NULL COMMENT 'Quoted total in minor units. An estimate by nature: fuel, mileage and damage are only known at return.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of the quote.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'confirmed' COMMENT 'confirmed | picked_up | completed | cancelled | no_show.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Booking time.',
	`cancelled_at` DATETIME COMMENT 'Cancellation time. Kept rather than deleted, since no-show and cancellation rates drive overbooking policy.',
	PRIMARY KEY(`id`)
) COMMENT='A promise of a class at a branch over a date range. It carries a price but no car, no odometer and no fuel level, because none of those exist until someone hands over a key.';


CREATE INDEX `idx_reservations_pickup`
ON `reservations` (`pickup_location_id`, `pickup_at`);
CREATE INDEX `idx_reservations_customer`
ON `reservations` (`customer_id`, `created_at`);
CREATE INDEX `idx_reservations_status`
ON `reservations` (`status`);
CREATE TABLE IF NOT EXISTS `rentals` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`agreement_number` VARCHAR(16) NOT NULL UNIQUE COMMENT 'Number printed on the signed agreement, which is the legal document rather than the booking.',
	`reservation_id` BIGINT UNIQUE COMMENT 'Originating reservation. Null for a walk-up, and unique so one booking can never produce two agreements. That single nullable column is why reservations and rentals are separate tables.',
	`vehicle_id` BIGINT NOT NULL COMMENT 'Car actually handed over. Assigned at the counter, which is the moment the class becomes a plate.',
	`customer_id` BIGINT NOT NULL COMMENT 'Renter named on the agreement.',
	`pickup_location_id` BIGINT NOT NULL COMMENT 'Branch the car left from.',
	`return_location_id` BIGINT NOT NULL COMMENT 'Branch it came back to, which is not always the branch that was booked.',
	`picked_up_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Actual collection time, which starts the 24-hour billing clock.',
	`due_back_at` DATETIME NOT NULL COMMENT 'Contractual return time. Passing it triggers late fees and, eventually, a recovery process.',
	`returned_at` DATETIME COMMENT 'Actual return. Null while the car is out, which is the cheapest possible open-rental query.',
	`odometer_out` INTEGER NOT NULL COMMENT 'Reading at handover. Kept on the rental rather than only on the vehicle, so a mileage dispute can be settled years later.',
	`odometer_in` INTEGER COMMENT 'Reading at return. The difference is the distance billed against the included allowance.',
	`included_km` INTEGER COMMENT 'Free kilometres for the rental. Null means unlimited, which is a genuinely different thing from zero.',
	`excess_km_rate_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Charge per kilometre over the allowance, in minor units.',
	`fuel_out_eighths` TINYINT NOT NULL DEFAULT 8 COMMENT 'Fuel gauge at handover in eighths, because that is the resolution a counter agent can actually read.',
	`fuel_in_eighths` TINYINT COMMENT 'Gauge at return. The shortfall multiplied by tank capacity is the refuelling charge.',
	`fuel_charge_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Refuelling charge applied at return.',
	`one_way_fee_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Drop fee actually charged, which can differ from the quote if the customer returned somewhere unplanned.',
	`subtotal_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Time, mileage, protection and fees before tax.',
	`taxes_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Taxes and airport concession recovery charges.',
	`total_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Final billed amount in minor units, settled only after the return inspection.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of the charges.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'open' COMMENT 'open | returned | closed | overdue | written_off. Closed means the final invoice is settled.',
	PRIMARY KEY(`id`)
) COMMENT='The signed agreement for a specific car. It exists only from the moment a key changes hands, which is why every measured value here — odometer, fuel, return branch — is absent from the reservation that preceded it.';


CREATE INDEX `idx_rentals_vehicle_time`
ON `rentals` (`vehicle_id`, `picked_up_at`);
CREATE INDEX `idx_rentals_customer_time`
ON `rentals` (`customer_id`, `picked_up_at`);
CREATE INDEX `idx_rentals_overdue_sweep`
ON `rentals` (`status`, `due_back_at`);
CREATE TABLE IF NOT EXISTS `inspections` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`rental_id` BIGINT NOT NULL COMMENT 'Rental being inspected.',
	`vehicle_id` BIGINT NOT NULL COMMENT 'Car inspected. Duplicated from the rental so fleet-wide condition history can be read without joining rentals.',
	`kind` VARCHAR(16) NOT NULL COMMENT 'pickup | return | interim. The pickup row is the baseline that the return row is compared against.',
	`performed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the walk-around happened.',
	`performed_by` VARCHAR(120) COMMENT 'Agent name or staff identifier. Null for a customer-completed digital check-in.',
	`odometer_km` INTEGER NOT NULL COMMENT 'Reading recorded during the inspection, independently of the rental row.',
	`fuel_level_eighths` TINYINT NOT NULL COMMENT 'Gauge reading in eighths at inspection time.',
	`cleanliness` VARCHAR(16) NOT NULL DEFAULT 'acceptable' COMMENT 'clean | acceptable | dirty | biohazard. Only the last two generate a cleaning charge.',
	`notes` TEXT COMMENT 'Free-text observations from the agent.',
	`signature_ref` VARCHAR(200) COMMENT 'Storage key for the customer signature image. Without a signature on the pickup inspection, no damage charge is defensible.',
	PRIMARY KEY(`id`)
) COMMENT='A condition snapshot at a point in time. Pickup and return are two rows rather than two sets of columns, because an interim inspection after an accident is the same kind of record and must slot in between them.';


CREATE INDEX `idx_inspections_rental_kind`
ON `inspections` (`rental_id`, `kind`);
CREATE INDEX `idx_inspections_vehicle_time`
ON `inspections` (`vehicle_id`, `performed_at`);
CREATE TABLE IF NOT EXISTS `damages` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`vehicle_id` BIGINT NOT NULL COMMENT 'Car carrying the damage. It belongs to the car, not to the rental, and outlives every rental.',
	`reported_inspection_id` BIGINT NOT NULL COMMENT 'Inspection that recorded it.',
	`first_seen_inspection_id` BIGINT COMMENT 'Earliest inspection showing the same damage. When this is a previous rental, the current renter cannot be charged, which is the entire reason pre-existing damage is tracked.',
	`charged_rental_id` BIGINT COMMENT 'Rental billed for the repair. Null when the damage is pre-existing, unresolved, or absorbed by the fleet.',
	`panel` VARCHAR(40) NOT NULL COMMENT 'Body area, e.g. front_bumper or nearside_rear_door. Coded so damage can be compared across inspections.',
	`damage_type` VARCHAR(24) NOT NULL DEFAULT 'scratch' COMMENT 'scratch | dent | chip | crack | tear | missing_part | mechanical.',
	`severity` VARCHAR(16) NOT NULL DEFAULT 'minor' COMMENT 'minor | moderate | severe. Drives whether the car can go straight back out.',
	`estimated_repair_minor` INTEGER COMMENT 'Estimated repair cost in minor units. Null until an estimate exists.',
	`currency_code` CHAR(3) COMMENT 'Currency of estimated_repair_minor.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'open' COMMENT 'open | charged | waived | repaired | disputed.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the damage was first recorded.',
	PRIMARY KEY(`id`)
) COMMENT='Damage attaches to the car and only optionally to a rental. Pointing at both the inspection that found it and the inspection that first saw it is what settles the only argument that matters at a rental counter.';


CREATE INDEX `idx_damages_vehicle_status`
ON `damages` (`vehicle_id`, `status`);
CREATE INDEX `idx_damages_charged_rental`
ON `damages` (`charged_rental_id`);
CREATE TABLE IF NOT EXISTS `damage_photos` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`damage_id` BIGINT NOT NULL COMMENT 'Damage the photo evidences.',
	`storage_key` VARCHAR(300) NOT NULL COMMENT 'Object storage key. The bytes never live in the database, only the pointer.',
	`taken_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Capture time from the device, which is what makes the photo evidence rather than illustration.',
	`caption` VARCHAR(200) COMMENT 'Short description, e.g. close-up of the offside wing mirror.',
	`is_primary` BOOLEAN NOT NULL DEFAULT false COMMENT 'The one photo shown in the dispute summary, so nobody has to pick from twelve near-identical shots.',
	PRIMARY KEY(`id`)
) COMMENT='Several photos per damage, which is why this is a table and not a column. A disputed charge is won or lost on a timestamped image from the pickup inspection.';


CREATE INDEX `idx_damage_photos_damage`
ON `damage_photos` (`damage_id`);
CREATE TABLE IF NOT EXISTS `protection_products` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`code` VARCHAR(16) NOT NULL UNIQUE COMMENT 'Short code used on the agreement, e.g. CDW or SLI.',
	`name` VARCHAR(120) NOT NULL COMMENT 'Customer-facing name.',
	`description` TEXT COMMENT 'What it actually covers, which is the part customers never read and later dispute.',
	`kind` VARCHAR(24) NOT NULL COMMENT 'collision_damage | theft | liability | personal_accident | roadside | tyre_and_glass.',
	`daily_price_minor` INTEGER NOT NULL COMMENT 'List price per rental day in minor units.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of daily_price_minor.',
	`excess_reduction_minor` INTEGER COMMENT 'How far the damage excess drops when the product is taken. This number, not the price, is what the product actually sells.',
	`is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'False withdraws it from sale while existing rentals keep their cover.',
	PRIMARY KEY(`id`)
) COMMENT='The catalogue of add-ons. Prices live here as a list price only; what a rental was actually charged is snapshotted on the join, because a product repriced next quarter must not alter a signed agreement.';


CREATE TABLE IF NOT EXISTS `rental_protections` (
	`rental_id` BIGINT COMMENT 'Rental the cover applies to.',
	`product_id` BIGINT COMMENT 'Product taken. Composite key with rental_id, so the same cover cannot be sold twice on one agreement.',
	`daily_price_minor` INTEGER NOT NULL COMMENT 'Price per day as agreed, snapshotted from the catalogue at signing.',
	`days` SMALLINT NOT NULL DEFAULT 1 COMMENT 'Days the cover was bought for, which is normally but not always the whole rental.',
	`total_minor` INTEGER NOT NULL COMMENT 'Charge for this product on this rental, in minor units.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of total_minor.',
	`accepted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the customer accepted. Timing matters because cover added after a collision is not cover.',
	PRIMARY KEY(`rental_id`, `product_id`)
) COMMENT='Join table with a composite primary key and no surrogate id, carrying the agreed price rather than looking it up. It records only what was accepted; a declined product is simply an absent row.';


CREATE TABLE IF NOT EXISTS `one_way_fees` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`pickup_location_id` BIGINT NOT NULL COMMENT 'Branch the car leaves from.',
	`return_location_id` BIGINT NOT NULL COMMENT 'Branch it is dropped at. The pair is the identity of the route.',
	`class_id` BIGINT COMMENT 'Class the fee applies to. Null means it applies to every class, which is the common case.',
	`is_allowed` BOOLEAN NOT NULL DEFAULT true COMMENT 'False forbids the route outright. A prohibition is a row here, not a missing row, so the reason can be recorded and reversed.',
	`fee_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Drop charge in minor units. Zero is a real value and means the route is free, not unpriced.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency of fee_minor.',
	`effective_from` DATE NOT NULL COMMENT 'First day the fee applies. Fees are superseded by new rows rather than edited, so old quotes stay reproducible.',
	`effective_to` DATE COMMENT 'Last day it applies. Null means open-ended.',
	PRIMARY KEY(`id`)
) COMMENT='A fee matrix keyed on the branch pair, because the cost of a one-way rental is really the cost of getting the car home. Directional on purpose: airport to city and city to airport are rarely the same price.';


CREATE INDEX `idx_one_way_route_from`
ON `one_way_fees` (`pickup_location_id`, `return_location_id`, `effective_from`);
ALTER TABLE `vehicles`
ADD FOREIGN KEY(`class_id`) REFERENCES `vehicle_classes`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `vehicles`
ADD FOREIGN KEY(`home_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `vehicles`
ADD FOREIGN KEY(`current_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `class_availability`
ADD FOREIGN KEY(`location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `class_availability`
ADD FOREIGN KEY(`class_id`) REFERENCES `vehicle_classes`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`customer_id`) REFERENCES `customers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`class_id`) REFERENCES `vehicle_classes`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`pickup_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `reservations`
ADD FOREIGN KEY(`return_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `rentals`
ADD FOREIGN KEY(`reservation_id`) REFERENCES `reservations`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `rentals`
ADD FOREIGN KEY(`vehicle_id`) REFERENCES `vehicles`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `rentals`
ADD FOREIGN KEY(`customer_id`) REFERENCES `customers`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `rentals`
ADD FOREIGN KEY(`pickup_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `rentals`
ADD FOREIGN KEY(`return_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `inspections`
ADD FOREIGN KEY(`rental_id`) REFERENCES `rentals`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `inspections`
ADD FOREIGN KEY(`vehicle_id`) REFERENCES `vehicles`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `damages`
ADD FOREIGN KEY(`vehicle_id`) REFERENCES `vehicles`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `damages`
ADD FOREIGN KEY(`reported_inspection_id`) REFERENCES `inspections`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `damages`
ADD FOREIGN KEY(`first_seen_inspection_id`) REFERENCES `inspections`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `damages`
ADD FOREIGN KEY(`charged_rental_id`) REFERENCES `rentals`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `damage_photos`
ADD FOREIGN KEY(`damage_id`) REFERENCES `damages`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `rental_protections`
ADD FOREIGN KEY(`rental_id`) REFERENCES `rentals`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `rental_protections`
ADD FOREIGN KEY(`product_id`) REFERENCES `protection_products`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `one_way_fees`
ADD FOREIGN KEY(`pickup_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `one_way_fees`
ADD FOREIGN KEY(`return_location_id`) REFERENCES `locations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `one_way_fees`
ADD FOREIGN KEY(`class_id`) REFERENCES `vehicle_classes`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
