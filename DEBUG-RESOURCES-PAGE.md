# Debug: Resources Page

## Current Status

### Backend ✅
- MongoDB has 8 resources
- API endpoint works: `curl http://localhost:4000/api/resources` returns 8 resources
- Backend accessible from host

### Frontend ✅
- User is logged in (3 sessions in database)
- Session callback running (Account found, Custom claims extracted)
- Page loads without errors

### Issue ❓
- User sees: "No resources match your filters"
- Resources are fetched but filtered out

---

## Investigation Steps

### 1. Check Browser Network Tab
Open browser DevTools (F12) → Network tab → Reload page

**Look for:**
- Request to `http://localhost:4000/api/resources`
- Response status (should be 200)
- Response body (should have 8 resources)

### 2. Check Browser Console
Open browser DevTools (F12) → Console tab

**Look for:**
- Any JavaScript errors
- Console.log statements from resource fetch
- Filter state being applied

### 3. Temporary Debug Fix

Add console logging to see what's happening:

**Edit `frontend/src/app/resources/page.tsx` line 163:**
```typescript
const fetchedResources = data.resources || [];
console.log('[DEBUG] Fetched resources:', fetchedResources.length, fetchedResources);
setResources(fetchedResources);
setFilteredResources(fetchedResources);
```

**Edit line 180:**
```typescript
const filtered = filterAndSortResources(resources, newFilters);
console.log('[DEBUG] After filtering:', filtered.length, 'filters:', newFilters);
setFilteredResources(filtered);
```

Then refresh the browser and check console logs.

---

## Possible Causes

### Cause 1: CORS Issue
Frontend at `localhost:3000` trying to fetch from `localhost:4000` - might need CORS headers.

**Check backend logs** for CORS errors.

### Cause 2: Default Filter Too Restrictive
The filters might have some default state that filters out all resources.

**Solution:** Check initial filter state in component.

### Cause 3: Resources Array Empty
`data.resources` might be undefined even though API returns data.

**Solution:** Check API response structure.

---

## Quick Test

**From your machine (not Docker):**
```bash
# Check backend returns resources
curl http://localhost:4000/api/resources | jq '.count'

# Should show: 8
```

**In browser:**
1. Open http://localhost:3000/resources
2. F12 → Network → Find request to `/api/resources`
3. Click on it → Preview tab
4. Should see 8 resources in response

If you see 8 resources in Network tab but page says "No resources", it's a **filtering/display issue** in the React component.

---

## Most Likely Issue

Since the page is `'use client'`, the fetch happens in the browser, which successfully reaches localhost:4000 (host machine).

The "No resources match your filters" is probably from **client-side filtering** removing all results.

**Try:**
1. Clear all filters on the page
2. Check if "Showing 0 of 8" appears (means resources fetched but filtered)
3. If so, disable filters one by one


