import { extractShowFields } from '../extractors/extractFieldsGemini';
import { extractShowFieldsOpenAI } from '../extractors/extractFieldsOpenAI';
import { ShowData, BaselineShowData } from '../types/schemas';
import { compareExtractionToBaseline } from '../compare-baseline';
import * as fs from 'fs';
import * as path from 'path';

export interface ModelComparisonResult {
  gemini: {
    success: boolean;
    data?: Partial<ShowData>;
    accuracy?: number;
    extraction_time: number;
    error?: string;
  };
  openai: {
    success: boolean;
    data?: Partial<ShowData>;
    accuracy?: number;
    extraction_time: number;
    error?: string;
  };
  comparison: {
    better_model: 'gemini' | 'openai' | 'tie';
    field_winners: Record<string, 'gemini' | 'openai' | 'tie'>;
    performance_summary: string;
  };
  baseline: BaselineShowData;
  processed_at: string;
}

export async function compareModels(
  html: string, 
  galleryUrl: string,
  baseline: BaselineShowData
): Promise<ModelComparisonResult> {
  const result: ModelComparisonResult = {
    gemini: { success: false, extraction_time: 0 },
    openai: { success: false, extraction_time: 0 },
    comparison: {
      better_model: 'tie',
      field_winners: {},
      performance_summary: ''
    },
    baseline,
    processed_at: new Date().toISOString()
  };

  // Test Gemini
  console.log('🔮 Testing Gemini extraction...');
  const geminiStart = Date.now();
  try {
    const geminiData = await extractShowFields(html, galleryUrl);
    result.gemini.extraction_time = Date.now() - geminiStart;
    result.gemini.success = true;
    result.gemini.data = geminiData;
    
    const geminiComparison = compareExtractionToBaseline(geminiData, baseline);
    result.gemini.accuracy = geminiComparison.accuracy_score;
    
    console.log(`✅ Gemini completed in ${result.gemini.extraction_time}ms - Accuracy: ${result.gemini.accuracy}%`);
  } catch (error) {
    result.gemini.extraction_time = Date.now() - geminiStart;
    result.gemini.error = error instanceof Error ? error.message : 'Unknown error';
    console.log(`❌ Gemini failed: ${result.gemini.error}`);
  }

  // Test OpenAI
  console.log('🤖 Testing OpenAI extraction...');
  const openaiStart = Date.now();
  try {
    const openaiData = await extractShowFieldsOpenAI(html, galleryUrl);
    result.openai.extraction_time = Date.now() - openaiStart;
    result.openai.success = true;
    result.openai.data = openaiData;
    
    const openaiComparison = compareExtractionToBaseline(openaiData, baseline);
    result.openai.accuracy = openaiComparison.accuracy_score;
    
    console.log(`✅ OpenAI completed in ${result.openai.extraction_time}ms - Accuracy: ${result.openai.accuracy}%`);
  } catch (error) {
    result.openai.extraction_time = Date.now() - openaiStart;
    result.openai.error = error instanceof Error ? error.message : 'Unknown error';
    console.log(`❌ OpenAI failed: ${result.openai.error}`);
  }

  // Compare results
  result.comparison = analyzeComparison(result.gemini, result.openai, baseline);

  return result;
}

function analyzeComparison(
  gemini: ModelComparisonResult['gemini'],
  openai: ModelComparisonResult['openai'],
  baseline: BaselineShowData
): ModelComparisonResult['comparison'] {
  const comparison: ModelComparisonResult['comparison'] = {
    better_model: 'tie',
    field_winners: {},
    performance_summary: ''
  };

  // Overall accuracy comparison
  const geminiAccuracy = gemini.accuracy || 0;
  const openaiAccuracy = openai.accuracy || 0;

  if (geminiAccuracy > openaiAccuracy + 5) {
    comparison.better_model = 'gemini';
  } else if (openaiAccuracy > geminiAccuracy + 5) {
    comparison.better_model = 'openai';
  } else {
    comparison.better_model = 'tie';
  }

  // Field-by-field analysis
  const fields = ['title', 'artists', 'start_date', 'end_date', 'press_release'];
  
  if (gemini.data && openai.data) {
    for (const field of fields) {
      const geminiValue = (gemini.data as any)[field];
      const openaiValue = (openai.data as any)[field];
      const baselineValue = getBaselineField(baseline, field);

      const geminiScore = scoreField(geminiValue, baselineValue, field);
      const openaiScore = scoreField(openaiValue, baselineValue, field);

      if (geminiScore > openaiScore) {
        comparison.field_winners[field] = 'gemini';
      } else if (openaiScore > geminiScore) {
        comparison.field_winners[field] = 'openai';
      } else {
        comparison.field_winners[field] = 'tie';
      }
    }
  }

  // Generate summary
  const performanceDiff = Math.abs(geminiAccuracy - openaiAccuracy);
  const speedDiff = Math.abs((gemini.extraction_time || 0) - (openai.extraction_time || 0));
  
  comparison.performance_summary = 
    `Accuracy: Gemini ${geminiAccuracy}% vs OpenAI ${openaiAccuracy}% (diff: ${performanceDiff}%). ` +
    `Speed: Gemini ${gemini.extraction_time}ms vs OpenAI ${openai.extraction_time}ms (diff: ${speedDiff}ms). ` +
    `Winner: ${comparison.better_model.toUpperCase()}`;

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

function scoreField(extractedValue: any, baselineValue: any, fieldName: string): number {
  if (!extractedValue || !baselineValue) return 0;

  switch (fieldName) {
    case 'title':
      return extractedValue.toLowerCase().trim() === baselineValue.toLowerCase().trim() ? 100 : 0;
    
    case 'artists':
      if (!Array.isArray(extractedValue) || !Array.isArray(baselineValue)) return 0;
      const matches = extractedValue.filter((ext: string) => 
        baselineValue.some((base: string) => 
          ext.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(ext.toLowerCase())
        )
      );
      return baselineValue.length > 0 ? (matches.length / baselineValue.length) * 100 : 0;
    
    case 'start_date':
    case 'end_date':
      try {
        const extDate = new Date(extractedValue);
        const baseDate = new Date(baselineValue);
        if (isNaN(extDate.getTime()) || isNaN(baseDate.getTime())) return 0;
        const diffDays = Math.abs(extDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays === 0 ? 100 : diffDays <= 1 ? 80 : diffDays <= 7 ? 60 : 0;
      } catch {
        return 0;
      }
    
    case 'press_release':
      const extWords = extractedValue.toLowerCase().split(/\s+/);
      const baseWords = baselineValue.toLowerCase().split(/\s+/);
      const commonWords = extWords.filter((word: string) => baseWords.includes(word));
      return baseWords.length > 0 ? (commonWords.length / baseWords.length) * 100 : 0;
    
    default:
      return 0;
  }
}

// CLI interface
export async function runModelComparison(showUrl: string): Promise<void> {
  try {
    // Load baseline data
    const baselinePath = path.join(__dirname, '..', '..', 'baseline_show_data.json');
    const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const baseline = baselineData.existing_data;

    // Fetch HTML (using existing fetchHtml utility)
    const { fetchAndCleanHtml } = await import('../utils/fetchHtml');
    const html = await fetchAndCleanHtml(showUrl);

    // Run comparison
    const result = await compareModels(html, showUrl, baseline);

    // Save result
    const outputsDir = path.join(__dirname, '..', '..', 'outputs');
    const timestamp = Date.now();
    const filename = `model_comparison_${timestamp}.json`;
    
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputsDir, filename),
      JSON.stringify(result, null, 2)
    );

    // Print summary
    console.log('\n📊 MODEL COMPARISON SUMMARY');
    console.log('=' .repeat(50));
    console.log(`🎯 Overall Winner: ${result.comparison.better_model.toUpperCase()}`);
    console.log(`📈 ${result.comparison.performance_summary}`);
    console.log('\n🔍 Field-by-field winners:');
    Object.entries(result.comparison.field_winners).forEach(([field, winner]) => {
      console.log(`  ${field}: ${winner.toUpperCase()}`);
    });
    console.log(`\n💾 Full results saved to: outputs/${filename}`);

  } catch (error) {
    console.error('❌ Model comparison failed:', error);
    process.exit(1);
  }
} 