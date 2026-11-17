CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`email` VARCHAR(320) NOT NULL UNIQUE COMMENT 'Login identity. One account is both buyer and seller, which is how most makers start: they bought here for two years before opening a shop.',
	`display_name` VARCHAR(120) NOT NULL COMMENT 'Public name shown on reviews and favourites.',
	`password_hash` VARCHAR(255) COMMENT 'Argon2id hash. Null for accounts that only ever signed in through a social provider.',
	`country_code` CHAR(2) NOT NULL COMMENT 'ISO 3166-1 alpha-2 country. Used to pick a default currency and to estimate shipping before an address is entered.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation time.',
	PRIMARY KEY(`id`)
) COMMENT='One identity for buyers and sellers. A separate sellers table would duplicate every contact detail and make the common buyer-who-opens-a-shop path a migration.';


CREATE TABLE IF NOT EXISTS `shops` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`owner_id` BIGINT NOT NULL COMMENT 'User who owns the shop. One owner per shop; co-ownership is handled off-platform, which is itself a product decision worth knowing.',
	`name` VARCHAR(120) NOT NULL UNIQUE COMMENT 'Shop name, unique across the marketplace and used as the URL segment. Immutable in practice because it appears in every order receipt.',
	`tagline` VARCHAR(200) COMMENT 'One-line description under the shop banner.',
	`announcement` TEXT COMMENT 'Free-text notice shown at the top of the shop, typically holiday or delay warnings.',
	`currency_code` CHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'ISO 4217 currency every listing in this shop is priced in. A shop is single-currency; buyers see a converted estimate.',
	`country_code` CHAR(2) NOT NULL COMMENT 'Where the shop ships from. Drives the customs and delivery estimate shown to overseas buyers.',
	`vacation_mode` TINYINT NOT NULL DEFAULT 0 COMMENT 'Pauses the whole shop without unlisting anything. Makers take weeks off and unlisting would lose their listing age and favourites.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | vacation | suspended | closed.',
	`opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Shop opening date, shown on the profile as a trust signal.',
	PRIMARY KEY(`id`)
) COMMENT='The seller storefront and the unit almost everything splits by: carts group by it, orders split by it, shipping is configured per shop.';


CREATE INDEX `idx_shops_owner`
ON `shops` (`owner_id`);
CREATE TABLE IF NOT EXISTS `shop_sections` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shop_id` BIGINT NOT NULL COMMENT 'Owning shop.',
	`name` VARCHAR(80) NOT NULL COMMENT 'Section label chosen by the maker, e.g. Rings or Made to Order.',
	`position` INTEGER NOT NULL DEFAULT 0 COMMENT 'Manual sort order in the shop sidebar. Makers reorder these seasonally.',
	`listing_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Denormalised count shown next to the section name. Maintained on listing moves rather than counted on every page load.',
	PRIMARY KEY(`id`)
) COMMENT='Seller-defined navigation, scoped to one shop. Deliberately not a shared taxonomy: makers categorise by material, occasion or mood and no global tree survives that.';


CREATE UNIQUE INDEX `uq_sections_shop_name`
ON `shop_sections` (`shop_id`, `name`);
CREATE TABLE IF NOT EXISTS `shipping_profiles` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shop_id` BIGINT NOT NULL COMMENT 'Owning shop. Profiles are reused across listings, which is the point.',
	`name` VARCHAR(80) NOT NULL COMMENT 'Maker-facing label such as Small parcel UK or Framed print.',
	`origin_country_code` CHAR(2) NOT NULL COMMENT 'Dispatch country. Can differ from the shop country when a maker uses a fulfilment partner abroad.',
	`processing_min_days` INTEGER NOT NULL DEFAULT 1 COMMENT 'Lower bound of the make-and-pack window. For made-to-order work this is the number that sets expectations, not the carrier transit time.',
	`processing_max_days` INTEGER NOT NULL DEFAULT 3 COMMENT 'Upper bound. The promised dispatch date is order date plus this, and missing it is the single biggest source of disputes.',
	`domestic_cost_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Domestic shipping charge in minor units of the shop currency. Integers only - never float money.',
	`international_cost_minor` INTEGER COMMENT 'International charge. Null means this profile does not ship abroad at all.',
	`free_over_minor` INTEGER COMMENT 'Order value at which shipping becomes free. Null when the shop runs no such threshold.',
	PRIMARY KEY(`id`)
) COMMENT='Shipping and processing time as a reusable profile rather than columns on every listing. A maker changing their turnaround for the holidays edits one row, not four hundred.';


CREATE UNIQUE INDEX `uq_shipping_profiles_shop_name`
ON `shipping_profiles` (`shop_id`, `name`);
CREATE TABLE IF NOT EXISTS `listings` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shop_id` BIGINT NOT NULL COMMENT 'Owning shop.',
	`section_id` BIGINT COMMENT 'Shop section. Null for a listing the maker has not filed yet.',
	`shipping_profile_id` BIGINT COMMENT 'Shipping and processing rules. Null only for a digital download, which has neither.',
	`title` VARCHAR(250) NOT NULL COMMENT 'Listing title. Long and keyword-heavy by convention, because on-site search is the main discovery channel.',
	`description` MEDIUMTEXT COMMENT 'Long-form description including materials and care instructions.',
	`base_price_minor` INTEGER NOT NULL COMMENT 'Price before any variation adjustment, in minor units of the shop currency.',
	`quantity` INTEGER NOT NULL DEFAULT 1 COMMENT 'Units available for a ready-to-ship listing. Ignored when made_to_order is set, where capacity is time, not stock.',
	`made_to_order` TINYINT NOT NULL DEFAULT 0 COMMENT 'Item is crafted after purchase. It changes the whole promise: quantity stops meaning anything and processing days become the contract.',
	`is_personalizable` TINYINT NOT NULL DEFAULT 0 COMMENT 'Shows the personalisation box at checkout.',
	`personalization_prompt` VARCHAR(300) COMMENT 'Question asked of the buyer, e.g. Name to engrave. Null unless is_personalizable.',
	`personalization_required` TINYINT NOT NULL DEFAULT 0 COMMENT 'Blocks add-to-cart without an answer. Optional personalisation is the commonest cause of a maker chasing a buyer for a name.',
	`personalization_max_length` INTEGER COMMENT 'Character limit, driven by what physically fits on the object.',
	`state` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft | active | sold_out | expired | inactive. Listings expire on a fixed term and are renewed, which is a billing event for the marketplace.',
	`favorite_count` INTEGER NOT NULL DEFAULT 0 COMMENT 'Denormalised favourites total. Counting the join table on every search result is the first query to fall over.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Listing creation time, also used as the age signal in search ranking.',
	PRIMARY KEY(`id`)
) COMMENT='One handmade item for sale. The personalisation columns sit here rather than in a child table because a listing has exactly one buyer-filled field, however many variations it offers.';


CREATE INDEX `idx_listings_shop_state`
ON `listings` (`shop_id`, `state`);
CREATE INDEX `idx_listings_section`
ON `listings` (`section_id`);
CREATE TABLE IF NOT EXISTS `listing_variations` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`listing_id` BIGINT NOT NULL COMMENT 'Parent listing.',
	`option_name` VARCHAR(60) NOT NULL COMMENT 'Option group such as Size, Chain length or Wood. Free text, because makers invent option names constantly.',
	`option_value` VARCHAR(120) NOT NULL COMMENT 'One choice within the group, e.g. 18 inch. One row per value, which keeps price and stock per choice possible.',
	`price_delta_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Adjustment to the listing base price. Signed, since a smaller size is often cheaper.',
	`quantity` INTEGER COMMENT 'Units of this specific choice. Null means it tracks the listing quantity instead, the normal case for made-to-order.',
	`position` INTEGER NOT NULL DEFAULT 0 COMMENT 'Display order within the option group.',
	`is_available` TINYINT NOT NULL DEFAULT 1 COMMENT 'Hides one choice without deleting it, so a maker who runs out of oak keeps the option for when the wood arrives.',
	PRIMARY KEY(`id`)
) COMMENT='A flat row per option value rather than a pre-computed matrix of combinations. Made-to-order work has no fixed SKU per combination, so materialising the cross product only creates rows nobody stocks.';


CREATE UNIQUE INDEX `uq_variations_listing_option_value`
ON `listing_variations` (`listing_id`, `option_name`, `option_value`);
CREATE TABLE IF NOT EXISTS `favorites` (
	`user_id` BIGINT COMMENT 'User who favourited.',
	`listing_id` BIGINT COMMENT 'Listing favourited. Composite with user_id, which makes the toggle an insert-or-delete with no read first.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When it was favourited. Drives the back-in-stock and price-drop notifications.',
	PRIMARY KEY(`user_id`, `listing_id`)
) COMMENT='A pure join with no surrogate id. Favourites are also a demand signal makers watch closely, which is why the count is denormalised onto listings.';


CREATE INDEX `idx_favorites_listing`
ON `favorites` (`listing_id`);
CREATE TABLE IF NOT EXISTS `cart_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`user_id` BIGINT NOT NULL COMMENT 'Shopper. There is no carts table at all: the cart is just the set of rows for this user.',
	`shop_id` BIGINT NOT NULL COMMENT 'Denormalised from the listing so the cart can be grouped and priced per shop without a join.',
	`listing_id` BIGINT NOT NULL COMMENT 'Item added.',
	`variation_id` BIGINT COMMENT 'Chosen variation. Null for a listing with no options.',
	`quantity` INTEGER NOT NULL DEFAULT 1 COMMENT 'Units requested.',
	`personalization_text` VARCHAR(500) COMMENT 'Buyer answer to the personalisation prompt. Captured in the cart because makers need it before they can quote a dispatch date.',
	`added_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the line was added; old lines are reaped and drive abandoned-cart email.',
	PRIMARY KEY(`id`)
) COMMENT='The cart is a set of lines, not a row. A buyer holds items from five shops at once and checks out once, so grouping by shop_id at checkout is the only cart-level concept needed.';


CREATE INDEX `idx_cart_items_user_shop`
ON `cart_items` (`user_id`, `shop_id`);
CREATE UNIQUE INDEX `uq_cart_items_user_listing_variation`
ON `cart_items` (`user_id`, `listing_id`, `variation_id`);
CREATE TABLE IF NOT EXISTS `orders` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`buyer_id` BIGINT NOT NULL COMMENT 'Shopper who checked out.',
	`order_number` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Human-facing reference for the whole checkout, quoted by support even when four shops were involved.',
	`currency_code` CHAR(3) NOT NULL COMMENT 'Currency the buyer was charged in.',
	`items_total_minor` INTEGER NOT NULL COMMENT 'Sum of every shop order item total.',
	`shipping_total_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Sum of shipping across all shop orders.',
	`tax_total_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Tax collected by the marketplace as facilitator.',
	`grand_total_minor` INTEGER NOT NULL COMMENT 'Single amount authorised. The buyer sees one charge however many makers are involved.',
	`shipping_address` JSON NOT NULL COMMENT 'Address snapshot shared by every shop order in the checkout. Snapshotted so a later address edit cannot rewrite where a parcel went.',
	`payment_reference` VARCHAR(120) UNIQUE COMMENT 'Gateway charge id. Unique so a replayed webhook cannot double-record the money.',
	`placed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Checkout completion time.',
	PRIMARY KEY(`id`)
) COMMENT='The buyer-facing checkout: one payment, one address, one confirmation. It carries no line items, because a line item belongs to a maker.';


CREATE INDEX `idx_orders_buyer_placed`
ON `orders` (`buyer_id`, `placed_at`);
CREATE TABLE IF NOT EXISTS `shop_orders` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`order_id` BIGINT NOT NULL COMMENT 'Parent checkout.',
	`shop_id` BIGINT NOT NULL COMMENT 'Maker responsible for this part.',
	`receipt_number` VARCHAR(32) NOT NULL UNIQUE COMMENT 'Per-shop receipt reference, which is the number the maker and the buyer actually talk about in messages.',
	`status` VARCHAR(24) NOT NULL DEFAULT 'pending' COMMENT 'pending | in_progress | shipped | delivered | cancelled | refunded. in_progress exists because made-to-order work has a visible making phase.',
	`items_total_minor` INTEGER NOT NULL COMMENT 'Sum of this shop item totals.',
	`shipping_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Shipping charged by this shop, from its own shipping profile.',
	`commission_minor` INTEGER NOT NULL DEFAULT 0 COMMENT 'Marketplace fee, frozen at purchase so a later rate change cannot rewrite what the maker was owed.',
	`dispatch_by` DATE NOT NULL COMMENT 'Promised dispatch date, computed from the shipping profile processing window at checkout. The maker deadline.',
	`carrier` VARCHAR(60) COMMENT 'Carrier once shipped.',
	`tracking_number` VARCHAR(80) COMMENT 'Tracking number once assigned. Many handmade parcels genuinely have none.',
	`shipped_at` DATETIME COMMENT 'Handover to the carrier.',
	PRIMARY KEY(`id`)
) COMMENT='One row per shop in a checkout, and the unit of fulfilment, messaging, cancellation and review. A four-shop basket becomes one payment and four independent jobs.';


CREATE INDEX `idx_shop_orders_shop_status`
ON `shop_orders` (`shop_id`, `status`);
CREATE INDEX `idx_shop_orders_order`
ON `shop_orders` (`order_id`);
CREATE TABLE IF NOT EXISTS `shop_order_items` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shop_order_id` BIGINT NOT NULL COMMENT 'Parent shop order.',
	`listing_id` BIGINT COMMENT 'Listing sold. Nullable so an expired listing can be removed without destroying order history.',
	`title` VARCHAR(250) NOT NULL COMMENT 'Listing title snapshot, exactly as shown on the receipt.',
	`variation_summary` VARCHAR(300) COMMENT 'Flattened chosen options such as Size: 18 inch, Wood: oak. Snapshotted because variation rows are edited and deleted constantly.',
	`personalization_text` VARCHAR(500) COMMENT 'The buyer instruction as submitted. This is the manufacturing spec, so it is copied out of the cart rather than referenced.',
	`quantity` INTEGER NOT NULL COMMENT 'Units bought.',
	`unit_price_minor` INTEGER NOT NULL COMMENT 'Base price plus variation delta at purchase time. Never recomputed from the live listing.',
	`total_minor` INTEGER NOT NULL COMMENT 'quantity * unit_price_minor, stored so line arithmetic is auditable.',
	PRIMARY KEY(`id`)
) COMMENT='Immutable lines that double as the work order. For made-to-order items the snapshot columns are what the maker actually reads while making the thing.';


CREATE INDEX `idx_soi_shop_order`
ON `shop_order_items` (`shop_order_id`);
CREATE TABLE IF NOT EXISTS `reviews` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`shop_order_item_id` BIGINT NOT NULL UNIQUE COMMENT 'Purchase being reviewed. Unique, which makes every review verifiable by construction: no purchase, no review, and one review per item.',
	`shop_id` BIGINT NOT NULL COMMENT 'Shop reviewed, denormalised so the shop rating can be aggregated without joining through two order tables.',
	`buyer_id` BIGINT NOT NULL COMMENT 'Reviewer.',
	`rating` TINYINT NOT NULL COMMENT 'One to five stars.',
	`body` TEXT COMMENT 'Review text. Null for a stars-only review.',
	`maker_reply` TEXT COMMENT 'Public reply from the maker. Kept on the review rather than as a comment thread, because exactly one reply is allowed.',
	`status` VARCHAR(16) NOT NULL DEFAULT 'published' COMMENT 'published | held | removed. Held covers reports awaiting moderation.',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Submission time.',
	PRIMARY KEY(`id`)
) COMMENT='A review of one purchased item, which rolls up to the shop rating. Handmade buyers review the making and the packaging as much as the object, so the item is the right anchor.';


CREATE INDEX `idx_reviews_shop_status_created`
ON `reviews` (`shop_id`, `status`, `created_at`);
CREATE TABLE IF NOT EXISTS `review_photos` (
	`id` BIGINT AUTO_INCREMENT COMMENT 'Surrogate primary key.',
	`review_id` BIGINT NOT NULL COMMENT 'Parent review.',
	`image_url` VARCHAR(500) NOT NULL COMMENT 'Object storage URL for the uploaded photo.',
	`position` INTEGER NOT NULL DEFAULT 0 COMMENT 'Display order, since the first photo becomes the thumbnail on the listing page.',
	`width` INTEGER COMMENT 'Pixel width, stored to reserve layout space before the image loads.',
	`height` INTEGER COMMENT 'Pixel height, same reason.',
	`uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Upload time.',
	PRIMARY KEY(`id`)
) COMMENT='Buyer photos as rows, because several per review is normal and they are the most persuasive content on a handmade listing - often reused as social proof on the listing itself.';


CREATE INDEX `idx_review_photos_review_position`
ON `review_photos` (`review_id`, `position`);
ALTER TABLE `shops`
ADD FOREIGN KEY(`owner_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `shop_sections`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shipping_profiles`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `listings`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `listings`
ADD FOREIGN KEY(`section_id`) REFERENCES `shop_sections`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `listings`
ADD FOREIGN KEY(`shipping_profile_id`) REFERENCES `shipping_profiles`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `listing_variations`
ADD FOREIGN KEY(`listing_id`) REFERENCES `listings`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `favorites`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `favorites`
ADD FOREIGN KEY(`listing_id`) REFERENCES `listings`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cart_items`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cart_items`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cart_items`
ADD FOREIGN KEY(`listing_id`) REFERENCES `listings`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cart_items`
ADD FOREIGN KEY(`variation_id`) REFERENCES `listing_variations`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `orders`
ADD FOREIGN KEY(`buyer_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `shop_orders`
ADD FOREIGN KEY(`order_id`) REFERENCES `orders`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shop_orders`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `shop_order_items`
ADD FOREIGN KEY(`shop_order_id`) REFERENCES `shop_orders`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `shop_order_items`
ADD FOREIGN KEY(`listing_id`) REFERENCES `listings`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`shop_order_item_id`) REFERENCES `shop_order_items`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`shop_id`) REFERENCES `shops`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `reviews`
ADD FOREIGN KEY(`buyer_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `review_photos`
ADD FOREIGN KEY(`review_id`) REFERENCES `reviews`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
