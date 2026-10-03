# AI Runtime Profile — どうする名古屋

Adopts: development-os/docs/AI_RUNTIME_COST_PERFORMANCE_STANDARD.md v1.0
Profile: DETERMINISTIC_HEAVY

## Deterministic responsibilities
- Official municipal source records, waste classifications, application procedures, fees, facilities, ward/branch data, freshness/version metadata.
- Retrieval and stale-data monitoring.

## Generative responsibilities
- Natural-language intent interpretation.
- Plain-language explanation of verified official information.
- Search/query guidance.

## Model routing
- NO_LLM for canonical municipal facts when structured data resolves the answer.
- gpt-6-luna for ordinary interpretation/explanation.
- gpt-6.1-sol only for material ambiguity or conflicting source interpretation.
- gpt-6-astra offline only.

## Verification
AI cannot overwrite official-source facts or generate unsupported classifications/procedures.

## Cost target
Deterministic retrieval first; Luna only for language/interface value.
