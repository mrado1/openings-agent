# 🔍 Phase 3: Show Discovery Pipeline

**Status**: ✅ Ready for Testing  
**Dependencies**: Google Custom Search API + Gemini API  

## 🚀 Quick Start

### 1. Setup Environment
```bash
# Add to agent/.env.local
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=46b5511dbb2284c30
GEMINI_API_KEY=your_existing_gemini_key
```

### 2. Test Discovery
```bash
cd agent

# Known working example
npm run discover-shows "Telos Tales" "Alicja Kwade" "Pace" "2025"

# Try other examples
npm run discover-shows "New Paintings" "Jeff Koons" "Gagosian" "2025"
npm run discover-shows "Retrospective" "Kara Walker" "David Zwirner" "2024"
```

### 3. Check Results
- Terminal shows real-time pipeline progress
- Full results saved to `outputs/discovery_*.json`
- Includes search queries, filtered URLs, confidence scores

## 🔧 How It Works

```
Search Queries → Google Search → URL Filtering → Gemini Selection → Phase 2 Extraction
```

1. **Smart Query Generation**: Multiple fallback strategies
   - `"Telos Tales" Alicja Kwade Pace 2025`
   - `"Telos" Alicja Kwade Pace 2025` (partial title)
   - `Alicja Kwade Pace 2025 exhibition` (backup)

2. **URL Filtering**: Scores and filters gallery URLs
   - ✅ Gallery domains (pace.com, gagosian.com)
   - ✅ Exhibition paths (/exhibitions/, /shows/)
   - ❌ Social media (Instagram, Facebook)
   - ❌ News sites (Artforum, Artnet)

3. **Gemini Selection**: AI picks best URL from candidates
   - Matches title, artist, gallery
   - Prefers current exhibitions
   - Fallback to highest confidence

4. **Phase 2 Extraction**: 100% accuracy pipeline
   - Uses existing enhanced extraction
   - Validates title/artist match
   - Calculates overall confidence

## 📊 Confidence Scoring

- **Title Match**: 30% (fuzzy matching)
- **Artist Match**: 30% (array search)
- **Data Completeness**: 40% (dates, images, press release)

**Target**: 85%+ confidence for production use

## 🧪 Testing

```bash
# Run unit tests
npm test

# Test specific components
npm test searchQueryBuilder
npm test urlFilterService
```

## ⚠️ Known Limitations

- Google Search API: 100 searches/day (free tier)
- Some galleries block web scraping
- Works best with current/recent exhibitions
- May need gallery-specific tweaks

## 🎯 Next Steps

Once Phase 3 is stable:
- **Phase 4**: Multiple exhibition handling
- **Phase 5**: Gallery-specific optimizations  
- **Phase 6**: Database integration & batch processing 