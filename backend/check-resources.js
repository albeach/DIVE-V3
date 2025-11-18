// Check what resources exist in MongoDB
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3';

async function check() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('ztdf-resources');
    
    const count = await collection.countDocuments();
    console.log(`\nTotal ZTDF resources: ${count}`);
    
    if (count > 0) {
      const resources = await collection.find({}).limit(5).toArray();
      console.log('\nFirst 5 resources:');
      resources.forEach(r => {
        console.log(`  - ${r.resourceId}: ${r.title}`);
      });
      
      // Test with first resource
      const firstResource = resources[0];
      console.log(`\n✓ Will test with: ${firstResource.resourceId}`);
      return firstResource.resourceId;
    } else {
      console.log('\n✗ No resources found - need to seed database');
      return null;
    }
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    return null;
  } finally {
    await client.close();
  }
}

check().then(resourceId => {
  if (resourceId) {
    console.log(`\nTo test download, run:`);
    console.log(`  curl -k https://localhost:4000/api/resources/${resourceId}/download -o test.ztdf`);
  }
  process.exit(0);
});
