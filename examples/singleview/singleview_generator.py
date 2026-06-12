import csv
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_CUSTOMERS = 3000           # 3,000 master customer profiles
MEGA_ACCOUNT_RATIO = 0.02      # 2% of accounts are corporate/whale "mega account" outliers

def generate_customer_360_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled Customer 360 generation for {NUM_CUSTOMERS:,} profiles...")

    # Shared pools for dynamic procedural generation
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
    managers = ["Alice Vance", "Bob Sterling", "Clara Oswald", "Dan Draper", "Elena Rostova"]
    
    order_statuses = ["completed", "completed", "completed", "shipped", "processing", "cancelled"]
    ticket_subjects = ["Delayed Delivery Investigation", "Payment Gateway Rejected", "Defective Hardware Return", "Subscription Tier Upgrade Error", "Account Access Reset Request"]
    ticket_statuses = ["closed", "closed", "closed", "open", "pending"]
    ticket_priorities = ["low", "normal", "normal", "high", "critical"]
    
    marketing_channels = ["email", "sms", "paid_search", "social_media", "retargeting_ad"]
    marketing_campaigns = ["Spring Clearance Flash", "Loyalty Rewards Migration", "Holiday VIP Early Access", "Abandoned Cart Reminder", "Re-engagement Push 2026"]
    
    loyalty_tiers = ["bronze", "silver", "gold", "platinum"]
    
    products_pool = [
        ("SKU-CORE-101", "Enterprise Base Terminal", 14999),   # $149.99
        ("SKU-ACC-202", "Ergonomic Desk Mounting Arm", 4999),   # $49.99
        ("SKU-POW-303", "Smart Uninterruptible Power Supply", 8999), # $89.99
        ("SKU-CBL-404", "Premium Braided Fiber Patch Cable", 1299),  # $12.99
        ("SKU-SOFT-505", "Cloud Analytics Seat License (Annual)", 29999) # $299.99
    ]

    # -------------------------------------------------------------------------
    # 1. Generate CRM Customers
    # -------------------------------------------------------------------------
    print("Writing crm_customers.csv...")
    customers_meta = [] # Store minimal lookup matrix: [id, created_at_dt, is_mega_outlier]
    
    # Establish which random customer IDs will be "mega accounts" to demonstrate statistical outliers
    mega_customer_ids = set(random.sample(range(1, NUM_CUSTOMERS + 1), int(NUM_CUSTOMERS * MEGA_ACCOUNT_RATIO)))

    with open('crm_customers.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'email', 'first_name', 'last_name', 'phone', 'account_manager', 'created_at'])
        
        for c_id in range(1, NUM_CUSTOMERS + 1):
            is_mega = c_id in mega_customer_ids
            
            first = random.choice(first_names)
            last = random.choice(last_names)
            # Mega accounts simulate structured enterprise buyers
            email = f"procurement@{last.lower()}-enterprises.internal" if is_mega else f"{first.lower()}.{last.lower()}{c_id}@personal-mail.net"
            phone = f"+1-{random.randint(200, 999)}-555-{random.randint(1000, 9999)}"
            acct_mgr = random.choice(managers) if is_mega or random.random() > 0.70 else "" # Normal accounts rarely get explicit managers
            
            # Accounts created distributed over a 2-year horizon
            created_dt = datetime.now() - timedelta(days=random.randint(30, 730))
            created_at_str = created_dt.strftime("%Y-%m-%d %H:%M:%S")
            
            writer.writerow([c_id, email, first, last, phone, acct_mgr, created_at_str])
            customers_meta.append({"id": c_id, "created_at": created_dt, "is_mega": is_mega})

    # -------------------------------------------------------------------------
    # 2. Stream Customer Fragments (Web Accounts, Support, Marketing, Loyalty)
    # -------------------------------------------------------------------------
    print("Streaming dependent customer system fragments...")
    
    web_id_counter = 1
    order_id_counter = 1
    item_id_counter = 1
    ticket_id_counter = 1
    touch_id_counter = 1
    loyalty_id_counter = 1

    with open('web_accounts.csv', mode='w', newline='', encoding='utf-8') as f_web, \
         open('orders.csv', mode='w', newline='', encoding='utf-8') as f_ord, \
         open('order_items.csv', mode='w', newline='', encoding='utf-8') as f_items, \
         open('support_tickets.csv', mode='w', newline='', encoding='utf-8') as f_tick, \
         open('marketing_touches.csv', mode='w', newline='', encoding='utf-8') as f_touch, \
         open('loyalty_accounts.csv', mode='w', newline='', encoding='utf-8') as f_loy:
         
        web_writer = csv.writer(f_web)
        ord_writer = csv.writer(f_ord)
        item_writer = csv.writer(f_items)
        tick_writer = csv.writer(f_tick)
        touch_writer = csv.writer(f_touch)
        loy_writer = csv.writer(f_loy)
        
        # Write Headers exactly matching your DDL
        web_writer.writerow(['id', 'crm_customer_id', 'username', 'last_login_at', 'marketing_opt_in'])
        ord_writer.writerow(['id', 'crm_customer_id', 'order_number', 'status', 'total_cents', 'currency', 'placed_at'])
        item_writer.writerow(['id', 'order_id', 'sku', 'product_name', 'quantity', 'unit_price_cents'])
        tick_writer.writerow(['id', 'crm_customer_id', 'subject', 'status', 'priority', 'opened_at', 'closed_at'])
        touch_writer.writerow(['id', 'crm_customer_id', 'channel', 'campaign_name', 'touched_at', 'converted'])
        loy_writer.writerow(['id', 'crm_customer_id', 'tier', 'points_balance', 'enrolled_at'])
        
        for c_meta in customers_meta:
            c_id = c_meta["id"]
            c_start = c_meta["created_at"]
            is_mega = c_meta["is_mega"]
            
            # A. Web Accounts Fragment (90% link rate)
            if random.random() > 0.10:
                username = f"user_node_{c_id}"
                last_login = (datetime.now() - timedelta(days=random.uniform(0, 14))).strftime("%Y-%m-%d %H:%M:%S")
                opt_in = 1 if is_mega or random.random() > 0.40 else 0
                web_writer.writerow([web_id_counter, c_id, username, last_login, opt_in])
                web_id_counter += 1
                
            # B. OUTLIER & COMPUTED MODEL: Orders and Nested Order Items
            num_orders = random.randint(40, 100) if is_mega else random.choices([0, 1, 2, 3, 4], weights=[0.25, 0.35, 0.20, 0.15, 0.05], k=1)[0]
            
            for o_idx in range(num_orders):
                order_num = f"ORD-{c_start.year}-{c_id:04d}-{o_idx:03d}"
                status = random.choice(order_statuses)
                placed_dt = c_start + timedelta(days=random.uniform(1, 25))
                if placed_dt > datetime.now(): placed_dt = datetime.now()
                
                num_items = random.randint(3, 8) if is_mega else random.randint(1, 3)
                order_total_cents = 0
                temp_item_rows = []
                
                for _ in range(num_items):
                    sku, p_name, unit_price = random.choice(products_pool)
                    qty = random.randint(5, 20) if is_mega else random.randint(1, 2)
                    line_cost = unit_price * qty
                    order_total_cents += line_cost
                    
                    temp_item_rows.append([item_id_counter, order_id_counter, sku, p_name, qty, unit_price])
                    item_id_counter += 1
                    
                ord_writer.writerow([order_id_counter, c_id, order_num, status, order_total_cents, 'USD', placed_dt.strftime("%Y-%m-%d %H:%M:%S")])
                
                for item_row in temp_item_rows:
                    item_writer.writerow(item_row)
                    
                order_id_counter += 1

            # C. Support Tickets Fragment
            num_tickets = random.randint(5, 15) if is_mega else random.choices([0, 1, 2], weights=[0.70, 0.25, 0.05], k=1)[0]
            for _ in range(num_tickets):
                subject = random.choice(ticket_subjects)
                t_status = random.choice(ticket_statuses)
                priority = random.choice(ticket_priorities) if is_mega else "normal"
                
                opened_dt = c_start + timedelta(days=random.uniform(5, 40))
                if opened_dt > datetime.now(): opened_dt = datetime.now()
                
                closed_at_str = ""
                if t_status == "closed":
                    closed_at_str = (opened_dt + timedelta(days=random.uniform(0.5, 5))).strftime("%Y-%m-%d %H:%M:%S")
                    
                tick_writer.writerow([ticket_id_counter, c_id, subject, t_status, priority, opened_dt.strftime("%Y-%m-%d %H:%M:%S"), closed_at_str])
                ticket_id_counter += 1

            # D. Marketing Touches Fragment
            num_touches = random.randint(15, 40) if is_mega else random.randint(1, 5)
            for _ in range(num_touches):
                channel = random.choice(marketing_channels)
                campaign = random.choice(marketing_campaigns)
                touch_dt = c_start + timedelta(days=random.uniform(0, 60))
                if touch_dt > datetime.now(): touch_dt = datetime.now()
                converted = 1 if is_mega or random.random() > 0.70 else 0
                
                touch_writer.writerow([touch_id_counter, c_id, channel, campaign, touch_dt.strftime("%Y-%m-%d %H:%M:%S"), converted])
                touch_id_counter += 1

            # E. Loyalty Accounts Fragment (65% enrollment rate)
            if is_mega or random.random() > 0.35:
                tier = random.choice(["gold", "platinum"]) if is_mega else random.choice(loyalty_tiers)
                points = random.randint(50000, 750000) if is_mega else random.randint(0, 4500)
                enroll_dt = (c_start + timedelta(hours=random.randint(1, 24))).strftime("%Y-%m-%d %H:%M:%S")
                
                loy_writer.writerow([loyalty_id_counter, c_id, tier, points, enroll_dt])
                loyalty_id_counter += 1

            if c_id % 1000 == 0:
                print(f"... synchronized database fragments up to customer account {c_id:,}")

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("CUSTOMER 360 SINGLE VIEW DATA GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - crm_customers.csv    : {NUM_CUSTOMERS:,} rows")
    print(f" - web_accounts.csv     : {web_id_counter - 1:,} rows")
    print(f" - orders.csv           : {order_id_counter - 1:,} rows")
    print(f" - order_items.csv      : {item_id_counter - 1:,} rows")
    print(f" - support_tickets.csv  : {ticket_id_counter - 1:,} rows")
    print(f" - marketing_touches.csv: {touch_id_counter - 1:,} rows")
    print(f" - loyalty_accounts.csv : {loyalty_id_counter - 1:,} rows")
    print("="*50)

if __name__ == "__main__":
    generate_customer_360_dataset()
