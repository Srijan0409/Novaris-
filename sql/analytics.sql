-- Step 6: ANALYTICS LAYER

-- 1. Average Cost & Time Savings per Disruption Type
SELECT 
    d.type,
    COUNT(dec.decision_id) AS total_interventions,
    ROUND(AVG(dec.cost_before - dec.cost_after), 2) AS avg_cost_saved,
    ROUND(AVG(dec.time_saved), 2) AS avg_time_saved
FROM `your_project.self_healing_supply_chain.disruptions` d
JOIN `your_project.self_healing_supply_chain.decisions` dec
  ON d.disruption_id = dec.disruption_id
GROUP BY d.type
ORDER BY avg_cost_saved DESC;

-- 2. Supplier Reliability Ranking (Based on memory's success track record)
SELECT 
    context AS supplier_used, -- In production, ensure supplier ID is parsed from context or joined.
    COUNT(*) AS times_selected,
    ROUND(AVG(success_score), 2) AS avg_success_score,
    ROUND(AVG(supplier_score), 2) AS avg_supplier_rating
FROM `your_project.self_healing_supply_chain.agent_memory`
WHERE supplier_score IS NOT NULL
GROUP BY supplier_used
ORDER BY avg_success_score DESC
LIMIT 10;

-- 3. Disruption Frequency Trends (Weekly views for dashboards)
SELECT 
    DATE_TRUNC(DATE(timestamp), WEEK) AS disruption_week,
    type,
    node_id,
    COUNT(disruption_id) AS frequency
FROM `your_project.self_healing_supply_chain.disruptions`
GROUP BY disruption_week, type, node_id
ORDER BY disruption_week DESC;
