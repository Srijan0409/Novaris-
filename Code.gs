/**
 * Self-Healing Supply Chain Backend
 * Google Solution Challenge 2026
 * 
 * Orchestrates a multi-agent AI system (Supplier, Logistics, Demand) using Gemini 1.5 Pro 
 * to handle supply chain disruptions autonomously and stream telemetry to BigQuery.
 */

// ==========================================
// CONFIGURATION
// ==========================================
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // Replace with your Google AI Studio API key
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY;
const ALERT_EMAIL = "admin@example.com";     // Replace with target alert email
const GCP_PROJECT_ID = "YOUR_PROJECT_ID";    // Replace with GCP project ID for BigQuery

// ==========================================
// AGENT SYSTEM PROMPTS (CONSTANTS)
// ==========================================
const AGENT_1_SUPPLIER_PROMPT = `
You are the Supplier Agent in an autonomous supply chain recovery system. Your only job is to find the best backup supplier when the primary supplier fails.

You will receive a JSON object with:
- "disruption": { "type": string, "affected_supplier_id": string, "timestamp": string }
- "suppliers": array of supplier objects, each with fields: id, name, cost_per_unit, lead_days, reliability_score (0-1), status ("active" or "backup"), region

YOUR TASK:
1. Identify all suppliers where status = "backup"
2. Score each backup supplier using this formula: score = (reliability_score * 0.5) + ((1 / cost_per_unit) * 0.3) + ((1 / lead_days) * 0.2)
3. Pick the highest scoring backup supplier
4. Explain your reasoning in 2 sentences maximum

OUTPUT RULES:
- Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation outside the JSON.
- JSON format must be exactly:
{
  "chosen_supplier_id": "string",
  "chosen_supplier_name": "string",
  "score": number,
  "cost_delta": number,
  "lead_days": number,
  "reliability_score": number,
  "reason": "string (2 sentences max)"
}

If no backup supplier is available, return: { "error": "no_backup_available" }
`;

const AGENT_2_LOGISTICS_PROMPT = `
You are the Logistics Agent in an autonomous supply chain recovery system. Your job is to find the optimal shipping route given that the supplier has changed.

You will receive a JSON object with:
- "supplier_decision": the full output from the Supplier Agent (which backup supplier was chosen)
- "routes": array of route objects, each with fields: id, origin_region, destination, cost_per_shipment, eta_hours, carrier, status ("active" or "alternate"), reliability_score (0-1)

YOUR TASK:
1. Filter routes where origin_region matches the chosen supplier's region
2. From those, filter routes where status = "alternate" (since the primary route may now be suboptimal)
3. Score each valid route: score = (reliability_score * 0.4) + ((1 / cost_per_shipment) * 0.3) + ((1 / eta_hours) * 0.3)
4. Pick the highest scoring route
5. Calculate time_saved_hours = old_eta_hours - new_eta_hours (use 72 hours as default old ETA if unknown)

OUTPUT RULES:
- Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation outside the JSON.
- JSON format must be exactly:
{
  "new_route_id": "string",
  "carrier": "string",
  "cost_per_shipment": number,
  "eta_hours": number,
  "time_saved_hours": number,
  "cost_change": number,
  "reroute_reason": "string (2 sentences max)"
}

If no valid alternate route exists, return: { "error": "no_alternate_route" }
`;

const AGENT_3_DEMAND_PROMPT = `
You are the Demand Agent in an autonomous supply chain recovery system. Your job is to assess which customer orders are at risk and reprioritise them given the new supplier and route.

You will receive a JSON object with:
- "supplier_decision": output from Supplier Agent
- "logistics_decision": output from Logistics Agent
- "orders": array of order objects, each with fields: id, customer_name, qty, priority (1=high, 2=medium, 3=low), expected_delivery_date, supplier_id, status ("pending" or "processing")

YOUR TASK:
1. Identify orders linked to the broken supplier (supplier_id matches affected_supplier_id)
2. Calculate new expected delivery date using: today + new lead_days + new eta_hours/24
3. Flag any orders where new delivery date exceeds original expected_delivery_date by more than 2 days as "at_risk"
4. For at-risk orders, recommend buffer stock needed = qty * 0.2 (20% safety buffer)
5. Produce a repriority list: sort all affected orders by priority ascending (1 first), then by qty descending

OUTPUT RULES:
- Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation outside the JSON.
- JSON format must be exactly:
{
  "total_orders_affected": number,
  "orders_at_risk": number,
  "buffer_stock_needed": number,
  "total_cost_impact": number,
  "repriority_list": [ { "order_id": "string", "customer_name": "string", "priority": number, "qty": number, "new_delivery_date": "YYYY-MM-DD", "status": "at_risk" or "on_track" } ],
  "summary": "string (3 sentences max, plain language summary for the dashboard)"
}

If no orders are affected, return: { "total_orders_affected": 0, "orders_at_risk": 0, "buffer_stock_needed": 0, "repriority_list": [], "summary": "No orders affected by this disruption." }
`;

// ==========================================
// MAIN TRIGGER FUNCTION
// ==========================================

/**
 * Trigger function for Event Detection (Google Form Submit)
 * Runs the autonomous recovery pipeline from end to end.
 */
function onFormSubmit(e) {
  try {
    Logger.log("STEP 1: EVENT DETECTION START");
    
    // Extract variables from the Form submission. Standard fallback values for testing.
    const disruptionType = (e && e.namedValues && e.namedValues['disruption_type']) ? e.namedValues['disruption_type'][0] : "Port Delay";
    const affectedId = (e && e.namedValues && e.namedValues['affected_id']) ? e.namedValues['affected_id'][0] : "ROUTE_123";
    const timestamp = (e && e.namedValues && e.namedValues['Timestamp']) ? e.namedValues['Timestamp'][0] : new Date().toISOString();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName("disruption_log");
    if(logSheet) {
      logSheet.appendRow([timestamp, disruptionType, affectedId, "pending"]);
    }
    Logger.log("STEP 1 COMPLETED. Event logged.");

    Logger.log("STEP 2: READ CURRENT STATE START");
    const suppliersSheet = ss.getSheetByName("suppliers");
    const routesSheet = ss.getSheetByName("routes");
    const ordersSheet = ss.getSheetByName("orders");
    
    // Read to JSON arrays
    const suppliersData = sheetToJSON(suppliersSheet);
    const routesData = sheetToJSON(routesSheet);
    const ordersData = sheetToJSON(ordersSheet);
    
    // Mark the affected component as broken in our database (Google Sheets)
    if (disruptionType === "Supplier Shutdown") {
      markAsBroken(suppliersSheet, affectedId);
    } else { // Port Delay or Route Blocked
      markAsBroken(routesSheet, affectedId);
    }
    Logger.log("STEP 2 COMPLETED. State arrays initialized and sheets updated.");
    
    Logger.log("STEP 3: AGENT 1 (SUPPLIER AGENT) START");
    const disruptionContext = `Disruption Type: ${disruptionType}, Affected ID: ${affectedId}`;
    
    // Prompt includes the state, limited to ~8000 characters to prevent timeouts/payload size limits
    const supplierUserPrompt = `
    Context: ${disruptionContext}
    Suppliers JSON: ${JSON.stringify(suppliersData).substring(0, 7500)}
    `;
    
    const agent1Output = callGemini(AGENT_1_SUPPLIER_PROMPT, supplierUserPrompt);
    if (!agent1Output) throw new Error("Agent 1 failed to return valid data.");
    Logger.log("STEP 3 COMPLETED. Agent 1 Output: " + JSON.stringify(agent1Output));
    
    Logger.log("STEP 4: AGENT 2 (LOGISTICS AGENT) START");
    const logsticsUserPrompt = `
    Agent 1 Decision: ${JSON.stringify(agent1Output)}
    Routes JSON: ${JSON.stringify(routesData).substring(0, 7500)}
    `;
    
    const agent2Output = callGemini(AGENT_2_LOGISTICS_PROMPT, logsticsUserPrompt);
    if (!agent2Output) throw new Error("Agent 2 failed to return valid data.");
    Logger.log("STEP 4 COMPLETED. Agent 2 Output: " + JSON.stringify(agent2Output));
    
    Logger.log("STEP 5: AGENT 3 (DEMAND AGENT) START");
    const demandUserPrompt = `
    Agent 1 Decision: ${JSON.stringify(agent1Output)}
    Agent 2 Decision: ${JSON.stringify(agent2Output)}
    Orders JSON: ${JSON.stringify(ordersData).substring(0, 7000)}
    `;
    
    const agent3Output = callGemini(AGENT_3_DEMAND_PROMPT, demandUserPrompt);
    if (!agent3Output) throw new Error("Agent 3 failed to return valid data.");
    Logger.log("STEP 5 COMPLETED. Agent 3 Output: " + JSON.stringify(agent3Output));
    
    Logger.log("STEP 6: AUTONOMOUS RECOVERY START");
    // Update the database sheets with the final decisions from Agent 1 and Agent 2
    replaceBrokenWithActive(suppliersSheet, agent1Output.chosen_supplier_id);
    replaceBrokenWithActive(routesSheet, agent2Output.new_route_id);
    
    // Compute Cost before and after
    const beforeCost = 100000; // Example baseline standard cost metric
    const afterCost = beforeCost + agent1Output.cost_delta + agent2Output.cost_change;
    
    const demoMetricsSheet = ss.getSheetByName("demo_metrics");
    if(demoMetricsSheet) {
      demoMetricsSheet.appendRow([timestamp, beforeCost, afterCost]);
    }
    
    const fullRecoveryPlan = {
      timestamp: timestamp,
      disruptionType: disruptionType,
      affectedId: affectedId,
      supplier_plan: agent1Output,
      logistics_plan: agent2Output,
      demand_plan: agent3Output
    };
    
    const recoverySheet = ss.getSheetByName("recovery_plan");
    if(recoverySheet) {
      recoverySheet.appendRow([timestamp, JSON.stringify(fullRecoveryPlan)]);
    }
    Logger.log("STEP 6 COMPLETED. Sheets and Metrics updated with Recovery Plan.");
    
    Logger.log("STEP 7: BIGQUERY STREAM START");
    streamToBigQuery({
      timestamp: timestamp,
      disruption_type: disruptionType,
      affected_id: affectedId,
      recovery_plan: JSON.stringify(fullRecoveryPlan),
      cost_delta: agent1Output.cost_delta + agent2Output.cost_change,
      time_saved: agent2Output.time_saved_hours
    });
    Logger.log("STEP 7 COMPLETED. Data streamed to BigQuery.");
    
    Logger.log("STEP 8: ALERT START");
    const netCostDelta = agent1Output.cost_delta + agent2Output.cost_change;
    sendAlertEmail(disruptionType, affectedId, agent1Output, agent2Output, netCostDelta);
    Logger.log("STEP 8 COMPLETED. Alert sent to stakeholders.");
    
    // Mark original disruption log entry as resolved
    if(logSheet) {
      logSheet.getRange(logSheet.getLastRow(), 4).setValue("resolved");
    }
    
    Logger.log("SUCCESS: Autonomous System Recovery Loop finished.");

  } catch (err) {
    Logger.log("CRITICAL PIPELINE ERROR: " + err.toString() + "\\n" + err.stack);
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Calls Gemini API safely, catching any exceptions and parsing the returned JSON.
 */
function callGemini(systemPrompt, userText) {
  const payload = {
    "system_instruction": { "parts": [{ "text": systemPrompt }] },
    "contents": [ { "role": "user", "parts": [{"text": userText}] } ]
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(GEMINI_URL, options);
    const result = JSON.parse(response.getContentText());
    
    if(result.error) {
       Logger.log("Gemini API Exception: " + JSON.stringify(result.error));
       return null;
    }
    
    const textOutput = result.candidates[0].content.parts[0].text;
    const parsedData = cleanJSONResponse(textOutput);
    return JSON.parse(parsedData);
    
  } catch (error) {
    Logger.log("Error invoking Gemini API: " + error.toString());
    return null;
  }
}

/**
 * Safely strips markdown backticks and whitespace to ensure Valid JSON from the LLM.
 */
function cleanJSONResponse(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

/**
 * Converts a 2D sheet range into an array of JS Objects (mapping row vectors against headers).
 */
function sheetToJSON(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0];
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    headers.forEach((key, index) => {
      obj[key] = row[index];
    });
    result.push(obj);
  }
  return result;
}

/**
 * Searches the 'status' column and marks the specific record ID as 'broken'
 * Assumes ID is in the first column (index 0).
 */
function markAsBroken(sheet, id) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusIndex = headers.indexOf("status");
  
  if (statusIndex === -1) return;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) { // Found our row
      sheet.getRange(i + 1, statusIndex + 1).setValue("broken");
      break;
    }
  }
}

/**
 * Marks the agent-selected backup ID as 'active' in the database.
 */
function replaceBrokenWithActive(sheet, newId) {
  if(!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusIndex = headers.indexOf("status");
  
  if (statusIndex === -1) return;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == newId) {
      sheet.getRange(i + 1, statusIndex + 1).setValue("active");
      break;
    }
  }
}

/**
 * Streams the disruption and actions to BigQuery to act as the persistent memory layer.
 * Note:Requires the generic 'BigQuery' Advanced Service enabled in Apps Script.
 */
function streamToBigQuery(dataRow) {
  const datasetId = "supply_chain";
  const tableId = "disruption_events";
  
  const request = {
    rows: [ { json: dataRow } ]
  };
  
  try {
    BigQuery.Tabledata.insertAll(request, GCP_PROJECT_ID, datasetId, tableId);
    Logger.log("BigQuery insert success.");
  } catch (err) {
    Logger.log("BigQuery API Error: " + err);
  }
}

/**
 * Final step. Dispatches an email leveraging Gmail services automatically.
 */
function sendAlertEmail(disruptionType, affectedId, a1Plan, a2Plan, costDelta) {
  const subject = "Supply Chain Alert: Auto-Recovery Complete";
  const body = \`
A supply chain disruption has been automatically detected and resolved.

DISRUPTION DETAILS:
Type: \${disruptionType}
Failed Component: \${affectedId}

AGENT 1 (SUPPLIER RECOVERY):
Chosen Backup: \${a1Plan.chosen_supplier_id}
Reasoning: \${a1Plan.reason}
Supplier Delta Cost: $\${a1Plan.cost_delta}

AGENT 2 (LOGISTICS REROUTE):
New Route: \${a2Plan.new_route_id}
Reasoning: \${a2Plan.reroute_reason}
Time Saved by AI rerouting: \${a2Plan.time_saved_hours} hours

TOTAL SYSTEM IMPACT:
Cumulative Cost Impact: $\${costDelta}

The Looker Studio dashboard and BigQuery history have been automatically updated.
System healed successfully.
\`;

  try {
    MailApp.sendEmail(ALERT_EMAIL, subject, body);
  } catch (e) {
    Logger.log("Failed to send MailApp alert: " + e.toString());
  }
}
