# Cursor Commands

This directory contains custom Cursor commands for the Retriever Daily Digest project.

## Available Commands

### Session Management
- `/AgentOpen` - Start a new agent session with context loading
- `/AgentClose` - End session and update project documentation

### PrintSmith Export
- `/CheckExport` - Check when Render last received PrintSmith data
- `/ManualExport` - Run PrintSmith export manually
- `/ExportHelp` - Show comprehensive export system help

## Quick Reference

### Daily Workflow
```
1. Type /CheckExport
2. If scheduled task worked ✅ - You're done!
3. If not ❌ - Type /ManualExport
```

### Troubleshooting
```
Type /ExportHelp for:
- Setup instructions
- Common issues
- Configuration guide
- Environment variables
```

## How Commands Work

Commands are markdown files that provide instructions to the Cursor AI.

When you type a command (e.g., `/CheckExport`), Cursor:
1. Reads the corresponding `.md` file
2. Follows the instructions in the file
3. Executes the actions and provides guidance

## Creating New Commands

To create a new command:

1. Create a new `.md` file in this directory (e.g., `MyCommand.md`)
2. Use this structure:
   ```markdown
   # MyCommand Command
   
   When the user types `/MyCommand`, [describe what should happen].
   
   ## Actions
   1. [First action]
   2. [Second action]
   
   ## Example Output
   [Show what user should see]
   ```
3. Save the file
4. Type `/MyCommand` in Cursor to use it

## Command Best Practices

- **Clear actions:** List specific steps to follow
- **Example output:** Show what success looks like
- **Error handling:** Include troubleshooting guidance
- **Context:** Provide background on why the command exists
- **Interactive:** Ask for confirmation when needed
