import { BaselineShowData, ShowData } from './types/schemas';
import * as fs from 'fs';
import * as path from 'path';

interface ComparisonResult {
  accuracy_score: number;
  field_matches: Record<string, FieldComparison>;
  discrepancies: string[];
  extracted_new_data: Record<string, any>;
}

interface FieldComparison {
  baseline: any;
  extracted: any;
  accuracy: number;
  match: boolean;
}

export function compareExtractionToBaseline(
  extracted: Partial<ShowData>, 
  baseline: BaselineShowData
): ComparisonResult {
  const comparison: ComparisonResult = {
    accuracy_score: 0,
    field_matches: {},
    discrepancies: [],
    extracted_new_data: {}
  };

  // Compare each field
  const fields = ['title', 'artists', 'start_date', 'end_date', 'press_release'];
  let totalMatches = 0;

  for (const field of fields) {
    const extractedValue = (extracted as any)[field];
    const match = compareField(extractedValue, getBaselineField(baseline, field), field);
    comparison.field_matches[field] = match;
    
    if (match.accuracy > 0.8) {
      totalMatches += 1;
    } else {
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

function getBaselineField(baseline: BaselineShowData, field: string): any {
  switch (field) {
    case 'artists':
      return baseline.artist_names;
    default:
      return (baseline as any)[field];
  }
}

function compareField(extracted: any, baseline: any, fieldName: string): FieldComparison {
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

function compareStrings(str1: string, str2: string): FieldComparison {
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

function compareArrays(arr1: string[], arr2: string[]): FieldComparison {
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
    return { baseline: arr2, extracted: arr1, accuracy: 0.0, match: false };
  }
  
  const matches = arr1.filter(item1 => 
    arr2.some(item2 => item1.toLowerCase().includes(item2.toLowerCase()) || 
                       item2.toLowerCase().includes(item1.toLowerCase()))
  );
  
  const accuracy = arr2.length > 0 ? matches.length / arr2.length : 0;
  
  return { 
    baseline: arr2, 
    extracted: arr1, 
    accuracy, 
    match: accuracy > 0.5 
  };
}

function compareDates(date1: string, date2: string): FieldComparison {
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
    } else if (daysDiff <= 1) {
      return { baseline: date2, extracted: date1, accuracy: 0.9, match: true };
    } else if (daysDiff <= 7) {
      return { baseline: date2, extracted: date1, accuracy: 0.7, match: true };
    }
    
    return { baseline: date2, extracted: date1, accuracy: 0.0, match: false };
  } catch (error) {
    return { baseline: date2, extracted: date1, accuracy: 0.0, match: false };
  }
}

function compareTexts(text1: string, text2: string): FieldComparison {
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
      .filter(f => f.startsWith('extraction_') && f.endsWith('.json'))
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
    
    const comparison = compareExtractionToBaseline(
      extractionData.data, 
      baselineData.existing_data
    );
    
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
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Comparison failed:', message);
    process.exit(1);
  }
} 