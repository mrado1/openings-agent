# AI Enrichment Testing Workflow

## Overview
This workflow tests AI enrichment capabilities by comparing local unenriched shows with production enriched data and AI-enhanced versions.

## Corrected 4-Step Process

### 1. **Query Local Unenriched Shows**
```bash
npm run query-unenriched-shows [limit]
```
- Finds shows with `has_been_enriched=false` in local database
- Prioritizes shows missing press releases, summaries, or images
- Ensures gallery has website for AI discovery
- **Output**: `local_unenriched_test_set_[timestamp].json`

**Example**:
```bash
npm run query-unenriched-shows 10
```

### 2. **Query Production Enriched Data**
```bash
npm run query-production-enriched <local_test_set_file>
```
- Finds same show IDs in production database
- Shows enriched data for comparison baseline
- **Output**: `production_enriched_test_set_[timestamp].json`

**Example**:
```bash
npm run query-production-enriched local_unenriched_test_set_1752182405592.json
```

### 3. **AI Enrichment Test**
```bash
npm run enrich-test-shows <local_test_set_file>
```
- Runs AI discovery pipeline on local unenriched shows
- Tracks success rate, confidence, processing time
- Analyzes added press releases, images, summaries
- **Output**: `enrichment_results_[timestamp].json`

**Example**:
```bash
npm run enrich-test-shows local_unenriched_test_set_1752182405592.json
```

### 4. **AI vs Production Comparison**
```bash
npm run compare-ai-vs-production <enrichment_file> <production_file>
```
- Compares AI enrichment results vs production data
- Calculates improvement rates and production readiness score
- **Output**: `ai_vs_production_comparison_[timestamp].json`

**Example**:
```bash
npm run compare-ai-vs-production enrichment_results_1752182405599.json production_enriched_test_set_1752182405600.json
```

## Key Corrections Made

### **Image Counting Logic**
- **Local shows**: Only 1 image (Artforum `preview_image_url`)
- **AI enriched**: Local + additional images found by AI
- **Production**: Baseline + manually enriched additional images

### **Data Matching**
- Uses exact ID matching (both databases from same scrape)
- Handles missing IDs gracefully
- Shows clear data lineage

### **Separate Output Files**
1. **Local Test Set**: Unenriched shows selected for testing
2. **Production Test Set**: Same shows from production with enrichment
3. **AI Enrichment Results**: AI processing results and improvements
4. **Final Comparison**: Head-to-head AI vs Production analysis

### **Focus on Missing Data**
- Prioritizes shows without press releases (AI's strength)
- Tests AI's ability to find additional images
- Evaluates summary generation capabilities

## Expected Results

**High-performing AI system should show**:
- 80%+ success rate in discovery
- Significant image additions (2-10+ additional images per show)
- Press release improvements for shows missing them
- Competitive or better performance vs production enrichment

**Production readiness indicators**:
- Success rate ≥ 80%
- Image discovery significantly better than production
- Processing time < 60s per show
- High confidence scores (90%+) for successful enrichments

## Output Analysis

Each output file contains structured data for detailed analysis:

- **Performance metrics**: Success rates, timing, confidence
- **Data improvements**: Before/after comparisons
- **Error tracking**: Specific failure reasons
- **Recommendations**: Production deployment guidance

This workflow provides concrete evidence for production deployment decisions. 