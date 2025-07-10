# AI Show Extractor

Automated art show data extraction system using Gemini and OpenAI.

## 🚨 **CRITICAL PROJECT ISOLATION**
**⚠️ DO NOT MODIFY `scene/` OR `openings/` FOLDERS ⚠️**
- **Work ONLY in `/agent` directory from project root**

## Setup Complete ✅

### Phase 0 Checklist:
- [x] Git repository initialized
- [x] Package.json with dependencies installed
- [x] TypeScript configuration
- [x] Jest testing configuration
- [x] Directory structure created
- [x] Baseline data placeholder created
- [x] Schema interfaces defined

### Next Steps:

1. **Configure Environment Variables:**
   ```bash
   # Create .env.local with your API keys:
   OPENAI_API_KEY=your_openai_key_here
   GEMINI_API_KEY=your_gemini_key_here
   ```

2. **Get Baseline Data (when Scene database is running):**
   ```bash
   npm run query-baseline
   ```

3. **Start Phase 1 Implementation:**
   ```bash
   npm run dev  # Will run src/main.ts when implemented
   npm test     # Run tests
   ```

## Project Structure

```
agent/
├── src/
│   ├── types/schemas.ts         # TypeScript interfaces ✅
│   ├── utils/                   # Utility functions
│   ├── extractors/              # AI extraction modules
│   ├── processors/              # Data processing
│   └── main.ts                  # CLI entry point
├── tests/                       # Test files
├── outputs/                     # JSON outputs
├── baseline_show_data.json      # Reference data ✅
└── query-baseline.js            # Database query script ✅
```

## Dependencies Installed

- **Core**: TypeScript, Node.js, ts-node
- **AI**: @google/generative-ai, openai
- **Web**: axios, cheerio, playwright
- **Testing**: jest, ts-jest
- **Database**: pg

Ready for Phase 1: Extract Structured Data from Known Show Page! 🚀 