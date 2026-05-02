import { fal } from '@fal-ai/client';
import dotenv from 'dotenv';
dotenv.config();
fal.config({ credentials: process.env.FAL_KEY });

async function test() {
  try {
    const result = await fetch('https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/veo3.1');
    const schema = await result.json();
    console.log(JSON.stringify(schema, null, 2));
  } catch(e) {
    console.error('Error fetching schema:', e.message);
  }
}
test();
