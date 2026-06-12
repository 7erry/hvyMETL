import csv
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_BRANDS = 1000             # 1,000 distinct global brands
NUM_PRODUCTS = 5000           # 5,000 base products
HOT_PRODUCT_RATIO = 0.05      # 5% of products are "hot items" with highly skewed review counts
WAREHOUSES = ["WH-EAST", "WH-WEST", "WH-CENTRAL"]

def generate_ecommerce_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled generation for {NUM_PRODUCTS:,} products...")

    # Shared pools for dynamic procedural generation
    brand_prefixes = ["Aero", "Apex", "Nova", "Quantum", "Lux", "Terra", "Infinity", "Summit", "Vertex", "Echo"]
    brand_suffixes = ["Corp", "Labs", "Wear", "Gear", "Tech", "Goods", "Industries", "Designs", "Styles"]
    countries = ["USA", "CAN", "DEU", "JPN", "GBR", "FRA", "AUS", "KOR", "ITA", "ESP"]
    
    colors = ["Black", "White", "Slate Gray", "Navy Blue", "Crimson", "Olive Green", "Silver"]
    sizes = ["XS", "S", "M", "L", "XL", "XXL", "One-Size"]
    
    eav_pool = [
        ("Material", ["Stainless Steel", "100% Cotton", "Premium Leather", "Recycled Plastic", "Aluminum"]),
        ("Warranty", ["1 Year Limited", "2 Year Manufacturer", "Lifetime Warranty"]),
        ("Eco-Friendly", ["Yes", "No"]),
        ("Country of Origin", ["Assembled in USA", "Imported"]),
        ("Water Resistance", ["IP67 Certified", "30m Atmospheric", "None"])
    ]
    
    review_templates = [
        (5, "Absolutely loved it!", "Exceeded my expectations. Build quality is phenomenal and it works perfectly."),
        (4, "Great value for money", "Solid product overall. Minor shipping delay but the item itself is excellent."),
        (3, "Average product", "It does what it says, but nothing spectacular. Decent for the price."),
        (2, "Disappointed", "Had higher hopes. Material feels a bit cheap and it didn't fit right."),
        (1, "Do not buy", "Arrived broken. Customer service was slow to respond. Would not recommend.")
    ]
    reviewer_names = ["John D.", "Sarah M.", "David K.", "Elena R.", "Alex P.", "Emma W.", "Michael T.", "Lisa C."]

    # -------------------------------------------------------------------------
    # 1. Generate Brands (1,000 rows)
    # -------------------------------------------------------------------------
    print("Writing brands.csv...")
    brand_ids = list(range(1, NUM_BRANDS + 1))
    with open('brands.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name', 'country', 'website'])
        
        for b_id in brand_ids:
            name = f"{random.choice(brand_prefixes)}{random.choice(brand_suffixes)} {b_id}"
            country = random.choice(countries)
            website = f"https://www.{name.lower().replace(' ', '')}.com"
            writer.writerow([b_id, name, country, website])

    # -------------------------------------------------------------------------
    # 2. Generate Hierarchical Tree Categories (~1,110 rows)
    # -------------------------------------------------------------------------
    print("Writing categories.csv (Self-referencing tree structure)...")
    leaf_category_ids = []
    category_id_counter = 1
    
    root_categories = ["Electronics", "Apparel", "Home & Kitchen", "Sports & Outdoors", "Beauty"]
    sub_categories = {
        "Electronics": ["Computers", "Audio", "Phones"],
        "Apparel": ["Men's Clothing", "Women's Clothing", "Footwear"],
        "Home & Kitchen": ["Cookware", "Furniture", "Appliances"],
        "Sports & Outdoors": ["Fitness", "Camping", "Cycling"],
        "Beauty": ["Skincare", "Haircare", "Makeup"]
    }
    leaf_categories = {
        "Computers": ["Laptops", "Desktops"], "Audio": ["Headphones", "Speakers"], "Phones": ["Smartphones", "Cases"],
        "Men's Clothing": ["Shirts", "Jeans"], "Women's Clothing": ["Dresses", "Skirts"], "Footwear": ["Sneakers", "Boots"],
        "Cookware": ["Pots & Pans", "Bakeware"], "Furniture": ["Chairs", "Tables"], "Appliances": ["Blenders", "Microwaves"],
        "Fitness": ["Treadmills", "Dumbbells"], "Camping": ["Tents", "Sleeping Bags"], "Cycling": ["Bikes", "Helmets"],
        "Skincare": ["Moisturizers", "Serums"], "Haircare": ["Shampoos", "Conditioners"], "Makeup": ["Lipstick", "Foundation"]
    }

    with open('categories.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'parent_id', 'name', 'slug'])
        
        # Level 1: Roots (parent_id is empty/NULL)
        for root in root_categories:
            root_id = category_id_counter
            root_slug = root.lower().replace(" & ", "-").replace(" ", "-")
            writer.writerow([root_id, "", root, root_slug])
            category_id_counter += 1
            
            # Level 2: Subcategories
            for sub in sub_categories[root]:
                sub_id = category_id_counter
                sub_slug = sub.lower().replace("'", "").replace(" ", "-")
                writer.writerow([sub_id, root_id, sub, sub_slug])
                category_id_counter += 1
                
                # Level 3: Leaf Categories (Where products actually live)
                for leaf in leaf_categories[sub]:
                    leaf_id = category_id_counter
                    leaf_slug = leaf.lower().replace(" & ", "-").replace(" ", "-")
                    writer.writerow([leaf_id, sub_id, leaf, leaf_slug])
                    leaf_category_ids.append(leaf_id)
                    category_id_counter += 1

    # -------------------------------------------------------------------------
    # 3. Stream Products, Variants, Inventory, EAV, and Skewed Reviews (Millions combined)
    # -------------------------------------------------------------------------
    print("Simulating Catalog Generation (Streaming related rows sequentially)...")
    
    variant_id_counter = 1
    eav_id_counter = 1
    review_id_counter = 1
    
    # Establish which random product IDs will be "hot outliers" for skewed review volumes
    hot_products = set(random.sample(range(1, NUM_PRODUCTS + 1), int(NUM_PRODUCTS * HOT_PRODUCT_RATIO)))

    with open('products.csv', mode='w', newline='', encoding='utf-8') as f_prod, \
         open('product_variants.csv', mode='w', newline='', encoding='utf-8') as f_var, \
         open('product_attributes.csv', mode='w', newline='', encoding='utf-8') as f_attr, \
         open('reviews.csv', mode='w', newline='', encoding='utf-8') as f_rev, \
         open('inventory_levels.csv', mode='w', newline='', encoding='utf-8') as f_inv:
         
        prod_writer = csv.writer(f_prod)
        var_writer = csv.writer(f_var)
        attr_writer = csv.writer(f_attr)
        rev_writer = csv.writer(f_rev)
        inv_writer = csv.writer(f_inv)
        
        # Write Headers exactly matching the DDL
        prod_writer.writerow(['id', 'brand_id', 'category_id', 'sku', 'name', 'description', 'base_price_cents', 'currency', 'is_active', 'created_at'])
        var_writer.writerow(['id', 'product_id', 'variant_sku', 'color', 'size', 'price_cents', 'weight_grams'])
        attr_writer.writerow(['id', 'product_id', 'attr_key', 'attr_value'])
        rev_writer.writerow(['id', 'product_id', 'reviewer_name', 'stars', 'title', 'body', 'created_at'])
        inv_writer.writerow(['id', 'variant_id', 'warehouse_code', 'quantity_on_hand', 'updated_at'])
        
        for p_id in range(1, NUM_PRODUCTS + 1):
            # A. Base Product Details
            brand_id = random.choice(brand_ids)
            category_id = random.choice(leaf_category_ids)
            sku = f"PROD-{random.randint(100, 999)}-{p_id:04d}"
            name = f"Premium Utility Item Block {p_id}"
            description = f"High-performance catalog item matching product identifier reference code {p_id}."
            base_price_cents = random.randint(1500, 25000) # $15.00 to $250.00
            is_active = 1 if random.random() > 0.08 else 0
            created_at = (datetime.now() - timedelta(days=random.randint(10, 500))).strftime("%Y-%m-%d %H:%M:%S")
            
            prod_writer.writerow([p_id, brand_id, category_id, sku, name, description, base_price_cents, 'USD', is_active, created_at])
            
            # B. Product Variants & Inventory Level Child Links (Parallel Write)
            num_variants = random.randint(2, 5)
            for v_idx in range(1, num_variants + 1):
                v_sku = f"{sku}-VAR{v_idx}"
                color = random.choice(colors)
                size = random.choice(sizes)
                # Variant price fluctuates slightly around base price
                price_cents = base_price_cents + random.choice([-500, 0, 1000, 2500])
                if price_cents < 500: price_cents = base_price_cents # fallback boundary
                weight_grams = random.randint(150, 4500)
                
                var_writer.writerow([variant_id_counter, p_id, v_sku, color, size, price_cents, weight_grams])
                
                # Multi-Warehouse Inventory Rows for this specific variant
                for wh in WAREHOUSES:
                    qty = random.choices([0, random.randint(5, 120)], weights=[0.10, 0.90], k=1)[0]
                    updated_at = (datetime.now() - timedelta(hours=random.randint(1, 72))).strftime("%Y-%m-%d %H:%M:%S")
                    inv_writer.writerow([variant_id_counter, variant_id_counter, wh, qty, updated_at])
                    
                variant_id_counter += 1

            # C. Entity-Attribute-Value Sparse Metadata (Product Attributes)
            # Pick a subset of keys to represent sparse EAV properties
            assigned_attrs = random.sample(eav_pool, k=random.randint(1, 3))
            for key, val_options in assigned_attrs:
                attr_writer.writerow([eav_id_counter, p_id, key, random.choice(val_options)])
                eav_id_counter += 1

            # D. Skewed Review Distribution Outliers (Power-Law Simulation)
            if p_id in hot_products:
                # Hot products get bombed with reviews (50 to 150 reviews)
                num_reviews = random.randint(50, 150)
            else:
                # Normal products get realistic organic counts (65% get 0 reviews, 35% get 1-3)
                num_reviews = random.choices([0, random.randint(1, 3)], weights=[0.65, 0.35], k=1)[0]
                
            for _ in range(num_reviews):
                stars, title, body = random.choice(review_templates)
                # Add slight variation to stars based on item performance bias
                if p_id in hot_products and random.random() > 0.15: 
                    stars = random.choice([4, 5]) # Hot items trend higher
                    
                reviewer = f"{random.choice(reviewer_names)} {random.randint(10,99)}"
                rev_date = (datetime.now() - timedelta(days=random.uniform(1, 180))).strftime("%Y-%m-%d %H:%M:%S")
                
                rev_writer.writerow([review_id_counter, p_id, reviewer, stars, title, body, rev_date])
                review_id_counter += 1
                
            if p_id % 1000 == 0:
                print(f"... flushed records up to Product ID {p_id:,} to disk")

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("E-COMMERCE CATALOG GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - brands.csv            : {NUM_BRANDS:,} rows")
    print(f" - categories.csv        : {category_id_counter - 1:,} rows (Hierarchical Tree)")
    print(f" - products.csv          : {NUM_PRODUCTS:,} rows")
    print(f" - product_variants.csv  : {variant_id_counter - 1:,} rows")
    print(f" - inventory_levels.csv  : {(variant_id_counter - 1) * len(WAREHOUSES):,} rows")
    print(f" - product_attributes.csv: {eav_id_counter - 1:,} rows (Sparse EAV format)")
    print(f" - reviews.csv           : {review_id_counter - 1:,} rows (Skewed Outlier distribution)")
    print("="*50)

if __name__ == "__main__":
    generate_ecommerce_dataset()
