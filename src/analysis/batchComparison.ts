import * as fs from 'fs';
import * as path from 'path';

interface ProductionShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_website: string;
  start_date: string;
  end_date: string;
  press_release: string | null;
}

interface AIExtraction {
  title?: string;
  artists?: string[];
  start_date?: string;
  end_date?: string;
  press_release?: string;
  image_url?: string;
  additional_images?: string[];
  gallery_url?: string;
}

interface BatchResult {
  production_show: ProductionShow;
  ai_discovery: {
    success: boolean;
    discoveredUrl?: string;
    extractedData?: AIExtraction;
    confidence?: number;
    errors?: string[];
  };
  search_context: any;
}

interface FieldComparison {
  field: string;
  production_value: any;
  ai_value: any;
  match_score: number; // 0-100
  match_type: 'exact' | 'partial' | 'fuzzy' | 'none';
  notes: string;
}

interface ShowComparison {
  show_id: number;
  show_title: string;
  gallery_name: string;
  ai_success: boolean;
  ai_confidence: number;
  field_comparisons: FieldComparison[];
  overall_accuracy: number;
  discovered_url: string | null;
  issues: string[];
  improvements: string[];
}

interface ComparisonAnalysis {
  summary: {
    total_shows: number;
    successful_extractions: number;
    success_rate: number;
    average_accuracy: number;
    average_confidence: number;
  };
  by_field: {
    [field: string]: {
      exact_matches: number;
      partial_matches: number;
      no_matches: number;
      accuracy_rate: number;
    };
  };
  by_gallery: {
    [gallery: string]: {
      success_count: number;
      total_count: number;
      success_rate: number;
      average_accuracy: number;
    };
  };
  common_issues: {
    issue: string;
    frequency: number;
    affected_shows: string[];
  }[];
  recommendations: string[];
  detailed_comparisons: ShowComparison[];
}

function normalizeString(str: string): string {
  return str.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateStringMatch(str1: string, str2: string): { score: number; type: 'exact' | 'partial' | 'fuzzy' | 'none' } {
  if (!str1 || !str2) return { score: 0, type: 'none' };
  
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  // Exact match
  if (norm1 === norm2) return { score: 100, type: 'exact' };
  
  // Contains match
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length <= norm2.length ? norm1 : norm2;
    const score = Math.round((shorter.length / longer.length) * 90);
    return { score, type: 'partial' };
  }
  
  // Word overlap fuzzy match
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  const totalWords = Math.max(words1.length, words2.length);
  
  if (totalWords === 0) return { score: 0, type: 'none' };
  
  const matchingWords = words1.filter(w => words2.includes(w)).length;
  const overlapScore = (matchingWords / totalWords) * 80;
  
  if (overlapScore >= 30) {
    return { score: Math.round(overlapScore), type: 'fuzzy' };
  }
  
  return { score: 0, type: 'none' };
}

function calculateDateMatch(date1: string, date2: string): { score: number; type: 'exact' | 'partial' | 'fuzzy' | 'none' } {
  if (!date1 || !date2) return { score: 0, type: 'none' };
  
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    if (d1.getTime() === d2.getTime()) {
      return { score: 100, type: 'exact' };
    }
    
    // Within same month
    if (d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()) {
      return { score: 80, type: 'partial' };
    }
    
    // Within same year
    if (d1.getFullYear() === d2.getFullYear()) {
      return { score: 40, type: 'fuzzy' };
    }
    
    return { score: 0, type: 'none' };
  } catch {
    return { score: 0, type: 'none' };
  }
}

function calculateArrayMatch(arr1: string[], arr2: string[]): { score: number; type: 'exact' | 'partial' | 'fuzzy' | 'none' } {
  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) {
    return { score: 0, type: 'none' };
  }
  
  const norm1 = arr1.map(normalizeString);
  const norm2 = arr2.map(normalizeString);
  
  // Check for exact matches
  const exactMatches = norm1.filter(item => norm2.includes(item)).length;
  const totalUnique = new Set([...norm1, ...norm2]).size;
  
  if (exactMatches === norm1.length && exactMatches === norm2.length) {
    return { score: 100, type: 'exact' };
  }
  
  if (exactMatches > 0) {
    const score = Math.round((exactMatches / Math.max(norm1.length, norm2.length)) * 90);
    return { score, type: 'partial' };
  }
  
  // Fuzzy matching for artist names
  let fuzzyMatches = 0;
  for (const item1 of norm1) {
    for (const item2 of norm2) {
      const match = calculateStringMatch(item1, item2);
      if (match.score >= 70) {
        fuzzyMatches++;
        break;
      }
    }
  }
  
  if (fuzzyMatches > 0) {
    const score = Math.round((fuzzyMatches / Math.max(norm1.length, norm2.length)) * 70);
    return { score, type: 'fuzzy' };
  }
  
  return { score: 0, type: 'none' };
}

function compareFields(production: ProductionShow, ai: AIExtraction): FieldComparison[] {
  const comparisons: FieldComparison[] = [];
  
  // Title comparison
  const titleMatch = calculateStringMatch(production.title, ai.title || '');
  comparisons.push({
    field: 'title',
    production_value: production.title,
    ai_value: ai.title || null,
    match_score: titleMatch.score,
    match_type: titleMatch.type,
    notes: titleMatch.score === 0 ? 'No title extracted' : `${titleMatch.type} match`
  });
  
  // Artists comparison
  const artistMatch = calculateArrayMatch(production.artist_names, ai.artists || []);
  comparisons.push({
    field: 'artists',
    production_value: production.artist_names,
    ai_value: ai.artists || [],
    match_score: artistMatch.score,
    match_type: artistMatch.type,
    notes: artistMatch.score === 0 ? 'No artists extracted' : `${artistMatch.type} match for ${production.artist_names.length} vs ${(ai.artists || []).length} artists`
  });
  
  // Start date comparison
  const startDateMatch = calculateDateMatch(production.start_date, ai.start_date || '');
  comparisons.push({
    field: 'start_date',
    production_value: production.start_date,
    ai_value: ai.start_date || null,
    match_score: startDateMatch.score,
    match_type: startDateMatch.type,
    notes: startDateMatch.score === 0 ? 'No start date extracted' : `${startDateMatch.type} date match`
  });
  
  // End date comparison
  const endDateMatch = calculateDateMatch(production.end_date, ai.end_date || '');
  comparisons.push({
    field: 'end_date',
    production_value: production.end_date,
    ai_value: ai.end_date || null,
    match_score: endDateMatch.score,
    match_type: endDateMatch.type,
    notes: endDateMatch.score === 0 ? 'No end date extracted' : `${endDateMatch.type} date match`
  });
  
  // Press release comparison
  const pressReleaseMatch = calculateStringMatch(production.press_release || '', ai.press_release || '');
  comparisons.push({
    field: 'press_release',
    production_value: production.press_release ? `${production.press_release.length} chars` : null,
    ai_value: ai.press_release ? `${ai.press_release.length} chars` : null,
    match_score: pressReleaseMatch.score,
    match_type: pressReleaseMatch.type,
    notes: pressReleaseMatch.score === 0 ? 'No press release extracted' : `${pressReleaseMatch.type} content match`
  });
  
  return comparisons;
}

function analyzeShowComparison(batchResult: BatchResult): ShowComparison {
  const { production_show, ai_discovery } = batchResult;
  
  if (!ai_discovery.success) {
    return {
      show_id: production_show.id,
      show_title: production_show.title,
      gallery_name: production_show.gallery_name,
      ai_success: false,
      ai_confidence: 0,
      field_comparisons: [],
      overall_accuracy: 0,
      discovered_url: null,
      issues: ai_discovery.errors || ['AI discovery failed'],
      improvements: ['Fix discovery pipeline', 'Check search query generation', 'Verify URL filtering']
    };
  }
  
  const fieldComparisons = compareFields(production_show, ai_discovery.extractedData || {});
  const totalScore = fieldComparisons.reduce((sum, comp) => sum + comp.match_score, 0);
  const overallAccuracy = Math.round(totalScore / fieldComparisons.length);
  
  const issues: string[] = [];
  const improvements: string[] = [];
  
  // Identify specific issues
  fieldComparisons.forEach(comp => {
    if (comp.match_score === 0) {
      issues.push(`Failed to extract ${comp.field}`);
      improvements.push(`Improve ${comp.field} extraction prompt`);
    } else if (comp.match_score < 50) {
      issues.push(`Poor ${comp.field} match (${comp.match_score}%)`);
      improvements.push(`Refine ${comp.field} parsing logic`);
    }
  });
  
  if ((ai_discovery.confidence || 0) < 80) {
    issues.push(`Low AI confidence (${ai_discovery.confidence}%)`);
    improvements.push('Improve extraction confidence scoring');
  }
  
  return {
    show_id: production_show.id,
    show_title: production_show.title,
    gallery_name: production_show.gallery_name,
    ai_success: true,
    ai_confidence: ai_discovery.confidence || 0,
    field_comparisons: fieldComparisons,
    overall_accuracy: overallAccuracy,
    discovered_url: ai_discovery.discoveredUrl || null,
    issues,
    improvements
  };
}

export async function analyzeBatchResults(batchResultFile: string): Promise<void> {
  try {
    console.log(`📊 Analyzing batch extraction results: ${batchResultFile}`);
    console.log('');
    
    // Load batch results
    const batchPath = path.join('outputs', batchResultFile);
    if (!fs.existsSync(batchPath)) {
      throw new Error(`Batch results file not found: ${batchPath}`);
    }
    
    const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const results: BatchResult[] = batchData.ai_extraction_results;
    
    console.log(`📋 Analyzing ${results.length} extraction results...`);
    
    // Analyze each show
    const detailedComparisons: ShowComparison[] = [];
    for (const result of results) {
      const comparison = analyzeShowComparison(result);
      detailedComparisons.push(comparison);
    }
    
    // Calculate summary statistics
    const successfulExtractions = detailedComparisons.filter(c => c.ai_success).length;
    const totalAccuracy = detailedComparisons.reduce((sum, c) => sum + c.overall_accuracy, 0);
    const totalConfidence = detailedComparisons.reduce((sum, c) => sum + c.ai_confidence, 0);
    
    // Field-level analysis
    const fieldStats: any = {};
    const allFields = ['title', 'artists', 'start_date', 'end_date', 'press_release'];
    
    allFields.forEach(field => {
      const fieldComparisons = detailedComparisons
        .filter(c => c.ai_success)
        .map(c => c.field_comparisons.find(fc => fc.field === field))
        .filter(fc => fc !== undefined);
      
      const exactMatches = fieldComparisons.filter(fc => fc!.match_type === 'exact').length;
      const partialMatches = fieldComparisons.filter(fc => fc!.match_type === 'partial').length;
      const noMatches = fieldComparisons.filter(fc => fc!.match_type === 'none').length;
      const totalFieldComparisons = fieldComparisons.length;
      
      fieldStats[field] = {
        exact_matches: exactMatches,
        partial_matches: partialMatches,
        no_matches: noMatches,
        accuracy_rate: totalFieldComparisons > 0 ? Math.round(((exactMatches + partialMatches * 0.5) / totalFieldComparisons) * 100) : 0
      };
    });
    
    // Gallery-level analysis
    const galleryStats: any = {};
    detailedComparisons.forEach(comp => {
      if (!galleryStats[comp.gallery_name]) {
        galleryStats[comp.gallery_name] = {
          success_count: 0,
          total_count: 0,
          total_accuracy: 0
        };
      }
      
      galleryStats[comp.gallery_name].total_count++;
      if (comp.ai_success) {
        galleryStats[comp.gallery_name].success_count++;
        galleryStats[comp.gallery_name].total_accuracy += comp.overall_accuracy;
      }
    });
    
    Object.keys(galleryStats).forEach(gallery => {
      const stats = galleryStats[gallery];
      stats.success_rate = Math.round((stats.success_count / stats.total_count) * 100);
      stats.average_accuracy = stats.success_count > 0 ? Math.round(stats.total_accuracy / stats.success_count) : 0;
    });
    
    // Common issues analysis
    const issueFrequency: { [issue: string]: string[] } = {};
    detailedComparisons.forEach(comp => {
      comp.issues.forEach(issue => {
        if (!issueFrequency[issue]) {
          issueFrequency[issue] = [];
        }
        issueFrequency[issue].push(comp.show_title);
      });
    });
    
    const commonIssues = Object.entries(issueFrequency)
      .map(([issue, shows]) => ({
        issue,
        frequency: shows.length,
        affected_shows: shows
      }))
      .sort((a, b) => b.frequency - a.frequency);
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (fieldStats.title?.accuracy_rate < 80) {
      recommendations.push('Improve title extraction - consider enhancing HTML parsing for title elements');
    }
    if (fieldStats.artists?.accuracy_rate < 80) {
      recommendations.push('Enhance artist name extraction - may need better artist parsing logic');
    }
    if (fieldStats.start_date?.accuracy_rate < 80 || fieldStats.end_date?.accuracy_rate < 80) {
      recommendations.push('Fix date extraction - implement more robust date parsing patterns');
    }
    if (fieldStats.press_release?.accuracy_rate < 60) {
      recommendations.push('Improve press release extraction - may need better content area detection');
    }
    
    const lowPerformanceGalleries = Object.entries(galleryStats)
      .filter(([_, stats]: any) => stats.success_rate < 60)
      .map(([gallery]) => gallery);
    
    if (lowPerformanceGalleries.length > 0) {
      recommendations.push(`Focus on gallery-specific issues: ${lowPerformanceGalleries.join(', ')}`);
    }
    
    // Create final analysis
    const analysis: ComparisonAnalysis = {
      summary: {
        total_shows: results.length,
        successful_extractions: successfulExtractions,
        success_rate: Math.round((successfulExtractions / results.length) * 100),
        average_accuracy: Math.round(totalAccuracy / results.length),
        average_confidence: Math.round(totalConfidence / results.length)
      },
      by_field: fieldStats,
      by_gallery: galleryStats,
      common_issues: commonIssues,
      recommendations,
      detailed_comparisons: detailedComparisons
    };
    
    // Save analysis
    const analysisFilename = `comparison_analysis_${Date.now()}.json`;
    const analysisPath = path.join('outputs', analysisFilename);
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
    
    // Print summary
    console.log('🎯 COMPARISON ANALYSIS COMPLETE');
    console.log('===============================');
    console.log(`✅ Success Rate: ${analysis.summary.success_rate}% (${successfulExtractions}/${results.length})`);
    console.log(`📊 Average Accuracy: ${analysis.summary.average_accuracy}%`);
    console.log(`🎯 Average Confidence: ${analysis.summary.average_confidence}%`);
    console.log('');
    console.log('📈 Field Performance:');
    Object.entries(analysis.by_field).forEach(([field, stats]: any) => {
      console.log(`   ${field}: ${stats.accuracy_rate}% (${stats.exact_matches} exact, ${stats.partial_matches} partial, ${stats.no_matches} failed)`);
    });
    console.log('');
    console.log('🏛️ Gallery Performance:');
    Object.entries(analysis.by_gallery)
      .sort(([,a]: any, [,b]: any) => b.success_rate - a.success_rate)
      .forEach(([gallery, stats]: any) => {
        console.log(`   ${gallery}: ${stats.success_rate}% success, ${stats.average_accuracy}% accuracy`);
      });
    
    if (analysis.common_issues.length > 0) {
      console.log('');
      console.log('⚠️ Top Issues:');
      analysis.common_issues.slice(0, 5).forEach(issue => {
        console.log(`   ${issue.issue} (${issue.frequency} shows)`);
      });
    }
    
    if (analysis.recommendations.length > 0) {
      console.log('');
      console.log('💡 Recommendations:');
      analysis.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
    
    console.log('');
    console.log(`📁 Full analysis saved to: ${analysisPath}`);
    
  } catch (error: any) {
    console.error(`💥 Analysis failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const batchResultFile = process.argv[2];
  
  if (!batchResultFile) {
    console.error('Usage: npm run compare-batch-results <batch-result-filename>');
    console.error('Example: npm run compare-batch-results batch_extraction_1752179832048.json');
    console.error('');
    console.error('Available batch results:');
    const outputDir = path.join(__dirname, '../../outputs');
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('batch_extraction_'));
      files.forEach(file => console.error(`  - ${file}`));
    }
    process.exit(1);
  }
  
  analyzeBatchResults(batchResultFile).catch(console.error);
} 