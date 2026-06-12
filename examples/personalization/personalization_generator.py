import csv
import json
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_PROFILES = 3000           # 3,000 distinct user profiles
NUM_ITEMS = 1500              # 1,500 catalog items to track for affinities
TOP_N_RECOMMENDATIONS = 5      # Generates a bounded subset of top recommendations per user

def generate_personalization_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled Personalization Engine generation for {NUM_PROFILES:,} profiles...")

    # Shared pools for dynamic procedural generation
    locales = ["en-US", "en-US", "en-GB", "de-DE", "fr-FR", "ja-JP", "es-ES", "zh-CN"]
    item_types = ["electronics", "apparel", "home_goods", "books", "fitness", "entertainment"]
    
    item_adjectives = ["Smart", "Ultra", "Premium", "Wireless", "Eco", "Classic", "Vintage", "Ergonomic"]
    item_nouns = ["Hub", "Pack", "Device", "Apparel", "Kit", "Console", "Monitor", "Tracker", "Gear"]
    
    trait_pool = [
        ("preferred_category", ["electronics", "apparel", "home_goods", "books", "fitness"]),
        ("acquisition_channel", ["google_ads", "organic_search", "referral_link", "influencer_campaign"]),
        ("device_primary", ["mobile_ios", "mobile_android", "desktop_chrome", "desktop_safari"]),
        ("lifecycle_stage", ["new_user", "active_shopper", "dormant", "loyal_vip"]),
        ("subscription_status", ["tier_0_free", "tier_1_premium", "tier_2_enterprise"])
    ]
    
    rec_reasons = [
        "Based on your recent viewing history",
        "Frequently purchased together with items in your cart",
        "Trending item in your preferred category",
        "Highly rated by users with similar profiles",
        "New arrival matching your brand affinities"
    ]

    # -------------------------------------------------------------------------
    # 1. Generate Segments (Defined Rule Criteria)
    # -------------------------------------------------------------------------
    print("Writing segments.csv...")
    segments_data = [
        (1, "High Affluence Shoppers", {"min_lifetime_value_cents": 50000, "preferred_locales": ["en-US", "en-GB"]}),
        (2, "Tech Enthusiasts", {"required_traits": {"preferred_category": "electronics"}, "interaction_weight": 2.5}),
        (3, "Dormant Risk Profiles", {"days_since_last_interaction_gt": 14, "exclude_plan": "tier_2_enterprise"}),
        (4, "Active Mobile Churn Candidate", {"primary_device": ["mobile_ios", "mobile_android"], "activity_score_lt": 0.35}),
        (5, "International Trendsetters", {"exclude_locales": ["en-US"], "affinity_threshold": 0.75})
    ]
    
    with open('segments.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name', 'rule_json'])
        for seg_id, name, rule in segments_data:
            writer.writerow([seg_id, name, json.dumps(rule)])

    # -------------------------------------------------------------------------
    # 2. Generate Items (1,000s of rows)
    # -------------------------------------------------------------------------
    print("Writing items.csv...")
    item_ids = list(range(1, NUM_ITEMS + 1))
    
    with open('items.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'external_item_id', 'title', 'item_type', 'metadata_json'])
        
        for i_id in item_ids:
            ext_item_id = f"item_{random.getrandbits(32):08x}_{i_id}"
            i_type = random.choice(item_types)
            title = f"{random.choice(item_adjectives)} {random.choice(item_nouns)} (Model {i_id})"
            
            # Pack nested metadata properties for validation testing
            meta = {
                "sku_reference": f"SKU-{random.randint(100,999)}-{i_id}",
                "inventory_status": random.choices(["in_stock", "low_stock", "backorder"], weights=[0.80, 0.15, 0.05])[0],
                "margin_rating": round(random.uniform(0.10, 0.65), 2)
            }
            
            writer.writerow([i_id, ext_item_id, title, i_type, json.dumps(meta)])

    # -------------------------------------------------------------------------
    # 3. Stream Profiles, Sparse Traits, and Segment Enrollments
    # -------------------------------------------------------------------------
    print("Streaming master profile rows with sparse trait and segment child entries...")
    
    trait_id_counter = 1
    prof_seg_id_counter = 1
    profiles_meta = [] # Store minimal metadata lookup matrix: [id, created_at_dt]
    
    with open('profiles.csv', mode='w', newline='', encoding='utf-8') as f_prof, \
         open('profile_traits.csv', mode='w', newline='', encoding='utf-8') as f_traits, \
         open('profile_segments.csv', mode='w', newline='', encoding='utf-8') as f_prof_segs:
         
        prof_writer = csv.writer(f_prof)
        trait_writer = csv.writer(f_traits)
        pseg_writer = csv.writer(f_prof_segs)
        
        # Write Headers exactly matching the DDL
        prof_writer.writerow(['id', 'external_user_id', 'email', 'locale', 'created_at'])
        trait_writer.writerow(['id', 'profile_id', 'trait_key', 'trait_value', 'observed_at'])
        pseg_writer.writerow(['id', 'profile_id', 'segment_id', 'entered_at'])
        
        for p_id in range(1, NUM_PROFILES + 1):
            ext_user_id = f"usr_{random.getrandbits(40):010x}_{p_id}"
            email = f"user_{p_id}@personalization-labs.internal"
            locale = random.choice(locales)
            
            # Users created sequentially over a historical window
            created_dt = datetime.now() - timedelta(days=random.randint(15, 120))
            created_at_str = created_dt.strftime("%Y-%m-%d %H:%M:%S")
            
            prof_writer.writerow([p_id, ext_user_id, email, locale, created_at_str])
            profiles_meta.append({"id": p_id, "created_at": created_dt})
            
            # A. ATTRIBUTE MODEL: Sparse profile characteristics (EAV layout)
            # Users get a random sub-selection of traits to represent sparsity
            assigned_traits = random.sample(trait_pool, k=random.randint(1, 4))
            for key, val_options in assigned_traits:
                # Traits are observed shortly after profile setup
                obs_dt = created_dt + timedelta(hours=random.uniform(0.5, 48))
                trait_writer.writerow([trait_id_counter, p_id, key, random.choice(val_options), obs_dt.strftime("%Y-%m-%d %H:%M:%S")])
                trait_id_counter += 1
                
            # B. Segment Allocations mapping profile records
            # ~45% probability that a profile fits one or more engine rulesets
            if random.random() < 0.45:
                for seg_id, _, _ in random.sample(segments_data, k=random.randint(1, 2)):
                    entered_dt = created_dt + timedelta(days=random.uniform(1, 5))
                    pseg_writer.writerow([prof_seg_id_counter, p_id, seg_id, entered_dt.strftime("%Y-%m-%d %H:%M:%S")])
                    prof_seg_id_counter += 1
                    
            if p_id % 1000 == 0:
                print(f"... written {p_id:,} user profile relational graphs")

    # -------------------------------------------------------------------------
    # 4. Stream Affinities and Top-N Recommendations (Millions combined)
    # -------------------------------------------------------------------------
    print(f"Streaming high-velocity affinities.csv and top-{TOP_N_RECOMMENDATIONS} recommendations.csv...")
    
    affinity_id_counter = 1
    rec_id_counter = 1
    
    with open('affinities.csv', mode='w', newline='', encoding='utf-8') as f_aff, \
         open('recommendations.csv', mode='w', newline='', encoding='utf-8') as f_rec:
         
        aff_writer = csv.writer(f_aff)
        rec_writer = csv.writer(f_rec)
        
        aff_writer.writerow(['id', 'profile_id', 'item_id', 'score', 'interaction_count', 'last_interaction_at'])
        rec_writer.writerow(['id', 'profile_id', 'item_id', 'rank', 'reason', 'generated_at'])
        
        for p_meta in profiles_meta:
            profile_id = p_meta["id"]
            
            # COMPUTED MODEL: Select a subset of items this user interacted with (5 to 15 items per user)
            num_interactions = random.randint(5, 15)
            interacted_items = random.sample(item_ids, k=num_interactions)
            
            user_affinity_tracker = [] # Track items and scores to determine subset recommendation placement
            
            for item_id in interacted_items:
                interaction_count = random.randint(1, 45)
                
                # Base math logic for affinity calculation model walk:
                # Score scales positively with counts, plus a randomized engagement weight variance
                raw_score = (interaction_count * 0.15) + random.uniform(0.05, 3.2)
                score = round(min(raw_score, 10.0), 4) # bound ceiling to 10.0000
                
                # Interactions occur forward from profile creation milestone
                last_inter_dt = p_meta["created_at"] + timedelta(days=random.uniform(0.1, 10))
                last_inter_str = last_inter_dt.strftime("%Y-%m-%d %H:%M:%S")
                
                aff_writer.writerow([affinity_id_counter, profile_id, item_id, score, interaction_count, last_inter_str])
                
                user_affinity_tracker.append({"item_id": item_id, "score": score, "time": last_inter_dt})
                affinity_id_counter += 1
                
            # SUBSET MODEL: Top-N Recommendations per user profile
            # Sort the interacted items by their computed affinity scores descending to pick top options
            user_affinity_tracker.sort(key=lambda x: x["score"], reverse=True)
            
            # Grab top items up to our TOP_N limit configuration
            top_rec_items = user_affinity_tracker[:TOP_N_RECOMMENDATIONS]
            
            for rank_idx, aff_node in enumerate(top_rec_items):
                rank = rank_idx + 1
                reason = random.choice(rec_reasons)
                
                # Recommendations are evaluated shortly after the last known interaction walk milestone
                gen_dt = aff_node["time"] + timedelta(hours=random.uniform(1, 24))
                
                rec_writer.writerow([rec_id_counter, profile_id, aff_node["item_id"], rank, reason, gen_dt.strftime("%Y-%m-%d %H:%M:%S")])
                rec_id_counter += 1
                
            if profile_id % 1000 == 0:
                print(f"... processed behavioral affinity algorithms for {profile_id:,} profiles")

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("PERSONALIZATION ENGINE DATA GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - segments.csv        : {len(segments_data):,} rows")
    print(f" - items.csv           : {NUM_ITEMS:,} rows (JSON Metadata Objects Packed)")
    print(f" - profiles.csv        : {NUM_PROFILES:,} rows")
    print(f" - profile_traits.csv  : {trait_id_counter - 1:,} rows (Sparse EAV format)")
    print(f" - profile_segments.csv: {prof_seg_id_counter - 1:,} rows")
    print(f" - affinities.csv      : {affinity_id_counter - 1:,} rows (Continuously calculated scores)")
    print(f" - recommendations.csv : {rec_id_counter - 1:,} rows (Top-{TOP_N_RECOMMENDATIONS} user subsets)")
    print("="*50)

if __name__ == "__main__":
    generate_personalization_dataset()
