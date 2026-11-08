---
name: write-issue
description: Turn rough notes into a GitHub issue that matches this repo's issue forms (feature, bug, visual change), show the draft, and create it with gh once approved.
argument-hint: "[feature: … | bug: … | visual: …]"
disable-model-invocation: true
---

# Write an issue

Turn the user's notes into an issue that reads as if it was filed through one of the repo's issue forms in `.github/ISSUE_TEMPLATE/`.

Notes: $ARGUMENTS

If there are no notes, ask for them.

## Notes format

Notes usually follow this format. Only the first line is needed; every other key is optional, and notes in any other shape work too.

Feature:
```
feature: what you want, in one line
why: who needs it, or what they can't do today
done when: outcome; outcome; outcome
where: page or part of the app
not: what to leave alone
```

Bug:
```
bug: what went wrong
steps: 1. … 2. … 3. …
expected: what should have happened
where: page or part of the app
logs: error text, if any
```

Visual change:
```
visual: which page
change: what it looks like now → what you want; for wording, the exact new text
done when: what you'll check on the screenshots
```

Each key fills one form field:

| Key | Feature form | Bug form | Visual change form |
|---|---|---|---|
| `feature:` / `bug:` / `visual:` | What to build | What happened | Page |
| `why` | Problem | | |
| `steps` | | Steps to reproduce | |
| `expected` | | Expected behavior | |
| `change` | | | What should change |
| `done when` | Acceptance criteria | Acceptance criteria | Acceptance criteria |
| `where` | Area | Area | |
| `not` | Out of scope | | |
| `logs` | | Logs or error messages | |

Anything that fits no key goes in Notes, or for a visual change, in What should change. If a field name here differs from the form, the form wins.

## Steps

1. **Pick the form** from the first key: `feature:`, `bug:` or `visual:`. Without one, pick from the text, and ask if it could be more than one. If the notes describe more than one change, propose one issue per change.
2. **Check for duplicates.** Run `gh issue list --state open --search "<key words>"`. If an open issue looks like the same thing, show it and ask how to go on.
3. **Fill the fields.** Read the form and use each body field's `label` as a `### ` heading, in the form's order, with the answer under it. That's how GitHub renders a filed form, and the agents that triage and implement issues read them by these headings.
   - Fill fields from the notes and the user's answers. Ask about any required field (`required: true`) the notes don't cover, except acceptance criteria (below).
   - Acceptance criteria: a `- [ ]` checklist of outcomes someone can check, one per line, about behavior, not implementation. Keep the ones the user gave. If the notes don't cover them, propose criteria that follow from the notes, and when you show the draft, say which ones you proposed so the user can edit, remove or approve them.
   - Bugs: never invent what happened, the steps to reproduce or the expected behavior; ask. Describe what the user sees. Add a suspected cause only if the user gave one, and mark it as a guess.
   - Area: map `where` to the dropdown's options (a page in the web app is "Web app"). Use "Not sure" if it's unclear or missing.
   - Under an empty optional field, write `_No response_`, as GitHub does.
   - For a dropdown, use its options exactly as written; separate several with `, `.
   - Ask all your questions in one message, not one at a time.
4. **Write the title.** Short and specific: the outcome for a feature or visual change, the symptom for a bug. No type prefix; the label shows the type.
5. **Show the draft:** title, labels and the full body, plus which acceptance criteria you proposed. Wait for approval. Apply the user's edits and show it again until they approve.
6. **Create it.** Write the body to a temporary file outside the repo, run `gh issue create --title "<title>" --label "<label>" --body-file <file>`, then delete the file and reply with the issue URL.
   - Use only the labels in the form's `labels:` list.
   - Never add the `agent` label. The user adds it when the issue is ready for an agent.
