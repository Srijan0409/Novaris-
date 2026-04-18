import uuid
from datetime import datetime

# from google.cloud import bigquery
# client = bigquery.Client()
PROJECT_ID = "your_project"
DATASET_ID = "self_healing_supply_chain"

def calculate_success_score(cost_saved, time_saved, reliability_improvement):
    """
    Computes a success score (0-100) based on multiple weighted factors.
    """
    w_cost = 0.5
    w_time = 0.3
    w_rel = 0.2
    
    norm_cost = min(cost_saved / 1000.0, 1.0) * 100
    norm_time = min(time_saved / 48.0, 1.0) * 100
    norm_rel = min(reliability_improvement / 10.0, 1.0) * 100
    
    score = (w_cost * norm_cost) + (w_time * norm_time) + (w_rel * norm_rel)
    return round(score, 2)

def store_memory(decision_record, context, outcome, disruption_event, reliability_improvement=5):
    """
    Stores an agent's experience in the knowledge system.
    Extracts the disruption info to enable fast exact-match lookup later.
    """
    cost_saved = decision_record["cost_before"] - decision_record["cost_after"]
    score = calculate_success_score(cost_saved, decision_record["time_saved"], reliability_improvement)
    
    memory_record = {
        "memory_id": f"mem-{uuid.uuid4().hex[:8]}",
        "context": context,
        "action_taken": decision_record["action"],
        "outcome": outcome,
        "success_score": score,
        "supplier_score": 85.0 if decision_record["selected_supplier"] else None,
        "route_score": 90.0 if decision_record["new_route"] else None,
        "timestamp": datetime.utcnow().isoformat(),
        
        "disruption_type": disruption_event["type"],
        "disruption_severity": disruption_event["severity"],
        "node_id": disruption_event["node_id"]
    }
    
    # client.insert_rows_json(f"{PROJECT_ID}.{DATASET_ID}.agent_memory", [memory_record])
    return memory_record

def retrieve_top_solutions(disruption_type, severity, node_id, top_k=3):
    """
    Retrieves the most successful past actions for a similar disruption.
    Implements weighted scoring for node_id and closeness in severity.
    """
    query = f"""
    SELECT 
        action_taken, outcome, success_score, context,
        supplier_score, route_score,
        (IF(node_id = @node_id, 50, 0) + 
         (50 - ABS(disruption_severity - @severity) * 5)) as similarity_score
    FROM `{PROJECT_ID}.{DATASET_ID}.agent_memory`
    WHERE disruption_type = @disruption_type
    ORDER BY similarity_score DESC, success_score DESC
    LIMIT @top_k
    """
    
    '''
    # Using python BQ Client API:
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("disruption_type", "STRING", disruption_type),
            bigquery.ScalarQueryParameter("severity", "INT64", severity),
            bigquery.ScalarQueryParameter("node_id", "STRING", node_id),
            bigquery.ScalarQueryParameter("top_k", "INT64", top_k),
        ]
    )
    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]
    '''
    
    # Static fallback for no-dependency environments
    return [
        {
            "action_taken": "reroute", 
            "success_score": 95.5, 
            "similarity_score": 90, 
            "outcome": "Saved 10 hrs"
        }
    ]

if __name__ == "__main__":
    print("Simulating retrieval of memory context:")
    solutions = retrieve_top_solutions("delay", 8, "NODE_A")
    print(solutions)
