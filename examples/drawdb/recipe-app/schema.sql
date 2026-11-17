/* A recipe. The sync columns are on the table rather than in a side journal because a phone database has to answer what changed with one index scan while the app is being killed in the background. */
CREATE TABLE IF NOT EXISTS "recipes" (
	-- Surrogate primary key. INTEGER PRIMARY KEY is the SQLite rowid alias, which is the only truly free index in the file.
	"id" INTEGER,
	-- Server UUID once the row has been synced. Null for a recipe created offline that has never reached a server, which is the normal state on day one.
	"remote_id" VARCHAR UNIQUE,
	-- Recipe name as the cook typed it.
	"title" VARCHAR NOT NULL,
	-- Short blurb shown under the title in lists.
	"summary" TEXT,
	-- Where it was imported from. Kept so a clipped recipe can be re-fetched when the parse was imperfect.
	"source_url" TEXT,
	-- Yield the quantities below are written for. Every scaling operation in the app is a ratio against this number.
	"servings" INTEGER NOT NULL DEFAULT 4,
	-- Hands-on time. Null when unknown, which is most imported recipes.
	"prep_minutes" INTEGER,
	-- Unattended time. Kept apart from prep because a cook planning an evening cares about the difference.
	"cook_minutes" INTEGER,
	-- easy | medium | hard. Null when the source did not say.
	"difficulty" VARCHAR,
	-- Cover photo bytes, stored in the file. On a phone this avoids a second cache directory to keep in step with the database; over a few hundred kB it should be a path instead.
	"image_blob" BLOB,
	-- Local creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Last local edit. The whole sync story is built on this column plus is_dirty.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- True when the local row has changes the server has not seen. Set on every write, cleared only by a successful push.
	"is_dirty" BOOLEAN NOT NULL DEFAULT true,
	-- Soft delete. A row deleted offline has to survive long enough to tell the server about it, so nothing is ever removed outright.
	"deleted_at" TIMESTAMP,
	PRIMARY KEY("id")
);

CREATE INDEX IF NOT EXISTS "idx_recipes_live_updated"
ON "recipes" ("deleted_at", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_recipes_dirty"
ON "recipes" ("is_dirty");
/* The shared vocabulary of the app. Recipes point here rather than storing free text, and that single decision is what makes merged shopping lists and pantry matching possible at all. */
CREATE TABLE IF NOT EXISTS "ingredients" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Canonical name, e.g. plain flour. One row per thing you can buy, not per mention in a recipe.
	"name" VARCHAR NOT NULL,
	-- Lowercased, singularised, punctuation stripped. This is the column that makes flour, Flour and flours merge into one shopping line.
	"normalized_name" VARCHAR NOT NULL UNIQUE,
	-- Supermarket section, e.g. produce or baking. Purely so the generated list sorts into the order a person walks a shop.
	"aisle" VARCHAR,
	-- Unit this is usually measured in. Used when the app has to guess, e.g. when a step says a pinch.
	"default_unit_id" INTEGER,
	-- Mass per millilitre. The one number that turns a volume into a weight when no ingredient-specific conversion exists.
	"density_g_per_ml" REAL,
	-- Salt, oil, pepper. Excluded from generated lists by default, because nobody wants to buy salt every week.
	"is_pantry_staple" BOOLEAN NOT NULL DEFAULT false,
	PRIMARY KEY("id"),
	FOREIGN KEY ("default_unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

/* A unit of measure with a factor into its own base. Self-referencing rather than a hardcoded enum so a user can add a unit the app authors never thought of, such as a Japanese go of rice. */
CREATE TABLE IF NOT EXISTS "units" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Full name, e.g. tablespoon.
	"name" VARCHAR NOT NULL UNIQUE,
	-- What is printed in the ingredient line, e.g. tbsp.
	"abbreviation" VARCHAR NOT NULL,
	-- mass | volume | count | length. Conversions are only ever attempted within a kind, or through an ingredient density.
	"kind" VARCHAR NOT NULL,
	-- metric | imperial | universal. Drives the display toggle; the stored numbers never change when the toggle flips.
	"system" VARCHAR NOT NULL,
	-- Reference unit for this kind, e.g. gram for mass. Null on the base unit itself, which is how the chain terminates.
	"base_unit_id" INTEGER,
	-- Multiplier into the base unit. 1 tbsp is 14.7868 ml. REAL is right here: this is a measurement, not money.
	"to_base_factor" REAL NOT NULL DEFAULT 1,
	PRIMARY KEY("id"),
	FOREIGN KEY ("base_unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_units_kind_system"
ON "units" ("kind", "system");
/* Volume to mass is not a property of a unit, it is a property of an ingredient. This table holds those pairs, with the general rules sharing the same shape under a null ingredient so the lookup is one query with a fallback. */
CREATE TABLE IF NOT EXISTS "unit_conversions" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Ingredient this conversion is specific to. Null makes it a general rule such as litres to millilitres.
	"ingredient_id" INTEGER,
	-- Unit being converted out of.
	"from_unit_id" INTEGER NOT NULL,
	-- Unit being converted into.
	"to_unit_id" INTEGER NOT NULL,
	-- Multiply the quantity by this. One cup of flour is 120 g and one cup of sugar is 200 g, which is exactly why this table exists and why a global cup-to-gram factor is a bug.
	"factor" REAL NOT NULL,
	-- builtin | user | imported. A user correction must win over a shipped default without being overwritten on the next app update.
	"source" VARCHAR NOT NULL DEFAULT 'builtin',
	PRIMARY KEY("id"),
	FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("from_unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("to_unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_unit_conversions_triple"
ON "unit_conversions" ("ingredient_id", "from_unit_id", "to_unit_id");
/* One quantified line of a recipe. Quantity, unit and ingredient are three columns rather than one string, and that is the price of admission for scaling, merging and pantry matching. */
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Parent recipe.
	"recipe_id" INTEGER NOT NULL,
	-- What to buy.
	"ingredient_id" INTEGER NOT NULL,
	-- Unit the quantity is in. Null for a bare count, e.g. 2 eggs.
	"unit_id" INTEGER,
	-- How much, for the recipe stated servings. Null for the to taste case, which must stay distinct from zero.
	"quantity" NUMERIC,
	-- Upper bound when the recipe says 2 to 3 cloves. Null for a single value. Shopping lists round up to this; scaling uses the lower.
	"quantity_max" NUMERIC,
	-- State required, e.g. finely chopped. Kept apart from the ingredient name so 200 g of onion still merges across recipes that chop it differently.
	"preparation" VARCHAR,
	-- Heading within the recipe, e.g. For the sauce. Null for the main list.
	"group_label" VARCHAR,
	-- Excluded from generated shopping lists unless the cook opts in.
	"is_optional" BOOLEAN NOT NULL DEFAULT false,
	-- Display order, which is the order a cook lays things out.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- The original line as imported, e.g. a generous handful of parsley. Kept so a bad parse is visible and correctable instead of silently wrong.
	"raw_text" VARCHAR,
	PRIMARY KEY("id"),
	FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
	ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY ("unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_recipe_position"
ON "recipe_ingredients" ("recipe_id", "position");

CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_ingredient"
ON "recipe_ingredients" ("ingredient_id");
/* An ordered instruction with an optional timer. Timers are structured data rather than parsed out of the prose at read time, because parsing has to be right every time and a column only has to be filled in once. */
CREATE TABLE IF NOT EXISTS "recipe_steps" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Parent recipe.
	"recipe_id" INTEGER NOT NULL,
	-- Step number. Not a stored label, so inserting a step renumbers by reordering rather than by rewriting text.
	"position" INTEGER NOT NULL,
	-- What to do, in prose.
	"instruction" TEXT NOT NULL,
	-- Duration the app offers as a one-tap timer. Null for a step with no waiting. Seconds rather than minutes because 90 seconds is a real instruction.
	"timer_seconds" INTEGER,
	-- What the timer is for, e.g. simmer. Shown on the lock screen, where simmer is far more useful than step 4.
	"timer_label" VARCHAR,
	-- True when the cook is free during this step, e.g. resting dough. Total active time is the sum of the rest, which is the number worth showing.
	"is_passive" BOOLEAN NOT NULL DEFAULT false,
	-- Optional step photo bytes.
	"image_blob" BLOB,
	PRIMARY KEY("id"),
	FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recipe_steps_recipe_position"
ON "recipe_steps" ("recipe_id", "position");
/* A dated stretch of cooking. Plans are separate rows rather than a flag on entries so last week can be duplicated into next week in one insert-select. */
CREATE TABLE IF NOT EXISTS "meal_plans" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- What the cook calls it, e.g. Week of 3 March.
	"name" VARCHAR NOT NULL,
	-- First day covered. A DATE, not a timestamp: a meal belongs to a calendar day, and converting to instants is what makes Sunday dinner appear on Monday after a flight.
	"start_date" DATE NOT NULL,
	-- Last day covered, inclusive. Stored rather than derived so a plan can be four days or three weeks.
	"end_date" DATE NOT NULL,
	-- Default servings for entries in this plan. Scaling every recipe to this is the point of the plan.
	"household_size" INTEGER NOT NULL DEFAULT 2,
	-- Local creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Sync flag, same contract as on recipes.
	"is_dirty" BOOLEAN NOT NULL DEFAULT true,
	PRIMARY KEY("id")
);

/* One recipe on one day in one slot. The nullable recipe is deliberate: a plan that cannot express takeaway on Friday gets abandoned by the second week. */
CREATE TABLE IF NOT EXISTS "meal_plan_entries" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Plan this sits in.
	"meal_plan_id" INTEGER NOT NULL,
	-- Recipe planned. Null for a placeholder such as leftovers or eating out, which still occupies the slot and still must not generate shopping.
	"recipe_id" INTEGER,
	-- Calendar day this meal is for.
	"plan_date" DATE NOT NULL,
	-- breakfast | lunch | dinner | snack. A small vocabulary rather than a time, because nobody plans dinner for 19:30.
	"meal_slot" VARCHAR NOT NULL,
	-- Servings wanted, which drives the scaling ratio against recipes.servings. Defaulted from the plan but overridable, because Saturday has guests.
	"servings" INTEGER NOT NULL,
	-- Free text, e.g. double it for lunches.
	"note" VARCHAR,
	-- Order within a slot when two things are cooked for the same meal.
	"position" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_plan_entries_plan_date_slot"
ON "meal_plan_entries" ("meal_plan_id", "plan_date", "meal_slot");
/* A generated or hand-made shopping list. Freezing it at generation time is the important decision: a list is a thing you take to a shop, not a live query over a plan. */
CREATE TABLE IF NOT EXISTS "shopping_lists" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Plan the list was generated from. Null for a list someone started by hand.
	"meal_plan_id" INTEGER,
	-- Label, e.g. Big shop.
	"name" VARCHAR NOT NULL,
	-- When the merge ran. A list is a snapshot: editing the plan afterwards does not silently rewrite a list someone is standing in a shop with.
	"generated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- active | completed | archived.
	"status" VARCHAR NOT NULL DEFAULT 'active',
	-- Whether generation subtracted what is already in the pantry. Stored because it explains why the list looks short.
	"deduct_pantry" BOOLEAN NOT NULL DEFAULT true,
	PRIMARY KEY("id"),
	FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

/* One thing to buy, already merged. Storing the merged number rather than recomputing it means the list stays stable while you shop, and source_count keeps the merge explainable. */
CREATE TABLE IF NOT EXISTS "shopping_list_items" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Parent list.
	"shopping_list_id" INTEGER NOT NULL,
	-- Ingredient to buy. Null for a manual line such as birthday candles.
	"ingredient_id" INTEGER,
	-- Unit of the merged quantity. Null for a counted item or a manual line.
	"unit_id" INTEGER,
	-- Merged amount across every recipe that asked for it, already converted into one unit. Null for a manual line or a to taste ingredient that still needs buying.
	"quantity" NUMERIC,
	-- Free text for a line with no ingredient behind it.
	"manual_text" VARCHAR,
	-- How many recipe lines were merged into this one. Shown as used in 3 recipes, and it is what lets a cook understand a surprisingly large number.
	"source_count" INTEGER NOT NULL DEFAULT 1,
	-- Amount subtracted because it was already in the pantry. Kept separate from quantity so the cook can see the maths and override it when the jar is nearly empty.
	"pantry_deducted" NUMERIC,
	-- Aisle snapshot from the ingredient, so the list keeps its shop order even if the ingredient is recategorised later.
	"aisle" VARCHAR,
	-- Ticked off in the shop. The single most frequently written column in the whole database.
	"is_checked" BOOLEAN NOT NULL DEFAULT false,
	-- Manual order within an aisle.
	"position" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_list_items_list_aisle_position"
ON "shopping_list_items" ("shopping_list_id", "aisle", "position");
/* What is already in the house. It is the input to list generation and it is always slightly wrong, which is why the deduction it causes is recorded separately on the list line rather than folded into the quantity. */
CREATE TABLE IF NOT EXISTS "pantry_items" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- What is in the cupboard.
	"ingredient_id" INTEGER NOT NULL,
	-- Unit of quantity. Null for a rough count, e.g. three onions.
	"unit_id" INTEGER,
	-- How much is left. Null means present but unmeasured, which is the honest state of most jars and must not be read as zero.
	"quantity" NUMERIC,
	-- pantry | fridge | freezer. Drives the expiry warning threshold more than anything else.
	"location" VARCHAR,
	-- Best before date. Null when there is not one or nobody typed it.
	"expires_on" DATE,
	-- When the packet was opened, which is what actually determines how long it lasts.
	"opened_on" DATE,
	-- Last adjustment. Stale rows are the main source of wrong deductions, so the app greys anything untouched for months.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("unit_id") REFERENCES "units"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_pantry_items_ingredient"
ON "pantry_items" ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_pantry_items_expires"
ON "pantry_items" ("expires_on");
/* A starred recipe. Modelled as a table rather than a boolean on recipes so the ordering, the collection and the timestamp have somewhere to live, and so the row disappears entirely when unstarred. */
CREATE TABLE IF NOT EXISTS "favorites" (
	-- Recipe favourited. Also the primary key: a single-user local app has exactly one favourites list, so there is no second column to make composite.
	"recipe_id" INTEGER,
	-- Optional grouping, e.g. Weeknight. Null for a plain favourite.
	"collection" VARCHAR,
	-- Manual order, because a favourites list people reorder by hand is the one list they trust.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- When it was starred, used as the default sort before anyone reorders anything.
	"favorited_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("recipe_id"),
	FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_favorites_collection_position"
ON "favorites" ("collection", "position");
