import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const PRODUCTION_API_URL = 'https://scene-michael-rado.vercel.app';

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

interface LocalTestSet {
  selection_criteria: string;
  local_shows: LocalUnenrichedShow[];
  selected_count: number;
  total_unenriched: number;
  missing_data_analysis: any;
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

async function fetchShowFromProduction(id: number): Promise<ProductionEnrichedShow | null> {
  try {
    const response = await axios.get(`${PRODUCTION_API_URL}/api/shows/${id}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Scene-AI-Agent/1.0'
      }
    });

    const show = response.data;
    
    // Transform API response to our expected format
    return {
      id: show.id,
      title: show.title,
      artist_names: show.artists ? show.artists.map((a: any) => a.name) : [],
      gallery_name: show.gallery?.name || show.gallery_name,
      gallery_website: show.gallery?.website || show.gallery_website,
      start_date: show.start_date,
      end_date: show.end_date,
      press_release: show.press_release,
      image_url: show.image_url,
      additional_images: show.additional_images,
      show_summary: show.show_summary,
      has_been_enriched: show.has_been_enriched,
      source_url: show.source_url,
      scraped_at: show.scraped_at,
      gallery_address: show.gallery?.address || show.gallery_address,
      enriched_at: show.enriched_at
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`⚠️  Show ID ${id} not found in production`);
      return null;
    }
    throw error;
  }
}

async function queryProductionEnriched(localTestFile: string): Promise<void> {
  console.log(`🔍 Querying production API for enriched shows matching: ${localTestFile}`);
  console.log(`🌐 Production API: ${PRODUCTION_API_URL}`);

  // Load local test set to get IDs
  const localTestPath = localTestFile.startsWith('outputs/') ? localTestFile : path.join('outputs', localTestFile);
  if (!fs.existsSync(localTestPath)) {
    throw new Error(`Local test set file not found: ${localTestPath}`);
  }
  
  const localTestSet: LocalTestSet = JSON.parse(fs.readFileSync(localTestPath, 'utf8'));
  const localIds = localTestSet.local_shows.map(show => show.id);
  
  console.log(`📋 Looking for ${localIds.length} show IDs in production:`, localIds);

  try {
    // Fetch each show from production API
    const foundShows: ProductionEnrichedShow[] = [];
    const missingIds: number[] = [];

    for (const id of localIds) {
      console.log(`🔍 Fetching show ID ${id} from production...`);
      const show = await fetchShowFromProduction(id);
      
      if (show) {
        foundShows.push(show);
      } else {
        missingIds.push(id);
      }
      
      // Rate limiting - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Found ${foundShows.length}/${localIds.length} matching shows in production`);
    
    if (missingIds.length > 0) {
      console.log(`❌ Missing IDs: ${missingIds.join(', ')}`);
    }

    // Analyze data richness
    let hasPressRelease = 0;
    let hasAdditionalImages = 0;
    let hasSummary = 0;
    let hasGalleryWebsite = 0;

    foundShows.forEach((show, i) => {
      if (show.press_release && show.press_release.length > 0) hasPressRelease++;
      if (show.additional_images && show.additional_images.length > 0) hasAdditionalImages++;
      if (show.show_summary && show.show_summary.length > 0) hasSummary++;
      if (show.gallery_website && show.gallery_website.length > 0) hasGalleryWebsite++;
      
      console.log(`\n📋 [${i + 1}] "${show.title}" by ${show.artist_names.join(', ')}`);
      console.log(`   Gallery: ${show.gallery_name}`);
      console.log(`   Enriched: ${show.has_been_enriched} (${show.enriched_at || 'Never'})`);
      console.log(`   Data: PR=${show.press_release?.length || 0} chars, Images=${(show.additional_images?.length || 0) + (show.image_url ? 1 : 0)}, Summary=${!!show.show_summary}`);
    });

    const productionTestSet: ProductionTestSet = {
      local_test_reference: localTestFile,
      query_criteria: `Production enriched shows matching local test set IDs via API: [${localIds.join(', ')}]`,
      production_shows: foundShows,
      found_count: foundShows.length,
      missing_count: missingIds.length,
      missing_ids: missingIds,
      data_analysis: {
        has_press_release: hasPressRelease,
        has_additional_images: hasAdditionalImages,
        has_summary: hasSummary,
        has_gallery_website: hasGalleryWebsite
      },
      extracted_at: new Date().toISOString()
    };

    const filename = `production_enriched_test_set_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    fs.writeFileSync(outputPath, JSON.stringify(productionTestSet, null, 2));

    console.log(`\n📊 Production data analysis:`);
    console.log(`   Has press release: ${hasPressRelease}/${foundShows.length} (${Math.round(hasPressRelease/foundShows.length*100)}%)`);
    console.log(`   Has additional images: ${hasAdditionalImages}/${foundShows.length} (${Math.round(hasAdditionalImages/foundShows.length*100)}%)`);
    console.log(`   Has summary: ${hasSummary}/${foundShows.length} (${Math.round(hasSummary/foundShows.length*100)}%)`);
    console.log(`   Has gallery website: ${hasGalleryWebsite}/${foundShows.length} (${Math.round(hasGalleryWebsite/foundShows.length*100)}%)`);

    console.log(`\n📁 Production test set saved to: ${filename}`);
    console.log(`🔗 Next step: npm run compare-ai-vs-production <enrichment_file> <production_file>`);

  } catch (error: any) {
    console.error(`❌ Production API query failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide local test set file name');
    console.log('Usage: npm run query-production-enriched <local_unenriched_test_set_file.json>');
    console.log('Example: npm run query-production-enriched local_unenriched_test_set_1752184045578.json');
    process.exit(1);
  }

  const localTestFile = args[0];
  
  try {
    await queryProductionEnriched(localTestFile);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { queryProductionEnriched }; 