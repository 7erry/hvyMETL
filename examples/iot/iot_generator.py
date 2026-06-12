import csv
import random
from datetime import datetime, timedelta

# Configuration
NUM_SITES = 5
NUM_DEVICES_PER_SITE = 4
DAYS_OF_HISTORY = 3          # Scale this up for larger datasets
READING_INTERVAL_MINS = 15   # Frequency of telemetry readings

def generate_iot_csv_dataset():
    print("Starting CSV data generation...")

    # -------------------------------------------------------------------------
    # 1. Generate and Write Sites
    # -------------------------------------------------------------------------
    print("Writing sites.csv...")
    site_templates = [
        ("Alpha Facility", "America/New_York", 40.7128, -74.0060),
        ("Beta Plant", "Europe/London", 51.5074, -0.1278),
        ("Gamma Outpost", "Asia/Tokyo", 35.6762, 139.6503),
        ("Delta Warehouse", "Australia/Sydney", -33.8688, 151.2093),
        ("Epsilon Lab", "Europe/Berlin", 52.5200, 13.4050)
    ]
    
    sites_data = []
    with open('sites.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name', 'timezone', 'latitude', 'longitude'])
        
        for i in range(NUM_SITES):
            template = site_templates[i % len(site_templates)]
            # Append counter if we exceed the unique base templates
            name = f"{template[0]} {((i // len(site_templates)) + 1) if i >= len(site_templates) else ''}".strip()
            site_id = i + 1
            row = [site_id, name, template[1], template[2], template[3]]
            writer.writerow(row)
            sites_data.append(site_id)

    # -------------------------------------------------------------------------
    # 2. Generate and Write Firmware Versions
    # -------------------------------------------------------------------------
    print("Writing firmware_versions.csv...")
    firmware_data = [
        (1, "v1.0.0", "2024-01-15 08:00:00", "Initial production release."),
        (2, "v1.1.2", "2024-06-20 14:30:00", "Patch for connection stability issues."),
        (3, "v2.0.0", "2025-02-10 10:15:00", "Major upgrade with optimized telemetry payload.")
    ]
    with open('firmware_versions.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'version', 'released_at', 'changelog'])
        for fw in firmware_data:
            writer.writerow(fw)

    # -------------------------------------------------------------------------
    # 3. Generate and Write Devices
    # -------------------------------------------------------------------------
    print("Writing devices.csv...")
    device_models = ["Nexus-IoT-v1", "QuantumSense-X", "ApexGateway-500"]
    devices_data = [] # Track IDs for child tables
    device_id = 1
    
    with open('devices.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'site_id', 'firmware_id', 'serial_number', 'model', 'installed_at', 'is_online'])
        
        for site_id in sites_data:
            for _ in range(NUM_DEVICES_PER_SITE):
                firmware_id = random.choice([1, 2, 3])
                serial_number = f"SN-{random.randint(100000, 999999)}-{device_id}"
                model = random.choice(device_models)
                
                days_ago = random.randint(10, 300)
                installed_at = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")
                is_online = 1 if random.random() > 0.05 else 0 # 95% online probability
                
                writer.writerow([device_id, site_id, firmware_id, serial_number, model, installed_at, is_online])
                devices_data.append(device_id)
                device_id += 1

    # -------------------------------------------------------------------------
    # 4. Generate and Write Sensors
    # -------------------------------------------------------------------------
    print("Writing sensors.csv...")
    sensor_profiles = [
        {"kind": "Temperature", "unit": "°C", "precision": 1, "range": (-10, 45)},
        {"kind": "Humidity", "unit": "%", "precision": 0, "range": (20, 90)},
        {"kind": "Pressure", "unit": "hPa", "precision": 2, "range": (980, 1030)},
        {"kind": "Power Consumption", "unit": "kWh", "precision": 3, "range": (0, 15)}
    ]
    
    sensor_meta_lookup = {} # In-memory map to feed the readings table generator
    sensor_id = 1
    
    with open('sensors.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'device_id', 'kind', 'unit', 'precision_digits'])
        
        for dev_id in devices_data:
            # Assign 2 to 4 unique sensors to every device
            assigned_profiles = random.sample(sensor_profiles, k=random.randint(2, 4))
            
            for profile in assigned_profiles:
                writer.writerow([sensor_id, dev_id, profile["kind"], profile["unit"], profile["precision"]])
                
                # Cache metadata for generating time-series telemetry later
                sensor_meta_lookup[sensor_id] = {
                    "device_id": dev_id,
                    "range": profile["range"],
                    "precision": profile["precision"]
                }
                sensor_id += 1

    # -------------------------------------------------------------------------
    # 5. Generate and Write Sensor Readings (The Fire Hose)
    # -------------------------------------------------------------------------
    print(f"Streaming sensor_readings.csv ({DAYS_OF_HISTORY} days of historical telemetry)...")
    reading_id = 1
    start_time = datetime.now() - timedelta(days=DAYS_OF_HISTORY)
    end_time = datetime.now()
    
    with open('sensor_readings.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'sensor_id', 'device_id', 'recorded_at', 'value', 'quality_flag'])
        
        current_time = start_time
        rows_written = 0
        
        while current_time <= end_time:
            time_str = current_time.strftime("%Y-%m-%d %H:%M:%S")
            
            for s_id, meta in sensor_meta_lookup.items():
                min_val, max_val = meta["range"]
                raw_value = random.uniform(min_val, max_val)
                value = round(raw_value, meta["precision"])
                
                # Quality flags: 0 = Good, 1 = Degraded, 2 = Critical Error
                quality_rand = random.random()
                quality_flag = 0 if quality_rand > 0.02 else (1 if quality_rand > 0.005 else 2)
                
                writer.writerow([reading_id, s_id, meta["device_id"], time_str, value, quality_flag])
                reading_id += 1
                rows_written += 1
                
                if rows_written % 100000 == 0:
                    print(f"... written {rows_written:,} telemetry rows")
                    
            current_time += timedelta(minutes=READING_INTERVAL_MINS)

    # -------------------------------------------------------------------------
    # 6. Generate and Write Device Alerts
    # -------------------------------------------------------------------------
    print("Writing device_alerts.csv...")
    alert_messages = {
        "INFO": ["System rebooted cleanly", "Configuration sync complete", "Firmware integrity verified"],
        "WARNING": ["High operational temperature threshold breached", "Intermittent packet loss detected", "Battery backup low"],
        "CRITICAL": ["Hardware sub-component failure", "Unscheduled disconnection state reached", "Power line surge intercepted"]
    }
    
    alert_id = 1
    with open('device_alerts.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'device_id', 'severity', 'message', 'raised_at', 'acknowledged_at'])
        
        for dev_id in devices_data:
            # 30% chance a device has experienced an alert over history
            if random.random() < 0.30:
                num_alerts = random.randint(1, 3)
                for _ in range(num_alerts):
                    severity = random.choice(["INFO", "WARNING", "CRITICAL"])
                    message = random.choice(alert_messages[severity])
                    
                    alert_days_ago = random.uniform(0, DAYS_OF_HISTORY)
                    raised_dt = datetime.now() - timedelta(days=alert_days_ago)
                    raised_at = raised_dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    if severity == "INFO" or random.random() > 0.3:
                        ack_dt = raised_dt + timedelta(minutes=random.randint(2, 120))
                        acknowledged_at = ack_dt.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        acknowledged_at = "" # Empty column for NULL/None values
                        
                    writer.writerow([alert_id, dev_id, severity, message, raised_at, acknowledged_at])
                    alert_id += 1

    print("\nGeneration Complete! Generated Files:")
    print(" - sites.csv")
    print(" - firmware_versions.csv")
    print(" - devices.csv")
    print(" - sensors.csv")
    print(" - sensor_readings.csv")
    print(" - device_alerts.csv")

if __name__ == "__main__":
    generate_iot_csv_dataset()
