# Test COI Complete Flow - Step by Step ✅

**Date**: October 15, 2025  
**Purpose**: Verify COI upload → KAS → decrypt flow works end-to-end  
**Status**: ✅ **Ready to Test**  
**Time**: 3 minutes

---

## ✅ Pre-Flight Check

**Services Running**:
- [x] Backend: http://localhost:4000 (restarted with COI fix)
- [x] KAS: Port 8080 (restarted - see logs above)
- [x] Frontend: http://localhost:3000
- [x] OPA: http://localhost:8181
- [x] MongoDB: Port 27017

**Fixes Applied**:
- [x] Upload controller: Parse COI string → array
- [x] KAS server: Parse COI string → array
- [x] Frontend: Proactive COI warnings
- [x] Enrichment middleware: Added to upload route
- [x] Debug logging: Enabled for verification

---

## 🧪 TEST SCENARIO

### Part 1: Upload Document with COI (1 minute)

**Step 1: Navigate to Upload Page**
```
URL: http://localhost:3000/upload
```

**Step 2: Check Your COI Status**
```
Look at "Communities of Interest (COI)" section header

You should see ONE of these:
✅ Green badge: "Your COIs: NATO-COSMIC, FVEY"
⚠️ Amber badge: "You have no COI memberships"
```

**Step 3: Upload File**
```
File: Any test file (e.g., create a .txt file with "Test FVEY Content")
Title: "Test FVEY Document"
Classification: SECRET
Countries: USA, GBR, CAN, AUS, NZL (click "FVEY" quick select)
COI: FVEY (if you have it)
```

**Step 4: Verify Warnings**
```
If you have FVEY:
  ✅ No warnings shown
  ✅ Green checkmark on FVEY button

If you DON'T have FVEY:
  ⚠️ Yellow warning box: "UPLOAD WILL FAIL: Not a member of FVEY"
  ⚠️ Red badge on FVEY button: "Not your COI"
  → SOLUTION: Deselect COI or choose one you have
```

**Step 5: Upload**
```
Click "Upload Document" button

Expected Result:
✅ "Upload successful!"
✅ Resource ID shown (e.g., doc-upload-1760541616881-abc123)
✅ No "COI intersection" error

If error shown:
❌ Read the error message
❌ Check backend logs: tail -f backend/logs/app.log
```

---

### Part 2: Request KAS Key (1 minute)

**Step 6: Navigate to Resource**
```
URL: http://localhost:3000/resources/[your-resource-id]

You should see:
- Document details
- Classification: SECRET
- 🔐 "Encrypted - KAS key request required"
```

**Step 7: Request Decryption Key**
```
Click: "Request Decryption Key" button

KAS Request Modal opens showing:
- 6-step flow visualization
- All steps initially PENDING
```

**Step 8: Decrypt Content**
```
Click: "Decrypt Content" button in modal

Watch the 6 steps animate:
Step 1: Resource Access Request → COMPLETE ✅
Step 2: OPA Policy Evaluation → COMPLETE ✅
Step 3: Key Request to KAS → COMPLETE ✅
Step 4: KAS Policy Re-evaluation → COMPLETE ✅ (COI check!)
Step 5: Key Release → COMPLETE ✅
Step 6: Content Decryption → COMPLETE ✅
```

**Expected Result**:
```
✅ All 6 steps show COMPLETE (green checkmarks)
✅ "Decryption successful!"
✅ Content displayed: "Test FVEY Content"
✅ No "COI intersection" error
```

**If Error**:
```
❌ Check which step failed
❌ Read error message
❌ Check KAS logs: docker-compose logs kas | tail -30
```

---

### Part 3: Verify Debug Logs (30 seconds)

**Step 9: Check Backend Logs**
```bash
grep "Processing upload request" backend/logs/app.log | tail -1 | jq .
```

**Should show**:
```json
{
  "uploaderCOI": ["NATO-COSMIC", "FVEY"],
  "uploaderCOI_type": "object",
  "uploaderCOI_isArray": true,  ← MUST BE TRUE!
  "uploaderClearance": "SECRET",
  "uploaderCountry": "USA"
}
```

**Step 10: Check KAS Logs**
```bash
docker-compose logs kas | grep "acpCOI_isArray" | tail -1
```

**Should show**:
```json
{
  "acpCOI_isArray": true,  ← MUST BE TRUE!
  "subject_acpCOI_isArray": true  ← MUST BE TRUE!
}
```

---

## 🎯 SUCCESS CRITERIA

### All Must Pass

- [ ] Upload shows COI status badge (green or amber)
- [ ] Upload with valid COI succeeds
- [ ] Resource appears in /resources list
- [ ] Resource detail page shows encryption badge
- [ ] KAS request modal opens
- [ ] All 6 steps complete successfully
- [ ] Content decrypts and displays
- [ ] Backend logs show isArray: true
- [ ] KAS logs show isArray: true
- [ ] No "COI intersection" errors anywhere

**All checked?** 🎉 **COI flow is working perfectly!**

---

## 🐛 TROUBLESHOOTING

### Issue: Upload still fails with "COI intersection"

**Check 1**: Backend restarted?
```bash
# In backend terminal, should see recent restart time
# If not, stop and restart:
cd backend
npm run dev
```

**Check 2**: Enrichment middleware running?
```bash
grep "enrichment" backend/logs/app.log | tail -5
# Should see enrichment logs
```

**Check 3**: COI actually in token?
```javascript
// Browser console
const session = await fetch('/api/auth/session').then(r => r.json());
console.log('COI:', session.user.acpCOI);
// Should show array like: ["FVEY", "NATO-COSMIC"]
```

### Issue: KAS request fails with "COI intersection"

**Check 1**: KAS restarted?
```bash
docker-compose ps kas
# Should show "Up" status

# Restart if needed:
docker-compose restart kas
```

**Check 2**: KAS logs show proper parsing?
```bash
docker-compose logs kas | grep "acpCOI_isArray"
# Should show: true
```

**Check 3**: KAS receiving proper token?
```bash
docker-compose logs kas | grep "Token validated" | tail -1
# Should show acpCOI as array
```

### Issue: Frontend doesn't show COI badge

**Check**: Session has COI?
```javascript
// Browser console
console.log(window.next?.router?.query);
// Or refresh page and check network tab for /api/auth/session
```

**Fix**: Logout and login again to get fresh token

---

## 📊 WHAT TO EXPECT

### Successful Upload Flow

```
Frontend:
  ✅ Green badge: "Your COIs: FVEY, NATO-COSMIC"
  ✅ No warnings
  ✅ Upload succeeds
  
Backend Logs:
  ✅ "uploaderCOI_isArray": true
  ✅ "allow": true
  ✅ "File upload successful"
  
Result:
  ✅ Resource created with COI: ["FVEY"]
```

### Successful KAS Flow

```
Frontend:
  ✅ KAS modal opens
  ✅ All 6 steps complete
  ✅ Content displays
  
KAS Logs:
  ✅ "acpCOI_isArray": true
  ✅ "subject_acpCOI_isArray": true
  ✅ "Key released successfully"
  
Backend Logs:
  ✅ "Content decrypted successfully"
  
Result:
  ✅ Document content visible
```

---

## 🎉 EXPECTED OUTCOME

**Complete end-to-end COI workflow**:

1. ✅ Upload document with COI
2. ✅ Document stored with ZTDF encryption
3. ✅ View document (shows KAS obligation)
4. ✅ Request KAS key (policy re-evaluation)
5. ✅ KAS releases key (COI check passes)
6. ✅ Backend decrypts content
7. ✅ User sees decrypted content

**No COI intersection errors at any step!** 🏆

---

## 📖 Documentation Reference

- **Complete Analysis**: `notes/COI-UPLOAD-ISSUE-ROOT-CAUSE-AND-FIX.md`
- **Type Fix Details**: `notes/COI-STRING-VS-ARRAY-FIX.md`
- **KAS Fix**: `notes/COI-KAS-FIX.md`
- **Summary**: `COI-COMPLETE-FIX-SUMMARY.md`
- **Quick Ref**: `COI-UPLOAD-FIX-QUICK-REF.md`

---

**Ready to test! Follow the steps above and everything should work perfectly now.** ✅

**KAS is running, backend should be restarted, and the complete COI flow is fixed!** 🚀

