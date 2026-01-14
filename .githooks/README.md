# DIVE V3 Git Hooks

This directory contains custom git hooks for the DIVE V3 project to enforce code quality and security standards.

## Setup

The hooks are automatically activated if you've cloned the repository. If not, run:

```bash
git config core.hooksPath .githooks
```

## Available Hooks

### pre-commit

Runs before each commit to check for common issues:

#### 🔒 Security Checks
- **Hardcoded localhost URLs**: Prevents `http://localhost:*` or `http://127.0.0.1:*` in code
- **Debug telemetry calls**: Blocks port 7243 debug endpoints
- **Hardcoded secrets**: Warns about potential API keys, passwords, tokens

#### 🏗️ Architecture Checks
- **Federation registry**: Ensures USA hub uses `dive-hub-*` container names (not `dive-v3-*`)
- **Debug markers**: Blocks `#region agent log` comments

#### 💡 What to do if checks fail:

1. **Fix the issue** (recommended):
   ```bash
   # Use environment variables instead
   const apiUrl = process.env.NEXT_PUBLIC_API_URL;
   ```

2. **Bypass the check** (not recommended):
   ```bash
   git commit --no-verify
   ```

## Hook Output Example

```bash
🔍 Running DIVE V3 pre-commit checks...
  Checking for hardcoded localhost URLs...
  Checking for debug telemetry calls...
  Checking for debug region markers...
  Checking for potential hardcoded secrets...
  Checking federation registry for incorrect container names...

✅ All pre-commit checks passed
```

## Violations Caught

### ❌ Hardcoded localhost URL
```typescript
// BAD
fetch('http://localhost:7243/ingest/...')

// GOOD
const debugUrl = process.env.DEBUG_TELEMETRY_URL;
if (debugUrl) {
  fetch(debugUrl + '/ingest/...')
}
```

### ❌ Debug telemetry call
```typescript
// BAD
fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783', ...)

// GOOD - Remove it or make it conditional
```

### ❌ Wrong container name in federation registry
```json
// BAD
{
  "containerName": "dive-v3-backend"
}

// GOOD (USA hub)
{
  "containerName": "dive-hub-backend"
}

// GOOD (NZL spoke)
{
  "containerName": "dive-spoke-nzl-backend"
}
```

## ESLint Integration

These checks are also enforced in ESLint:

**Frontend** (`.eslintrc.json`):
```json
{
  "rules": {
    "no-restricted-syntax": ["error", {
      "selector": "CallExpression[callee.name='fetch'] Literal[value=/^https?:\\/\\/(127\\.0\\.0\\.1|localhost):/]",
      "message": "Hardcoded localhost URLs not allowed"
    }]
  }
}
```

**Backend** (`.eslintrc.json`): Same rule

## Testing the Hook

```bash
# Try committing a file with a hardcoded localhost URL
echo "fetch('http://localhost:7243/test')" > test.ts
git add test.ts
git commit -m "test"
# Should fail with error message

# Clean up
rm test.ts
git reset HEAD
```

## Disabling Hooks (Not Recommended)

To temporarily disable all hooks:
```bash
git config core.hooksPath /dev/null
```

To re-enable:
```bash
git config core.hooksPath .githooks
```

## Maintenance

### Adding New Checks

Edit `.githooks/pre-commit` and add your check in the appropriate section:

```bash
# Check N: Your new check
echo "  Checking for X..."
MATCHES=$(git diff --cached | grep "YOUR_PATTERN" || true)
if [ -n "$MATCHES" ]; then
  echo "${RED}❌ ERROR: Issue found${NC}"
  ISSUES_FOUND=1
fi
```

### Hook Best Practices

1. **Fast checks**: Keep hooks under 2 seconds
2. **Clear messages**: Explain what's wrong and how to fix it
3. **Non-blocking warnings**: Use yellow for warnings, red for errors
4. **Graceful failures**: Always provide a bypass option (`--no-verify`)

## Related Files

- `.githooks/pre-commit` - Main pre-commit hook script
- `frontend/.eslintrc.json` - Frontend linting rules
- `backend/.eslintrc.json` - Backend linting rules
- `DEBUG_TELEMETRY_CLEANUP.md` - Context on why these checks exist
- `FEDERATED_SEARCH_ROOT_CAUSE_ANALYSIS.md` - Container naming issue details

## Support

If you encounter issues with git hooks:

1. Check hook is executable: `ls -la .githooks/pre-commit`
2. Verify git config: `git config --get core.hooksPath`
3. Test hook manually: `.githooks/pre-commit`
4. Check staged files: `git diff --cached --name-only`

## References

- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- DIVE V3 Security Standards: `docs/SECRET_MANAGEMENT_BEST_PRACTICES.md`
- Federation Registry: `backend/config/federation-registry.json`
