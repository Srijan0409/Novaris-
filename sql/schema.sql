-- Step 2: BIGQUERY SETUP
-- Create Dataset: (Run this in BigQuery console or via CLI)
-- CREATE SCHEMA IF NOT EXISTS `your_project.self_healing_supply_chain` OPTIONS(location='US');

-- 1. disruptions table
CREATE TABLE IF NOT EXISTS `your_project.self_healing_supply_chain.disruptions` (
    disruption_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    node_id STRING NOT NULL,
    type STRING NOT NULL, -- delay, shortage, failure
    severity INT64 NOT NULL,
    description STRING
)
-- Partitioning by timestamp allows efficient time-based analytics and prunes data for cheaper queries.
PARTITION BY DATE(timestamp)
-- Clustering by node_id and type to speed up filtering on specific supply chain nodes or disruption types.
CLUSTER BY node_id, type;

-- 2. decisions table
CREATE TABLE IF NOT EXISTS `your_project.self_healing_supply_chain.decisions` (
    decision_id STRING NOT NULL,
    disruption_id STRING NOT NULL,
    agent STRING NOT NULL, -- supplier, logistics, demand
    action STRING NOT NULL,
    cost_before FLOAT64,
    cost_after FLOAT64,
    time_saved FLOAT64,
    selected_supplier STRING,
    new_route STRING,
    priority_strategy STRING,
    timestamp TIMESTAMP NOT NULL
)
PARTITION BY DATE(timestamp)
CLUSTER BY agent, action;

-- 3. agent_memory table
CREATE TABLE IF NOT EXISTS `your_project.self_healing_supply_chain.agent_memory` (
    memory_id STRING NOT NULL,
    context STRING NOT NULL, -- summarized situation
    action_taken STRING NOT NULL,
    outcome STRING NOT NULL,
    success_score FLOAT64 NOT NULL,
    supplier_score FLOAT64,
    route_score FLOAT64,
    timestamp TIMESTAMP NOT NULL,
    
    -- Added mapping for similarity matching
    disruption_type STRING, 
    disruption_severity INT64,
    node_id STRING
)
PARTITION BY DATE(timestamp)
CLUSTER BY disruption_type, node_id;
