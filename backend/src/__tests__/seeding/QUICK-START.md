# Multi-Format Seeding Tests - Quick Start Guide

## TL;DR - Run Everything

```bash
cd backend/src/__tests__/seeding
./run-all-tests.sh
```

That's it! The script will:
1. ✅ Validate environment and prerequisites
2. ✅ Run all integration tests
3. ✅ Validate file type distribution
4. ✅ Validate ZTDF structure
5. ✅ Run performance benchmarks
6. ✅ Verify document preview capability
7. ✅ Generate comprehensive Markdown report

## Prerequisites

Make sure your DIVE instance is running:

```bash
# For hub testing
./dive deploy hub

# For spoke testing
./dive spoke deploy USA
```

## Test Options

### Full Test Suite (Recommended)

Complete validation with 1000 resources and performance benchmarks:

```bash
./run-all-tests.sh
```

### Quick Test

Fast validation with 100 resources, no benchmarks:

```bash
./run-all-tests.sh USA --quick
```

### Custom Instance

Test a specific spoke instance:

```bash
./run-all-tests.sh ALB
./run-all-tests.sh GBR --quick
```

## Individual Tests

Run specific test categories if you don't need the full suite:

### 1. Integration Tests Only

```bash
./test-seeding-multi-format.sh --full
```

### 2. Distribution Validation Only

```bash
cd ../../../../
docker exec dive-hub-backend npx tsx src/__tests__/seeding/validate-distribution.ts \
  --instance USA \
  --expected-count 5000
```

### 3. ZTDF Structure Validation Only

```bash
cd ../../../../
docker exec dive-hub-backend npx tsx src/__tests__/seeding/validate-ztdf-structure.ts \
  --instance USA \
  --deep
```

### 4. Performance Benchmarks Only

```bash
./benchmark-seeding.sh USA 3
```

## Understanding the Output

### Integration Tests

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Category 1: Template Loading & Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[TEST] 1.1 - Verify examples directory exists
[PASS] Examples directory found: /path/to/examples/examples
[TEST] 1.2 - Verify manifest.json exists and is valid JSON
[PASS] manifest.json is valid JSON
```

- **[PASS]** = Test passed ✅
- **[FAIL]** = Test failed ❌
- **[WARN]** = Warning issued ⚠️
- **[SKIP]** = Test skipped ⏭️

### Distribution Analysis

```
================================================================================
  MULTI-FORMAT SEEDING - DISTRIBUTION VALIDATION REPORT
================================================================================

Type       Count     Actual   Expected   Variance   Status
────────────────────────────────────────────────────────────────────────────
pdf         1015     20.3%      20.0%     +0.3%     ✓ OK
docx         998     20.0%      20.0%     +0.0%     ✓ OK
pptx         504     10.1%      10.0%     +0.1%     ✓ OK
```

- **✓ OK** = Within tolerance (±5%)
- **⚠ WARN** = Outside tolerance but acceptable (±10%)
- **✗ FAIL** = Significant variance (>10%)

### ZTDF Validation

```
================================================================================
  ZTDF STRUCTURE VALIDATION REPORT
================================================================================

Category                   Valid    Invalid   Success Rate
────────────────────────────────────────────────────────────────────────────
ZTDF Structure               100          0          100.0%
Encryption Metadata           98          2           98.0%
Policy Bindings              100          0          100.0%
```

- **100%** = Perfect ✅
- **95-99%** = Excellent ✅
- **90-94%** = Good ⚠️
- **<90%** = Needs attention ❌

### Performance Benchmarks

```
Performance Comparison: Multi vs Text Mode

  100 resources:
    Text mode:   2.3s
    Multi mode:  3.1s
    Difference:  +0.8s (+34.8%) slower
```

Expected: Multi-format is 30-50% slower than text-only (acceptable trade-off)

## Expected Results

### Success Criteria

All tests should achieve:
- ✅ All 14 file types present
- ✅ Distribution within ±5% tolerance
- ✅ 100% ZTDF structure validity
- ✅ >95% BDO metadata validity
- ✅ Throughput >25 resources/sec

### What "Success" Looks Like

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test Results Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total Tests:    47
  Passed:         45
  Failed:         0
  Skipped:        2
  Warnings:       3
  Duration:       182s

✓ ALL TESTS PASSED
```

## Test Reports

After running `./run-all-tests.sh`, you'll find:

### Main Report
```
backend/src/__tests__/seeding/test-reports/full-test-report-YYYYMMDD-HHMMSS.md
```

Comprehensive Markdown report with:
- Executive summary
- Detailed test results
- Performance metrics
- Sample document URLs
- Recommendations

### Benchmark Results
```
backend/src/__tests__/seeding/benchmark-results/
  ├── benchmark-YYYYMMDD-HHMMSS.csv       # Raw data
  └── benchmark-YYYYMMDD-HHMMSS-summary.txt  # Summary
```

### View Reports

```bash
# View main report
cat test-reports/full-test-report-*.md | less

# View latest benchmark
ls -t benchmark-results/*.csv | head -1 | xargs cat

# Open in VS Code
code test-reports/full-test-report-*.md
```

## Troubleshooting

### "Backend container not running"

```bash
# Check if container exists
docker ps -a | grep backend

# Start your instance
./dive deploy hub
# OR
./dive spoke deploy USA
```

### "Template files not mounted"

```bash
# Check volume mount
docker inspect dive-hub-backend | grep examples

# Should show: /path/to/examples/examples:/app/examples/examples:ro

# If missing, rebuild with updated docker-compose
./dive deploy hub --rebuild
```

### "MongoDB connection failed"

```bash
# Check MongoDB container
docker ps | grep mongodb

# Test connection
docker exec dive-hub-backend npx tsx -e "
  import { MongoClient } from 'mongodb';
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  console.log('✓ Connected');
  await client.close();
"
```

### "Seeding failed"

```bash
# Check backend logs
docker logs dive-hub-backend --tail 100

# Check disk space
df -h

# Try with smaller count
TEST_COUNT=50 ./run-all-tests.sh --quick
```

### "Tests taking too long"

Use quick mode for faster results:

```bash
./run-all-tests.sh USA --quick
```

This runs with 100 resources and skips benchmarks (~2 minutes vs ~10 minutes)

## Testing Different Scenarios

### Test Text-Only Mode (Legacy)

```bash
docker exec dive-hub-backend npx tsx src/scripts/seed-instance-resources.ts \
  --instance=USA \
  --count=100 \
  --file-type-mode=text
```

### Test Without Multimedia

```bash
docker exec dive-hub-backend npx tsx src/scripts/seed-instance-resources.ts \
  --instance=USA \
  --count=100 \
  --file-type-mode=multi \
  --no-multimedia
```

### Test Large Scale

```bash
# 10,000 resources (takes ~10 minutes)
docker exec dive-hub-backend npx tsx src/scripts/seed-instance-resources.ts \
  --instance=USA \
  --count=10000 \
  --file-type-mode=multi
```

## Verify in Browser

After seeding completes, test document preview:

1. Navigate to: https://localhost:3000/resources
2. Click any resource
3. Verify:
   - ✅ Document preview renders
   - ✅ STANAG markings display
   - ✅ Multiple file types work (PDF, DOCX, MP4, etc.)

## Continuous Integration

Integrate into your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Start DIVE Hub
  run: ./dive deploy hub

- name: Run Multi-Format Tests
  run: |
    cd backend/src/__tests__/seeding
    ./run-all-tests.sh --quick

- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: backend/src/__tests__/seeding/test-reports/
```

## Support

Need help?

1. Check [README.md](./README.md) for detailed documentation
2. Review [MULTI-FORMAT-SEEDING-TESTS.md](./MULTI-FORMAT-SEEDING-TESTS.md) for test specifications
3. Check Docker logs: `docker logs dive-hub-backend`
4. Verify MongoDB data: Use MongoDB Compass or `mongosh`

---

**Last Updated:** 2026-01-25
