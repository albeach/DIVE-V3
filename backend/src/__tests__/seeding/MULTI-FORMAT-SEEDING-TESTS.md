# Multi-Format Resource Seeding - Comprehensive Test Plan

## Overview
This document provides a comprehensive testing strategy for validating the multi-format resource seeding enhancement in DIVE-V3.

## Test Categories

### 1. Template Loading & Validation
- [ ] Verify all 21 template files exist in `/examples/examples/`
- [ ] Validate manifest.json structure and integrity
- [ ] Verify template file SHA-256 checksums match manifest
- [ ] Test template cache initialization
- [ ] Verify fallback behavior when templates missing

### 2. File Type Distribution
- [ ] Validate weighted distribution algorithm
- [ ] Verify actual distribution matches expected percentages
- [ ] Test with different batch sizes (100, 1000, 5000)
- [ ] Verify all 14 file types are represented
- [ ] Test `--no-multimedia` flag exclusions

### 3. STANAG 4778 BDO Generation
- [ ] Validate BDO XML schema compliance
- [ ] Verify namespace declarations (mb, slab, xmime)
- [ ] Test classification mapping (UNCLASSIFIED → NATO format)
- [ ] Verify DataReference URI matches filename
- [ ] Validate contentType matches MIME type
- [ ] Test CreationDateTime ISO 8601 format

### 4. ZTDF Structure Validation
- [ ] Verify manifest.contentType matches file type
- [ ] Validate policy bindings for each file type
- [ ] Test encryption headers (AES-256-GCM)
- [ ] Verify COI templates applied correctly
- [ ] Validate releasability rules

### 5. MongoDB Data Integrity
- [ ] Verify resource count matches seeding target
- [ ] Validate file type distribution in database
- [ ] Test metadata fields (classification, COI, releasability)
- [ ] Verify seed manifest tracking
- [ ] Validate indexes and performance

### 6. CLI Argument Handling
- [ ] Test `--file-type-mode=text` (legacy mode)
- [ ] Test `--file-type-mode=multi` (new mode)
- [ ] Test `--no-multimedia` flag
- [ ] Test `--count` parameter validation
- [ ] Test `--dry-run` behavior
- [ ] Test invalid argument handling

### 7. Docker Volume Mounts
- [ ] Verify hub backend can access `/app/examples/examples/`
- [ ] Verify spoke backend can access templates
- [ ] Test read-only mount permissions
- [ ] Verify volume mount after container restart

### 8. Hub & Spoke Integration
- [ ] Test hub seeding: `./dive hub seed 100 multi`
- [ ] Test spoke seeding: `./dive spoke seed ALB 100 multi`
- [ ] Verify both use same seeding logic
- [ ] Test legacy mode: `./dive hub seed 100 text`

### 9. Document Preview Functionality
- [ ] Test PDF preview rendering
- [ ] Test DOCX preview rendering
- [ ] Test XLSX spreadsheet preview
- [ ] Test PPTX presentation preview
- [ ] Test multimedia preview (MP4, MP3)
- [ ] Test image preview (JPG, PNG)
- [ ] Verify STANAG markings display on all types

### 10. Performance & Scalability
- [ ] Benchmark 1,000 resources (time to complete)
- [ ] Benchmark 5,000 resources (default)
- [ ] Benchmark 10,000 resources (stress test)
- [ ] Measure MongoDB write performance
- [ ] Measure template cache efficiency
- [ ] Test concurrent seeding operations

### 11. Error Handling & Edge Cases
- [ ] Test with missing template files
- [ ] Test with corrupted manifest.json
- [ ] Test with invalid file type mode
- [ ] Test with zero or negative count
- [ ] Test with count > 1,000,000
- [ ] Test backend container not running
- [ ] Test MongoDB connection failure

### 12. Backward Compatibility
- [ ] Verify existing text-mode seeding still works
- [ ] Test migration from text to multi-format
- [ ] Verify old resources remain accessible
- [ ] Test mixed text/multi resources in database

## Test Execution Order

1. **Pre-flight Checks** (Templates & Docker)
2. **Unit Tests** (Template loading, BDO generation)
3. **Integration Tests** (Full seeding workflow)
4. **Data Validation** (MongoDB queries)
5. **Frontend Tests** (Document preview)
6. **Performance Tests** (Benchmarks)
7. **Edge Case Tests** (Error scenarios)

## Success Criteria

### Functional Requirements
- ✅ All 14 file types successfully seeded
- ✅ Distribution matches expected percentages (±5%)
- ✅ All ZTDF documents have valid BDO metadata
- ✅ All documents encrypted with AES-256-GCM
- ✅ Document preview works for all file types
- ✅ MongoDB schema includes new fields

### Performance Requirements
- ✅ 5,000 resources seeded in < 10 minutes
- ✅ Template cache loads in < 5 seconds
- ✅ No memory leaks during batch processing
- ✅ Database write performance > 100 docs/sec

### Quality Requirements
- ✅ Zero ZTDF structure validation errors
- ✅ Zero BDO schema validation errors
- ✅ 100% template SHA-256 match rate
- ✅ Zero classification mapping errors

## Test Scripts

| Script | Purpose | Location |
|--------|---------|----------|
| `test-seeding-multi-format.sh` | Main test orchestrator | `backend/src/__tests__/seeding/` |
| `validate-distribution.js` | MongoDB distribution analysis | `backend/src/__tests__/seeding/` |
| `validate-ztdf-structure.ts` | ZTDF structure validator | `backend/src/__tests__/seeding/` |
| `validate-bdo-schema.ts` | BDO XML schema validator | `backend/src/__tests__/seeding/` |
| `benchmark-seeding.sh` | Performance benchmarking | `backend/src/__tests__/seeding/` |

## Automated Test Execution

```bash
# Run full test suite
cd backend/src/__tests__/seeding
./test-seeding-multi-format.sh --full

# Run specific test category
./test-seeding-multi-format.sh --category distribution
./test-seeding-multi-format.sh --category performance

# Run with specific instance
./test-seeding-multi-format.sh --instance USA --count 1000
```

## Test Results Format

Each test will output:
```
[PASS] Test Name - Description
[FAIL] Test Name - Error details
[SKIP] Test Name - Reason for skip
[WARN] Test Name - Warning message
```

## Reporting

Test results will be saved to:
- **Console output**: Real-time test progress
- **JSON report**: `test-results-TIMESTAMP.json`
- **HTML report**: `test-results-TIMESTAMP.html`
- **MongoDB collection**: `test_results` (optional)
