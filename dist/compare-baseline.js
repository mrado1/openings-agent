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
exports.compareExtractionToBaseline = compareExtractionToBaseline;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function compareExtractionToBaseline(extracted, baseline) {
    const comparison = {
        accuracy_score: 0,
        field_matches: {},
        discrepancies: [],
        extracted_new_data: {}
    };
    // Compare each field
    const fields = ['title', 'artists', 'start_date', 'end_date', 'press_release'];
    let totalMatches = 0;
    for (const field of fields) {
        const extractedValue = extracted[field];
        const match = compareField(extractedValue, getBaselineField(baseline, field), field);
        comparison.field_matches[field] = match;
        if (match.accuracy > 0.8) {
            totalMatches += 1;
        }
        else {
            comparison.discrepancies.push(`${field}: Low accuracy (${Math.round(match.accuracy * 100)}%)`);
        }
    }
    comparison.accuracy_score = Math.round((totalMatches / fields.length) * 100);
    // Check for new data extracted
    if (extracted.additional_images && extracted.additional_images.length > 0) {
        comparison.extracted_new_data.additional_images = extracted.additional_images;
    }
    if (extracted.show_summary && !baseline.show_summary) {
        comparison.extracted_new_data.show_summary = extracted.show_summary;
    }
    return comparison;
}
function getBaselineField(baseline, field) {
    switch (field) {
        case 'artists':
            return baseline.artist_names;
        default:
            return baseline[field];
    }
}
function compareField(extracted, baseline, fieldName) {
    if (!extracted && !baseline) {
        return { baseline, extracted, accuracy: 1.0, match: true };
    }
    if (!extracted || !baseline) {
        return { baseline, extracted, accuracy: 0.0, match: false };
    }
    switch (fieldName) {
        case 'title':
            return compareStrings(extracted, baseline);
        case 'artists':
            return compareArrays(extracted, baseline);
        case 'start_date':
        case 'end_date':
            return compareDates(extracted, baseline);
        case 'press_release':
            return compareTexts(extracted, baseline);
        default:
            return compareStrings(extracted, baseline);
    }
}
function compareStrings(str1, str2) {
    const normalized1 = str1.toLowerCase().trim();
    const normalized2 = str2.toLowerCase().trim();
    if (normalized1 === normalized2) {
        return { baseline: str2, extracted: str1, accuracy: 1.0, match: true };
    }
    // Simple similarity check
    const longer = normalized1.length > normalized2.length ? normalized1 : normalized2;
    const shorter = normalized1.length > normalized2.length ? normalized2 : normalized1;
    if (longer.includes(shorter)) {
        return { baseline: str2, extracted: str1, accuracy: 0.8, match: true };
    }
    return { baseline: str2, extracted: str1, accuracy: 0.0, match: false };
}
function compareArrays(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
        return { baseline: arr2, extracted: arr1, accuracy: 0.0, match: false };
    }
    const matches = arr1.filter(item1 => arr2.some(item2 => item1.toLowerCase().includes(item2.toLowerCase()) ||
        item2.toLowerCase().includes(item1.toLowerCase())));
    const accuracy = arr2.length > 0 ? matches.length / arr2.length : 0;
    return {
        baseline: arr2,
        extracted: arr1,
        accuracy,
        match: accuracy > 0.5
    };
}
function compareDates(date1, date2) {
    try {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return { baseline: date2, extracted: date1, accuracy: 0.0, match: false };
        }
        const timeDiff = Math.abs(d1.getTime() - d2.getTime());
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        if (daysDiff === 0) {
            return { baseline: date2, extracted: date1, accuracy: 1.0, match: true };
        }
        else if (daysDiff <= 1) {
            return { baseline: date2, extracted: date1, accuracy: 0.9, match: true };
        }
        else if (daysDiff <= 7) {
            return { baseline: date2, extracted: date1, accuracy: 0.7, match: true };
        }
        return { baseline: date2, extracted: date1, accuracy: 0.0, match: false };
    }
    catch (error) {
        return { baseline: date2, extracted: date1, accuracy: 0.0, match: false };
    }
}
function compareTexts(text1, text2) {
    if (!text1 || !text2) {
        return { baseline: text2, extracted: text1, accuracy: 0.0, match: false };
    }
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    const accuracy = words2.length > 0 ? commonWords.length / words2.length : 0;
    return {
        baseline: text2,
        extracted: text1,
        accuracy: Math.min(accuracy, 1.0),
        match: accuracy > 0.3
    };
}
// CLI interface
if (require.main === module) {
    try {
        // Load baseline data
        const baselinePath = path.join(__dirname, '..', 'baseline_show_data.json');
        const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        // Find latest extraction
        const outputsDir = path.join(__dirname, '..', 'outputs');
        if (!fs.existsSync(outputsDir)) {
            console.error('❌ No outputs directory found. Run extraction first.');
            process.exit(1);
        }
        const files = fs.readdirSync(outputsDir)
            .filter(f => f.startsWith('extraction_') && f.endsWith('.json') && !f.includes('error'))
            .sort()
            .reverse();
        if (files.length === 0) {
            console.error('❌ No extraction files found. Run extraction first.');
            process.exit(1);
        }
        const latestFile = files[0];
        const extractionPath = path.join(outputsDir, latestFile);
        const extractionData = JSON.parse(fs.readFileSync(extractionPath, 'utf8'));
        console.log(`📊 Comparing extraction from: ${latestFile}`);
        console.log(`📋 Baseline: ${baselineData.existing_data.title} by ${baselineData.existing_data.artist_names.join(', ')}`);
        const comparison = compareExtractionToBaseline(extractionData.data, baselineData.existing_data);
        console.log(`\n🎯 Overall Accuracy: ${comparison.accuracy_score}%`);
        console.log('\n📈 Field Comparison:');
        Object.entries(comparison.field_matches).forEach(([field, match]) => {
            const status = match.match ? '✅' : '❌';
            const accuracy = Math.round(match.accuracy * 100);
            console.log(`  ${status} ${field}: ${accuracy}%`);
        });
        if (comparison.discrepancies.length > 0) {
            console.log('\n⚠️  Discrepancies:');
            comparison.discrepancies.forEach(d => console.log(`  - ${d}`));
        }
        if (Object.keys(comparison.extracted_new_data).length > 0) {
            console.log('\n🆕 New Data Extracted:');
            Object.entries(comparison.extracted_new_data).forEach(([key, value]) => {
                console.log(`  + ${key}: ${Array.isArray(value) ? value.length + ' items' : 'Added'}`);
            });
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Comparison failed:', message);
        process.exit(1);
    }
}
