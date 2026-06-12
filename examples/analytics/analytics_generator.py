import csv
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_SITES = 1500               # Generates 1,500 sites, funnels, and ~3,000 campaigns
DAYS_OF_HISTORY = 5           # 5 days = 120 hours of time-series rollups
EVENTS_PER_SITE_PER_HOUR = (3, 8)  # Generates ~1 million total firehose records

def generate_scaled_analytics_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled generation for {NUM_SITES:,} sites over {DAYS_OF_HISTORY} days...")

    # Base pools for generating realistic combinations dynamically
    industries = ["tech", "shop", "edu", "cloud", "fin", "health", "media", "dev", "crypto", "bio"]
    suffixes = ["portal", "hub", "app", "sphere", "base", "grid", "metrics", "flow", "stack", "labs"]
    tlds = [".com", ".io", ".net", ".org", ".co"]
    
    marketing_sources = ["google", "facebook", "twitter", "linkedin", "newsletter", "partner"]
    marketing_mediums = ["cpc", "social", "email", "affiliate", "display"]

    # -------------------------------------------------------------------------
    # 1. Generate Tracked Sites (1,000s of rows)
    # -------------------------------------------------------------------------
    print("Writing tracked_sites.csv...")
    sites_data = []
    
    with open('tracked_sites.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'domain', 'owner_email', 'created_at'])
        
        for site_id in range(1, NUM_SITES + 1):
            # Procedurally generate thousands of unique domains
            domain = f"{random.choice(industries)}-{random.choice(suffixes)}-{site_id}{random.choice(tlds)}"
            owner_email = f"admin@{domain}"
            created_at = (datetime.now() - timedelta(days=random.randint(30, 365))).strftime("%Y-%m-%d %H:%M:%S")
            
            writer.writerow([site_id, domain, owner_email, created_at])
            sites_data.append(site_id)

    # -------------------------------------------------------------------------
    # 2. Generate Campaigns (1,000s of rows)
    # -------------------------------------------------------------------------
    print("Writing campaigns.csv...")
    active_campaigns = {}  # site_id -> list of active campaign windows
    campaign_id = 1
    start_history_dt = datetime.now() - timedelta(days=DAYS_OF_HISTORY)
    
    with open('campaigns.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'site_id', 'name', 'utm_code', 'started_at', 'ended_at'])
        
        for site_id in sites_data:
            active_campaigns[site_id] = []
            
            # Create 2 unique campaigns per site to scale campaign rows into the thousands
            for num in range(1, 3):
                source = random.choice(marketing_sources)
                medium = random.choice(marketing_mediums)
                
                name = f"Campaign {source.title()} {medium.upper()} Q{random.randint(1,4)}"
                utm_code = f"utm_source={source}&utm_medium={medium}&utm_campaign=run_{site_id}_{num}"
                
                camp_start = start_history_dt + timedelta(days=random.uniform(-10, 2))
                has_ended = random.choice([True, False])
                camp_end = camp_start + timedelta(days=random.uniform(3, 10)) if has_ended else None
                
                writer.writerow([
                    campaign_id, site_id, name, utm_code, 
                    camp_start.strftime("%Y-%m-%d %H:%M:%S"),
                    camp_end.strftime("%Y-%m-%d %H:%M:%S") if camp_end else ""
                ])
                
                active_campaigns[site_id].append({
                    "id": campaign_id,
                    "start": camp_start,
                    "end": camp_end if camp_end else datetime.max
                })
                campaign_id += 1

    # -------------------------------------------------------------------------
    # 3. Generate Funnels & Funnel Steps (1,000s of rows)
    # -------------------------------------------------------------------------
    print("Writing funnels.csv and funnel_steps.csv...")
    funnel_id = 1
    step_id = 1
    site_funnel_paths = {} 
    
    funnel_templates = [
        ("E-Commerce Funnel", [("/products", "Browse Product"), ("/cart", "Add To Cart"), ("/checkout", "Checkout"), ("/thank-you", "Purchase Success")]),
        ("B2B SaaS Signup", [("/features", "View Pricing"), ("/register", "Fill Form"), ("/verify", "Verify Identity"), ("/dashboard", "First Login")]),
        ("Content Subscription", [("/articles", "Read Content"), ("/paywall", "Trigger Paywall"), ("/subscribe", "Payment Form"), ("/welcome", "Welcome Page")])
    ]
    
    with open('funnels.csv', mode='w', newline='', encoding='utf-8') as f_funnel, \
         open('funnel_steps.csv', mode='w', newline='', encoding='utf-8') as f_steps:
         
        f_writer = csv.writer(f_funnel)
        s_writer = csv.writer(f_steps)
        
        f_writer.writerow(['id', 'site_id', 'name'])
        s_writer.writerow(['id', 'funnel_id', 'step_number', 'match_url_path', 'label'])
        
        for site_id in sites_data:
            f_name, steps = random.choice(funnel_templates)
            f_writer.writerow([funnel_id, site_id, f_name])
            
            site_funnel_paths[site_id] = [step[0] for step in steps]
            
            for idx, (path, label) in enumerate(steps):
                s_writer.writerow([step_id, funnel_id, idx + 1, path, label])
                step_id += 1
                
            funnel_id += 1

    # -------------------------------------------------------------------------
    # 4. Stream Page Events (Millions) & Pre-aggregated Rollups (100,000s)
    # -------------------------------------------------------------------------
    print(f"Streaming high-velocity page_events.csv and hourly_rollups.csv...")
    
    # Generate bounded unique visitor identities per site to mimic real sessions
    # (Kept memory footprint small by limiting to 30 visitors per site)
    visitor_pools = {
        site_id: [f"vis_{random.getrandbits(32):08x}" for _ in range(30)] 
        for site_id in sites_data
    }
    
    generic_paths = ["/home", "/about-us", "/contact", "/privacy", "/terms-of-service", "/blog/main"]
    event_types = ["pageview", "click", "conversion"]
    
    event_id = 1
    rollup_id = 1
    
    start_time = start_history_dt.replace(minute=0, second=0, microsecond=0)
    end_time = datetime.now()
    
    with open('page_events.csv', mode='w', newline='', encoding='utf-8') as f_events, \
         open('hourly_rollups.csv', mode='w', newline='', encoding='utf-8') as f_rollups:
         
        event_writer = csv.writer(f_events)
        rollup_writer = csv.writer(f_rollups)
        
        event_writer.writerow(['id', 'site_id', 'campaign_id', 'visitor_id', 'event_type', 'url_path', 'occurred_at', 'load_time_ms'])
        rollup_writer.writerow(['id', 'site_id', 'hour_start', 'views', 'clicks', 'conversions', 'avg_load_time_ms'])
        
        current_hour = start_time
        total_events_written = 0
        
        while current_hour <= end_time:
            hour_start_str = current_hour.strftime("%Y-%m-%d %H:%M:%S")
            
            for site_id in sites_data:
                views_count = 0
                clicks_count = 0
                conversions_count = 0
                total_load_time = 0
                hourly_event_count = 0
                
                # Dynamic volume allocation per site per hour
                num_events = random.randint(*EVENTS_PER_SITE_PER_HOUR)
                
                for _ in range(num_events):
                    # Randomize exact second placement within the current hour block
                    occurred_dt = current_hour + timedelta(minutes=random.randint(0, 59), seconds=random.randint(0, 59))
                    occurred_at_str = occurred_dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    visitor_id = random.choice(visitor_pools[site_id])
                    load_time = random.randint(80, 1500)
                    ev_type = random.choices(event_types, weights=[0.65, 0.28, 0.07], k=1)[0]
                    
                    # Funnel path routing vs organic site traffic
                    if random.random() < 0.70:
                        path = random.choice(site_funnel_paths[site_id])
                        # Conversions mostly occur at the final checkout node
                        if path == site_funnel_paths[site_id][-1]:
                            ev_type = "conversion"
                    else:
                        path = random.choice(generic_paths)
                        if ev_type == "conversion":
                            ev_type = "pageview"
                    
                    # Dynamic attribution to active marketing campaigns
                    campaign_id_val = ""
                    for camp in active_campaigns[site_id]:
                        if camp["start"] <= occurred_dt <= camp["end"]:
                            if random.random() < 0.35: # 35% click attribution conversion rate
                                campaign_id_val = camp["id"]
                                break
                    
                    # Stream firehose record instantly to disk
                    event_writer.writerow([event_id, site_id, campaign_id_val, visitor_id, ev_type, path, occurred_at_str, load_time])
                    
                    # Collate rollup figures for the pre-aggregated summary row
                    hourly_event_count += 1
                    total_load_time += load_time
                    if ev_type == "pageview":
                        views_count += 1
                    elif ev_type == "click":
                        clicks_count += 1
                    elif ev_type == "conversion":
                        conversions_count += 1
                        
                    event_id += 1
                    total_events_written += 1
                
                # Write matching pre-allocated rollup slot for the analytical analytical query engine
                avg_load = round(total_load_time / hourly_event_count, 2) if hourly_event_count > 0 else 0.0
                rollup_writer.writerow([rollup_id, site_id, hour_start_str, views_count, clicks_count, conversions_count, avg_load])
                rollup_id += 1
                
            if total_events_written >= 250000 and total_events_written % 250000 < 10:
                print(f"... flushed {total_events_written:,} firehose page events to disk")
                
            current_hour += timedelta(hours=1)

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("SCALED GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - tracked_sites.csv : {NUM_SITES:,} rows")
    print(f" - campaigns.csv     : {campaign_id - 1:,} rows")
    print(f" - funnels.csv       : {funnel_id - 1:,} rows")
    print(f" - funnel_steps.csv  : {step_id - 1:,} rows")
    print(f" - hourly_rollups.csv: {rollup_id - 1:,} rows")
    print(f" - page_events.csv   : {event_id - 1:,} rows (Firehose Streamed!)")
    print("="*50)

if __name__ == "__main__":
    generate_scaled_analytics_dataset()
