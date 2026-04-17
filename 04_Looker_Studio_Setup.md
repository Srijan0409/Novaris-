# Looker Studio Setup Guide: Self-Healing Supply Chain

This guide outlines exactly how to construct the live demo dashboard for the judges. 

> [!IMPORTANT]
> **Data Connection Strategy:** While some panels connect directly to Google Sheets, **Panels 4, 5, and 6 MUST connect to your BigQuery table (`supply_chain.disruption_events`)**. Looker Studio cannot parse nested JSON arrays directly from a Google Sheet string cell, but BigQuery makes this trivial using `JSON_VALUE()` and `UNNEST()`.

---

## PANEL 1: Supply Chain Status (Scorecard Row)
**Top full width.** Four separate Scorecard charts aligned horizontally.

**Card 1 & 2: Active Supplier and Active Route**
1. **Data Source**: BigQuery `supply_chain.disruption_events`
2. **Chart Type**: Scorecard
3. **Setup**:
   - **Metric (Active Supplier)**: Create a calculated field: `JSON_VALUE(recovery_plan, '$.supplier_plan.chosen_supplier_id')`
   - **Metric (Active Route)**: Create a calculated field: `JSON_VALUE(recovery_plan, '$.logistics_plan.new_route_id')`
4. **Filter**: Sort by `timestamp` DESC, limit to 1 row (to show the current active state).

**Card 3 & 4: Cost Saved & Time Saved**
1. **Data Source**: Google Sheets Tab: `demo_metrics`
2. **Chart Type**: Scorecard
3. **Setup**:
   - **Metric (Cost Saved)**: Create a calculated field: `before_cost - after_cost`
   - **Metric (Time Saved)**: Create a calculated field, which requires joining or grabbing `time_saved` from BigQuery, but since you requested it from `demo_metrics`, if `time_saved` isn't in that tab, pull it from BigQuery `time_saved` column directly. 
   - **Style**: Set conditional formatting to turn the metric text **green** if value > 0.
4. **Filter**: Sort by `timestamp` DESC, limit to 1 row.

---

## PANEL 2: Disruption Log
**Left side, 40% width.**

1. **Data Source**: Google Sheets Tab: `disruption_log`
2. **Chart Type**: Table
3. **Setup**:
   - **Dimensions**: `timestamp`, `disruption_type`, `affected_id`, `status`
   - **Metric**: None (hide the Row Count metric in settings).
4. **Filter/Sort**: Default sort by `timestamp` Descending. Set Rows per page to **10**.

---

## PANEL 3: Before vs After Cost Comparison
**Right side, 60% width.**

1. **Data Source**: Google Sheets Tab: `demo_metrics`
2. **Chart Type**: Bar Chart (Grouped)
3. **Setup**:
   - **Dimension**: `timestamp` (formatted as Time or just string for distinct events)
   - **Metrics**: Add both `before_cost` and `after_cost`.
4. **Style**: Set `before_cost` to Grey/Red and `after_cost` to **Green**. This visually proves the AI intervention saved money compared to the baseline.

---

## PANEL 4: Agent Reasoning Trace 
**Full width. Label prominently: "Agent Reasoning Trace"**

> [!CAUTION]
> Because the `recovery_plan` in Sheets is a JSON string, you must use a **BigQuery Custom SQL Data Source** to cleanly extract these text blocks for the judges to read.

1. **Data Source**: BigQuery Custom SQL Query:
   ```sql
   SELECT 
     timestamp,
     JSON_VALUE(recovery_plan, '$.supplier_plan.chosen_supplier_id') AS agent_1_supplier,
     JSON_VALUE(recovery_plan, '$.supplier_plan.reason') AS agent_1_reason,
     JSON_VALUE(recovery_plan, '$.logistics_plan.new_route_id') AS agent_2_route,
     JSON_VALUE(recovery_plan, '$.logistics_plan.reroute_reason') AS agent_2_reason,
     JSON_VALUE(recovery_plan, '$.demand_plan.orders_at_risk') AS agent_3_orders_affected,
     JSON_VALUE(recovery_plan, '$.demand_plan.summary') AS agent_3_summary
   FROM \`YOUR_PROJECT_ID.supply_chain.disruption_events\`
   ```
2. **Chart Type**: Table
3. **Setup**: Add all 7 SQL columns as Dimensions. Remove metrics. Wrap text on the "reason" and "summary" columns so the judges can read the AI's LLM reasoning natively in the table.

---

## PANEL 5: Orders at Risk
**Left side, 50% width.**

> [!IMPORTANT]
> The `repriority_list` is an array of objects inside the JSON. Looker Studio tables require flat rows. You must flatten it via BigQuery UNNEST.

1. **Data Source**: BigQuery Custom SQL Query:
   ```sql
   SELECT 
     JSON_VALUE(o, '$.order_id') AS order_id,
     JSON_VALUE(o, '$.customer_name') AS customer_name,
     CAST(JSON_VALUE(o, '$.priority') AS INT64) AS priority,
     JSON_VALUE(o, '$.new_delivery_date') AS new_delivery_date,
     JSON_VALUE(o, '$.status') AS status
   FROM \`YOUR_PROJECT_ID.supply_chain.disruption_events\`,
   UNNEST(JSON_QUERY_ARRAY(recovery_plan, '$.demand_plan.repriority_list')) AS o
   WHERE timestamp = (SELECT MAX(timestamp) FROM \`YOUR_PROJECT_ID.supply_chain.disruption_events\`)
   ```
2. **Chart Type**: Table
3. **Setup**: Add all fields as Dimensions.
4. **Style**: Add conditional formatting on the `status` Dimension:
   - If `status` contains "at_risk", Background Color = Red (or light red).
   - If `status` contains "on_track", Background Color = Green.

---

## PANEL 6: Buffer Stock Gauge
**Right side, 50% width. Subtitle: "Units of safety stock recommended by Demand Agent"**

1. **Data Source**: BigQuery `supply_chain.disruption_events` 
2. **Chart Type**: Scorecard (or Gauge)
3. **Setup**:
   - **Metric**: Create calculated field: `CAST(JSON_VALUE(recovery_plan, '$.demand_plan.buffer_stock_needed') AS NUMBER)`
4. **Filter**: Sort by timestamp DESC, limit to latest row.

---

## ⚡ The Live Demo Refresh Hack

By default, Looker Studio caches data for 15 minutes. In a live hackathon pitch, you need the dashboard to update immediately when you submit the Google Form. 

**Here is the trick to force an instant refresh:**

1. Install a free Chrome Extension called **"Auto Refresh Plus"** (or use any tab auto-refresher).
2. Looker Studio has a native hidden feature: appending `?refresh=true` to the dashboard URL bypasses cache and queries the live data sources. 
3. Set the Auto Refresh extension to reload your dashboard URL with the `?refresh=true` parameter every **5 seconds**.
4. Hide the Chrome UI (go full screen `F11`). 

When you hit submit on the Google Form during the demo, Looker Studio will query BigQuery and Google Sheets within ~5-10 seconds, and the dashboard will magically heal itself on screen with zero human clicks!
