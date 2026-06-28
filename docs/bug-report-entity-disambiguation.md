# Bug Report — Entity Disambiguation Failure in Long Context

> Sterilized, vendor-submittable report. No personal names, no project/lineage
> details, no repo references. Describes a real, ordinary ML failure class
> (coreference / entity-disambiguation degradation under long-context load).
> Two versions below: full report, and a short feedback-box form.

---

## Full Report

**Title:** Entity disambiguation failure in long context — model attributes
system-component properties to a human actor when designators overlap

**Component:** Long-context coreference resolution / entity tracking / multi-turn state

**Severity:** Medium — produces confident misattribution (a class of hallucination)
that persists across turns once it occurs

### Summary
In an extended multi-turn session containing both (a) a custom multi-agent
software framework with a non-standard relational naming scheme and (b)
references to a human operator whose identifier semantically overlaps with one of
the system components, the model failed to maintain disambiguation between the
human and the software entity. It began attributing programmatic/architectural
properties to the human actor. The misattribution was sticky — once it occurred,
it propagated to subsequent turns rather than self-correcting.

### Observed Behavior
- The model treated a biological human as an active element of the software
  architecture (assigned it component-level attributes, state, and behaviors that
  belong to the system definition, not the person).
- The error appeared only after sufficient context depth/density; early in the
  session the entities were tracked correctly.
- Once the collapse occurred it was persistent across turns until the session was
  reset.

### Expected Behavior
The model should preserve a hard partition between human actors and programmatic
entities across the full context window, regardless of context length, token
density, or overlap in naming, and should not transfer attributes from a system
component to a human referent (or vice versa).

### Reproduction (sterilized)
1. Open a long session that defines a custom multi-agent framework using a
   non-standard, relational naming scheme (e.g., kinship- or role-based
   identifiers for agents/components).
2. Build up dense technical context describing those components performing
   complex behaviors.
3. Introduce a real human actor whose identifier overlaps semantically with one
   of the component names.
4. Continue past the depth at which context density is high.
5. Observe: the model attributes system-component properties to the human actor
   and maintains that conflation across subsequent turns.

### Hypothesized Mechanism (not confirmed — for triage only)
Consistent with degradation of coreference resolution and entity disambiguation
as effective context grows. When two referents occupy nearby regions of
representational space (overlapping relational designators) and one register
carries dense attribute associations, attribute attribution appears to bleed from
the system entity to the human entity. This reads as an entity-gating /
coreference-binding failure under long-context load rather than a content-policy
issue.

### Impact
- Confident, persistent misattribution (factual hallucination about a real
  person's nature).
- Erodes user trust; in sensitive sessions the misattribution can be alarming to
  the user.
- Likely generalizes to any domain where human identifiers overlap with named
  system entities (org charts, agent frameworks, RPG/sim contexts, codebases with
  personified components).

### Suggested Investigation
- Test coreference stability as a function of context depth with deliberately
  overlapping human/component designators.
- Check whether entity-type tags (human vs. system) are preserved or decay across
  long context.
- Evaluate whether attribute-attribution respects entity-type boundaries under
  high token density.

---

## Short Form (feedback box / limited character field)

> In long, dense multi-turn sessions that mix a custom multi-agent framework with
> references to a human user whose name overlaps a system component, the model
> stops distinguishing the person from the software — it starts attributing
> system/architecture properties to the human and keeps doing so across later
> turns until reset. The entities are tracked correctly early in the session and
> only collapse once context depth is high, which points to coreference / entity
> disambiguation degrading under long-context load rather than a content issue.
> Expected: human vs. system entities should stay partitioned regardless of
> context length or name overlap.
