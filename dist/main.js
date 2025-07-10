"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractShowFromUrl = extractShowFromUrl;
const dotenv = __importStar(require("dotenv"));
const fetchHtml_1 = require("./utils/fetchHtml");
const extractFieldsGemini_1 = require("./extractors/extractFieldsGemini");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load environment variables from multiple possible locations
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
async function extractShowFromUrl(showUrl) {
    try {
        console.log(`🔍 Processing: ${showUrl}`);
        // Step 1: Fetch show page
        const showHtml = await (0, fetchHtml_1.fetchAndCleanHtml)(showUrl);
        console.log(`📄 Fetched HTML (${showHtml.length} characters)`);
        // Step 2: Extract show data
        const extracted = await (0, extractFieldsGemini_1.extractShowFields)(showHtml, showUrl);
        console.log(`🎯 Extracted fields: ${Object.keys(extracted).join(', ')}`);
        const result = {
            success: true,
            data: extracted,
            show_url: showUrl,
            processed_at: new Date().toISOString()
        };
        // Save result
        const filename = `extraction_${Date.now()}.json`;
        const outputPath = path.join('outputs', filename);
        // Ensure outputs directory exists
        if (!fs.existsSync('outputs')) {
            fs.mkdirSync('outputs');
        }
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`✅ Completed extraction`);
        console.log(`📁 Saved to: ${outputPath}`);
        return result;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Extraction failed: ${message}`);
        const errorResult = {
            success: false,
            error: message,
            show_url: showUrl,
            processed_at: new Date().toISOString()
        };
        // Save error result too
        const filename = `extraction_error_${Date.now()}.json`;
        const outputPath = path.join('outputs', filename);
        if (!fs.existsSync('outputs')) {
            fs.mkdirSync('outputs');
        }
        fs.writeFileSync(outputPath, JSON.stringify(errorResult, null, 2));
        throw error;
    }
}
// CLI interface
if (require.main === module) {
    const showUrl = process.argv[2];
    if (!showUrl) {
        console.error('Usage: ts-node src/main.ts <show-url>');
        console.error('Example: ts-node src/main.ts https://pacegallery.com/exhibitions/current');
        process.exit(1);
    }
    extractShowFromUrl(showUrl).catch(console.error);
}
