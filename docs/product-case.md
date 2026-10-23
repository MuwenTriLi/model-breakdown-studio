# Model Breakdown: making a model explain itself

[← Project and one-minute demo](../README.md) · [Open the original web app](https://meshroom-breakdown-studio.limuwen9.chatgpt.site) · [Implementation of the local adaptation](architecture.md)

**The job:** turn a multi-part model into an understandable presentation without rebuilding a separate animation setup for every explanation.

## The smallest useful task

**Task:** explain the Control PCB in the built-in keypad, then repeat with one authorized, named, multi-part GLB: assembled view → separated focal component → return to the whole. A synthetic three-part GLB has now completed the hosted path; a real creative model and narrated explanation remain to add.

**Local correction:** first revise explode amount, selected part or framing in the loaded scene; do not reimport or replace the model just to change its emphasis. The sample selection/explode controls were observed. Per-part motion locks, affected-interval regeneration and revision rollback are proposed, not established capabilities of the hosted app.

**Decision now:** iterate the real-model import-to-export path. A fused mesh should trigger a clear limitation. Expand only after one creator can complete and correct the explanation; narrow support when an input cannot preserve meaningful component relationships.

## Problem and hypothesis

A complete assembly can hide the part a presenter wants to explain. Separating components is useful only if their relationships, framing and order remain legible. The working hypothesis is that hierarchy, spatial composition and timing in one interface let a creator refine that explanation directly. This is a practitioner-led product hypothesis; formal workflow interviews and comparative usability evidence are still to add.

## Interaction decisions

| Decision | Current interaction | Reason |
| --- | --- | --- |
| Inspect before animating | Named component list linked to selection | The creator can confirm what is being moved or emphasized |
| Compare whole and parts | Assembled / exploded view controls | Separation should reveal relationships without losing the original context |
| Direct attention | Part selection, highlight, rotation and timeline | The explanation determines the motion and emphasis |
| Bring a real model | Import a GLB with separate named meshes | An imported model should remain an editable source for the explanation |

My contribution is creative direction and the interaction workflow, developed with Codex-assisted implementation. Code and tests for the retained local adaptation are available in this repository; its extra sample shelf and export tests are separate from the original hosted app.

## Automation and creator control

**Today:** the browser applies selected explode, view and timing parameters. The creator chooses the story, focal component, orientation, framing and reveal order. This is parameter-driven assistance; no language-to-animation agent is claimed.

**Proposed agent extension:** inspect the hierarchy, suggest a focal component and a short sequence, then produce a draft using the existing controls. Selecting a different subject, hiding important parts or changing component grouping requires a review of the proposed change. Routine layout calculations can run within the accepted brief. Locks, plan previews and revision recovery are proposed controls, not already verified features of the hosted app.

If a model is one fused mesh, the system should explain the limitation instead of promising a meaningful part-by-part breakdown. If imported geometry clips the frame or loses its spatial relationships, return the problematic state for correction. Do not silently substitute a sample model as the user's result.

## What a deliverable must pass

The creator can identify the intended focal component; separation preserves a comprehensible relationship to the assembly; parts and labels remain inside the chosen frame; transitions and the assembled return remain continuous. Check the encoded file for expected duration, resolution and playback, then inspect the entire sequence. These are acceptance criteria for the next validation, not a claim that every imported model passes.

**Existing evidence:** the original public app was checked with the nine-part keypad, 250% explode and Control PCB selection. Separately, the local adaptation passed 17 geometry/sample tests and a two-second 720p H.264 export check. A separate check in the original hosted app imported a named three-part synthetic GLB, selected +Z front, set 250% explode and selected Support, then exported a 2.000 s / 60-frame / 30 fps / 3840 × 2160 H.264 file. It decoded fully and sampled frames contained the assembly. This establishes a narrow technical path, not clear storytelling or support for difficult/large models. Curated user GLBs and final-film legibility remain to validate. [Full scope](https://github.com/MuwenTriLi/creative-workflows/blob/main/docs/functional-review.md).

## Next test and handoff

Use one approved multi-part GLB and a clear brief: explain one component, show its relationship to the whole, then return to the assembly. Record the import, one compositional correction, the encoded result and the checks. Compare this task with the creator's current production workflow; record assistance required and correction work before claiming efficiency gains.

Expand the workflow if a new creator can complete it with a legible result. Iterate if orientation, component naming or framing causes repeated corrections. Stop automatic composition for an input class if the system cannot preserve the intended explanation. Hand engineering the source revision, model fixture, expected sequence, control mapping and a failing case. [Shared handoff template](https://github.com/MuwenTriLi/creative-workflows/blob/main/docs/handoff-template.md).
