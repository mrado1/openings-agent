import * as fs from 'fs';
import * as path from 'path';

interface LocalUnenrichedShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_website: string | null;
  start_date: string;
  end_date: string;
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_address: string | null;
}

interface EnrichedShow extends LocalUnenrichedShow {
  ai_enrichment: {
    success: boolean;
    confidence: number;
    discovered_url?: string;
    processing_time_seconds: number;
    added_data: {
      press_release?: {
        original_length: number;
        ai_length: number;
        content?: string;
      };
      images?: {
        original_count: number;
        ai_count: number;
        additional_images?: string[];
      };
      show_summary?: {
        original_exists: boolean;
        ai_generated: boolean;
        content?: string;
      };
    };
    errors: string[];
  };
}

interface EnrichmentResults {
  local_test_reference: string;
  enriched_shows: EnrichedShow[];
  success_rate: number;
  total_shows: number;
  successful_enrichments: number;
  failed_enrichments: number;
  total_processing_time_seconds: number;
  improvements_summary: {
    press_release_additions: number;
    image_additions: number;
    summary_additions: number;
  };
  extracted_at: string;
}

interface ProductionEnrichedShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_website: string | null;
  start_date: string;
  end_date: string;
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_address: string | null;
  enriched_at: string | null;
}

interface ProductionTestSet {
  local_test_reference: string;
  query_criteria: string;
  production_shows: ProductionEnrichedShow[];
  found_count: number;
  missing_count: number;
  missing_ids: number[];
  data_analysis: {
    has_press_release: number;
    has_additional_images: number;
    has_summary: number;
    has_gallery_website: number;
  };
  extracted_at: string;
}

interface ShowComparison {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  ai_success: boolean;
  ai_confidence: number;
  ai_processing_time: number;
  ai_discovered_url?: string;
  comparison: {
    press_release: {
      local_length: number;
      ai_length: number;
      production_length: number;
      ai_vs_local_improvement: number;
      ai_vs_production_comparison: 'better' | 'worse' | 'equal' | 'failed';
    };
    images: {
      local_count: number;
      ai_count: number;
      production_count: number;
      ai_vs_local_improvement: number;
      ai_vs_production_comparison: 'better' | 'worse' | 'equal' | 'failed';
    };
    summary: {
      local_exists: boolean;
      ai_generated: boolean;
      production_exists: boolean;
      ai_vs_production_comparison: 'better' | 'worse' | 'equal' | 'failed';
    };
  };
  ai_errors: string[];
}

interface ComparisonResults {
  enrichment_file_reference: string;
  production_file_reference: string;
  test_parameters: {
    total_shows_tested: number;
    ai_success_rate: number;
    ai_quality_success_rate: number;
    quality_criteria_rates: {
      accurate_url_rate: number;
      main_image_replaced_rate: number;
      press_release_found_rate: number;
      additional_images_rate: number;
    };
    shows_matched_in_production: number;
    shows_compared: number;
  };
  ai_performance: {
    average_processing_time: number;
    average_confidence: number;
    discovery_success_rate: number;
  };
  comparison_summary: {
    press_release_performance: {
      ai_better_than_production: number;
      ai_worse_than_production: number;
      ai_equal_to_production: number;
      ai_failed: number;
    };
    image_performance: {
      ai_better_than_production: number;
      ai_worse_than_production: number;
      ai_equal_to_production: number;
      ai_failed: number;
    };
    summary_performance: {
      ai_better_than_production: number;
      ai_worse_than_production: number;
      ai_equal_to_production: number;
      ai_failed: number;
    };
  };
  show_comparisons: ShowComparison[];
  overall_assessment: {
    ai_improvement_rate: number;
    ai_competitive_rate: number;
    production_readiness_score: number;
    recommendations: string[];
  };
  extracted_at: string;
}

/**
 * Validate 4 quality criteria for AI enrichment success:
 * 1. Accurate URL found (correct gallery exhibition page)
 * 2. Main image replaced (never Artforum URLs, always gallery images)
 * 3. Press release found (non-empty content)
 * 4. Additional images found (minimum 1 additional image)
 */
function validateEnrichmentQuality(enrichedShow: EnrichedShow): {
  isQualitySuccess: boolean;
  qualityCriteria: {
    accurate_url_found: boolean;
    main_image_replaced: boolean;
    press_release_found: boolean;
    additional_images_found: boolean;
  };
  qualityScore: number;
} {
  const criteria = {
    accurate_url_found: false,
    main_image_replaced: false,
    press_release_found: false,
    additional_images_found: false
  };

  // 1. Accurate URL found (discovered_url exists and is a gallery URL, not Artforum)
  if (enrichedShow.ai_enrichment.discovered_url && 
      !enrichedShow.ai_enrichment.discovered_url.includes('artforum.com')) {
    criteria.accurate_url_found = true;
  }

  // 2. Main image replaced (image_url should be from gallery, never Artforum)
  if (enrichedShow.image_url && 
      !enrichedShow.image_url.includes('artforum.com')) {
    criteria.main_image_replaced = true;
  }

  // 3. Press release found (non-empty AI-generated content)
  if (enrichedShow.ai_enrichment.added_data.press_release?.content && 
      enrichedShow.ai_enrichment.added_data.press_release.content.length > 50) {
    criteria.press_release_found = true;
  }

  // 4. Additional images found (minimum 1 additional image)
  if (enrichedShow.ai_enrichment.added_data.images?.additional_images && 
      enrichedShow.ai_enrichment.added_data.images.additional_images.length >= 1) {
    criteria.additional_images_found = true;
  }

  // Calculate quality score (0-100%)
  const criteriaCount = Object.values(criteria).filter(Boolean).length;
  const qualityScore = Math.round((criteriaCount / 4) * 100);

  // Quality success requires at least 3 out of 4 criteria (75%)
  const isQualitySuccess = criteriaCount >= 3;

  return {
    isQualitySuccess,
    qualityCriteria: criteria,
    qualityScore
  };
}

async function compareAIvsProduction(enrichmentFile: string, productionFile: string): Promise<void> {
  console.log(`🔍 Comparing AI enrichment vs Production data`);
  console.log(`📊 AI Results: ${enrichmentFile}`);
  console.log(`🏭 Production Data: ${productionFile}`);
  console.log('');

  // Load enrichment results
  const enrichmentPath = path.join('outputs', enrichmentFile);
  if (!fs.existsSync(enrichmentPath)) {
    throw new Error(`Enrichment results file not found: ${enrichmentPath}`);
  }
  const enrichmentResults: EnrichmentResults = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'));

  // Load production test set
  const productionPath = path.join('outputs', productionFile);
  if (!fs.existsSync(productionPath)) {
    throw new Error(`Production test set file not found: ${productionPath}`);
  }
  const productionTestSet: ProductionTestSet = JSON.parse(fs.readFileSync(productionPath, 'utf8'));

  console.log(`📋 Loaded ${enrichmentResults.enriched_shows.length} AI-enriched shows`);
  console.log(`🏭 Loaded ${productionTestSet.production_shows.length} production shows`);

  // Create comparison for each show
  const showComparisons: ShowComparison[] = [];
  let aiSuccessCount = 0;
  let qualitySuccessCount = 0;
  let totalProcessingTime = 0;
  let totalConfidence = 0;
  let discoverySuccessCount = 0;
  
  // Quality criteria tracking
  let accurateUrlCount = 0;
  let mainImageReplacedCount = 0;
  let pressReleaseFoundCount = 0;
  let additionalImagesCount = 0;

  // Performance counters
  let prBetter = 0, prWorse = 0, prEqual = 0, prFailed = 0;
  let imgBetter = 0, imgWorse = 0, imgEqual = 0, imgFailed = 0;
  let sumBetter = 0, sumWorse = 0, sumEqual = 0, sumFailed = 0;

  for (const aiShow of enrichmentResults.enriched_shows) {
    const productionShow = productionTestSet.production_shows.find(p => p.id === aiShow.id);
    
    if (!productionShow) {
      console.log(`⚠️  Show ID ${aiShow.id} not found in production data, skipping`);
      continue;
    }

    // Validate quality criteria for this show
    const qualityValidation = validateEnrichmentQuality(aiShow);
    
    // Aggregate AI stats (basic success from pipeline)
    if (aiShow.ai_enrichment.success) {
      aiSuccessCount++;
      totalConfidence += aiShow.ai_enrichment.confidence;
      if (aiShow.ai_enrichment.discovered_url) discoverySuccessCount++;
    }
    
    // Track quality-based success
    if (qualityValidation.isQualitySuccess) {
      qualitySuccessCount++;
    }
    
    // Track individual quality criteria
    if (qualityValidation.qualityCriteria.accurate_url_found) accurateUrlCount++;
    if (qualityValidation.qualityCriteria.main_image_replaced) mainImageReplacedCount++;
    if (qualityValidation.qualityCriteria.press_release_found) pressReleaseFoundCount++;
    if (qualityValidation.qualityCriteria.additional_images_found) additionalImagesCount++;
    
    totalProcessingTime += aiShow.ai_enrichment.processing_time_seconds;

    // Calculate data counts
    const localPrLength = aiShow.press_release?.length || 0;
    const aiPrLength = aiShow.ai_enrichment.added_data.press_release?.ai_length || localPrLength;
    const productionPrLength = productionShow.press_release?.length || 0;

    const localImgCount = aiShow.image_url ? 1 : 0;
    const aiImgCount = localImgCount + (aiShow.ai_enrichment.added_data.images?.ai_count || 0);
    const productionImgCount = (productionShow.image_url ? 1 : 0) + (productionShow.additional_images?.length || 0);

    const localHasSummary = !!aiShow.show_summary;
    const aiGeneratedSummary = aiShow.ai_enrichment.added_data.show_summary?.ai_generated || false;
    const productionHasSummary = !!productionShow.show_summary;

    // Compare AI vs Production (use quality success instead of basic success)
    const prComparison = qualityValidation.isQualitySuccess ?
      (aiPrLength > productionPrLength ? 'better' : 
       aiPrLength < productionPrLength ? 'worse' : 'equal') : 'failed';
    
    const imgComparison = qualityValidation.isQualitySuccess ?
      (aiImgCount > productionImgCount ? 'better' : 
       aiImgCount < productionImgCount ? 'worse' : 'equal') : 'failed';
    
    const sumComparison = qualityValidation.isQualitySuccess ?
      (aiGeneratedSummary && !productionHasSummary ? 'better' :
       !aiGeneratedSummary && productionHasSummary ? 'worse' : 'equal') : 'failed';

    // Count performance
    if (prComparison === 'better') prBetter++;
    else if (prComparison === 'worse') prWorse++;
    else if (prComparison === 'equal') prEqual++;
    else prFailed++;

    if (imgComparison === 'better') imgBetter++;
    else if (imgComparison === 'worse') imgWorse++;
    else if (imgComparison === 'equal') imgEqual++;
    else imgFailed++;

    if (sumComparison === 'better') sumBetter++;
    else if (sumComparison === 'worse') sumWorse++;
    else if (sumComparison === 'equal') sumEqual++;
    else sumFailed++;

    const comparison: ShowComparison = {
      id: aiShow.id,
      title: aiShow.title,
      artist_names: aiShow.artist_names,
      gallery_name: aiShow.gallery_name,
      ai_success: qualityValidation.isQualitySuccess, // Use quality success instead of basic success
      ai_confidence: qualityValidation.qualityScore, // Use quality score instead of pipeline confidence
      ai_processing_time: aiShow.ai_enrichment.processing_time_seconds,
      ai_discovered_url: aiShow.ai_enrichment.discovered_url,
      comparison: {
        press_release: {
          local_length: localPrLength,
          ai_length: aiPrLength,
          production_length: productionPrLength,
          ai_vs_local_improvement: aiPrLength - localPrLength,
          ai_vs_production_comparison: prComparison as any
        },
        images: {
          local_count: localImgCount,
          ai_count: aiImgCount,
          production_count: productionImgCount,
          ai_vs_local_improvement: aiImgCount - localImgCount,
          ai_vs_production_comparison: imgComparison as any
        },
        summary: {
          local_exists: localHasSummary,
          ai_generated: aiGeneratedSummary,
          production_exists: productionHasSummary,
          ai_vs_production_comparison: sumComparison as any
        }
      },
      ai_errors: aiShow.ai_enrichment.errors
    };

    showComparisons.push(comparison);

    // Log comparison
    console.log(`\n📊 [${showComparisons.length}] "${aiShow.title}"`);
    console.log(`   AI Quality Success: ${qualityValidation.isQualitySuccess} (${qualityValidation.qualityScore}% quality score)`);
    console.log(`   Quality Criteria: URL=${qualityValidation.qualityCriteria.accurate_url_found}, Image=${qualityValidation.qualityCriteria.main_image_replaced}, PR=${qualityValidation.qualityCriteria.press_release_found}, Additional=${qualityValidation.qualityCriteria.additional_images_found}`);
    console.log(`   Press Release: Local=${localPrLength} → AI=${aiPrLength} vs Prod=${productionPrLength} (${prComparison})`);
    console.log(`   Images: Local=${localImgCount} → AI=${aiImgCount} vs Prod=${productionImgCount} (${imgComparison})`);
    console.log(`   Summary: Local=${localHasSummary} → AI=${aiGeneratedSummary} vs Prod=${productionHasSummary} (${sumComparison})`);
  }

  // Calculate overall metrics
  const avgProcessingTime = Math.round(totalProcessingTime / enrichmentResults.enriched_shows.length);
  const avgConfidence = aiSuccessCount > 0 ? Math.round(totalConfidence / aiSuccessCount) : 0;
  const discoveryRate = Math.round((discoverySuccessCount / enrichmentResults.enriched_shows.length) * 100);
  
  // Calculate quality-based success rates
  const qualitySuccessRate = Math.round((qualitySuccessCount / enrichmentResults.enriched_shows.length) * 100);
  const accurateUrlRate = Math.round((accurateUrlCount / enrichmentResults.enriched_shows.length) * 100);
  const mainImageReplacedRate = Math.round((mainImageReplacedCount / enrichmentResults.enriched_shows.length) * 100);
  const pressReleaseFoundRate = Math.round((pressReleaseFoundCount / enrichmentResults.enriched_shows.length) * 100);
  const additionalImagesRate = Math.round((additionalImagesCount / enrichmentResults.enriched_shows.length) * 100);

  // Calculate improvement and competitive rates
  const totalComparisons = showComparisons.length;
  const aiImprovements = prBetter + imgBetter + sumBetter;
  const aiCompetitive = aiImprovements + prEqual + imgEqual + sumEqual;
  const improvementRate = Math.round((aiImprovements / (totalComparisons * 3)) * 100);
  const competitiveRate = Math.round((aiCompetitive / (totalComparisons * 3)) * 100);

  // Production readiness score (weighted) - use quality success rate
  const successWeight = 0.4;
  const improvementWeight = 0.3;
  const competitiveWeight = 0.3;
  const productionReadinessScore = Math.round(
    (qualitySuccessRate * successWeight) +
    (improvementRate * improvementWeight) +
    (competitiveRate * competitiveWeight)
  );

  // Generate recommendations based on quality criteria
  const recommendations: string[] = [];
  if (qualitySuccessRate >= 80) {
    recommendations.push("✅ High AI quality success rate indicates system is production-ready");
  } else {
    recommendations.push("⚠️ Consider improving AI quality - current rate below 80% threshold");
  }
  
  // Quality-specific recommendations
  if (accurateUrlRate < 80) {
    recommendations.push("🔍 Improve URL discovery accuracy - only " + accurateUrlRate + "% found correct gallery URLs");
  }
  if (mainImageReplacedRate < 80) {
    recommendations.push("🖼️ Fix image replacement strategy - " + (100 - mainImageReplacedRate) + "% still using Artforum URLs");
  }
  if (pressReleaseFoundRate < 60) {
    recommendations.push("📄 Enhance press release extraction - only " + pressReleaseFoundRate + "% found quality content");
  }
  if (additionalImagesRate < 60) {
    recommendations.push("📸 Improve additional image discovery - only " + additionalImagesRate + "% found extra images");
  }

  if (improvementRate >= 30) {
    recommendations.push("🚀 AI shows significant value-add over production data");
  } else if (improvementRate >= 15) {
    recommendations.push("📈 AI provides moderate improvements - consider selective deployment");
  } else {
    recommendations.push("🤔 Limited AI improvements - evaluate cost/benefit vs current system");
  }

  if (imgBetter / totalComparisons >= 0.5) {
    recommendations.push("🖼️ AI excels at image discovery - prioritize this capability");
  }

  if (prBetter / totalComparisons >= 0.3) {
    recommendations.push("📄 AI effectively enhances press release content");
  }

  const comparisonResults: ComparisonResults = {
    enrichment_file_reference: enrichmentFile,
    production_file_reference: productionFile,
    test_parameters: {
      total_shows_tested: enrichmentResults.enriched_shows.length,
      ai_success_rate: enrichmentResults.success_rate,
      ai_quality_success_rate: qualitySuccessRate,
      quality_criteria_rates: {
        accurate_url_rate: accurateUrlRate,
        main_image_replaced_rate: mainImageReplacedRate,
        press_release_found_rate: pressReleaseFoundRate,
        additional_images_rate: additionalImagesRate
      },
      shows_matched_in_production: productionTestSet.found_count,
      shows_compared: totalComparisons
    },
    ai_performance: {
      average_processing_time: avgProcessingTime,
      average_confidence: avgConfidence,
      discovery_success_rate: discoveryRate
    },
    comparison_summary: {
      press_release_performance: {
        ai_better_than_production: prBetter,
        ai_worse_than_production: prWorse,
        ai_equal_to_production: prEqual,
        ai_failed: prFailed
      },
      image_performance: {
        ai_better_than_production: imgBetter,
        ai_worse_than_production: imgWorse,
        ai_equal_to_production: imgEqual,
        ai_failed: imgFailed
      },
      summary_performance: {
        ai_better_than_production: sumBetter,
        ai_worse_than_production: sumWorse,
        ai_equal_to_production: sumEqual,
        ai_failed: sumFailed
      }
    },
    show_comparisons: showComparisons,
    overall_assessment: {
      ai_improvement_rate: improvementRate,
      ai_competitive_rate: competitiveRate,
      production_readiness_score: productionReadinessScore,
      recommendations: recommendations
    },
    extracted_at: new Date().toISOString()
  };

  // Save results
  const filename = `ai_vs_production_comparison_${Date.now()}.json`;
  const outputPath = path.join('outputs', filename);
  fs.writeFileSync(outputPath, JSON.stringify(comparisonResults, null, 2));

  console.log('\n🎯 AI vs PRODUCTION COMPARISON COMPLETE');
  console.log('=====================================');
  console.log(`📊 Shows Compared: ${totalComparisons}`);
  console.log(`✅ AI Basic Success Rate: ${enrichmentResults.success_rate}%`);
  console.log(`🏆 AI Quality Success Rate: ${qualitySuccessRate}% (3/4 criteria required)`);
  console.log(`⏱️  Avg Processing Time: ${avgProcessingTime}s`);
  console.log(`🔍 Discovery Success Rate: ${discoveryRate}%`);
  console.log('');
  console.log('📋 Quality Criteria Performance:');
  console.log(`   🌐 Accurate URL found: ${accurateUrlRate}% (${accurateUrlCount}/${enrichmentResults.enriched_shows.length})`);
  console.log(`   🖼️ Main image replaced: ${mainImageReplacedRate}% (${mainImageReplacedCount}/${enrichmentResults.enriched_shows.length})`);
  console.log(`   📄 Press release found: ${pressReleaseFoundRate}% (${pressReleaseFoundCount}/${enrichmentResults.enriched_shows.length})`);
  console.log(`   📸 Additional images found: ${additionalImagesRate}% (${additionalImagesCount}/${enrichmentResults.enriched_shows.length})`);
  console.log('');
  console.log('📈 Performance vs Production:');
  console.log(`   Press Releases: Better=${prBetter}, Equal=${prEqual}, Worse=${prWorse}, Failed=${prFailed}`);
  console.log(`   Images: Better=${imgBetter}, Equal=${imgEqual}, Worse=${imgWorse}, Failed=${imgFailed}`);
  console.log(`   Summaries: Better=${sumBetter}, Equal=${sumEqual}, Worse=${sumWorse}, Failed=${sumFailed}`);
  console.log('');
  console.log(`🏆 AI Improvement Rate: ${improvementRate}%`);
  console.log(`🥇 AI Competitive Rate: ${competitiveRate}%`);
  console.log(`🚀 Production Readiness Score: ${productionReadinessScore}/100 (based on quality metrics)`);
  console.log('');
  console.log('🎯 Recommendations:');
  recommendations.forEach(rec => console.log(`   ${rec}`));
  console.log('');
  console.log(`📁 Detailed comparison saved to: ${filename}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.error('❌ Please provide both enrichment results and production test set files');
    console.log('Usage: npm run compare-ai-vs-production <enrichment_results.json> <production_enriched_test_set.json>');
    console.log('Example: npm run compare-ai-vs-production enrichment_results_1752182405592.json production_enriched_test_set_1752182405599.json');
    process.exit(1);
  }

  const [enrichmentFile, productionFile] = args;
  
  try {
    await compareAIvsProduction(enrichmentFile, productionFile);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { validateEnrichmentQuality };