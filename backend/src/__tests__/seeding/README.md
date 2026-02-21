# Multi-Format Resource Seeding - Testing Suite

Comprehensive testing suite for validating the multi-format resource seeding enhancement in DIVE-V3.

## Overview

This testing suite provides extensive validation of the multi-format seeding system, including:

- **Template validation** - Verify example files and manifest integrity
- **Distribution analysis** - Validate file type distribution matches expected percentages
- **ZTDF structure validation** - Deep validation of encrypted document structure
- **BDO validation** - STANAG 4778 metadata binding verification
- **Performance benchmarking** - Compare multi-format vs text-only performance
- **Integration testing** - End-to-end seeding workflow validation

## Quick Start

### Prerequisites

1. DIVE-V3 hub or spoke instance deployed and running
2. Backend container running (e.g., `dive-hub-backend`)
3. MongoDB accessible
4. Example files mounted at `/app/examples/examples/`

### Run All Tests

```bash
cd backend/src/__tests__/seeding
./test-seeding-multi-format.sh --full
```

### Run Quick Tests (Essential Only)

```bash
./test-seeding-multi-format.sh --quick
```

### Run Specific Test Category

```bash
./test-seeding-multi-format.sh --category distribution
./test-seeding-multi-format.sh --category ztdf
./test-seeding-multi-format.sh --category performance
```

## Test Scripts

### 1. Main Test Suite (`test-seeding-multi-format.sh`)

Comprehensive test orchestrator covering all validation categories.

**Usage:**
```bash
./test-seeding-multi-format.sh [options]

Options:
  --full                Run all tests (default)
  --quick               Run essential tests only
  --category <name>     Run specific test category

Environment Variables:
  TEST_INSTANCE         Instance code (default: USA)
  TEST_COUNT            Number of resources (default: 100)
  BACKEND_CONTAINER     Backend container name (default: dive-hub-backend)
```

**Test Categories:**
- `templates` - Template files and manifest validation
- `docker` - Docker volume mounts and container environment
- `cli` - Command-line argument handling
- `seeding` - Full seeding execution
- `distribution` - File type distribution analysis
- `ztdf` - ZTDF structure validation
- `bdo` - BDO metadata validation
- `performance` - Performance metrics
- `backward_compat` - Legacy text mode compatibility

**Example:**
```bash
# Test with specific instance and count
TEST_INSTANCE=ALB TEST_COUNT=500 ./test-seeding-multi-format.sh --full

# Test specific category
./test-seeding-multi-format.sh --category seeding
```

### 2. Distribution Validator (`validate-distribution.ts`)

MongoDB-based validation of file type distribution and data integrity.

**Usage:**
```bash
cd backend
npx tsx src/__tests__/seeding/validate-distribution.ts [options]

Options:
  --instance <code>         Instance code (default: USA)
  --expected-count <num>    Expected resource count
  --tolerance <pct>         Tolerance percentage (default: 5)
```

**What It Validates:**
- Total resource count matches expected
- File type distribution matches weights (±5% tolerance)
- All 14 file types are present
- No unexpected file types
- ZTDF structure compliance
- BDO metadata presence

**Example:**
```bash
# Validate USA instance with 5000 expected resources
npx tsx src/__tests__/seeding/validate-distribution.ts \
  --instance USA \
  --expected-count 5000 \
  --tolerance 5

# Validate with stricter tolerance
npx tsx src/__tests__/seeding/validate-distribution.ts \
  --instance ALB \
  --tolerance 3
```

**Output:**
```
================================================================================
  MULTI-FORMAT SEEDING - DISTRIBUTION VALIDATION REPORT
================================================================================

Instance:         USA
Total Resources:  5000
Expected Count:   5000
Tolerance:        ±5%

File Type Distribution:
────────────────────────────────────────────────────────────────────────────
Type       Count     Actual   Expected   Variance   Status
────────────────────────────────────────────────────────────────────────────
pdf         1015     20.3%      20.0%     +0.3%     ✓ OK
docx         998     20.0%      20.0%     +0.0%     ✓ OK
pptx         504     10.1%      10.0%     +0.1%     ✓ OK
xlsx         396      7.9%       8.0%     -0.1%     ✓ OK
...
```

### 3. ZTDF Structure Validator (`validate-ztdf-structure.ts`)

Deep validation of ZTDF document structure and metadata.

**Usage:**
```bash
cd backend
npx tsx src/__tests__/seeding/validate-ztdf-structure.ts [options]

Options:
  --instance <code>    Instance code (default: USA)
  --sample <num>       Sample size (default: 100)
  --deep               Deep validation (sample 1000)
```

**What It Validates:**
- ZTDF manifest structure
- Encryption metadata (AES-256-GCM)
- Policy bindings (classification, releasability, COI)
- Content type MIME mappings
- STANAG 4778 BDO structure
- XML namespace declarations
- Classification consistency

**Example:**
```bash
# Quick validation (100 samples)
npx tsx src/__tests__/seeding/validate-ztdf-structure.ts --instance USA

# Deep validation (1000 samples)
npx tsx src/__tests__/seeding/validate-ztdf-structure.ts --instance USA --deep

# Custom sample size
npx tsx src/__tests__/seeding/validate-ztdf-structure.ts \
  --instance ALB \
  --sample 500
```

**Output:**
```
================================================================================
  ZTDF STRUCTURE VALIDATION REPORT
================================================================================

Instance:          USA
Total Sampled:     100
Valid Documents:   98 (98.0%)
Invalid Documents: 2 (2.0%)

Validation Summary:
────────────────────────────────────────────────────────────────────────────
Category                   Valid    Invalid   Success Rate
────────────────────────────────────────────────────────────────────────────
ZTDF Structure               100          0          100.0%
Encryption Metadata           98          2           98.0%
Policy Bindings              100          0          100.0%
Content Types                100          0          100.0%
BDO Structure                 95          5           95.0%
```

### 4. Performance Benchmark (`benchmark-seeding.sh`)

Performance benchmarking comparing multi-format vs text-only seeding.

**Usage:**
```bash
cd backend/src/__tests__/seeding
./benchmark-seeding.sh [instance] [num_runs]

Arguments:
  instance     Instance code (default: USA)
  num_runs     Number of runs per config (default: 3)

Environment Variables:
  BACKEND_CONTAINER     Backend container name
```

**Test Configurations:**
- 100 resources (text vs multi)
- 500 resources (text vs multi)
- 1000 resources (text vs multi)
- 5000 resources (multi only - default production config)

**Example:**
```bash
# Run with defaults (USA, 3 runs per config)
./benchmark-seeding.sh

# Run with custom instance and more runs
./benchmark-seeding.sh ALB 5

# View results
cat ./benchmark-results/benchmark-*.csv
```

**Output:**
```
Benchmark Results Summary:
─────────────────────────────────────────────────────────────────────────────
Configuration             Count      Avg Time(s)  Avg Thru     Success
─────────────────────────────────────────────────────────────────────────────
Text mode 100             100        2.3s         43/s         100%
Multi mode 100            100        3.1s         32/s         100%
Text mode 500             500        10.5s        48/s         100%
Multi mode 500            500        15.2s        33/s         100%
Text mode 1000            1000       21.8s        46/s         100%
Multi mode 1000           1000       32.4s        31/s         100%
Multi mode 5000           5000       168.7s       30/s         100%

Performance Comparison: Multi vs Text Mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  100 resources:
    Text mode:   2.3s
    Multi mode:  3.1s
    Difference:  +0.8s (+34.8%) slower

  500 resources:
    Text mode:   10.5s
    Multi mode:  15.2s
    Difference:  +4.7s (+44.8%) slower

  1000 resources:
    Text mode:   21.8s
    Multi mode:  32.4s
    Difference:  +10.6s (+48.6%) slower
```

## Test Documentation

### Test Plan (`MULTI-FORMAT-SEEDING-TESTS.md`)

Comprehensive test plan document with:
- Detailed test categories (12 total)
- Success criteria
- Test execution order
- Reporting format

View the full test plan:
```bash
cat MULTI-FORMAT-SEEDING-TESTS.md
```

## Running Tests in Docker

All tests can run from within the backend container:

```bash
# Enter container
docker exec -it dive-hub-backend bash

# Run distribution validation
npx tsx src/__tests__/seeding/validate-distribution.ts --instance USA

# Run ZTDF validation
npx tsx src/__tests__/seeding/validate-ztdf-structure.ts --instance USA --deep
```

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Multi-Format Seeding Tests
  run: |
    cd backend/src/__tests__/seeding
    ./test-seeding-multi-format.sh --full

- name: Validate Distribution
  run: |
    cd backend
    npx tsx src/__tests__/seeding/validate-distribution.ts \
      --instance USA \
      --expected-count 5000
```

## Test Results

Test results are saved to:
- **Console output** - Real-time progress
- **CSV files** - Benchmark raw data (`benchmark-results/*.csv`)
- **JSON reports** - Validation results (optional)
- **Summary reports** - Text summaries (`benchmark-results/*-summary.txt`)

## Troubleshooting

### Container not running
```bash
# Check container status
docker ps | grep backend

# Start hub
./dive deploy hub

# Start spoke
./dive spoke deploy ALB
```

### MongoDB connection issues
```bash
# Check MongoDB container
docker ps | grep mongodb

# Check connection from backend
docker exec dive-hub-backend npx tsx -e "
  import { MongoClient } from 'mongodb';
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  console.log('Connected!');
  await client.close();
"
```

### Template files not accessible
```bash
# Verify volume mount
docker inspect dive-hub-backend | grep examples

# Check files in container
docker exec dive-hub-backend ls -la /app/examples/examples/

# Verify manifest
docker exec dive-hub-backend cat /app/examples/examples/manifest.json | jq .
```

### Permission issues
```bash
# Make scripts executable
chmod +x test-seeding-multi-format.sh benchmark-seeding.sh
```

## Expected Performance

Based on testing:

| Configuration | Resources | Time | Throughput |
|--------------|-----------|------|------------|
| Text mode | 1,000 | ~22s | ~45/s |
| Multi mode | 1,000 | ~32s | ~31/s |
| Multi mode | 5,000 | ~170s | ~30/s |

Multi-format seeding is approximately **30-50% slower** than text-only due to:
- Template file loading and caching
- BDO XML generation
- More complex ZTDF structure
- Varied content types

This performance impact is **acceptable** given the significantly enhanced functionality.

## Success Criteria

Tests pass when:
- ✅ All 14 file types successfully seeded
- ✅ Distribution matches expected percentages (±5%)
- ✅ All ZTDF documents have valid structure
- ✅ All BDO metadata validates against STANAG 4778
- ✅ Documents decrypt and preview correctly
- ✅ Performance > 25 resources/sec
- ✅ Zero critical validation errors

## Related Documentation

- [MULTI-FORMAT-SEEDING-TESTS.md](./MULTI-FORMAT-SEEDING-TESTS.md) - Full test plan
- [Metadata-Markings.md](../../../../docs/Metadata-Markings.md) - STANAG 4774/4778 spec
- [seed-instance-resources.ts](../../../scripts/seed-instance-resources.ts) - Seeding implementation

## Support

For issues or questions:
1. Check [troubleshooting](#troubleshooting) section
2. Review test output for specific error messages
3. Examine MongoDB collections directly
4. Check Docker logs: `docker logs dive-hub-backend`

---

**Last Updated:** 2026-01-25
**DIVE Version:** V3
**Test Suite Version:** 1.0.0
