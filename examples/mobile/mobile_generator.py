import csv
import json
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_USERS = 3000               # 3,000 application users
DAYS_OF_HISTORY = 7            # 7 days of behavioral simulation metrics

def generate_mobile_backend_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled Mobile Backend generation for {NUM_USERS:,} users...")

    # Shared pools for dynamic procedural generation
    countries = ["US", "CA", "GB", "DE", "FR", "JP", "AU", "BR", "IN", "KR"]
    plans = ["free", "free", "free", "premium_monthly", "premium_yearly"]
    platforms = ["iOS", "Android"]
    
    os_versions = {
        "iOS": ["16.5", "17.0", "17.4", "17.5"],
        "Android": ["11.0", "12.0", "13.0", "14.0"]
    }
    
    event_names = ["app_launch", "screen_view", "button_tap", "search_executed", "add_to_cart", "api_error"]
    screens = ["home_feed", "product_details", "search_results", "user_profile", "checkout_view"]
    
    products = [
        ("premium_sub_mo", 999),    # $9.99
        ("premium_sub_yr", 7999),   # $79.99
        ("coins_pack_small", 299),  # $2.99
        ("coins_pack_large", 1999), # $19.99
        ("remove_ads_ticket", 499)  # $4.99
    ]
    
    push_templates = [
        ("Don't miss out!", "Check out our latest exclusive drops waiting for you inside the app."),
        ("We miss you!", "Log back in today to claim your daily activity bonus streaks!"),
        ("Purchase Confirmed", "Your payment transaction was successful. Thank you for your support!")
    ]

    # -------------------------------------------------------------------------
    # 1. Generate App Users
    # -------------------------------------------------------------------------
    print("Writing app_users.csv...")
    users_meta = [] # In-memory metadata matrix: [id, plan, created_dt]
    
    with open('app_users.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'username', 'email', 'country', 'plan', 'created_at'])
        
        for u_id in range(1, NUM_USERS + 1):
            username = f"user_mobile_{u_id}"
            email = f"{username}@example-mobile-net.com"
            country = random.choice(countries)
            plan = random.choice(plans)
            
            # Users created dynamically between 10 and 60 days ago
            created_dt = datetime.now() - timedelta(days=random.randint(10, 60))
            created_at_str = created_dt.strftime("%Y-%m-%d %H:%M:%S")
            
            writer.writerow([u_id, username, email, country, plan, created_at_str])
            users_meta.append({"id": u_id, "plan": plan, "created_at": created_dt})

    # -------------------------------------------------------------------------
    # 2. Generate User Devices
    # -------------------------------------------------------------------------
    print("Writing user_devices.csv...")
    devices_meta = [] # In-memory metadata matrix: [device_id, user_id, registered_at_dt]
    device_id_counter = 1
    
    with open('user_devices.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'user_id', 'platform', 'os_version', 'push_token', 'registered_at'])
        
        for u_meta in users_meta:
            # 85% have 1 device, 15% have 2 devices (table scales into thousands)
            num_devices = 2 if random.random() < 0.15 else 1
            
            for _ in range(num_devices):
                platform = random.choice(platforms)
                os_ver = random.choice(os_versions[platform])
                
                # 90% chance user enabled push notifications
                push_token = f"tok_{random.getrandbits(64):016x}" if random.random() > 0.10 else ""
                
                # Registration occurs shortly after user account creation date
                reg_dt = u_meta["created_at"] + timedelta(minutes=random.randint(2, 120))
                reg_at_str = reg_dt.strftime("%Y-%m-%d %H:%M:%S")
                
                writer.writerow([device_id_counter, u_meta["id"], platform, os_ver, push_token, reg_at_str])
                
                devices_meta.append({
                    "id": device_id_counter,
                    "user_id": u_meta["id"],
                    "registered_at": reg_dt,
                    "has_push": bool(push_token)
                })
                device_id_counter += 1

    # -------------------------------------------------------------------------
    # 3. Stream Sessions & High-Velocity Event Stream (The Firehose)
    # -------------------------------------------------------------------------
    print(f"Streaming high-velocity sessions.csv and app_events.csv ({DAYS_OF_HISTORY} days hierarchy)...")
    
    session_id_counter = 1
    event_id_counter = 1
    
    history_start_dt = datetime.now() - timedelta(days=DAYS_OF_HISTORY)
    
    with open('sessions.csv', mode='w', newline='', encoding='utf-8') as f_sessions, \
         open('app_events.csv', mode='w', newline='', encoding='utf-8') as f_events:
         
        session_writer = csv.writer(f_sessions)
        event_writer = csv.writer(f_events)
        
        session_writer.writerow(['id', 'user_id', 'device_id', 'started_at', 'ended_at', 'duration_sec'])
        event_writer.writerow(['id', 'user_id', 'session_id', 'event_name', 'occurred_at', 'properties_json'])
        
        for d_meta in devices_meta:
            # Determine active evaluation bounds (start tracking from device registration or global history edge)
            track_start = max(d_meta["registered_at"], history_start_dt)
            track_end = datetime.now()
            
            # Generate multiple sessions chronologically distributed over the tracking window
            current_time = track_start + timedelta(hours=random.randint(1, 12))
            
            while current_time < track_end:
                started_at_str = current_time.strftime("%Y-%m-%d %H:%M:%S")
                
                # Simulate session durations (lengths between 10 seconds and 30 minutes)
                duration_sec = random.randint(10, 1800)
                ended_dt = current_time + timedelta(seconds=duration_sec)
                
                # 2% chance session drops abruptly without clean end mapping (NULL simulations)
                if random.random() > 0.02:
                    ended_at_str = ended_dt.strftime("%Y-%m-%d %H:%M:%S")
                    duration_val = duration_sec
                else:
                    ended_at_str = ""
                    duration_val = ""
                
                # Write individual transactional session row
                session_writer.writerow([session_id_counter, d_meta["user_id"], d_meta["id"], started_at_str, ended_at_str, duration_val])
                
                # BUCKET MODEL: Generate sequence of events occurring strictly *inside* this individual session bounds
                num_events = random.randint(4, 15)
                for step in range(num_events):
                    ev_name = random.choice(event_names)
                    
                    # Distribute chronological events evenly within session runtime bounds
                    ev_dt = current_time + timedelta(seconds=int((duration_sec / num_events) * step))
                    ev_at_str = ev_dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    # Construct structural Contextual JSON property payloads based on event subtype selection
                    props = {"device_session_step": step + 1}
                    if ev_name == "screen_view":
                        props["screen_name"] = random.choice(screens)
                        props["previous_screen"] = random.choice(screens)
                    elif ev_name == "button_tap":
                        props["target_element_id"] = f"btn_{random.randint(10,99)}"
                    elif ev_name == "search_executed":
                        props["query_length"] = random.randint(3, 25)
                        props["results_returned"] = random.choice([0, 5, 20, 50])
                    elif ev_name == "api_error":
                        props["status_code"] = random.choice([401, 404, 500, 503])
                        props["endpoint"] = "/v1/mobile/feed"
                        
                    props_json_str = json.dumps(props)
                    
                    # Stream firehose log directly to disk 
                    event_writer.writerow([event_id_counter, d_meta["user_id"], session_id_counter, ev_name, ev_at_str, props_json_str])
                    event_id_counter += 1
                
                session_id_counter += 1
                # Increment forward to next potential login execution timestamp loop
                current_time = ended_dt + timedelta(hours=random.randint(6, 48))
                
            if session_id_counter % 2000 == 0 or session_id_counter > 0 and session_id_counter % 2000 < 5:
                print(f"... flushed {event_id_counter - 1:,} high-velocity app events to disk")

    # -------------------------------------------------------------------------
    # 4. Generate Purchases (Calculated Lifetime Spend Model)
    # -------------------------------------------------------------------------
    print("Writing purchases.csv...")
    purchase_id_counter = 1
    with open('purchases.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'user_id', 'product_code', 'amount_cents', 'currency', 'purchased_at'])
        
        for u_meta in users_meta:
            # Premium users are guaranteed to have transactions, free tiers have lower transaction probability (12%)
            is_paying_user = True if "premium" in u_meta["plan"] else (random.random() < 0.12)
            
            if is_paying_user:
                # Generate between 1 and 4 monetization actions per user
                num_purchases = random.randint(1, 4) if "premium" in u_meta["plan"] else random.randint(1, 2)
                
                for _ in range(num_purchases):
                    prod_code, amount_cents = random.choice(products)
                    
                    # Enforce that purchase occurs cleanly *after* the user profile creation milestone
                    purch_dt = u_meta["created_at"] + timedelta(days=random.uniform(1, 8))
                    purch_at_str = purch_dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    writer.writerow([purchase_id_counter, u_meta["id"], prod_code, amount_cents, 'USD', purch_at_str])
                    purchase_id_counter += 1

    # -------------------------------------------------------------------------
    # 5. Generate Push Notifications (Targeting Valid Devices)
    # -------------------------------------------------------------------------
    print("Writing push_notifications.csv...")
    push_id_counter = 1
    with open('push_notifications.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'device_id', 'title', 'body', 'sent_at', 'opened_at'])
        
        for d_meta in devices_meta:
            # Push logs can only target registration addresses containing active token payloads
            if d_meta["has_push"]:
                # Generate between 1 and 3 systemic campaigns sent over the timeline history bounds
                for _ in range(random.randint(1, 3)):
                    title, body = random.choice(push_templates)
                    
                    sent_dt = d_meta["registered_at"] + timedelta(days=random.uniform(0.5, 5))
                    sent_at_str = sent_dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    # 40% open conversion rate simulation
                    if random.random() < 0.40:
                        opened_dt = sent_dt + timedelta(seconds=random.randint(15, 7200)) # Opened within 2 hours
                        opened_at_str = opened_dt.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        opened_at_str = "" # Unopened NULL states
                        
                    writer.writerow([push_id_counter, d_meta["id"], title, body, sent_at_str, opened_at_str])
                    push_id_counter += 1

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("MOBILE BACKEND DATA GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - app_users.csv         : {NUM_USERS:,} rows")
    print(f" - user_devices.csv      : {device_id_counter - 1:,} rows")
    print(f" - sessions.csv          : {session_id_counter - 1:,} rows (Recent subsets modeled)")
    print(f" - app_events.csv        : {event_id_counter - 1:,} rows (Polymorphic JSON Event Firehose)")
    print(f" - purchases.csv         : {purchase_id_counter - 1:,} rows (Supports computed lifetime spend)")
    print(f" - push_notifications.csv: {push_id_counter - 1:,} rows")
    print("="*50)

if __name__ == "__main__":
    generate_mobile_backend_dataset()
