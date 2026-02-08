# Chromatic Setup - Quick Reference

**Date**: 2026-02-08  
**Account Owner**: aubreybeach  
**Status**: Partial - Storybook token needed

---

## Current Setup

### ✅ Playwright Project (Created)
- **Token**: `chpt_2fbb8e478dc089c`
- **Purpose**: E2E visual testing (bonus functionality)
- **Status**: Ready but not required for Phase 2
- **Use Case**: Capture and compare screenshots during E2E tests

### ✅ Storybook Project (Created)
- **Token**: `chpt_830b42947e40212`
- **Purpose**: Component visual regression testing (Phase 2, Weeks 5-8)
- **Status**: Ready (pending GitHub Secret addition)
- **Use Case**: 40 components × 3 viewports × multiple states = ~600 snapshots

---

## Why Two Projects?

Chromatic supports two different testing approaches:

1. **Storybook Integration** (What we need for Phase 2):
   - Tests isolated UI components
   - Uses Storybook stories as the source
   - Best for design system/component library testing
   - **This is our primary use case** (40 components planned)

2. **Playwright Integration** (What you created):
   - Tests full application screenshots during E2E tests
   - Uses Playwright test runs as the source
   - Best for full-page visual regression
   - Bonus feature, not in the 12-week plan

---

## Creating the Storybook Project

### Step-by-Step

1. **Go to Chromatic Dashboard**:
   - URL: https://www.chromatic.com/
   - You should already be logged in

2. **Create New Project**:
   - Click "New Project" or "Add Project" button
   - You'll see project type selection

3. **Select "Storybook"**:
   - Choose "Storybook" (NOT Playwright this time)
   - Name it: "DIVE-V3-Components" or similar
   - Link it to your GitHub repo if prompted

4. **Get the Token**:
   - After creation, you'll see a token like: `CHROMATIC_PROJECT_TOKEN=chpt_...`
   - Copy this token (it's different from your Playwright token)

5. **Add to GitHub Secrets**:
   ```
   Repository: aubreybeach/DIVE-V3
   Navigate to: Settings → Secrets and variables → Actions
   Click: "New repository secret"
   Name: CHROMATIC_PROJECT_TOKEN
   Value: [paste your Storybook token]
   Save
   ```

---

## Both Tokens Reference

| Project Type | Token | Purpose | Priority | Phase |
|--------------|-------|---------|----------|-------|
| **Playwright** | `chpt_2fbb8e478dc089c` | E2E visual testing | Optional | Future |
| **Storybook** | `chpt_830b42947e40212` | Component visual regression | Required | Phase 2 (Week 5) |

---

## Verification

Once Storybook token is added to GitHub Secrets:

```bash
# Verify GitHub Secret exists
# Go to: https://github.com/aubreybeach/DIVE-V3/settings/secrets/actions
# You should see: CHROMATIC_PROJECT_TOKEN

# Test locally (Phase 2, Week 5)
cd frontend
npm install --save-dev chromatic
npx chromatic --project-token=<your-storybook-token>
```

---

## Phase 2 Implementation (Weeks 5-8)

When we begin Phase 2 Visual Regression Testing, we'll:

1. **Week 5**: Setup Chromatic + Storybook infrastructure
   - Install Chromatic package
   - Create first 10 component stories
   - Configure Chromatic workflow in `.github/workflows/`

2. **Week 6-7**: Build component library
   - Create 30 more stories (total: 40 components)
   - 3 viewports: Mobile (375px), Tablet (768px), Desktop (1440px)
   - Multiple states: default, hover, error, loading

3. **Week 8**: CI Integration
   - Automate Chromatic runs on PR
   - Set up UI review workflow
   - Train team on visual regression process

---

## Cost Tracking

### Free Tier Limits
- **5,000 snapshots/month** (resets monthly)
- **Unlimited team members**
- **Unlimited projects**

### Our Usage Estimate
- 40 components × 3 viewports × 2 states (avg) = **240 snapshots per run**
- ~20 PR/month × 240 snapshots = **4,800 snapshots/month**
- **Within free tier** ✅

### Overage Pricing
- If exceeded: $149/month for unlimited snapshots
- ROI: $48,900/year saved in manual testing (see VISUAL_REGRESSION_TESTING_PLAN.md)

---

## Troubleshooting

### "I only see Playwright projects"
- Create a new project and explicitly select "Storybook"
- You can have multiple projects in one account

### "Token not working"
- Verify you're using the **Storybook token**, not Playwright token
- Check GitHub Secret name is exactly: `CHROMATIC_PROJECT_TOKEN`
- Token format should be: `chpt_` followed by alphanumeric characters

### "Can I use both?"
- Yes! Keep both projects
- Playwright for E2E visual testing (future enhancement)
- Storybook for component testing (Phase 2 requirement)

---

## Quick Links

- **Chromatic Dashboard**: https://www.chromatic.com/
- **Storybook Docs**: https://storybook.js.org/docs/react/get-started/introduction
- **Chromatic Storybook Guide**: https://www.chromatic.com/docs/storybook
- **GitHub Secrets**: https://github.com/aubreybeach/DIVE-V3/settings/secrets/actions

---

## Next Steps

1. ✅ Chromatic account created
2. ✅ Playwright project created
3. ✅ Storybook project created
4. ⏳ **Add token to GitHub Secrets** (2 minutes) - FINAL STEP
5. ✅ Ready for Phase 2 implementation

**Token to Add**: `chpt_830b42947e40212`

**Total Time**: ~2 minutes remaining

---

**Document Owner**: Testing & Quality Team  
**Last Updated**: 2026-02-08  
**Contact**: aubreybeach
