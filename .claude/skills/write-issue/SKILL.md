---
name: write-issue
description: Turn rough notes into a GitHub issue that matches this repo's issue forms (feature, bug, visual change), show the draft, and create it with gh once approved.
argument-hint: "[rough notes]"
disable-model-invocation: true
---

# Write an issue

Turn the user's notes into an issue that reads as if it was filed through one of the repo's issue forms.

Notes: $ARGUMENTS

If there are no notes, ask for them.

## Steps

1. **Pick the form.** Read the forms in `.github/ISSUE_TEMPLATE/` (every `.yml` file except `config.yml`) and pick the one that fits: feature, bug or visual change. If the notes could fit more than one, ask. If they describe more than one change, propose one issue per change.
2. **Check for duplicates.** Run `gh issue list --state open --search "<key words>"`. If an open issue looks like the same thing, show it and ask how to go on.
3. **Fill the fields.** Use each body field's `label` as a `### ` heading, in the form's order, with the answer under it. That's how GitHub renders a filed form, and the agents that triage and implement issues read them by these headings.
   - Fill fields only from the notes and the user's answers. Ask about every required field (`required: true`) the notes don't cover. Never invent acceptance criteria, steps to reproduce or expected behavior.
   - Under an empty optional field, write `_No response_`, as GitHub does.
   - For a dropdown, use its options exactly as written; separate several with `, `.
   - Acceptance criteria: a `- [ ]` checklist of outcomes someone can check, one per line, about behavior, not implementation.
   - Bugs: describe what the user sees. Add a suspected cause only if the user gave one, and mark it as a guess.
4. **Write the title.** Short and specific: the outcome for a feature or visual change, the symptom for a bug. No type prefix; the label shows the type.
5. **Show the draft:** title, labels and the full body. Wait for approval. Apply the user's edits and show it again until they approve.
6. **Create it.** Write the body to a temporary file outside the repo, run `gh issue create --title "<title>" --label "<label>" --body-file <file>`, then delete the file and reply with the issue URL.
   - Use only the labels in the form's `labels:` list.
   - Never add the `agent` label. The user adds it when the issue is ready for an agent.
