# AgentClose Command

When the user types `/AgentClose` or asks to close/end the agent session, perform the following documentation updates before ending:

## Required Actions

### 1. Update Context.md
- Update the "Last Updated" date at the top
- Update "Current Phase" and "Status" to reflect current state
- Add any new knowledge learned (especially technical discoveries like database schemas, API quirks, etc.)
- Update "Current Build Status" section with completed/in-progress phases
- Add a new entry to "Session History" summarizing what was accomplished this session
- Update "Next Steps" with immediate priorities

### 2. Update DEPLOYMENT.md
- Check off any completed checklist items with `[x]`
- Add completion dates to finished phases
- Add any test results or verification notes
- Mark the next phase as ready if applicable

### 3. Update DEFINITIONS.md
If any metric definitions were discussed, clarified, or changed during the session:
- Add new terms to the appropriate section
- Update existing definitions if the logic changed
- Add new excluded accounts if identified
- Document any new date fields or amount fields discovered
- Update the "Last Updated" date at the top

### 4. Check for Uncommitted Changes
- Run `git status` to identify uncommitted changes
- List any modified files that should be committed
- Warn the user if critical files (like export scripts, config files) have uncommitted changes

### 5. Provide Session Summary
Output a brief summary including:
- What was accomplished this session
- Current project status (which phase, what's next)
- Any uncommitted changes that need attention
- Recommended next steps for the following session

## Example Output Format

```
## Session Close Summary

### Accomplished This Session
- [List of completed tasks]

### Current Status
- **Phase:** [Current phase]
- **Next Up:** [What to do next]

### Uncommitted Changes
- [List files or "None"]

### Documents Updated
- ✅ Context.md
- ✅ DEPLOYMENT.md
- ✅ DEFINITIONS.md (if definitions changed)

### Recommended Next Session
Start with: "[suggested command or action]"
```
