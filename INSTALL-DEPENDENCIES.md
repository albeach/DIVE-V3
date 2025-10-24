# IdP Management Revamp - Required Dependencies

## Frontend Dependencies to Install

```bash
cd frontend

# Core UI Libraries
npm install framer-motion@^11.0.0
npm install date-fns@^3.0.0
npm install @tanstack/react-query@^5.0.0

# Color Picker (for theme editor)
npm install react-color@^2.19.3
npm install @types/react-color --save-dev

# File Upload (for theme assets)
# react-dropzone already installed ✅

# Command Palette
npm install cmdk@^1.0.0

# Fuzzy Search
npm install fuse.js@^7.0.0

# i18n (Phase 4)
npm install next-intl@^3.0.0

# Build
npm run build
```

## Backend Dependencies to Install

```bash
cd backend

# File Upload & Image Processing
npm install multer@^1.4.5-lts.1
npm install @types/multer --save-dev

# Sharp for image optimization (optional - commented out for now)
# npm install sharp@^0.33.0

# Build
npm run build
```

## Testing Dependencies

```bash
# Frontend
cd frontend
npm install @testing-library/react@^14.0.0 --save-dev
npm install @testing-library/jest-dom@^6.0.0 --save-dev
npm install @testing-library/user-event@^14.0.0 --save-dev

# Backend
cd backend
# Jest already installed ✅
```

## Installation Order

1. **Backend first** (ensures API is ready)
   ```bash
   cd backend
   npm install multer @types/multer
   npm run build
   ```

2. **Frontend** (ensures UI can consume API)
   ```bash
   cd frontend
   npm install framer-motion date-fns @tanstack/react-query cmdk fuse.js react-color @types/react-color next-intl
   npm run build
   ```

3. **Test compilation**
   ```bash
   # Backend
   cd backend && npm run build
   
   # Frontend  
   cd frontend && npx tsc --noEmit
   ```

## Notes

- **Framer Motion**: Required for animations (IdPCard2025, modals, FAB)
- **React Query**: Required for API layer (caching, mutations, optimistic updates)
- **date-fns**: Required for IdPSessionViewer (date formatting)
- **cmdk**: Required for IdPQuickSwitcher (command palette)
- **react-color**: Required for IdPThemeEditor (color picker)
- **next-intl**: Required for Phase 4 (multi-language support)
- **Multer**: Required for theme asset uploads
- **Sharp**: Optional (image optimization) - can be added later

## Verification

After installation, verify:
```bash
# Backend compiles
cd backend && npm run build

# Frontend compiles
cd frontend && npx tsc --noEmit

# Both servers start
cd .. && ./scripts/dev-start.sh
```

