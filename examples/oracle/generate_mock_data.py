import csv
import random
import hashlib
from datetime import datetime, timedelta

# Configurations for scaling row sizes
NUM_EMPLOYEES = 1200
NUM_CUSTOMERS = 2500
NUM_PRODUCTS = 1500
NUM_ORDERS = 3500
NUM_SUPPORT_TICKETS = 1200
NUM_SUPPLY_ORDERS = 1000

# Helper lists for mock data generation
FIRST_NAMES = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]
CITIES = [("New York", "NY", "US"), ("Los Angeles", "CA", "US"), ("Chicago", "IL", "US"), ("Houston", "TX", "US"), ("Phoenix", "AZ", "US"), ("London", "Eng", "UK"), ("Paris", "IDF", "FR"), ("Tokyo", "Ty", "JP"), ("Berlin", "Be", "DE"), ("Toronto", "ON", "CA")]
COMPANY_SUFFIXES = ["Inc", "LLC", "Group", "Corp", "Solutions", "Global"]
CARRIERS = ["FedEx", "UPS", "DHL", "USPS", "Amazon Logistics"]
PRODUCT_ADJECTIVES = ["Ultra", "Eco", "Smart", "Pro", "Max", "Quantum", "Elite", "Core", "Flex"]
PRODUCT_NOUNS = ["Widget", "Gadget", "Device", "Hub", "Pad", "Link", "Station", "Pack", "Module"]

def random_date(start, end):
    return start + timedelta(seconds=random.randint(0, int((end - start).total_seconds())))

def write_csv(filename, fieldnames, rows):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Generated {len(rows)} rows for {filename}")

def main():
    print("🚀 Starting relational mock data generation...")
    start_time = datetime(2021, 1, 1)
    end_time = datetime(2026, 1, 1)

    # 1. REGIONS
    regions_data = [
        {"region_id": 1, "region_name": "North America"},
        {"region_id": 2, "region_name": "Europe"},
        {"region_id": 3, "region_name": "Asia"},
        {"region_id": 4, "region_name": "South America"},
        {"region_id": 5, "region_name": "Oceania"}
    ]
    write_csv("regions.csv", ["region_id", "region_name"], regions_data)

    # 2. COUNTRIES
    countries_data = [
        {"country_id": "US", "country_name": "United States", "region_id": 1},
        {"country_id": "CA", "country_name": "Canada", "region_id": 1},
        {"country_id": "UK", "country_name": "United Kingdom", "region_id": 2},
        {"country_id": "FR", "country_name": "France", "region_id": 2},
        {"country_id": "DE", "country_name": "Germany", "region_id": 2},
        {"country_id": "JP", "country_name": "Japan", "region_id": 3},
        {"country_id": "CN", "country_name": "China", "region_id": 3},
        {"country_id": "BR", "country_name": "Brazil", "region_id": 4},
        {"country_id": "AU", "country_name": "Australia", "region_id": 5},
        {"country_id": "MX", "country_name": "Mexico", "region_id": 1}
    ]
    write_csv("countries.csv", ["country_id", "country_name", "region_id"], countries_data)

    # 3. LOCATIONS
    locations_data = []
    for i in range(1, 101):
        city_info = random.choice(CITIES)
        locations_data.append({
            "location_id": i,
            "street_address": f"{random.randint(100, 9999)} Main St Blvd",
            "postal_code": f"{random.randint(10000, 99999)}",
            "city": city_info[0],
            "state_province": city_info[1],
            "country_id": city_info[2]
        })
    write_csv("locations.csv", ["location_id", "street_address", "postal_code", "city", "state_province", "country_id"], locations_data)

    # 4. COMPANY ASSETS (1000+ rows)
    assets_data = []
    asset_types = ["Laptop", "Server", "Office Chair", "Desk", "Projector", "Vehicle", "Security Camera"]
    for i in range(1, 1100):
        assets_data.append({
            "asset_id": i,
            "asset_name": f"{random.choice(asset_types)} #{i}",
            "asset_type": random.choice(asset_types),
            "purchase_date": random_date(start_time, end_time).strftime('%Y-%m-%d'),
            "purchase_cost": round(random.uniform(50.00, 5000.00), 2),
            "location_id": random.randint(1, 100)
        })
    write_csv("company_assets.csv", ["asset_id", "asset_name", "asset_type", "purchase_date", "purchase_cost", "location_id"], assets_data)

    # 5. SECURITY ROLES
    roles_data = [
        {"role_id": 1, "role_name": "Admin", "description": "Full access to system operations"},
        {"role_id": 2, "role_name": "Manager", "description": "Access to departmental assets and metrics"},
        {"role_id": 3, "role_name": "Staff", "description": "Standard operational transactional permissions"},
        {"role_id": 4, "role_name": "Support Agent", "description": "Customer ticket support queue operations"},
        {"role_id": 5, "role_name": "Auditor", "description": "Read-only access across standard ledgers"}
    ]
    write_csv("security_roles.csv", ["role_id", "role_name", "description"], roles_data)

    # 6. JOBS
    jobs_data = [
        {"job_id": "CEO", "job_title": "Chief Executive Officer", "min_salary": 150000.00, "max_salary": 500000.00},
        {"job_id": "MGR", "job_title": "Department Manager", "min_salary": 80000.00, "max_salary": 140000.00},
        {"job_id": "REP", "job_title": "Sales Representative", "min_salary": 40000.00, "max_salary": 90000.00},
        {"job_id": "ENG", "job_title": "Software Engineer", "min_salary": 75000.00, "max_salary": 160000.00},
        {"job_id": "SUP", "job_title": "Support Specialist", "min_salary": 35000.00, "max_salary": 65000.00},
        {"job_id": "FIN", "job_title": "Financial Analyst", "min_salary": 60000.00, "max_salary": 110000.00},
        {"job_id": "HR", "job_title": "HR Specialist", "min_salary": 45000.00, "max_salary": 85000.00}
    ]
    write_csv("jobs.csv", ["job_id", "job_title", "min_salary", "max_salary"], jobs_data)

    # 7. DEPARTMENTS
    departments_data = []
    dept_names = ["Executive", "Sales", "Engineering", "Customer Support", "Finance", "Human Resources"]
    for i, name in enumerate(dept_names, start=1):
        departments_data.append({
            "department_id": i,
            "department_name": name,
            "manager_id": "",  # Backfilled later
            "location_id": random.randint(1, 100)
        })

    # 8. EMPLOYEES (1000+ rows)
    employees_data = []
    used_emails = set()
    for i in range(1, NUM_EMPLOYEES + 1):
        fname = random.choice(FIRST_NAMES)
        lname = random.choice(LAST_NAMES)
        email = f"{fname.lower()}.{lname.lower()}{i}@company.com"
        
        job = random.choice(jobs_data) if i > 1 else jobs_data[0] # First is CEO
        dept_id = random.randint(1, len(dept_names))
        
        employees_data.append({
            "employee_id": i,
            "first_name": fname,
            "last_name": lname,
            "email": email,
            "phone_number": f"555-{random.randint(100,999)}-{random.randint(1000,9999)}",
            "hire_date": random_date(start_time, end_time).strftime('%Y-%m-%d'),
            "job_id": job["job_id"],
            "salary": round(random.uniform(job["min_salary"], job["max_salary"]), 2),
            "commission_pct": round(random.choice([0.05, 0.10, 0.15, 0.20]), 2) if job["job_id"] == "REP" else "",
            "manager_id": random.randint(1, max(1, i - 1)) if i > 1 else "",
            "department_id": dept_id
        })
    
    # Backfill Manager IDs into departments cleanly
    for dept in departments_data:
        dept["manager_id"] = random.randint(1, 20)
        
    write_csv("departments.csv", ["department_id", "department_name", "manager_id", "location_id"], departments_data)
    write_csv("employees.csv", ["employee_id", "first_name", "last_name", "email", "phone_number", "hire_date", "job_id", "salary", "commission_pct", "manager_id", "department_id"], employees_data)

    # 9. USER ACCOUNTS (1000+ rows)
    users_data = []
    for i in range(1, NUM_EMPLOYEES + 1):
        emp = employees_data[i-1]
        pwd_hash = hashlib.sha256(f"Password{i}".encode()).hexdigest()
        users_data.append({
            "user_id": i,
            "employee_id": emp["employee_id"],
            "username": f"user_{emp['first_name'].lower()}{i}",
            "password_hash": pwd_hash,
            "role_id": random.randint(1, 5),
            "is_active": random.choice([1, 1, 1, 0]), # 75% active
            "last_login": random_date(start_time, end_time).strftime('%Y-%m-%d %H:%M:%S')
        })
    write_csv("user_accounts.csv", ["user_id", "employee_id", "username", "password_hash", "role_id", "is_active", "last_login"], users_data)

    # 10. JOB HISTORY (1000+ rows)
    history_data = []
    for i in range(1, NUM_EMPLOYEES + 1):
        emp = employees_data[i-1]
        h_date = datetime.strptime(emp["hire_date"], '%Y-%m-%d')
        start = h_date - timedelta(days=random.randint(300, 1000))
        end = h_date - timedelta(days=random.randint(1, 299))
        history_data.append({
            "employee_id": emp["employee_id"],
            "start_date": start.strftime('%Y-%m-%d'),
            "end_date": end.strftime('%Y-%m-%d'),
            "job_id": random.choice(jobs_data)["job_id"],
            "department_id": random.randint(1, len(dept_names))
        })
    write_csv("job_history.csv", ["employee_id", "start_date", "end_date", "job_id", "department_id"], history_data)

    # 11. CUSTOMERS (1000+ rows)
    customers_data = []
    for i in range(1, NUM_CUSTOMERS + 1):
        fname = random.choice(FIRST_NAMES)
        lname = random.choice(LAST_NAMES)
        customers_data.append({
            "customer_id": i,
            "company_name": f"{random.choice(LAST_NAMES)} {random.choice(COMPANY_SUFFIXES)}" if random.random() > 0.4 else "",
            "first_name": fname,
            "last_name": lname,
            "email": f"customer{i}@{random.choice(['gmail.com', 'yahoo.com', 'outlook.com', 'corporate.net'])}",
            "phone": f"1-800-{random.randint(100,999)}-{random.randint(1000,9999)}",
            "credit_limit": round(random.choice([1000.00, 2500.00, 5000.00, 10000.00]), 2)
        })
    write_csv("customers.csv", ["customer_id", "company_name", "first_name", "last_name", "email", "phone", "credit_limit"], customers_data)

    # 12. CUSTOMER ADDRESSES (1000+ rows)
    cust_addresses_data = []
    for i in range(1, NUM_CUSTOMERS + 1):
        # Shipping
        cust_addresses_data.append({
            "address_id": (i * 2) - 1,
            "customer_id": i,
            "address_type": "SHIPPING",
            "street_address": f"{random.randint(10, 999)} Shipping Way",
            "city": random.choice(CITIES)[0],
            "postal_code": f"{random.randint(10000, 99999)}",
            "country_id": random.choice(["US", "CA", "UK", "DE", "JP"])
        })
        # Billing
        cust_addresses_data.append({
            "address_id": i * 2,
            "customer_id": i,
            "address_type": "BILLING",
            "street_address": f"{random.randint(10, 999)} Billing Ave",
            "city": random.choice(CITIES)[0],
            "postal_code": f"{random.randint(10000, 99999)}",
            "country_id": random.choice(["US", "CA", "UK", "DE", "JP"])
        })
    write_csv("customer_addresses.csv", ["address_id", "customer_id", "address_type", "street_address", "city", "postal_code", "country_id"], cust_addresses_data)

    # 13. SALES CHANNELS
    channels_data = [
        {"channel_id": 1, "channel_name": "Online Store"},
        {"channel_id": 2, "channel_name": "Direct Wholesale"},
        {"channel_id": 3, "channel_name": "Retail Outlet"},
        {"channel_id": 4, "channel_name": "Mobile App"}
    ]
    write_csv("sales_channels.csv", ["channel_id", "channel_name"], channels_data)

    # 14. LOYALTY PROGRAMS
    loyalty_prog_data = [
        {"program_id": 1, "tier_name": "Bronze", "points_multiplier": 1.00, "min_points_required": 0},
        {"program_id": 2, "tier_name": "Silver", "points_multiplier": 1.15, "min_points_required": 500},
        {"program_id": 3, "tier_name": "Gold", "points_multiplier": 1.30, "min_points_required": 2000},
        {"program_id": 4, "tier_name": "Platinum", "points_multiplier": 1.50, "min_points_required": 5000}
    ]
    write_csv("loyalty_programs.csv", ["program_id", "tier_name", "points_multiplier", "min_points_required"], loyalty_prog_data)

    # 15. CUSTOMER LOYALTY (1000+ rows)
    cust_loyalty_data = []
    for i in range(1, NUM_CUSTOMERS + 1):
        lt_points = random.randint(0, 7000)
        prog_id = 1
        if lt_points >= 5000: prog_id = 4
        elif lt_points >= 2000: prog_id = 3
        elif lt_points >= 500: prog_id = 2
        
        cust_loyalty_data.append({
            "customer_id": i,
            "program_id": prog_id,
            "current_points": max(0, lt_points - random.randint(0, 1000)),
            "lifetime_points": lt_points
        })
    write_csv("customer_loyalty.csv", ["customer_id", "program_id", "current_points", "lifetime_points"], cust_loyalty_data)

    # 16. PAYMENT METHODS
    methods_data = [
        {"method_id": 1, "method_name": "Credit Card"},
        {"method_id": 2, "method_name": "Bank Wire Transfer"},
        {"method_id": 3, "method_name": "PayPal"},
        {"method_id": 4, "method_name": "Apple Pay"}
    ]
    write_csv("payment_methods.csv", ["method_id", "method_name"], methods_data)

    # 17. SUPPLIERS
    suppliers_data = []
    for i in range(1, 151):
        suppliers_data.append({
            "supplier_id": i,
            "supplier_name": f"{random.choice(LAST_NAMES)} Manufacturing",
            "contact_name": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            "email": f"vendor{i}@manufacturing.net",
            "phone": f"888-{random.randint(100,999)}-{random.randint(1000,9999)}",
            "status": random.choice(["ACTIVE", "ACTIVE", "ACTIVE", "SUSPENDED", "INACTIVE"])
        })
    write_csv("suppliers.csv", ["supplier_id", "supplier_name", "contact_name", "email", "phone", "status"], suppliers_data)

    # 18. PRODUCT CATEGORIES
    categories_data = [
        {"category_id": 1, "category_name": "Electronics", "description": "Devices, parts, gadgets"},
        {"category_id": 2, "category_name": "Office Supplies", "description": "Paper, pens, desk configurations"},
        {"category_id": 3, "category_name": "Apparel", "description": "Company branded attire and protective gear"},
        {"category_id": 4, "category_name": "Hardware", "description": "Industrial structural manufacturing tools"},
        {"category_id": 5, "category_name": "Software Licences", "description": "Enterprise cloud runtime keys"}
    ]
    write_csv("product_categories.csv", ["category_id", "category_name", "description"], categories_data)

    # 19. PRODUCTS (1000+ rows)
    products_data = []
    for i in range(1, NUM_PRODUCTS + 1):
        cost = round(random.uniform(5.00, 800.00), 2)
        list_p = round(cost * random.uniform(1.2, 1.8), 2)
        products_data.append({
            "product_id": i,
            "product_name": f"{random.choice(PRODUCT_ADJECTIVES)} {random.choice(PRODUCT_NOUNS)} v{i}",
            "description": f"High performance utility design matching component spec {i}.",
            "category_id": random.randint(1, 5),
            "sku": f"SKU-{random.randint(100,999)}-{i:04d}",
            "list_price": list_p,
            "cost_price": cost,
            "weight_kg": round(random.uniform(0.1, 45.0), 2)
        })
    write_csv("products.csv", ["product_id", "product_name", "description", "category_id", "sku", "list_price", "cost_price", "weight_kg"], products_data)

    # 20. WAREHOUSES
    warehouses_data = []
    for i in range(1, 21):
        warehouses_data.append({
            "warehouse_id": i,
            "warehouse_name": f"Central Facility Dist #{i}",
            "location_id": random.randint(1, 100),
            "capacity_m3": round(random.uniform(5000, 100000), 2)
        })
    write_csv("warehouses.csv", ["warehouse_id", "warehouse_name", "location_id", "capacity_m3"], warehouses_data)

    # 21. INVENTORIES (1000+ rows)
    inventories_data = []
    for w_id in range(1, 21):
        # assign about 100-200 products randomly per warehouse to yield 3000+ combinations
        sampled_prods = random.sample(range(1, NUM_PRODUCTS + 1), random.randint(100, 200))
        for p_id in sampled_prods:
            inventories_data.append({
                "warehouse_id": w_id,
                "product_id": p_id,
                "quantity_on_hand": random.randint(0, 1500),
                "reorder_level": random.choice([20, 50, 100, 200])
            })
    write_csv("inventories.csv", ["warehouse_id", "product_id", "quantity_on_hand", "reorder_level"], inventories_data)

    # 22. ORDERS (1000+ rows)
    orders_data = []
    for i in range(1, NUM_ORDERS + 1):
        orders_data.append({
            "order_id": i,
            "customer_id": random.randint(1, NUM_CUSTOMERS),
            "employee_id": random.randint(1, NUM_EMPLOYEES),
            "channel_id": random.randint(1, 4),
            "order_date": random_date(start_time, end_time).strftime('%Y-%m-%d %H:%M:%S'),
            "status": random.choice(["PENDING", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"]),
            "total_amount": 0.00  # Calculated later from order items
        })

    # 23. ORDER ITEMS (1000+ rows)
    order_items_data = []
    order_totals = {}
    item_row_counter = 1
    
    for order in orders_data:
        o_id = order["order_id"]
        num_items = random.randint(1, 4)
        total_accum = 0.00
        
        for item_id in range(1, num_items + 1):
            prod = random.choice(products_data)
            qty = random.randint(1, 10)
            u_price = prod["list_price"]
            disc = random.choice([0.00, 0.00, 0.05, 0.10, 0.15])
            
            subtotal = (u_price * qty) * (1 - disc)
            total_accum += subtotal
            
            order_items_data.append({
                "order_id": o_id,
                "item_id": item_id,
                "product_id": prod["product_id"],
                "quantity": qty,
                "unit_price": u_price,
                "discount": disc
            })
        order_totals[o_id] = round(total_accum, 2)
        order["total_amount"] = round(total_accum, 2)

    write_csv("orders.csv", ["order_id", "customer_id", "employee_id", "channel_id", "order_date", "status", "total_amount"], orders_data)
    write_csv("order_items.csv", ["order_id", "item_id", "product_id", "quantity", "unit_price", "discount"], order_items_data)

    # 24. SHIPMENTS (1000+ rows)
    shipments_data = []
    shipment_counter = 1
    for order in orders_data:
        if order["status"] in ["SHIPPED", "COMPLETED"]:
            o_date = datetime.strptime(order["order_date"], '%Y-%m-%d %H:%M:%S')
            shipments_data.append({
                "shipment_id": shipment_counter,
                "order_id": order["order_id"],
                "shipment_date": (o_date + timedelta(days=random.randint(1, 3))).strftime('%Y-%m-%d %H:%M:%S'),
                "carrier_name": random.choice(CARRIERS),
                "tracking_number": f"1Z{random.randint(10000,99999)}AX{random.randint(10000000,99999999)}",
                "delivery_status": "DELIVERED" if order["status"] == "COMPLETED" else "IN_TRANSIT"
            })
            shipment_counter += 1
    write_csv("shipments.csv", ["shipment_id", "order_id", "shipment_date", "carrier_name", "tracking_number", "delivery_status"], shipments_data)

    # 25. INVOICES (1000+ rows)
    invoices_data = []
    invoice_counter = 1
    for order in orders_data:
        if order["status"] != "CANCELLED":
            o_date = datetime.strptime(order["order_date"], '%Y-%m-%d %H:%M:%S')
            tax = round(order["total_amount"] * 0.08, 2)
            invoices_data.append({
                "invoice_id": invoice_counter,
                "order_id": order["order_id"],
                "invoice_date": o_date.strftime('%Y-%m-%d'),
                "due_date": (o_date + timedelta(days=30)).strftime('%Y-%m-%d'),
                "tax_amount": tax,
                "total_due": round(order["total_amount"] + tax, 2),
                "status": "PAID" if order["status"] == "COMPLETED" else random.choice(["UNPAID", "PARTIAL", "OVERDUE"])
            })
            invoice_counter += 1
    write_csv("invoices.csv", ["invoice_id", "order_id", "invoice_date", "due_date", "tax_amount", "total_due", "status"], invoices_data)

    # 26. PAYMENTS (1000+ rows)
    payments_data = []
    payment_counter = 1
    for inv in invoices_data:
        if inv["status"] in ["PAID", "PARTIAL"]:
            inv_date = datetime.strptime(inv["invoice_date"], '%Y-%m-%d')
            amt = inv["total_due"] if inv["status"] == "PAID" else round(inv["total_due"] / 2, 2)
            payments_data.append({
                "payment_id": payment_counter,
                "invoice_id": inv["invoice_id"],
                "payment_date": (inv_date + timedelta(days=random.randint(0, 15))).strftime('%Y-%m-%d %H:%M:%S'),
                "amount": amt,
                "method_id": random.randint(1, 4),
                "reference_number": f"REF-{random.randint(1000000, 9999999)}"
            })
            payment_counter += 1
    write_csv("payments.csv", ["payment_id", "invoice_id", "payment_date", "amount", "method_id", "reference_number"], payments_data)

    # 27. CUSTOMER REVIEWS (1000+ rows)
    reviews_data = []
    for i in range(1, 1500):
        reviews_data.append({
            "review_id": i,
            "customer_id": random.randint(1, NUM_CUSTOMERS),
            "product_id": random.randint(1, NUM_PRODUCTS),
            "rating": random.choice([5, 5, 4, 4, 3, 2, 1]),
            "review_text": f"Automated transactional reference evaluation text for product segment index tracking verification profile {i}.",
            "review_date": random_date(start_time, end_time).strftime('%Y-%m-%d')
        })
    write_csv("customer_reviews.csv", ["review_id", "customer_id", "product_id", "rating", "review_text", "review_date"], reviews_data)

    # 28. SUPPLY ORDERS (1000+ rows)
    supply_orders_data = []
    for i in range(1, NUM_SUPPLY_ORDERS + 1):
        o_date = random_date(start_time, end_time)
        status = random.choice(["PENDING", "SHIPPED", "DELIVERED", "CANCELLED"])
        supply_orders_data.append({
            "supply_order_id": i,
            "supplier_id": random.randint(1, 150),
            "warehouse_id": random.randint(1, 20),
            "order_date": o_date.strftime('%Y-%m-%d %H:%M:%S'),
            "delivery_date": (o_date + timedelta(days=random.randint(5, 14))).strftime('%Y-%m-%d') if status == "DELIVERED" else "",
            "status": status
        })
    write_csv("supply_orders.csv", ["supply_order_id", "supplier_id", "warehouse_id", "order_date", "delivery_date", "status"], supply_orders_data)

    # 29. SUPPLY ORDER ITEMS (1000+ rows)
    supply_items_data = []
    for so in supply_orders_data:
        num_items = random.randint(1, 3)
        for item_id in range(1, num_items + 1):
            prod = random.choice(products_data)
            supply_items_data.append({
                "supply_order_id": so["supply_order_id"],
                "item_id": item_id,
                "product_id": prod["product_id"],
                "quantity": random.choice([50, 100, 200, 500]),
                "unit_cost": prod["cost_price"]
            })
    write_csv("supply_order_items.csv", ["supply_order_id", "item_id", "product_id", "quantity", "unit_cost"], supply_items_data)

    # 30. SUPPORT TICKETS (1000+ rows)
    tickets_data = []
    for i in range(1, NUM_SUPPORT_TICKETS + 1):
        tickets_data.append({
            "ticket_id": i,
            "customer_id": random.randint(1, NUM_CUSTOMERS),
            "assigned_employee_id": random.randint(1, NUM_EMPLOYEES),
            "subject": f"System Connection Interruption Ticket Reference Ref #{i}",
            "status": random.choice(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
            "priority": random.choice(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
            "created_at": random_date(start_time, end_time).strftime('%Y-%m-%d %H:%M:%S')
        })
    write_csv("support_tickets.csv", ["ticket_id", "customer_id", "assigned_employee_id", "subject", "status", "priority", "created_at"], tickets_data)

    # 31. TICKET COMMENTS (1000+ rows)
    comments_data = []
    comment_counter = 1
    for ticket in tickets_data:
        num_comments = random.randint(1, 3)
        t_date = datetime.strptime(ticket["created_at"], '%Y-%m-%d %H:%M:%S')
        for _ in range(num_comments):
            comments_data.append({
                "comment_id": comment_counter,
                "ticket_id": ticket["ticket_id"],
                "author_type": random.choice(["CUSTOMER", "EMPLOYEE"]),
                "comment_text": f"Log context snapshot verification trace parameter notes tracking ticket context identifier sequence {comment_counter}.",
                "created_at": (t_date + timedelta(hours=random.randint(1, 24))).strftime('%Y-%m-%d %H:%M:%S')
            })
            comment_counter += 1
    write_csv("ticket_comments.csv", ["comment_id", "ticket_id", "author_type", "comment_text", "created_at"], comments_data)

    print("\n🎉 Success! All 31 relational schema CSV files have been safely generated.")

if __name__ == "__main__":
    main()
