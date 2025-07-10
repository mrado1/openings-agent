# Production vs AI Extraction Comparison Guide

## 🎯 Overview

This guide walks you through systematically testing the AI extraction system against real production data to identify gallery-specific issues, edge cases, and areas for improvement.

## 📋 Prerequisites

### 1. Environment Setup
```bash
# Set up required environment variables in .env.local
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_SEARCH_API_KEY=your_google_search_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here
```

### 2. Production API Access
✅ **No additional setup needed!** 

We'll use your live production API at `https://scene-michael-rado.vercel.app` (same as your mobile app) to get enriched shows. This is much simpler than direct database access.

## 🔧 Step-by-Step Process

### Step 1: Query Production API for Test Shows
```bash
npm run query-production-api
```

**What this does:**
- Connects to your live production API (https://scene-michael-rado.vercel.app)
- Finds 10 diverse enriched shows (one per gallery)
- Requires shows with: enriched=true, press_release, gallery_website
- Saves test set to `outputs/production_test_set_api_[timestamp].json`

**Expected output:**
```
✅ Selected 10 diverse enriched shows:
1. "Exhibition Title" by Artist Name
   at Gallery Name (https://gallery.com)
   2025-01-15 to 2025-03-15

📁 Production test set saved to: ./outputs/production_test_set_api_1752179832048.json
📊 Diversity: 10 galleries, 15 artists
📅 Date range: 2024-12-01 to 2025-04-30
```

### Step 2: Run Batch AI Extraction
```bash
npm run batch-extraction production_test_set_api_1752179832048.json
```

**What this does:**
- Loads the production test set
- For each show, runs the complete AI discovery pipeline:
  1. Builds search queries
  2. Searches Google for exhibition URLs
  3. Filters and selects best URLs
  4. Extracts show data with Gemini
- Includes 2-second delays between requests
- Saves results to `outputs/batch_extraction_[timestamp].json`

**Expected output:**
```
🔍 [1/10] Processing: "Exhibition Title"
   Artist: Artist Name
   Gallery: Gallery Name
   Website: https://gallery.com
   ✅ Success! Confidence: 85%
   🌐 Found URL: https://gallery.com/exhibitions/show

🎯 BATCH EXTRACTION COMPLETE
==============================
✅ Success Rate: 80.0% (8/10)
⏱️  Total Time: 245.3 seconds
📁 Results saved to: outputs/batch_extraction_1752179832048.json
```

### Step 3: Analyze Results & Compare
```bash
npm run compare-batch-results batch_extraction_1752179832048.json
```

**What this does:**
- Compares AI extraction vs production data field-by-field
- Calculates accuracy scores for each field type
- Identifies gallery-specific performance patterns
- Generates actionable recommendations
- Saves analysis to `outputs/comparison_analysis_[timestamp].json`

**Expected output:**
```
🎯 COMPARISON ANALYSIS COMPLETE
===============================
✅ Success Rate: 80% (8/10)
📊 Average Accuracy: 72%
🎯 Average Confidence: 78%

📈 Field Performance:
   title: 85% (6 exact, 2 partial, 0 failed)
   artists: 90% (7 exact, 1 partial, 0 failed)
   start_date: 75% (5 exact, 1 partial, 2 failed)
   end_date: 70% (4 exact, 2 partial, 2 failed)
   press_release: 65% (3 exact, 2 partial, 3 failed)

🏛️ Gallery Performance:
   Pace Gallery: 100% success, 85% accuracy
   Gagosian: 100% success, 80% accuracy
   David Zwirner: 50% success, 60% accuracy
   
⚠️ Top Issues:
   Failed to extract press_release (3 shows)
   Poor end_date match (2 shows)
   AI discovery failed (2 shows)

💡 Recommendations:
   1. Improve press release extraction - may need better content area detection
   2. Fix date extraction - implement more robust date parsing patterns
   3. Focus on gallery-specific issues: David Zwirner, Small Gallery
```

## 📊 Understanding the Results

### Success Metrics
- **Success Rate**: % of shows where AI discovery found a URL and extracted data
- **Average Accuracy**: Overall field-by-field accuracy across all successful extractions
- **Average Confidence**: AI's self-reported confidence in extractions

### Field Performance
- **Exact Match**: 100% accuracy (identical content)
- **Partial Match**: 50-90% accuracy (similar but not identical)
- **Failed**: 0% accuracy (no extraction or completely wrong)

### Gallery Performance
Identifies which gallery websites work well vs. poorly with the AI system.

### Common Issues
Patterns of failure that indicate specific improvements needed.

## 🔍 Analysis Deep Dive

### Detailed Results Structure
```json
{
  "summary": {
    "total_shows": 10,
    "successful_extractions": 8,
    "success_rate": 80,
    "average_accuracy": 72,
    "average_confidence": 78
  },
  "by_field": {
    "title": {
      "exact_matches": 6,
      "partial_matches": 2,
      "no_matches": 0,
      "accuracy_rate": 85
    }
  },
  "by_gallery": {
    "Pace Gallery": {
      "success_count": 1,
      "total_count": 1,
      "success_rate": 100,
      "average_accuracy": 85
    }
  },
  "detailed_comparisons": [
    {
      "show_id": 123,
      "show_title": "Exhibition Title",
      "gallery_name": "Gallery Name",
      "ai_success": true,
      "ai_confidence": 85,
      "field_comparisons": [
        {
          "field": "title",
          "production_value": "Exhibition Title",
          "ai_value": "Exhibition Title",
          "match_score": 100,
          "match_type": "exact",
          "notes": "exact match"
        }
      ],
      "overall_accuracy": 85,
      "discovered_url": "https://gallery.com/exhibitions/show",
      "issues": [],
      "improvements": []
    }
  ]
}
```

## 🔧 Troubleshooting

### Production API Connection Issues
```bash
# Test API connection
npm run query-production-api
```

**Common issues:**
- API server down or maintenance
- Network connectivity issues
- Rate limiting (wait a few minutes and retry)

### AI Extraction Failures
- **Search failures**: Check Google Search API quota and credentials
- **URL filtering**: May need to adjust gallery domain detection
- **Gemini extraction**: Check API limits and model availability
- **JSON parsing**: Check for special characters in press releases

### Low Accuracy Scores
- **Title mismatches**: Gallery may use different title formatting
- **Artist parsing**: Multiple artists or formatting differences
- **Date extraction**: Various date formats across galleries
- **Press release**: Content may be in different page sections

## 📈 Next Steps Based on Results

### High Success Rate (>80%)
- ✅ Ready for production deployment
- Focus on edge case handling
- Implement monitoring and alerts

### Medium Success Rate (60-80%)
- 🔧 Focus on specific gallery improvements
- Enhance URL filtering and selection
- Improve extraction prompts

### Low Success Rate (<60%)
- 🚨 Major improvements needed
- Review search query generation
- Check API configurations
- Consider alternative extraction approaches

## 🎯 Production Testing Workflow

### Regular Testing (Recommended)
1. **Weekly**: Run comparison on 5-10 new shows
2. **Before releases**: Full 10-show comparison
3. **After changes**: Regression testing on known working shows

### Continuous Improvement
1. Identify worst-performing galleries
2. Create gallery-specific test cases
3. Implement targeted improvements
4. Re-test and measure improvement

### Monitoring Setup
- Set up alerts for extraction failures
- Track success rates over time
- Monitor API costs and usage

## 📝 Example Complete Workflow

```bash
# 1. Environment already set up with Gemini and Google Search API keys

# 2. Get test shows from production API
npm run query-production-api

# 3. Run AI extraction on those shows
npm run batch-extraction production_test_set_api_1752179832048.json

# 4. Compare and analyze results
npm run compare-batch-results batch_extraction_1752179832048.json

# 5. Review outputs/comparison_analysis_[timestamp].json for insights
```

## 🚀 Ready for Production?

**Green light indicators:**
- ✅ 80%+ success rate
- ✅ 70%+ average accuracy
- ✅ No major gallery-specific failures
- ✅ Reasonable extraction times (<30s per show)
- ✅ Cost under budget ($0.02 per show)

**Areas needing work:**
- ❌ <60% success rate
- ❌ <50% accuracy on core fields (title, artists, dates)
- ❌ Multiple gallery website failures
- ❌ Frequent JSON parsing errors
- ❌ High API costs or timeouts

This systematic approach will help you confidently move from Phase 3 to production deployment! 