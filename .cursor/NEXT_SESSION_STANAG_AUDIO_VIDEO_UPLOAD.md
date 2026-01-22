# STANAG 4774/4778 Audio & Video Upload Implementation

## 🎯 Mission Objective

Extend DIVE V3's upload capability to support **STANAG 4774/4778 compliant audio and video files** with proper metadata binding, classification markings, and ZTDF encryption. This builds upon the existing PDF/document upload pipeline to provide full multimedia support for coalition partners.

---

## 📋 Context & Foundation

### Current State (Baseline)
As of January 21, 2026, DIVE V3 has:
- ✅ **Working upload pipeline** for documents (PDF, DOCX, TXT, etc.)
- ✅ **SPIF parser** (`NATO_Security_Policy.xml`) generating STANAG 4774 compliant markings
- ✅ **ZTDF encryption** with KAS key management
- ✅ **BDO extraction/creation** for document metadata binding
- ✅ **Multi-instance deployment** (USA, FRA, GBR) with federation
- ✅ **Localized classification labels** (English, French, German, Spanish, Italian, Polish)
- ✅ **Full authorization pipeline** (OPA ABAC with ACP-240 compliance)

### Reference Documentation
- **Primary Spec**: `@docs/Metadata-Markings.md` - Comprehensive STANAG 4774/4778 guide
- **Example Files**: `@.archive/examples/` contains:
  - `NATO UNCLASSIFIED - Sample Audio 1.mp3`
  - `NATO_UNCLASSIFIED_sample_audio_v2.m4a`
  - `NATO_UNCLASSIFIED_sample_audio_v2.mp3`
  - `NATO_UNCLASSIFIED_sample_video_with_audio_v2.mp4`
  - `NATO_UNCLASSIFIED_marking_frame_v2.png`

### Key Architecture Components
```
frontend/src/app/upload/page.tsx          # Upload UI (Bento Grid, multi-step)
frontend/src/app/api/upload/route.ts      # Server-side upload proxy
backend/src/controllers/upload.controller.ts  # Upload handler with OPA authz
backend/src/services/upload.service.ts     # ZTDF conversion logic
backend/src/services/spif-parser.service.ts   # STANAG 4774 marking generation
backend/src/services/bdo-parser.service.ts    # BDO extraction/creation
backend/src/utils/ztdf.utils.ts           # ZTDF encryption utilities
policies/upload_authorization_policy.rego  # OPA upload authorization rules
```

---

## 🎓 Lessons Learned (Critical for Success)

### 1. **SPIF Parser XML Attribute Handling**
**Issue**: When `xml2js` parser uses `xmlns: true`, attributes return as objects `{ value: 'X', name: 'attr' }` not strings.
**Solution**: Always check `typeof attr === 'string' ? attr : attr?.value` for all attribute extractions.
**Location**: `backend/src/services/spif-parser.service.ts` lines 106-127, 70-93, 137-154

### 2. **Docker Volume Mounts for SPIF File**
**Issue**: `NATO_Security_Policy.xml` must be accessible in backend containers at `/app/NATO_Security_Policy.xml`.
**Solution**: 
- Template: `templates/spoke/docker-compose.template.yml` line 373
- Hub: `docker-compose.hub.yml` line 314
- Instances: All `instances/*/docker-compose.yml` files

### 3. **Keycloak Service Account Configuration**
**Issue**: Backend→KAS authentication requires `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET`.
**Critical Variables**:
```yaml
KEYCLOAK_CLIENT_ID: dive-v3-broker-{{INSTANCE_CODE_LOWER}}
KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET_{{INSTANCE_CODE_UPPER}}}
INSTANCE_REALM: {{INSTANCE_CODE_UPPER}}
KAS_URL: https://kas-{{INSTANCE_CODE_LOWER}}:8080
```
**Locations**: 
- Template: `templates/spoke/docker-compose.template.yml` lines 346-347, 334, 355
- All instance docker-compose files

### 4. **STANAG 4774 Country Code Format**
**Issue**: Must use ISO 3166-1 alpha-3 codes (FRA, USA, GBR) NOT full names ("France").
**Solution**: `backend/src/services/spif-parser.service.ts` line 456-460 - use codes directly, not translated names.
**Correct**: `SECRET // REL TO FRA, USA`
**Wrong**: `SECRET // Releasable To France, United States`

### 5. **Classification Localization**
**Issue**: French users should see "NON CLASSIFIÉ" not "UNCLASSIFIED".
**Solution**: Pass `language` parameter to `generateMarking()` based on `uploader.countryOfAffiliation`:
```typescript
const language = uploader.countryOfAffiliation === 'FRA' ? 'fr' : 'en';
```
**Locations**:
- `backend/src/services/upload.service.ts` line 123
- `backend/src/controllers/resource.controller.ts` line 238

### 6. **MongoDB Query Construction**
**Issue**: Empty `$or: []` arrays cause "must be a non-empty array" errors.
**Solution**: Only initialize `$or` when you have values to add. Never leave it empty.
**Location**: `backend/src/controllers/paginated-search.controller.ts` line 380-389

### 7. **React setState During Render**
**Issue**: Calling `router.push()` inside setState callback causes "Cannot update component during render" warnings.
**Solution**: Defer navigation with `setTimeout(() => callback(), 0)`.
**Location**: `frontend/src/components/upload/upload-progress-steps.tsx` line 187

### 8. **Content Security Policy for PDFs**
**Issue**: CSP `frame-src` must allow `data:` URIs to display PDF previews.
**Solution**: `frame-src 'self' data: ${keycloakBaseUrl}`
**Location**: `frontend/next.config.ts` line 57

### 9. **SPIF Cache Management**
**Issue**: In-memory SPIF cache persists old values across code updates.
**Solution**: Restart backend containers after SPIF parser changes to clear cache.
**Cache TTL**: 1 hour (`backend/src/config/spif.config.ts` line 59)

### 10. **DIVE CLI for All Orchestration**
**Critical**: Use `./dive up`, `./dive down`, `./dive restart`, etc. - NEVER manual `docker-compose` or `docker` commands.
**Reason**: DIVE CLI handles secrets loading, network setup, realm bootstrapping, and multi-instance orchestration.

---

## 📊 Current Project Structure (Relevant Directories)

```
DIVE-V3/
├── .archive/
│   └── examples/                    # ⭐ STANAG audio/video sample files
│       ├── NATO UNCLASSIFIED - Sample Audio 1.mp3
│       ├── NATO_UNCLASSIFIED_sample_audio_v2.m4a
│       ├── NATO_UNCLASSIFIED_sample_audio_v2.mp3
│       ├── NATO_UNCLASSIFIED_sample_video_with_audio_v2.mp4
│       └── NATO_UNCLASSIFIED_marking_frame_v2.png
│
├── docs/
│   └── Metadata-Markings.md         # ⭐ STANAG 4774/4778 specification guide
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── upload.controller.ts  # Upload endpoint with OPA authz
│   │   │   └── resource.controller.ts
│   │   ├── services/
│   │   │   ├── upload.service.ts     # Main upload logic + ZTDF conversion
│   │   │   ├── spif-parser.service.ts # STANAG 4774 marking generation
│   │   │   ├── bdo-parser.service.ts  # BDO extraction/creation
│   │   │   └── resource.service.ts
│   │   ├── utils/
│   │   │   └── ztdf.utils.ts        # ZTDF encryption utilities
│   │   └── types/
│   │       ├── stanag.types.ts      # STANAG 4774/4778 interfaces
│   │       └── upload.types.ts
│   └── __tests__/
│       └── services/
│           └── spif-parser.service.test.ts
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── upload/page.tsx      # Upload UI (Bento Grid design)
│   │   │   ├── api/upload/route.ts  # Server-side upload proxy
│   │   │   └── resources/[id]/page.tsx
│   │   └── components/
│   │       ├── upload/
│   │       │   ├── file-uploader.tsx
│   │       │   ├── security-label-form.tsx
│   │       │   ├── bento-upload-layout.tsx
│   │       │   └── upload-progress-steps.tsx
│   │       ├── resources/
│   │       │   └── content-viewer.tsx  # ⭐ Will need video/audio player
│   │       └── ztdf/
│   │           └── KASRequestModal.tsx
│
├── NATO_Security_Policy.xml          # SPIF file (classifications + markings)
├── policies/
│   └── upload_authorization_policy.rego
│
├── scripts/
│   └── dive-modules/                # ⭐ DIVE CLI modules
│       ├── core.sh                  # up, down, restart commands
│       ├── secrets.sh               # GCP secrets management
│       └── deploy.sh
│
├── templates/
│   └── spoke/
│       └── docker-compose.template.yml
│
└── instances/
    ├── fra/docker-compose.yml
    ├── gbr/docker-compose.yml
    └── deu/docker-compose.yml
```

---

## 🔍 Scope Gap Analysis (Required Pre-Implementation)

Before implementing audio/video support, you must analyze and document:

### A. **Format Support Matrix**
| Format | MIME Type | Current Support | STANAG Profile Needed | Metadata Binding Method |
|--------|-----------|----------------|----------------------|------------------------|
| MP3    | audio/mpeg | ❌ None | XMP Sidecar or BDO Sidecar | `.mp3.xmp` or `.mp3.bdo` |
| M4A    | audio/mp4 | ❌ None | XMP embedded or sidecar | ID3v2 tags or `.m4a.xmp` |
| MP4    | video/mp4 | ❌ None | XMP embedded or sidecar | XMP packet or `.mp4.xmp` |
| WAV    | audio/wav | ❌ None | BDO Sidecar | `.wav.bdo` |
| WebM   | video/webm | ❌ None | BDO Sidecar | `.webm.bdo` |

**Analysis Required**:
- Which formats does DIVE V3 need to support? (Prioritize MP3, MP4 based on examples)
- Can we embed XMP in MP4/M4A or must we use sidecars?
- What metadata extraction libraries exist? (e.g., `music-metadata`, `fluent-ffmpeg`)

### B. **Marking Placement Analysis**
Audio/video has no "page headers" like PDF. Analyze:
- **Player UI overlay** (on-screen display during playback)
- **Video watermark frames** (burned into video stream)
- **Audio metadata tags** (ID3, Vorbis comments)
- **Thumbnail/poster image markings**

**Gap**: Current `spif-parser.service.ts` generates `pageTopBottom` markings. Need audio/video equivalents.

### C. **Existing Backend Gaps**
Inventory what's missing:
- ✅ `upload.service.ts` handles generic buffers (works for any binary)
- ✅ `bdo-parser.service.ts` supports sidecar BDOs
- ❌ **No XMP extraction for MP4/M4A**
- ❌ **No audio metadata parsing** (ID3 tags, M4A atoms)
- ❌ **No video frame watermarking**
- ❌ **No audio waveform classification overlay generation**
- ❌ **MIME type validation** doesn't include audio/video

### D. **Frontend Player Gaps**
- ❌ **No audio player component** with classification overlay
- ❌ **No video player component** with classification banner
- ❌ **No waveform visualization** for audio
- ❌ **ContentViewer** only handles PDF/images/text
- ❌ **No classification watermark rendering** on video frames

### E. **Authorization Policy Gaps**
Check if upload authorization policy needs updates:
- Does it restrict based on file type?
- Are there special rules for multimedia (e.g., max file size, duration)?
- Should audio/video have different COI requirements?

### F. **Storage & Performance Gaps**
- **File size limits**: Videos can be 100MB-5GB (current limit?)
- **Streaming**: Should large videos stream or download?
- **Thumbnail generation**: Need to extract video thumbnails for preview
- **Transcoding**: Should videos be transcoded to standard formats?

### G. **Testing Gaps**
What test coverage exists?
- ✅ Document upload E2E tests
- ❌ Audio upload tests
- ❌ Video upload tests
- ❌ XMP metadata extraction tests
- ❌ Audio player classification overlay tests
- ❌ Video watermark rendering tests

---

## 📐 Phased Implementation Plan (SMART Goals)

### Phase 1: Foundation & Analysis (Week 1)
**Goal**: Establish technical foundation and validate approach with proof-of-concept

#### 1.1 Technical Research & Gap Analysis ✅
**Tasks**:
- [ ] Review `@docs/Metadata-Markings.md` sections 3-5 (audio/video binding profiles)
- [ ] Analyze `.archive/examples/` files for existing metadata/XMP
- [ ] Research Node.js libraries: `music-metadata`, `fluent-ffmpeg`, `node-exiftool`, `xmp-reader`
- [ ] Document STANAG 4778 sidecar vs embedded strategy decision
- [ ] Create technical decision record (TDR) in `docs/TDR-AUDIO-VIDEO-BINDING.md`

**Success Criteria**:
- ✅ TDR approved with clear binding profile choice (XMP sidecar vs embedded)
- ✅ Library evaluation matrix completed with recommendation
- ✅ MIME type support list defined (minimum: MP3, M4A, MP4)

#### 1.2 Extend MIME Type Support ✅
**Tasks**:
- [ ] Update `backend/src/config/spif.config.ts` - add audio/video MIME types to `BDO_SUPPORTED_MIME_TYPES`
- [ ] Update `backend/src/services/upload.service.ts` - add MIME type validation for audio/video
- [ ] Update `frontend/src/components/upload/file-uploader.tsx` - accept audio/video file types

**Success Criteria**:
- ✅ Upload endpoint accepts `.mp3`, `.m4a`, `.mp4`, `.wav`, `.webm` files
- ✅ MIME type validation passes for `audio/*` and `video/*`
- ✅ File size limits enforced (recommend: 500MB for video, 100MB for audio)

**Testing**:
```bash
./dive exec backend -- npm run test -- upload.service.test.ts
```

#### 1.3 Audio Metadata Extraction (POC) ✅
**Tasks**:
- [ ] Create `backend/src/services/audio-metadata.service.ts`
- [ ] Implement MP3 ID3 tag extraction using `music-metadata` library
- [ ] Implement M4A/MP4 atom parsing for metadata
- [ ] Test extraction with `.archive/examples/` sample files
- [ ] Write unit tests for extraction logic

**Success Criteria**:
- ✅ Successfully extract existing metadata from sample MP3/M4A files
- ✅ Detect if files already have STANAG labels (fail-secure: reject if mismatch)
- ✅ 90%+ test coverage for audio metadata extraction

**Code Example**:
```typescript
import { parseFile } from 'music-metadata';

export async function extractAudioMetadata(buffer: Buffer, mimeType: string) {
  const metadata = await parseFile(buffer, { mimeType });
  return {
    duration: metadata.format.duration,
    bitrate: metadata.format.bitrate,
    sampleRate: metadata.format.sampleRate,
    codec: metadata.format.codec,
    existingTags: metadata.native, // ID3, Vorbis, etc.
  };
}
```

---

### Phase 2: Backend Implementation (Week 2)

#### 2.1 BDO Sidecar Support for Audio/Video ✅
**Tasks**:
- [ ] Extend `backend/src/services/bdo-parser.service.ts` to support sidecar creation
- [ ] Implement `createAudioVideoBDO(buffer, metadata, securityLabel)` function
- [ ] Store BDO as `.{filename}.bdo` sidecar in MongoDB GridFS or S3
- [ ] Update `extractBDO()` to check for audio/video sidecars

**STANAG 4778 BDO Structure** (per Metadata-Markings.md):
```xml
<BindingInformation xmlns="urn:nato:stanag:4778:bindinginformation:1:0">
  <MetadataBinding>
    <Metadata>
      <OriginatorConfidentialityLabel>
        <!-- STANAG 4774 label here -->
      </OriginatorConfidentialityLabel>
    </Metadata>
    <DataReference>
      <URI>file:///example.mp4</URI>
      <MIMEType>video/mp4</MIMEType>
    </DataReference>
  </MetadataBinding>
</BindingInformation>
```

**Success Criteria**:
- ✅ BDO sidecars created for all uploaded audio/video files
- ✅ BDO validates against STANAG 4778 schema
- ✅ BDO extraction works for files with pre-existing sidecars

**Testing**:
```bash
./dive exec backend -- npm run test -- bdo-parser.service.test.ts
```

#### 2.2 XMP Embedding/Extraction (Optional) ✅
**Tasks**:
- [ ] Create `backend/src/services/xmp-metadata.service.ts`
- [ ] Implement XMP packet embedding for MP4 using `exiftool` or `ffmpeg`
- [ ] Implement XMP extraction for validation
- [ ] Decide: Embedded XMP vs Sidecar XMP (per format)

**Decision Matrix**:
| Format | Embedded XMP? | Sidecar XMP? | Recommendation |
|--------|---------------|--------------|----------------|
| MP4    | ✅ Yes (atoms) | ✅ Yes | Prefer embedded if tooling supports |
| MP3    | ❌ No (ID3 only) | ✅ Yes | Use `.mp3.xmp` sidecar |
| M4A    | ✅ Yes (atoms) | ✅ Yes | Prefer embedded |
| WAV    | ❌ No | ✅ Yes | Use `.wav.xmp` sidecar |

**Success Criteria**:
- ✅ XMP embedding works for at least MP4 format
- ✅ XMP extraction validates STANAG 4774 labels
- ✅ Fallback to sidecar if embedding fails

#### 2.3 Extend Upload Service for Multimedia ✅
**Tasks**:
- [ ] Update `backend/src/services/upload.service.ts::uploadFile()`
- [ ] Add audio/video specific metadata extraction
- [ ] Generate appropriate BDO binding (embedded XMP or sidecar)
- [ ] Update ZTDF payload structure for multimedia
- [ ] Add duration/codec metadata to resource document

**Enhanced IZTDFResource Schema**:
```typescript
interface IMultimediaMetadata {
  duration?: number;        // seconds
  bitrate?: number;         // kbps
  codec?: string;          // 'h264', 'aac', 'mp3', etc.
  resolution?: string;     // '1920x1080' for video
  sampleRate?: number;     // Hz for audio
  channels?: number;       // 1 (mono), 2 (stereo), etc.
  hasAudio?: boolean;      // for video files
  hasVideo?: boolean;      // for container formats
}
```

**Success Criteria**:
- ✅ Upload API accepts audio/video files
- ✅ BDO created and stored with resource
- ✅ Multimedia metadata extracted and stored
- ✅ ZTDF encryption works for large files (streaming or chunked)

**Testing**:
```bash
# Upload sample files using DIVE CLI
./dive exec backend -- npx tsx src/scripts/test-audio-video-upload.ts
```

---

### Phase 3: Frontend Player Implementation (Week 3)

#### 3.1 Audio Player with Classification Overlay ✅
**Tasks**:
- [ ] Create `frontend/src/components/multimedia/AudioPlayer.tsx`
- [ ] Implement HTML5 `<audio>` with custom controls
- [ ] Add classification banner overlay (always visible)
- [ ] Add waveform visualization using `wavesurfer.js` or `react-audio-player`
- [ ] Display releasability and COI metadata

**UI Requirements**:
```
┌─────────────────────────────────────────────┐
│ 🔒 NON CLASSIFIÉ // REL TO FRA, USA        │ ← Classification banner
├─────────────────────────────────────────────┤
│  [Waveform visualization]                   │
│  ████▓▓▓▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                             │
│  ▶  00:32 / 02:15  🔊 ━━━●────── 📥        │ ← Controls
├─────────────────────────────────────────────┤
│ 📄 NATO Intelligence Brief - Audio         │
│ 📅 Created: 2026-01-15                     │
│ 🔐 Encrypted with ZTDF                     │
└─────────────────────────────────────────────┘
```

**Success Criteria**:
- ✅ Classification banner always visible (cannot be dismissed)
- ✅ Audio playback works for MP3, M4A formats
- ✅ Waveform visualization shows classification color coding
- ✅ Download button respects authorization (OPA check)
- ✅ Mobile responsive design

#### 3.2 Video Player with Persistent Watermark ✅
**Tasks**:
- [ ] Create `frontend/src/components/multimedia/VideoPlayer.tsx`
- [ ] Implement HTML5 `<video>` with custom controls
- [ ] Add classification watermark overlay (header + footer banners)
- [ ] Prevent watermark circumvention (CSS overlays, not burnable without backend)
- [ ] Add chapter markers for long videos

**UI Requirements**:
```
┌─────────────────────────────────────────────┐
│ 🔒 SECRET // REL TO USA, GBR, FRA          │ ← Top banner (always visible)
├─────────────────────────────────────────────┤
│                                             │
│          [Video Content Area]               │
│                                             │
│         🔐 CLASSIFICATION WATERMARK         │ ← Center watermark (semi-transparent)
│                                             │
├─────────────────────────────────────────────┤
│ 🔒 SECRET // REL TO USA, GBR, FRA          │ ← Bottom banner
├─────────────────────────────────────────────┤
│  ▶  05:42 / 12:30  🔊 ━━━━●──────  ⚙ 📥   │
└─────────────────────────────────────────────┘
```

**Success Criteria**:
- ✅ Top/bottom classification banners persistent (CSS-based, always visible)
- ✅ Center watermark semi-transparent, rotated -45° (like PDF watermarks)
- ✅ Video playback works for MP4, WebM formats
- ✅ Quality selector for multi-bitrate videos (future: HLS/DASH)
- ✅ Full-screen mode preserves classification markings
- ✅ Screenshot prevention (where browser supports)

#### 3.3 Content Viewer Integration ✅
**Tasks**:
- [ ] Update `frontend/src/components/resources/content-viewer.tsx`
- [ ] Add MIME type detection for audio/video
- [ ] Route to AudioPlayer or VideoPlayer based on type
- [ ] Maintain existing PDF/image/text viewer support

**Success Criteria**:
- ✅ Content viewer auto-detects media type
- ✅ Seamless experience for all supported formats
- ✅ Classification markings consistent across all viewers

---

### Phase 4: Security & Compliance (Week 4)

#### 4.1 Classification Watermark Enforcement ✅
**Tasks**:
- [ ] Prevent watermark removal via browser DevTools (CSS-based, not foolproof)
- [ ] Add backend endpoint for server-side watermark burning (optional)
- [ ] Log all playback events (play, pause, seek, download attempts)
- [ ] Implement screen recording detection (where possible)

**Note**: True watermark enforcement requires server-side video processing (FFmpeg). CSS overlays are deterrent, not cryptographic protection.

#### 4.2 Upload Authorization Policy Updates ✅
**Tasks**:
- [ ] Update `policies/upload_authorization_policy.rego`
- [ ] Add rules for multimedia file size limits (by classification)
- [ ] Add rules for video duration limits (prevent DoS via huge files)
- [ ] Test with OPA test framework

**Example Policy**:
```rego
# Multimedia file size limits by classification
max_upload_size_mb(classification) := size if {
    size := {
        "UNCLASSIFIED": 500,
        "CONFIDENTIAL": 250,
        "SECRET": 100,
        "TOP_SECRET": 50,
    }[classification]
}

# Video duration limits (minutes)
max_video_duration_minutes(classification) := duration if {
    duration := {
        "UNCLASSIFIED": 60,
        "SECRET": 30,
        "TOP_SECRET": 15,
    }[classification]
}
```

**Success Criteria**:
- ✅ File size limits enforced by classification level
- ✅ Duration limits enforced for video
- ✅ 100% OPA test coverage for multimedia rules

**Testing**:
```bash
./dive exec backend -- npm run test -- upload-authorization.test.ts
opa test policies/upload_authorization_policy.rego policies/tests/
```

#### 4.3 Audit Logging for Multimedia Access ✅
**Tasks**:
- [ ] Extend `backend/src/services/audit.service.ts`
- [ ] Log: play, pause, seek, speed change, volume change, download
- [ ] Include duration watched, completion percentage
- [ ] ACP-240 compliance: log all multimedia access events

**Success Criteria**:
- ✅ All playback events logged to MongoDB audit collection
- ✅ 90-day retention enforced
- ✅ Queryable by resource, user, time range

---

### Phase 5: Testing & Validation (Week 5)

#### 5.1 Unit Tests ✅
**Coverage Required**:
- [ ] `audio-metadata.service.test.ts` - Metadata extraction (90%+)
- [ ] `xmp-metadata.service.test.ts` - XMP embedding/extraction (85%+)
- [ ] `bdo-parser.service.test.ts` - Audio/video BDO tests (90%+)
- [ ] `upload.service.test.ts` - Multimedia upload paths (85%+)

**Test Command**:
```bash
./dive exec backend -- npm run test:coverage
```

**Success Criteria**:
- ✅ 90%+ overall backend test coverage
- ✅ All STANAG 4774/4778 code paths tested
- ✅ Edge cases covered (missing metadata, corrupt files, unsupported codecs)

#### 5.2 Integration Tests ✅
**Tasks**:
- [ ] E2E upload test for MP3 with classification
- [ ] E2E upload test for MP4 with releasability
- [ ] E2E playback test with KAS decryption
- [ ] Cross-instance federation test (FRA uploads, USA accesses video)

**Test Files** (use `.archive/examples/`):
- `NATO_UNCLASSIFIED_sample_audio_v2.mp3`
- `NATO_UNCLASSIFIED_sample_video_with_audio_v2.mp4`

**Success Criteria**:
- ✅ All E2E tests pass in clean environment
- ✅ Playwright tests cover upload→playback→download flow
- ✅ Tests run in CI/CD pipeline

**Test Command**:
```bash
./dive down --clean
./dive up
./dive exec backend -- npm run test:e2e -- multimedia-upload.e2e.test.ts
```

#### 5.3 Performance & Load Testing ✅
**Tasks**:
- [ ] Upload 100MB video file (latency < 30s)
- [ ] Stream 1080p video (playback starts < 2s)
- [ ] Concurrent uploads (10 users, no degradation)
- [ ] KAS key request latency for large files (< 500ms)

**Success Criteria**:
- ✅ p95 upload latency < 30s for 100MB files
- ✅ p95 playback start < 2s
- ✅ Handles 50 concurrent uploads without errors

---

### Phase 6: Documentation & Deployment (Week 6)

#### 6.1 Documentation ✅
**Tasks**:
- [ ] Create `docs/AUDIO-VIDEO-UPLOAD-GUIDE.md`
- [ ] Document supported formats with examples
- [ ] Document BDO binding profiles used
- [ ] Update API documentation (OpenAPI/Swagger)
- [ ] Create user guide with screenshots

**Success Criteria**:
- ✅ Complete developer documentation
- ✅ User-facing guide with examples
- ✅ Architecture diagrams for audio/video pipeline

#### 6.2 Template & Instance Deployment ✅
**Tasks**:
- [ ] Update `templates/spoke/docker-compose.template.yml` with any new services
- [ ] Regenerate all instance configs using template
- [ ] Deploy to all instances (USA, FRA, GBR, DEU) using DIVE CLI
- [ ] Verify clean slate deployment works

**CRITICAL - Deployment Protocol**:
```bash
# NEVER use manual docker commands
# ALWAYS use DIVE CLI

# Clean slate test
./dive down --clean
./dive nuke  # If needed to completely reset
./dive up

# Instance-specific deployment
./dive --instance fra up
./dive --instance gbr up

# Verify health
./dive status
./dive health

# Check logs
./dive logs backend
./dive logs frontend
```

**Success Criteria**:
- ✅ Clean slate deployment completes without errors
- ✅ All instances (USA, FRA, GBR, DEU) support audio/video upload
- ✅ Federation works: FRA user can access USA-uploaded video
- ✅ No manual Docker commands required

#### 6.3 Rollback Plan ✅
**Tasks**:
- [ ] Document rollback procedure
- [ ] Test rollback to pre-audio/video version
- [ ] Verify data compatibility (MongoDB schema changes)

**Rollback Command**:
```bash
./dive down
git checkout main  # Or previous stable tag
./dive up
```

---

## 🎯 SMART Success Criteria (Overall)

### Specific
- [ ] Upload and playback **MP3, M4A, MP4** files with STANAG 4774/4778 metadata
- [ ] Generate **XMP or BDO sidecars** per NATO binding profiles
- [ ] Display **classification overlays** on audio/video players
- [ ] **OPA authorization** enforced for upload and playback

### Measurable
- [ ] **90%+ backend test coverage** for multimedia code
- [ ] **100% STANAG compliance** (validated against NATO_Security_Policy.xml)
- [ ] **p95 latency < 30s** for 100MB video upload
- [ ] **Zero manual Docker commands** used (100% DIVE CLI orchestration)

### Achievable
- [ ] Use existing `upload.service.ts` pipeline (proven working)
- [ ] Use existing `spif-parser.service.ts` for marking generation
- [ ] Leverage HTML5 `<audio>` and `<video>` (no custom codec implementation)
- [ ] Use npm libraries (`music-metadata`, `fluent-ffmpeg`) - no custom parsers

### Relevant
- [ ] Supports coalition multimedia intelligence sharing
- [ ] Extends existing ZTDF encryption to audio/video
- [ ] Maintains ACP-240 compliance for multimedia
- [ ] Enables federated video briefing access

### Time-Bound
- [ ] **Week 1**: Foundation + POC (metadata extraction working)
- [ ] **Week 2**: Backend implementation (upload pipeline complete)
- [ ] **Week 3**: Frontend players (audio/video playback working)
- [ ] **Week 4**: Security hardening (watermarks, logging)
- [ ] **Week 5**: Testing (90%+ coverage achieved)
- [ ] **Week 6**: Documentation + deployment (production-ready)

---

## 🔧 Technical Requirements

### Backend Dependencies
```json
{
  "music-metadata": "^9.1.0",      // Audio metadata extraction
  "fluent-ffmpeg": "^2.1.2",       // Video processing
  "@ffmpeg-installer/ffmpeg": "^1.1.0",  // FFmpeg binary
  "exiftool-vendored": "^25.0.0",  // XMP/EXIF extraction
  "xmp-reader": "^2.0.0"           // XMP packet parsing
}
```

### Frontend Dependencies
```json
{
  "react-player": "^2.16.0",       // Unified audio/video player
  "wavesurfer.js": "^7.7.3",       // Audio waveform visualization
  "video.js": "^8.10.0",           // Advanced video player (optional)
  "plyr-react": "^5.3.0"           // Alternative player (Plyr)
}
```

### Infrastructure
- **MongoDB GridFS** or **S3** for large file storage (if not already configured)
- **CDN** for video streaming (optional: CloudFront, Cloudflare Stream)
- **Transcoding service** (future: AWS MediaConvert, FFmpeg workers)

---

## 🚨 Critical Constraints & Guidelines

### 1. DIVE CLI Mandatory
```bash
# ✅ CORRECT
./dive up
./dive --instance fra restart backend
./dive logs kas
./dive exec backend -- npm test

# ❌ FORBIDDEN
docker-compose up -d
docker restart dive-spoke-fra-backend
docker logs dive-hub-kas
docker exec dive-hub-backend npm test
```

### 2. No Shortcuts or Workarounds
- ❌ Don't skip BDO creation "for POC" - implement fully
- ❌ Don't use plaintext files instead of encrypted ZTDF
- ❌ Don't skip OPA authorization for "faster development"
- ❌ Don't hardcode MIME types - use proper detection
- ❌ Don't skip tests "to save time"

### 3. Resilient & Persistent Design
- ✅ Handle FFmpeg failures gracefully (fallback to sidecar if embedding fails)
- ✅ Store metadata in MongoDB (survives container restarts)
- ✅ Use connection pooling for large file uploads
- ✅ Implement retry logic for KAS key requests
- ✅ Circuit breakers for external services (already exists in codebase)

### 4. Full Testing Suite Required
- ✅ Unit tests (Jest) - 90%+ coverage
- ✅ Integration tests - Upload→Storage→Playback
- ✅ E2E tests (Playwright) - User workflows
- ✅ OPA policy tests - 100% coverage
- ✅ Load tests - Performance benchmarks

### 5. Dummy Data - Clean Slate Authorized
```bash
# You are authorized to nuke everything for testing
./dive nuke  # Destroys all data, containers, volumes
./dive up    # Fresh start

# Test with dummy users
testuser-fra-1  (FRA, UNCLASSIFIED)
testuser-usa-1  (USA, SECRET)
testuser-gbr-1  (GBR, CONFIDENTIAL)
```

---

## 📝 Deliverables Checklist

### Code
- [ ] `backend/src/services/audio-metadata.service.ts`
- [ ] `backend/src/services/xmp-metadata.service.ts`
- [ ] `frontend/src/components/multimedia/AudioPlayer.tsx`
- [ ] `frontend/src/components/multimedia/VideoPlayer.tsx`
- [ ] Updated `upload.service.ts` with multimedia support
- [ ] Updated `content-viewer.tsx` with multimedia routing

### Tests
- [ ] `backend/src/__tests__/services/audio-metadata.service.test.ts`
- [ ] `backend/src/__tests__/e2e/multimedia-upload.e2e.test.ts`
- [ ] `frontend/src/__tests__/e2e/audio-playback.spec.ts`
- [ ] `frontend/src/__tests__/e2e/video-playback.spec.ts`
- [ ] `policies/tests/multimedia_upload_authz.test.rego`

### Documentation
- [ ] `docs/AUDIO-VIDEO-UPLOAD-GUIDE.md`
- [ ] `docs/TDR-AUDIO-VIDEO-BINDING.md`
- [ ] `docs/MULTIMEDIA-SECURITY-GUIDELINES.md`
- [ ] Updated `README.md` with multimedia support section

### Configuration
- [ ] Updated `templates/spoke/docker-compose.template.yml` (if needed)
- [ ] All instances regenerated from template
- [ ] `NATO_Security_Policy.xml` validated for multimedia marking rules

---

## 🎬 Sample Test Cases

### Test Case 1: Upload MP3 Audio File
```typescript
describe('Audio Upload - MP3', () => {
  it('should upload MP3 with STANAG 4774 BDO sidecar', async () => {
    const audioBuffer = fs.readFileSync('.archive/examples/NATO_UNCLASSIFIED_sample_audio_v2.mp3');
    
    const response = await uploadFile(audioBuffer, 'intel-brief.mp3', 'audio/mpeg', {
      classification: 'UNCLASSIFIED',
      releasabilityTo: ['FRA', 'USA'],
      COI: [],
      title: 'NATO Intelligence Brief - Audio',
    }, {
      uniqueID: 'testuser-fra-1',
      clearance: 'UNCLASSIFIED',
      countryOfAffiliation: 'FRA',
    });
    
    expect(response.resourceId).toBeDefined();
    expect(response.ztdf.metadata.multimedia.duration).toBeGreaterThan(0);
    expect(response.stanag.displayMarking).toBe('SANS CLASSIFICATION // REL TO FRA, USA');
  });
});
```

### Test Case 2: Playback with Classification Overlay
```typescript
describe('Video Player', () => {
  it('should display classification banner on video playback', async () => {
    render(<VideoPlayer 
      src="data:video/mp4;base64,..."
      classification="SECRET"
      releasabilityTo={['USA', 'GBR']}
      displayMarking="SECRET // REL TO USA, GBR"
    />);
    
    expect(screen.getByText('SECRET // REL TO USA, GBR')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /classification banner/i })).toBeVisible();
    
    // Classification banner should not be removable
    const banner = screen.getByText('SECRET // REL TO USA, GBR');
    expect(banner).toHaveStyle({ position: 'sticky' });
  });
});
```

### Test Case 3: Authorization Enforcement
```bash
# Upload authorized (user clearance sufficient)
curl -k -X POST https://localhost:4010/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@video.mp4" \
  -F "classification=CONFIDENTIAL"
# Expected: 200 OK

# Upload denied (user clearance insufficient)
curl -k -X POST https://localhost:4010/api/upload \
  -H "Authorization: Bearer $UNCLASS_TOKEN" \
  -F "file=@video.mp4" \
  -F "classification=SECRET"
# Expected: 403 Forbidden
```

---

## 🔍 Pre-Implementation Analysis Tasks

Before writing any code, complete these analysis tasks:

### 1. **Inventory Existing Multimedia Handling**
```bash
# Search for existing audio/video code
./dive exec backend -- grep -r "audio\|video\|mp3\|mp4\|multimedia" src/ --include="*.ts"

# Check current MIME type support
./dive exec backend -- grep -r "MIME\|mimetype" src/services/upload.service.ts

# List all supported file types
./dive exec backend -- grep -r "accept=" frontend/src/components/upload/
```

### 2. **Validate SPIF Marking Rules for Multimedia**
Verify `NATO_Security_Policy.xml` has marking rules appropriate for multimedia:
- Does it define watermark text rules?
- Does it define audio/video specific categories?
- Are portion markings applicable to media segments?

### 3. **Assess Storage Capacity**
```bash
# Check MongoDB disk space
./dive exec mongodb -- df -h

# Check available volumes
./dive exec backend -- du -sh /app/uploads

# Estimate: 100 users × 10 videos × 100MB = 100GB minimum
```

### 4. **Security Threat Modeling**
Document potential attacks and mitigations:
- **Screen recording bypass**: Mitigate with watermarks, log playback events
- **Label stripping**: Mitigate with cryptographic binding (STANAG 4778)
- **Re-encoding to remove watermark**: Server-side enforcement, not client CSS
- **Large file DoS**: File size and duration limits in OPA policy

---

## 📐 Architecture Decision Records Needed

Create ADRs for:
1. **ADR-001**: XMP Embedded vs Sidecar BDO (which binding profile?)
2. **ADR-002**: Client-side vs Server-side Watermarking (security vs performance)
3. **ADR-003**: Streaming vs Download for Large Videos (user experience)
4. **ADR-004**: FFmpeg Transcoding (standardize codecs or accept all?)
5. **ADR-005**: GridFS vs S3 for Large File Storage (cost, performance, federation)

---

## 🚀 Quick Start Command for New Session

```bash
# Ensure clean environment
./dive status

# If needed, nuke and restart
./dive nuke
./dive up

# Verify all services healthy
./dive health

# Run gap analysis script (create this first)
./dive exec backend -- npx tsx src/scripts/analyze-multimedia-gaps.ts

# Start with Phase 1.1 - analyze example files
./dive exec backend -- npx tsx -e "
  const fs = require('fs');
  const { parseFile } = require('music-metadata');
  
  async function analyzeExamples() {
    const files = [
      '../../.archive/examples/NATO_UNCLASSIFIED_sample_audio_v2.mp3',
      '../../.archive/examples/NATO_UNCLASSIFIED_sample_video_with_audio_v2.mp4'
    ];
    
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const metadata = await parseFile(file);
      console.log('File:', file);
      console.log('Format:', metadata.format);
      console.log('Tags:', metadata.common);
      console.log('---');
    }
  }
  
  analyzeExamples().catch(console.error);
"
```

---

## 🎯 Expected Final State

After completing all phases:

### User Experience
1. ✅ User uploads MP4 video on `/upload` page
2. ✅ Classification labels auto-generated (STANAG 4774)
3. ✅ BDO sidecar created (STANAG 4778)
4. ✅ File encrypted with ZTDF + KAS
5. ✅ Stored in MongoDB with multimedia metadata
6. ✅ User views video on `/resources/{id}` page
7. ✅ KAS decryption key requested (OPA re-evaluation)
8. ✅ Video plays with persistent classification watermarks
9. ✅ All events logged for audit (ACP-240 compliance)

### Technical Stack
```
Frontend: React Player + Custom Classification Overlays
    ↓
Next.js API Route (/api/upload)
    ↓
Backend Upload Controller (OPA authorization)
    ↓
Upload Service (metadata extraction, BDO creation, ZTDF encryption)
    ↓
SPIF Parser (STANAG 4774 marking generation)
    ↓
MongoDB (resource + BDO sidecar storage)
    ↓
KAS (key management for encrypted multimedia)
```

---

## ⚠️ Known Challenges & Mitigation

| Challenge | Impact | Mitigation Strategy |
|-----------|--------|-------------------|
| Large file upload timeouts | High | Implement chunked upload, increase timeout to 5min |
| FFmpeg processing latency | Medium | Make watermarking async, return resourceId immediately |
| Browser video codec support | Medium | Transcode to H.264/AAC (universal compatibility) |
| Classification watermark removal | High | Server-side burning (optional), audit logging (mandatory) |
| Cross-instance video streaming | High | Use federation token for CDN auth, or proxy through backend |
| XMP embedding library maturity | Low | Fallback to BDO sidecar if XMP embedding fails |

---

## 📚 Reference Materials

### STANAG Standards
- **STANAG 4774**: Confidentiality metadata label (machine-readable)
- **STANAG 4778**: Metadata binding mechanism (format-agnostic)
- **ADatP-4778.2**: Binding profiles (OOXML, XMP, Sidecar, SMTP, REST, etc.)
- **STANAG 4609**: Motion imagery (future: embedded stream labeling)

### NATO Documents
- `NATO_Security_Policy.xml` - SPIF with marking rules
- `.archive/examples/` - Sample NATO classified audio/video
- `docs/Metadata-Markings.md` - Implementation guide

### Existing Codebase
- `backend/src/services/upload.service.ts` - Proven upload pipeline
- `backend/src/services/bdo-parser.service.ts` - BDO handling (extend for multimedia)
- `backend/src/services/spif-parser.service.ts` - Marking generation (works for any format)
- `frontend/src/components/resources/content-viewer.tsx` - Extend with multimedia routing

---

## 🎬 Initial Prompt for AI Agent (New Session)

Use this exact prompt to start the new session:

---

**TASK**: Implement STANAG 4774/4778 compliant audio and video upload capability for DIVE V3, extending the existing document upload pipeline.

**CONTEXT**:
- Study `@docs/Metadata-Markings.md` for STANAG binding profiles (focus on sections 3-5: audio/video)
- Reference sample files in `@.archive/examples/` (MP3, M4A, MP4 with NATO markings)
- Current upload pipeline works for PDF/DOCX - extend to multimedia

**LESSONS LEARNED** (apply these immediately):
1. SPIF parser requires `typeof attr === 'string' ? attr : attr?.value` checks
2. All instances need: `INSTANCE_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KAS_URL`
3. Use ISO 3166-1 alpha-3 codes (FRA not France), prefix "REL TO" not "Releasable To"
4. Localize classifications based on `uploader.countryOfAffiliation`
5. Avoid empty MongoDB `$or: []` arrays
6. Defer router navigation: `setTimeout(() => router.push(), 0)`
7. CSP needs `frame-src 'self' data:` for media previews
8. Restart backends after SPIF parser changes (clears 1-hour cache)

**REQUIREMENTS**:
1. Conduct **full gap analysis** (see scope matrix above)
2. Create **phased implementation plan** with SMART goals
3. Implement **resilient, production-ready** solution (no workarounds)
4. Write **comprehensive test suite** (90%+ coverage)
5. Use **DIVE CLI exclusively** (`./dive up`, `./dive restart`, etc.) - NO manual docker commands
6. Support **clean slate deployment** (`./dive nuke && ./dive up`)
7. Document **all architectural decisions** (ADRs)

**DELIVERABLES**:
- Audio/video upload with STANAG 4774 labels + STANAG 4778 BDO binding
- Audio player with classification overlay + waveform
- Video player with persistent watermarks (top/bottom banners + center)
- OPA policies for multimedia authorization
- 90%+ test coverage with E2E Playwright tests
- Full documentation in `docs/AUDIO-VIDEO-UPLOAD-GUIDE.md`

**TECHNICAL APPROACH**:
- Backend: Use `music-metadata` for audio, `fluent-ffmpeg` for video
- Binding: XMP sidecar (`.mp3.xmp`, `.mp4.xmp`) or BDO sidecar (`.mp3.bdo`)
- Frontend: `react-player` + `wavesurfer.js` with custom classification overlays
- Storage: MongoDB GridFS for large files (or S3 if configured)

**SUCCESS CRITERIA** (measurable):
- ✅ Upload MP3, M4A, MP4 files with correct STANAG metadata
- ✅ p95 upload latency < 30s for 100MB files
- ✅ Classification overlays always visible on players
- ✅ 90%+ backend test coverage for multimedia code
- ✅ Zero manual Docker commands used (100% DIVE CLI)
- ✅ Clean slate deployment works: `./dive nuke && ./dive up`

**START WITH**: 
1. Read `@docs/Metadata-Markings.md` section 3 (audio/video formats)
2. Analyze `.archive/examples/` files for existing metadata
3. Complete gap analysis matrix (formats, backend, frontend, policies, tests)
4. Create TDR for binding profile decision (XMP vs BDO sidecar)
5. Propose detailed Phase 1 implementation plan

**CONSTRAINTS**:
- Use project conventions from `@.cursorrules`
- Follow existing patterns in `upload.service.ts` and `spif-parser.service.ts`
- All secrets via GCP Secret Manager (never hardcoded)
- STANAG 4774/4778 compliance is non-negotiable
- DIVE CLI is the only orchestration tool

Begin with gap analysis and present findings before implementing code.

---
