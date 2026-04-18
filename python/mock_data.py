import uuid
import random
from datetime import datetime, timedelta

# In a real environment, uncomment this to insert into BQ
# from google.cloud import bigquery
# client = bigquery.Client()

PROJECT_ID = "your_project"
DATASET_ID = "self_healing_supply_chain"

DISRUPTION_TYPES = ["delay", "shortage", "failure"]
NODES = ["NODE_A", "NODE_B", "NODE_C", "NODE_D"]
AGENTS = ["supplier", "logistics", "demand"]

def generate_mock_disruptions(num_records=10):
    disruptions = []
    for _ in range(num_records):
        disruptions.append({
            "disruption_id": f"evt-{uuid.uuid4().hex[:8]}",
            "timestamp": (datetime.utcnow() - timedelta(days=random.randint(0, 30))).isoformat(),
            "node_id": random.choice(NODES),
            "type": random.choice(DISRUPTION_TYPES),
            "severity": random.randint(1, 10),
            "description": "Simulated disruption event"
        })
    return disruptions

def generate_mock_decisions(disruptions):
    decisions = []
    for d in disruptions:
        decisions.append({
            "decision_id": f"dec-{uuid.uuid4().hex[:8]}",
            "disruption_id": d["disruption_id"],
            "agent": random.choice(AGENTS),
            "action": "reroute" if d["type"] == "delay" else "reselect_supplier",
            "cost_before": round(random.uniform(1000, 5000), 2),
            "cost_after": round(random.uniform(800, 4800), 2),
            "time_saved": round(random.uniform(5, 48), 1),
            "selected_supplier": f"Supplier_{random.randint(1,5)}",
            "new_route": f"Route_{random.randint(1,5)}",
            "priority_strategy": "standard",
            "timestamp": d["timestamp"]
        })
    return decisions

def insert_into_bq(table_name, rows_to_insert):
    """
    Utility function to insert mock data into BigQuery.
    """
    table_id = f"{PROJECT_ID}.{DATASET_ID}.{table_name}"
    print(f"Mocking insertion into {table_id}...")
    print(f"Sample data row 1: {rows_to_insert[0]}")
    
    # client.insert_rows_json(table_id, rows_to_insert)
    # print(f"Inserted {len(rows_to_insert)} rows into {table_id}")

if __name__ == "__main__":
    disruptions = generate_mock_disruptions(10)
    decisions = generate_mock_decisions(disruptions)
    
    insert_into_bq("disruptions", disruptions)
    insert_into_bq("decisions", decisions)
