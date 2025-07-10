#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { runModelComparison } from './processors/modelComparison';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  
  const showUrl = args[0] || 'https://www.pacegallery.com/exhibitions/alicja-kwade-telos-tales/';
  
  console.log('🚀 AI Model Comparison Tool');
  console.log('=' .repeat(50));
  console.log(`🎯 Testing URL: ${showUrl}`);
  console.log('');

  // Check API keys
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }

  await runModelComparison(showUrl);
}

if (require.main === module) {
  main().catch(console.error);
} 