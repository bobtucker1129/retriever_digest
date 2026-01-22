# AgentOpen Rule

When the user types `/AgentOpen` or starts a new agent session asking to continue the project, perform the following onboarding steps:

## Required Actions

### 1. Read Core Context Documents
Read these files to understand the project:
- `@Context.md` - Project overview, current status, technical knowledge
- `@DEPLOYMENT.md` - Deployment phases and progress

### 2. Check Current State
- Review the "Current Build Status" in Context.md
- Identify which phase is in progress or next
- Note any items marked as "NEXT" or "IN PROGRESS"

### 3. Check for Uncommitted Changes
- Run `git status` to see if there are pending changes from a previous session
- If there are uncommitted changes, note them and ask if they should be committed first

### 4. Review Session History
- Read the most recent entry in Context.md "Session History"
- Understand what was done last and any context from the previous session

### 5. Provide Onboarding Summary
Output a brief summary to confirm understanding:

## Example Output Format

```
## Agent Onboarding Complete

### Project: Retriever Daily Digest
[One sentence description]

### Current Status
- **Phase:** [Current phase from Context.md]
- **Last Session:** [Date and brief summary]
- **Next Up:** [What needs to happen next]

### Uncommitted Changes
- [List any uncommitted files or "Repository is clean"]

### Key Context
- [Any important technical notes relevant to current phase]

### Ready to Continue
[Suggested action or ask what user wants to work on]
```

## Important Technical Context to Remember

When working on this project, remember these key points from Context.md:

### PrintSmith Database
- `invoice` and `estimate` tables only have `id` and `isdeleted`
- ALL data is in `invoicebase` table
- Account name is `invoicebase.name` (not `accountname`)
- Sales rep requires JOIN to `salesrep` table via `salesrep_id`
- Always use `COALESCE(ib.voided, false) = false` for voided check

### Key Files
- `export/printsmith_export.py` - Python script that queries PrintSmith
- `src/lib/daily-digest.ts` - Email HTML generation
- `DEPLOYMENT.md` - The master deployment checklist

### Environment
- Dev server typically runs on port 3000-3002
- Database is on Render (external URL in .env)
- PrintSmith requires VPN connection
