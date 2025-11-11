# Clearance-Based Classification Filter UX Improvement

**Date**: November 10, 2025  
**Type**: UX Enhancement  
**Component**: Resource Filters

## Improvement

The classification filter in the resources page now **intelligently hides** classification levels that are above the user's clearance, creating a more streamlined and intuitive filtering experience.

## Before vs After

### Before
**All users saw all 5 classification levels** regardless of their clearance:
- UNCLASSIFIED user: Sees all 5 levels (UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP SECRET)
- CONFIDENTIAL user: Sees all 5 levels
- Problem: Users could filter by classifications they can't access anyway

### After
**Users only see classification levels they can access:**

| User Clearance | Filter Options Shown |
|----------------|---------------------|
| UNCLASSIFIED | 🟢 UNCLASSIFIED, 🔵 RESTRICTED |
| RESTRICTED | 🟢 UNCLASSIFIED, 🔵 RESTRICTED |
| CONFIDENTIAL | 🟢 UNCLASSIFIED, 🔵 RESTRICTED, 🟡 CONFIDENTIAL |
| SECRET | 🟢 UNCLASSIFIED, 🔵 RESTRICTED, 🟡 CONFIDENTIAL, 🟠 SECRET |
| TOP SECRET | 🟢 UNCLASSIFIED, 🔵 RESTRICTED, 🟡 CONFIDENTIAL, 🟠 SECRET, 🔴 TOP SECRET |

## Benefits

1. **✅ Cleaner UI**: Fewer filter options = less visual clutter
2. **✅ Better UX**: Users don't see filters for content they can't access
3. **✅ Security Clarity**: Reinforces the principle of least privilege
4. **✅ Reduced Confusion**: No more selecting SECRET filter when you only have CONFIDENTIAL clearance
5. **✅ Faster Decision Making**: Fewer choices = quicker filtering

## Implementation

Updated `frontend/src/components/resources/resource-filters.tsx`:

```typescript
<Disclosure.Panel className="px-4 pb-3 space-y-1.5">
    {CLASSIFICATIONS
        .filter(classItem => {
            // Only show classifications at or below user's clearance
            const userClearance = userAttributes?.clearance || 'UNCLASSIFIED';
            const accessibleLevels = CLEARANCE_HIERARCHY[userClearance] || ['UNCLASSIFIED'];
            return accessibleLevels.includes(classItem.value);
        })
        .map(classItem => {
            // ... render filter button
        })}
</Disclosure.Panel>
```

### Clearance Hierarchy

Uses the existing `CLEARANCE_HIERARCHY` mapping:

```typescript
const CLEARANCE_HIERARCHY: Record<string, string[]> = {
    'UNCLASSIFIED': ['UNCLASSIFIED', 'RESTRICTED'],
    'RESTRICTED': ['UNCLASSIFIED', 'RESTRICTED'],
    'CONFIDENTIAL': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL'],
    'SECRET': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET'],
    'TOP_SECRET': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
};
```

## Examples

### Example 1: UNCLASSIFIED User
**User**: `testuser-usa-unclass` (UNCLASSIFIED clearance)

**Classification Filter Shows:**
- 🟢 UNCLASSIFIED
- 🔵 RESTRICTED

**Hidden:** CONFIDENTIAL, SECRET, TOP SECRET

---

### Example 2: SECRET User
**User**: `testuser-usa-secret` (SECRET clearance)

**Classification Filter Shows:**
- 🟢 UNCLASSIFIED
- 🔵 RESTRICTED
- 🟡 CONFIDENTIAL
- 🟠 SECRET

**Hidden:** TOP SECRET

---

### Example 3: TOP SECRET User
**User**: Admin or TOP SECRET cleared user

**Classification Filter Shows:**
- 🟢 UNCLASSIFIED
- 🔵 RESTRICTED
- 🟡 CONFIDENTIAL
- 🟠 SECRET
- 🔴 TOP SECRET

**Hidden:** None (can see all levels)

## Security Note

This is a **UI optimization only** - it does NOT affect backend authorization:
- ✅ Backend still enforces clearance checks via OPA
- ✅ Users still can't access documents above their clearance
- ✅ This just makes the UI cleaner by hiding irrelevant filter options

## Testing

### Test Case 1: UNCLASSIFIED User
1. Login as: `testuser-usa-unclass` / `Password123!`
2. Go to: `https://dev-app.dive25.com/resources`
3. Open **Classification** filter
4. **Expected**: Only see UNCLASSIFIED 🟢 and RESTRICTED 🔵

### Test Case 2: CONFIDENTIAL User
1. Login as: `testuser-usa-conf` (if exists)
2. Go to: `https://dev-app.dive25.com/resources`
3. Open **Classification** filter
4. **Expected**: See UNCLASSIFIED 🟢, RESTRICTED 🔵, CONFIDENTIAL 🟡

### Test Case 3: SECRET User
1. Login as: `testuser-usa-secret` / `Password123!`
2. Go to: `https://dev-app.dive25.com/resources`
3. Open **Classification** filter
4. **Expected**: See UNCLASSIFIED 🟢, RESTRICTED 🔵, CONFIDENTIAL 🟡, SECRET 🟠

## Files Modified

- `frontend/src/components/resources/resource-filters.tsx` (lines 366-401)

## Related Standards

- **NATO ACP-240**: Classification hierarchy and clearance dominance
- **Need-to-Know Principle**: Users shouldn't see filter options for content they can't access
- **Principle of Least Privilege**: UI should reflect minimum necessary information

## Notes

- If a user has no clearance attribute, defaults to showing only UNCLASSIFIED and RESTRICTED
- The clearance hierarchy follows NATO ACP-240 standards
- RESTRICTED is treated as approximately equal to UNCLASSIFIED for access purposes
- This improvement aligns with modern ICAM best practices for user experience

## Future Enhancements

Could be extended to other filters:
- **Countries**: Hide countries user doesn't have access to (based on releasability)
- **COIs**: Hide COI filters for COIs user is not a member of
- **Caveats**: Hide caveats user doesn't have clearance for

However, these may be less impactful since users might want to see what they're missing.



