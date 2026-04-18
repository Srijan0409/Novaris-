# Self-Healing Supply Chain – Data & Memory System Architecture

## 1. Data Model Design Rationale

### `disruptions`
Records facts about when and where a real-world supply chain failure occurred.
- `disruption_id` (STRING): Unique primary key.
- `timestamp` (TIMESTAMP): Granular tracking to the second allows sequenced rebuilding of events.
- `node_id` (STRING): Links to the specific facility, port, or warehouse in the larger graph.
- `type` (STRING): Classifies the root issue so agents trigger the right playbook.
- `severity` (INT): Helps agents stack-rank urgency in multi-failure scenarios.
- `description` (STRING): LLM-readable natural text for advanced prompt context.

### `decisions`
Stores transparent audit trails of how the agents resolved a disruption.
- `decision_id` (STRING): Primary key.
- `disruption_id` (STRING): Connects the fix back to the exact failure in a 1-to-M relationship.
- `agent` (STRING): Traces which autonomous pod triggered the action.
- `action` (STRING): Machine-readable category of the fix.
- `cost_before/after` & `time_saved` (FLOAT): Direct success metrics tracking quantifiable ROI.
- `selected_supplier`/`new_route`/`priority_strategy` (STRING): Explicit tracking of actual decisions made.
- `timestamp` (TIMESTAMP): Logs when the intervention was executed for latency tracking.

### `agent_memory` (The AI's Brain)
Retains high-value aggregated lessons learned.
- `memory_id` (STRING): Primary key.
- `context` (STRING): High-density summarized situation (distilled by LLM from disruption + node state).
- `action_taken` (STRING): The tactic executed.
- `outcome` (STRING): The summarized resolution state.
- `success_score` (FLOAT): A weighted heuristic evaluating the holistic value of the intervention.
- `supplier_score`/`route_score` (FLOAT): Isolated metrics that adjust the reputation of external network partners.
- `timestamp` (TIMESTAMP): Enables recency-bias when retrieving knowledge base embeddings/memories.
- **Mapping Fields (`disruption_type`, `node_id`, `severity`)**: Crucial for fast SQL-based retrieval avoiding slow vector scans.

## 2. Similarity Matching & Retrieval (Step 5)
When a new disruption occurs, the memory engine looks for the closest past scenario to shortcut the LLM's token-heavy reasoning.
- **Exact Match**: The engine filters precisely on `type` (e.g., 'delay').
- **Weighted Scoring**: We boost the score drastically if it's the exact same `node_id`. The difference in `severity` subtracts from the score dynamically: `(50 - ABS(disruption_severity - req_severity) * 5)`.

### Why this improves decision-making:
Instead of "guessing" based on purely foundational LLM knowledge, providing top-3 historical *proven* resolutions pushes the agent into "in-context learning," mitigating hallucinations.

## 3. Scale & Performance Optimizations (Step 8)
- **Time-Partitioning**: BigQuery tables are partitioned by daily `DATE(timestamp)`. This caps query costs and speeds up dashboard metrics (e.g., Looker Studio scanning last 30 days).
- **Clustering**: Memory lookups cluster on `(disruption_type, node_id)`. Retrieving past similar cases queries small contiguous blocks of storage, reducing BigQuery I/O.
- **Caching**: Implement a Redis or Memcached layer in the FastAPI backend for repetitive identical queries.
- **Precomputed Aggregations**: Use materialized views in BQ for the `Analytics Layer` so Looker and React dashboards avoid running heavy JOINs in real-time.

## 4. Advanced Features (High Impact) (Step 9)
- **Context Summarization**: Rather than storing raw JSON graphs in Memory, an internal LLM step distills the disruption into a single "Context" sentence reducing DB sizes.
- **Feedback Loops**: A background cron-job cross-references external invoices and updates the `success_score` retrospectively if an intervened route was ultimately delayed again.
- **Top-K Retrieval**: The SQL query automatically ranks results by `(similarity_score DESC, success_score DESC) LIMIT K`, delivering only hyper-relevant strategies.
- **Failure Learning**: Actions with `success_score < 30` are flagged with negative embeddings—instructing the agent "What NOT to do".

## 5. Testing Methodologies (No External Dependencies) (Step 10)
1. **Pipeline Simulation**: Run `mock_data.py` to fill BigQuery. Then pass a simulated JSON dict into `memory_engine.py:retrieve_top_solutions()`.
2. **Offline Analytics Verification**: Query the Looker Dashboard queries in the BQ console.
3. **Compatibility Strategy**: Use strictly typed Pydantic models in FastAPI reflecting exactly the JSON Schema described in `api_contract.json` to enforce contract boundaries with front-end engineers.
