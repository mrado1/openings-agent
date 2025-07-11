// Phase 2: Enhanced Metadata Types
import { ArtistMedium } from '../extractors/extractFieldsGemini';

// Match existing Scene database structure
export interface ShowData {
  title: string;
  artists: string[];
  start_date: string; // ISO format
  end_date: string;
  press_release: string;
  image_url: string;
  additional_images: string[]; // Up to 10 additional images
  show_summary: string; // 1-2 sentence summary
  // Phase 2 Fix: show_url instead of gallery_url (moved from ai_enrichment.discovered_url)
  show_url: string; // Gallery exhibition URL discovered during enrichment
  extracted_at: string;
  // Enrichment tracking
  has_been_enriched: boolean;
  source_url: string;
  // Phase 2: Enhanced metadata fields
  artist_medium?: ArtistMedium | null;
}

export interface ExtractionResult {
  success: boolean;
  data?: ShowData;
  confidence?: number;
  errors: string[];
}

export interface BaselineShowData {
  show_id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_address: string;
  gallery_website: string;
  start_date: string;
  end_date: string;
  press_release: string;
  image_url: string;
  additional_images?: string[];
  show_summary?: string;
  has_been_enriched: boolean;
  source_url: string;
} 