import * as fs from 'fs';
import * as path from 'path';

interface EnrichedLocalShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_website: string;
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
  ai_enrichment: {
    success: boolean;
    confidence: number;
    discovered_url?: string;
    enriched_fields: {
      press_release?: string;
      image_url?: string;
      additional_images?: string[];
      show_summary?: string;
    };
    errors: string[];
  };
}

interface ProductionShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  start_date: string;
  end_date: string;
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_website: string;
  gallery_address: string | null;
}

interface ShowComparison {
  show_id: number;
  show_title: string;
  ai_success: boolean;
  comparison_fields: {
    press_release: {
      local_length: number;
      production_length: number;
      ai_enriched_length: number;
      improvement: string;
    };
    images: {
      local_count: number;
      production_count: number;
      ai_enriched_count: number;
      improvement: string;
    };
    show_summary: {
      local_has: boolean;
      production_has: boolean;
      ai_enriched_has: boolean;
      improvement: string;
    };
  };
  overall_assessment: string;
  discovered_url: string | null;
}

interface ComparisonResults {
  local_enrichment_reference: string;
  production_reference: string;
  total_shows: number;
  successful_enrichments: number;
  show_comparisons: ShowComparison[];
  summary: {
    press_release_improvements: number;
    image_improvements: number;
    summary_improvements: number;
    discovery_success_rate: number;
  };
  extracted_at: string;
}

function compareField(localValue: any, productionValue: any, aiEnrichedValue: any, fieldName: string): any {
  switch (fieldName) {
    case 'press_release':
      const localLength = localValue ? localValue.length : 0;
      const productionLength = productionValue ? productionValue.length : 0;
      const aiLength = aiEnrichedValue ? aiEnrichedValue.length : 0;
      
      let improvement = 'no_change';
      if (aiLength > Math.max(localLength, productionLength)) {
        improvement = 'ai_better';
      } else if (productionLength > localLength && aiLength >= productionLength * 0.8) {
        improvement = 'ai_matches_production';
      } else if (aiLength > localLength) {
        improvement = 'ai_improved_local';
      }
      
      return {
        local_length: localLength,
        production_length: productionLength,
        ai_enriched_length: aiLength,
        improvement
      };
      
    case 'images':
      const localCount = (localValue ? 1 : 0) + (localValue ? 0 : 0); // simplified
      const productionCount = (productionValue ? 1 : 0) + (productionValue?.additional_images?.length || 0);
      const aiCount = (aiEnrichedValue ? aiEnrichedValue.length : 0);
      
      let imageImprovement = 'no_change';
      if (aiCount > Math.max(localCount, productionCount)) {
        imageImprovement = 'ai_better';
      } else if (productionCount > localCount && aiCount >= productionCount) {
        imageImprovement = 'ai_matches_production';
      } else if (aiCount > localCount) {
        imageImprovement = 'ai_improved_local';
      }
      
      return {
        local_count: localCount,
        production_count: productionCount,
        ai_enriched_count: aiCount,
        improvement: imageImprovement
      };
      
    case 'show_summary':
      const localHas = !!localValue;
      const productionHas = !!productionValue;
      const aiHas = !!aiEnrichedValue;
      
      let summaryImprovement = 'no_change';
      if (aiHas && !localHas && !productionHas) {
        summaryImprovement = 'ai_better';
      } else if (aiHas && productionHas && !localHas) {
        summaryImprovement = 'ai_matches_production';
      } else if (aiHas && !localHas) {
        summaryImprovement = 'ai_improved_local';
      }
      
      return {
        local_has: localHas,
        production_has: productionHas,
        ai_enriched_has: aiHas,
        improvement: summaryImprovement
      };
      
    default:
      return { improvement: 'no_change' };
  }
}

function assessOverallComparison(fields: any): string {
  const improvements = [
    fields.press_release.improvement,
    fields.images.improvement,
    fields.show_summary.improvement
  ];
  
  const betterCount = improvements.filter(imp => imp === 'ai_better').length;
  const matchesCount = improvements.filter(imp => imp === 'ai_matches_production').length;
  const improvedCount = improvements.filter(imp => imp === 'ai_improved_local').length;
  
  if (betterCount >= 2) {
    return 'AI significantly better than production';
  } else if (betterCount + matchesCount >= 2) {
    return 'AI matches or exceeds production quality';
  } else if (improvedCount >= 2) {
    return 'AI improved local data significantly';
  } else if (betterCount + matchesCount + improvedCount >= 2) {
    return 'AI provided moderate improvements';
  } else {
    return 'Limited AI improvements';
  }
}

async function compareLocalToProduction(enrichmentFile: string): Promise<void> {
  try {
    console.log(`📊 Comparing AI-enriched local data to production: ${enrichmentFile}`);
    console.log('');

    // Load enrichment results
    const enrichmentPath = path.join('outputs', enrichmentFile);
    if (!fs.existsSync(enrichmentPath)) {
      throw new Error(`Enrichment file not found: ${enrichmentPath}`);
    }

    const enrichmentData = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'));
    const enrichedShows: EnrichedLocalShow[] = enrichmentData.enriched_shows;
    const productionReference: string = enrichmentData.production_test_reference;

    console.log(`📋 Loaded ${enrichedShows.length} enriched local shows`);
    console.log(`🔗 Production reference: ${productionReference}`);

    // Load original production test set
    const productionPath = path.join('outputs', productionReference);
    if (!fs.existsSync(productionPath)) {
      throw new Error(`Production reference file not found: ${productionPath}`);
    }

    const productionData = JSON.parse(fs.readFileSync(productionPath, 'utf8'));
    const productionShows: ProductionShow[] = productionData.selected_shows;

    console.log(`📋 Loaded ${productionShows.length} production shows for comparison`);
    console.log('');

    // Create comparison map by ID
    const productionMap = new Map<number, ProductionShow>();
    productionShows.forEach(show => productionMap.set(show.id, show));

    const showComparisons: ShowComparison[] = [];
    let pressReleaseImprovements = 0;
    let imageImprovements = 0;
    let summaryImprovements = 0;
    let successfulEnrichments = 0;

    // Compare each enriched local show to its production counterpart
    for (const localShow of enrichedShows) {
      const productionShow = productionMap.get(localShow.id);
      
      if (!productionShow) {
        console.log(`⚠️ No production data found for show ID ${localShow.id}`);
        continue;
      }

      const aiSuccess = localShow.ai_enrichment.success;
      if (aiSuccess) successfulEnrichments++;

      console.log(`🔍 Comparing: "${localShow.title}" (ID: ${localShow.id})`);
      console.log(`   AI Success: ${aiSuccess}, Confidence: ${localShow.ai_enrichment.confidence}%`);

      // Compare press release
      const pressReleaseComparison = compareField(
        localShow.press_release,
        productionShow.press_release,
        localShow.ai_enrichment.enriched_fields.press_release,
        'press_release'
      );

      // Compare images (simplified - count from enriched fields)
      const imageComparison = compareField(
        { additional_images: localShow.additional_images },
        { additional_images: productionShow.additional_images },
        localShow.ai_enrichment.enriched_fields.additional_images,
        'images'
      );

      // Compare show summary
      const summaryComparison = compareField(
        localShow.show_summary,
        productionShow.show_summary,
        localShow.ai_enrichment.enriched_fields.show_summary,
        'show_summary'
      );

      const comparisonFields = {
        press_release: pressReleaseComparison,
        images: imageComparison,
        show_summary: summaryComparison
      };

      // Count improvements
      if (pressReleaseComparison.improvement.includes('better') || pressReleaseComparison.improvement.includes('improved')) {
        pressReleaseImprovements++;
      }
      if (imageComparison.improvement.includes('better') || imageComparison.improvement.includes('improved')) {
        imageImprovements++;
      }
      if (summaryComparison.improvement.includes('better') || summaryComparison.improvement.includes('improved')) {
        summaryImprovements++;
      }

      const overallAssessment = assessOverallComparison(comparisonFields);

      console.log(`   📄 Press Release: ${pressReleaseComparison.improvement} (Local: ${pressReleaseComparison.local_length}, Production: ${pressReleaseComparison.production_length}, AI: ${pressReleaseComparison.ai_enriched_length})`);
      console.log(`   🖼️  Images: ${imageComparison.improvement} (Local: ${imageComparison.local_count}, Production: ${imageComparison.production_count}, AI: ${imageComparison.ai_enriched_count})`);
      console.log(`   📝 Summary: ${summaryComparison.improvement}`);
      console.log(`   🎯 Overall: ${overallAssessment}`);
      console.log('');

      showComparisons.push({
        show_id: localShow.id,
        show_title: localShow.title,
        ai_success: aiSuccess,
        comparison_fields: comparisonFields,
        overall_assessment: overallAssessment,
        discovered_url: localShow.ai_enrichment.discovered_url || null
      });
    }

    // Create final results
    const comparisonResults: ComparisonResults = {
      local_enrichment_reference: enrichmentFile,
      production_reference: productionReference,
      total_shows: enrichedShows.length,
      successful_enrichments: successfulEnrichments,
      show_comparisons: showComparisons,
      summary: {
        press_release_improvements: pressReleaseImprovements,
        image_improvements: imageImprovements,
        summary_improvements: summaryImprovements,
        discovery_success_rate: Math.round((successfulEnrichments / enrichedShows.length) * 100)
      },
      extracted_at: new Date().toISOString()
    };

    // Save results
    const resultFilename = `local_vs_production_comparison_${Date.now()}.json`;
    const resultPath = path.join('outputs', resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(comparisonResults, null, 2));

    console.log('🎯 LOCAL VS PRODUCTION COMPARISON COMPLETE');
    console.log('==========================================');
    console.log(`✅ AI Discovery Success: ${comparisonResults.summary.discovery_success_rate}% (${successfulEnrichments}/${enrichedShows.length})`);
    console.log(`📄 Press Release Improvements: ${pressReleaseImprovements}/${enrichedShows.length} shows`);
    console.log(`🖼️  Image Improvements: ${imageImprovements}/${enrichedShows.length} shows`);
    console.log(`📝 Summary Improvements: ${summaryImprovements}/${enrichedShows.length} shows`);
    console.log(`📁 Full analysis saved to: ${resultFilename}`);

    // Show overall conclusion
    const totalImprovements = pressReleaseImprovements + imageImprovements + summaryImprovements;
    const maxPossibleImprovements = enrichedShows.length * 3;
    const improvementRate = Math.round((totalImprovements / maxPossibleImprovements) * 100);

    console.log(`\n🏆 Overall Improvement Rate: ${improvementRate}%`);
    if (improvementRate >= 70) {
      console.log('🎉 Excellent! AI enrichment significantly enhances local data quality');
    } else if (improvementRate >= 50) {
      console.log('👍 Good! AI enrichment provides meaningful improvements');
    } else if (improvementRate >= 30) {
      console.log('📈 Moderate improvements - room for optimization');
    } else {
      console.log('⚠️  Limited improvements - requires system refinement');
    }

  } catch (error: any) {
    console.error(`💥 Comparison failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide enrichment results file name');
    console.log('Usage: npm run compare-local-to-production <local_enrichment_file.json>');
    console.log('Example: npm run compare-local-to-production local_enrichment_1752182405592.json');
    process.exit(1);
  }

  const enrichmentFile = args[0];
  
  try {
    await compareLocalToProduction(enrichmentFile);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 