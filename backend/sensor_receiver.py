import json
import os
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    load_dotenv(Path(__file__).resolve().parent / ".env")

PORT = int(os.getenv("RECEIVER_UDP_PORT", "5005"))
NODE_PORT = int(os.getenv("PORT", "5000"))
NODE_SENSOR_URL = os.getenv("NODE_SENSOR_URL", f"http://localhost:{NODE_PORT}/api/sensors/alert")

# Global variables for state tracking
last_pitch = None
last_roll = None

# Throttle cache: stores (alert_type, round(lat, 5), round(lng, 5)) -> timestamp
last_sent_times = {}

# Map local alert names to the backend valid alert types
MAP_ALERT_TYPES = {
    "gas": "gas_leak",
    "fire": "fire",
    "accident": "accident"
}


def detect_alert(payload):
    global last_pitch, last_roll
    gas = payload.get("gas", "Clean")
    mq2 = float(payload.get("mq2", 0) or 0)
    flame = int(payload.get("flame", 0) or 0)
    temperature = float(payload.get("temp", payload.get("temperature", 0)) or 0)
    pitch = float(payload.get("pitch", 0) or 0)
    roll = float(payload.get("roll", 0) or 0)

    accident = False
    if last_pitch is not None and last_roll is not None:
        accident = abs(pitch - last_pitch) > 28 or abs(roll - last_roll) > 28
    accident = accident or abs(pitch) > 55 or abs(roll) > 55
    last_pitch = pitch
    last_roll = roll

    
    if str(gas).lower() not in ["clean", "normal", "0"] or mq2 > 650:
        return "gas", mq2 or 1
    if flame == 1 and temperature > 40:
        return "fire", max(temperature, flame)
    if accident:
        return "accident", max(abs(pitch), abs(roll))
    return None, None


def maybe_forward(message):
    try:
        # Normalize: Strip 'Received:' prefix if present in the raw message
        message = message.strip()
        if message.startswith("Received:"):
            message = message[len("Received:"):].strip()

        timestamp_str, raw_json = message.split(",", 1)
        payload = json.loads(raw_json)
        detected_type, value = detect_alert(payload)

        if not detected_type:
            return

        latitude = float(payload.get("lat", payload.get("latitude", 12.9716)))
        longitude = float(payload.get("lng", payload.get("longitude", 77.5946)))
        
        # 1. Map to backend valid alert types
        alert_type = MAP_ALERT_TYPES.get(detected_type, detected_type)

        # 2. Local 20-second throttle check
        now = time.time()
        # Round latitude/longitude to 5 decimal places (approx 1.1 meters accuracy)
        throttle_key = (alert_type, round(latitude, 5), round(longitude, 5))
        if throttle_key in last_sent_times:
            elapsed = now - last_sent_times[throttle_key]
            if elapsed < 20:
                print(f"Throttled: {alert_type} alert at ({latitude}, {longitude}) skipped. Sent {elapsed:.1f}s ago.")
                return

        # Update last sent time
        last_sent_times[throttle_key] = now

        # Convert timestamp to ISO-8601 format
        try:
            dt = datetime.strptime(timestamp_str.strip(), "%d/%m/%Y %H:%M:%S")
            iso_timestamp = dt.isoformat() + "Z"
        except Exception:
            iso_timestamp = datetime.utcnow().isoformat() + "Z"

        # 3. Create the payload and invoke curl as requested
        alert_payload = {
            "alert_type": alert_type,
            "value": value,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": iso_timestamp
        }
        
        payload_str = json.dumps(alert_payload)
        
        curl_command = [
            "curl",
            "-s",  # silent
            "-X", "POST",
            "-H", "Content-Type: application/json",
            "-d", payload_str,
            NODE_SENSOR_URL
        ]
        
        print(f"\nForwarding alert to Node.js backend: {alert_type} at ({latitude}, {longitude})")
        print(f"Executing command: {' '.join(curl_command)}")
        
        # Execute the curl command using subprocess
        res = subprocess.run(curl_command, capture_output=True, text=True)
        if res.returncode == 0:
            print("Response:", res.stdout.strip())
            try:
                resp_json = json.loads(res.stdout)
                if resp_json.get("isDuplicate"):
                    print("Backend flagged this alert as a 10-minute duplicate. No new incident generated.")
                else:
                    print("Incident registered successfully on backend.")
            except Exception:
                pass
        else:
            print(f"Curl failed with return code {res.returncode}: {res.stderr}")

    except Exception as exc:
        print("Forward failed:", exc)


# Bind UDP socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", PORT))

print(f"UDP Sensor Receiver listening on port {PORT}...")
print(f"Forwarding endpoint: {NODE_SENSOR_URL}")

try:
    while True:
        data, addr = sock.recvfrom(1024)
        message = data.decode()
        print(f"Received: {message}")
        maybe_forward(message)
except KeyboardInterrupt:
    print("\nReceiver stopped by user.")
