import * as dotenv from 'dotenv';
import { DiscoveryPipeline } from '../discovery/discoveryPipeline';
import { ShowSearchContext } from '../discovery/searchQueryBuilder';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

interface ProductionShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  start_date: string;
  end_date: string;
  press_release: string | null;
  gallery_website: string | null;
}

interface ProductionTestSet {
  selected_shows: ProductionShow[];
  selection_criteria: string;
  total_enriched_shows: number;
  diversity_metrics: any;
  extracted_at: string;
}

interface BatchExtractionResult {
  production_test_set: string;
  ai_extraction_results: any[];
  success_rate: number;
  errors: string[];
  execution_time_seconds: number;
  processed_at: string;
}

async function runBatchExtraction(testSetFile: string): Promise<void> {
  try {
    console.log(`📊 Starting batch AI extraction from test set: ${testSetFile}`);
    console.log('');
    
    // Load production test set
    const testSetPath = path.join('outputs', testSetFile);
    if (!fs.existsSync(testSetPath)) {
      throw new Error(`Test set file not found: ${testSetPath}`);
    }
    
    const testSet: ProductionTestSet = JSON.parse(fs.readFileSync(testSetPath, 'utf8'));
    console.log(`📋 Loaded ${testSet.selected_shows.length} shows from production test set`);
    console.log(`🎯 Test criteria: ${testSet.selection_criteria}`);
    console.log('');
    
    const pipeline = new DiscoveryPipeline();
    const results: any[] = [];
    const errors: string[] = [];
    let successCount = 0;
    
    const startTime = Date.now();
    
    // Process each show
    for (let i = 0; i < testSet.selected_shows.length; i++) {
      const show = testSet.selected_shows[i];
      console.log(`\n🔍 [${i + 1}/${testSet.selected_shows.length}] Processing: "${show.title}"`);
      console.log(`   Artist: ${show.artist_names.join(', ')}`);
      console.log(`   Gallery: ${show.gallery_name}`);
      console.log(`   Website: ${show.gallery_website}`);
      
      try {
        // Extract year from start_date
        const year = new Date(show.start_date).getFullYear().toString();
        
        // Create search context
        const context: ShowSearchContext = {
          title: show.title,
          artist: show.artist_names[0], // Use primary artist for search
          gallery: show.gallery_name,
          year: year
        };
        
        // Run AI discovery and extraction
        const aiResult = await pipeline.discoverAndExtract(context);
        
        // Add production show context for comparison
        const enrichedResult = {
          production_show: {
            id: show.id,
            title: show.title,
            artist_names: show.artist_names,
            gallery_name: show.gallery_name,
            gallery_website: show.gallery_website,
            start_date: show.start_date,
            end_date: show.end_date,
            press_release: show.press_release
          },
          ai_discovery: aiResult,
          search_context: context,
          processing_index: i + 1
        };
        
        results.push(enrichedResult);
        
        if (aiResult.success) {
          successCount++;
          console.log(`   ✅ Success! Confidence: ${aiResult.confidence}%`);
          console.log(`   🌐 Found URL: ${aiResult.discoveredUrl}`);
        } else {
          console.log(`   ❌ Failed: ${aiResult.errors.join(', ')}`);
          errors.push(`Show ${i + 1} (${show.title}): ${aiResult.errors.join(', ')}`);
        }
        
        // Brief pause between requests to be respectful to APIs
        if (i < testSet.selected_shows.length - 1) {
          console.log('   ⏳ Waiting 2 seconds before next extraction...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error: any) {
        console.log(`   💥 Error: ${error.message}`);
        errors.push(`Show ${i + 1} (${show.title}): ${error.message}`);
        
        results.push({
          production_show: {
            id: show.id,
            title: show.title,
            artist_names: show.artist_names,
            gallery_name: show.gallery_name,
            gallery_website: show.gallery_website
          },
          ai_discovery: { success: false, errors: [(error as any).message] },
          search_context: { title: show.title, artist: show.artist_names[0], gallery: show.gallery_name, year: new Date(show.start_date).getFullYear().toString() },
          processing_index: i + 1
        });
      }
    }
    
    const endTime = Date.now();
    const executionTimeSeconds = (endTime - startTime) / 1000;
    const successRate = (successCount / testSet.selected_shows.length) * 100;
    
    // Create final batch result
    const batchResult: BatchExtractionResult = {
      production_test_set: testSetFile,
      ai_extraction_results: results,
      success_rate: successRate,
      errors: errors,
      execution_time_seconds: executionTimeSeconds,
      processed_at: new Date().toISOString()
    };
    
    // Save batch extraction results
    const resultFilename = `batch_extraction_${Date.now()}.json`;
    const resultPath = path.join('outputs', resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(batchResult, null, 2));
    
    console.log('\n🎯 BATCH EXTRACTION COMPLETE');
    console.log('==============================');
    console.log(`✅ Success Rate: ${successRate.toFixed(1)}% (${successCount}/${testSet.selected_shows.length})`);
    console.log(`⏱️  Total Time: ${executionTimeSeconds.toFixed(1)} seconds`);
    console.log(`📁 Results saved to: ${resultPath}`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      errors.forEach(error => console.log(`   - ${error}`));
    }
    
    console.log(`\n🔗 Next step: Run comparison analysis with:`);
    console.log(`npm run compare-batch-results ${resultFilename}`);
    
  } catch (error: any) {
    console.error(`💥 Batch extraction failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const testSetFile = process.argv[2];
  
  if (!testSetFile) {
    console.error('Usage: npm run batch-extraction <test-set-filename>');
    console.error('Example: npm run batch-extraction production_test_set_1752178932048.json');
    console.error('');
    console.error('Available test sets:');
    const outputDir = path.join(__dirname, '../../outputs');
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('production_test_set_'));
      files.forEach(file => console.error(`  - ${file}`));
    }
    process.exit(1);
  }
  
  runBatchExtraction(testSetFile).catch(console.error);
}

export { runBatchExtraction }; 