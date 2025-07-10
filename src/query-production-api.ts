import axios from 'axios';
import * as fs from 'fs';

interface APIShow {
  id: number;
  title: string;
  artists: { name: string }[];
  gallery: {
    name: string;
    website: string;
    address: string;
  };
  start_date: string;
  end_date: string;
  press_release: string | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  image_url: string | null;
  additional_images: string[] | null;
}

interface APIResponse {
  shows: APIShow[];
  total: number;
  neighborhoods: string[];
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
  gallery_website: string | null;
  gallery_address: string | null;
}

interface ProductionTestSet {
  selected_shows: ProductionShow[];
  selection_criteria: string;
  total_enriched_shows: number;
  diversity_metrics: {
    galleries: string[];
    artists: string[];
    date_range: string;
  };
  extracted_at: string;
  api_source: string;
}

const PRODUCTION_API_URL = 'https://scene-michael-rado.vercel.app';

async function queryProductionAPI(): Promise<void> {
  try {
    console.log('🔍 Querying production API for enriched shows...');
    console.log(`📡 API URL: ${PRODUCTION_API_URL}`);
    console.log('');

    // First, get all shows to see what's available
    const response = await axios.get<APIResponse>(`${PRODUCTION_API_URL}/api/shows`, {
      params: {
        limit: 500, // Get more shows to find enriched ones
        sort: 'date'
      },
      timeout: 10000
    });

    console.log(`📊 Found ${response.data.shows.length} total shows in production`);

    // Filter for enriched shows with required data
    const enrichedShows = response.data.shows.filter(show => 
      show.has_been_enriched && 
      show.press_release && 
      show.press_release.length > 100 &&
      show.gallery?.website &&
      show.gallery?.name &&
      show.artists &&
      show.artists.length > 0
    );

    console.log(`✅ Found ${enrichedShows.length} enriched shows with complete data`);

    if (enrichedShows.length === 0) {
      console.log('⚠️ No enriched shows found with required data');
      console.log('💡 Required: has_been_enriched=true, press_release, gallery_website, artists');
      return;
    }

    // Select diverse shows (max one per gallery)
    const galleryMap = new Map<string, APIShow>();
    const selectedShows: APIShow[] = [];

    enrichedShows.forEach(show => {
      const galleryName = show.gallery.name;
      if (!galleryMap.has(galleryName)) {
        galleryMap.set(galleryName, show);
        selectedShows.push(show);
      }
    });

    // Limit to 10 shows for testing
    const finalSelection = selectedShows.slice(0, 10);

    console.log(`🎯 Selected ${finalSelection.length} diverse enriched shows:`);
    
    const galleries = new Set<string>();
    const artists = new Set<string>();
    let earliestDate = '';
    let latestDate = '';

    // Transform API data to our test format
    const transformedShows: ProductionShow[] = finalSelection.map((show, index) => {
      const artistNames = show.artists.map(artist => artist.name);
      
      console.log(`${index + 1}. "${show.title}" by ${artistNames.join(', ')}`);
      console.log(`   at ${show.gallery.name} (${show.gallery.website})`);
      console.log(`   ${show.start_date} to ${show.end_date}`);
      console.log('');
      
      galleries.add(show.gallery.name);
      artistNames.forEach(artist => artists.add(artist));
      
      if (!earliestDate || show.start_date < earliestDate) earliestDate = show.start_date;
      if (!latestDate || show.end_date > latestDate) latestDate = show.end_date;

      return {
        id: show.id,
        title: show.title,
        artist_names: artistNames,
        gallery_name: show.gallery.name,
        start_date: show.start_date,
        end_date: show.end_date,
        press_release: show.press_release,
        image_url: show.image_url,
        additional_images: show.additional_images,
        show_summary: show.show_summary,
        has_been_enriched: show.has_been_enriched,
        source_url: `${PRODUCTION_API_URL}/shows/${show.id}`, // API endpoint as source
        scraped_at: new Date().toISOString(), // Current timestamp
        gallery_website: show.gallery.website,
        gallery_address: show.gallery.address
      };
    });

    const testSet: ProductionTestSet = {
      selected_shows: transformedShows,
      selection_criteria: 'One show per gallery, enriched=true, has press_release (>100 chars) and gallery_website',
      total_enriched_shows: enrichedShows.length,
      diversity_metrics: {
        galleries: Array.from(galleries),
        artists: Array.from(artists),
        date_range: `${earliestDate} to ${latestDate}`
      },
      extracted_at: new Date().toISOString(),
      api_source: PRODUCTION_API_URL
    };

    // Save the production test set
    const filename = `production_test_set_api_${Date.now()}.json`;
    const outputPath = `./outputs/${filename}`;
    fs.writeFileSync(outputPath, JSON.stringify(testSet, null, 2));

    console.log(`📁 Production test set saved to: ${outputPath}`);
    console.log(`📊 Diversity: ${galleries.size} galleries, ${artists.size} artists`);
    console.log(`📅 Date range: ${testSet.diversity_metrics.date_range}`);
    console.log(`🔗 API Source: ${PRODUCTION_API_URL}`);
    
    console.log('\n🔗 Next step: Run batch extraction with:');
    console.log(`npm run batch-extraction ${filename}`);
    
    return;

  } catch (error: any) {
    console.error(`❌ Production API query failed: ${error.message}`);
    
    if (error.response) {
      console.log(`📊 HTTP Status: ${error.response.status}`);
      console.log(`📄 Response: ${error.response.data}`);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Check if the production API is accessible');
      console.log(`🔗 Try opening: ${PRODUCTION_API_URL}/api/shows in your browser`);
    }
    
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  console.log('🔍 Querying production API for enriched shows...');
  console.log('');
  
  queryProductionAPI().catch(console.error);
}

export { queryProductionAPI }; 